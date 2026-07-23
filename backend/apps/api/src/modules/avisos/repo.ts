import type { Pool, PoolClient } from '@whaviso/shared/db'
import type {
  Aviso,
  DirecaoAviso,
  Envio,
  EtapaEnvio,
  EventoAviso,
  ItemPedido,
  Ocorrencia,
  PapelAviso,
  StatusAviso,
  TipoChavePix,
} from '@whaviso/shared/contracts'

type Executor = Pool | PoolClient

// data_combinada como texto (evita Date com fuso); valor como number. As colunas de
// recorrência (E6 H6.10 / E8 H8.7) vêm null no combinado simples; ocorrencia_atual/total
// alimentam o "k de N" do painel.
const COLS = `
  id, cobrador_id, devedor_profile_id, direcao, criador_papel, status,
  nome_devedor, telefone_devedor, nome_cobrador, telefone_cobrador, motivo,
  valor_centavos::bigint as valor_centavos,
  to_char(data_combinada, 'YYYY-MM-DD') as data_combinada, pix_chave,
  pix_titular, pix_banco,
  -- E16 (multi): categorias via junção aviso_categorias. Subquery escalar (uuid[], parseado
  -- pelo node-pg em string[]); vale em SELECT e em RETURNING (referencia avisos.id da linha).
  array(select ac.categoria_id from public.aviso_categorias ac where ac.aviso_id = avisos.id) as categoria_ids,
  valor_custo_centavos::bigint as valor_custo_centavos,
  -- itens é jsonb: node-pg já devolve como array JS (composição opcional do pedido, Fase A).
  itens,
  recorrencia_tipo, recorrencia_freq, recorrencia_intervalo,
  ocorrencias_total, ocorrencia_atual,
  -- node-pg não auto-parseia arrays de ENUM (etapa_envio[]) -> cast p/ text[] (parseado em JS).
  cadencia_etapas::text[] as cadencia_etapas,
  aceito_em, arquivado_em, criado_em, atualizado_em
`

// Mesmas colunas (forma LinhaAviso), mas projetadas da VIEW combinado_linhas (E9 H9.6):
// id = aviso_id; status/data_combinada/valor vêm da OCORRÊNCIA (linha_*); ocorrencia_atual
// = índice da ocorrência (alimenta o badge "k de N" daquela linha). Usada só no filtro por
// período; sem período a lista lê public.avisos (uma linha por combinado), via COLS.
const COLS_VIEW = `
  aviso_id as id, cobrador_id, devedor_profile_id, direcao, criador_papel,
  linha_status as status,
  nome_devedor, telefone_devedor, nome_cobrador, telefone_cobrador, motivo,
  linha_valor::bigint as valor_centavos,
  to_char(linha_data, 'YYYY-MM-DD') as data_combinada, pix_chave,
  pix_titular, pix_banco, categoria_ids,
  valor_custo_centavos::bigint as valor_custo_centavos,
  recorrencia_tipo, recorrencia_freq, recorrencia_intervalo,
  ocorrencias_total, indice as ocorrencia_atual,
  cadencia_etapas::text[] as cadencia_etapas,
  aceito_em, arquivado_em, criado_em, atualizado_em
`

interface LinhaAviso {
  id: string
  cobrador_id: string | null
  devedor_profile_id: string | null
  direcao: DirecaoAviso
  criador_papel: PapelAviso
  status: StatusAviso
  nome_devedor: string
  telefone_devedor: string | null
  nome_cobrador: string | null
  telefone_cobrador: string | null
  motivo: string
  valor_centavos: string
  data_combinada: string
  pix_chave: string | null
  pix_titular: string | null
  pix_banco: string | null
  categoria_ids: string[]
  valor_custo_centavos: string | null
  itens: ItemPedido[] | null
  recorrencia_tipo: 'periodo' | 'avulsas' | null
  recorrencia_freq: 'mensal' | 'semanal' | null
  recorrencia_intervalo: number | null
  ocorrencias_total: number | null
  ocorrencia_atual: number | null
  cadencia_etapas: EtapaEnvio[] | null
  aceito_em: Date | null
  arquivado_em: Date | null
  criado_em: Date
  atualizado_em: Date
}

function mapear(l: LinhaAviso): Aviso {
  return {
    ...l,
    valor_centavos: Number(l.valor_centavos),
    valor_custo_centavos: l.valor_custo_centavos === null ? null : Number(l.valor_custo_centavos),
  }
}

/** Configuração de recorrência/cadência gravada nas colunas do aviso (E6 H6.10 / E8 H8.7).
 *  Combinado simples = tudo null/undefined; o serviço já expandiu as datas e passa o N. */
export interface RecorrenciaAviso {
  recorrencia_tipo: 'periodo' | 'avulsas' | null
  recorrencia_freq: 'mensal' | 'semanal' | null
  recorrencia_intervalo: number | null
  ocorrencias_total: number | null
  ocorrencia_atual: number | null
  cadencia_etapas: EtapaEnvio[] | null
}

export interface NovoAviso {
  cobrador_id: string | null
  devedor_profile_id: string | null
  direcao: DirecaoAviso
  criador_papel: PapelAviso
  status: StatusAviso
  nome_devedor: string
  telefone_devedor: string | null
  nome_cobrador: string | null
  telefone_cobrador: string | null
  motivo: string
  valor_centavos: number
  data_combinada: string
  pix_chave: string | null
  pix_titular: string | null
  pix_banco: string | null
  // E7/H7.3: tipo da chave (snapshot). Resolvido pelo serviço (cadastro do cobrador ou
  // inferência). null quando sem chave / ambíguo (o zap reinferre no envio).
  pix_tipo: TipoChavePix | null
  // E16 (multi): as categorias do combinado NÃO são coluna de avisos; vivem na junção
  // aviso_categorias, gravadas pelo serviço via definirCategorias após o insert.
  // Fase A: custo opcional (centavos) do combinado; null = não informado.
  valor_custo_centavos: number | null
  // Fase A: composição opcional do pedido (itens); null = não informado.
  itens: ItemPedido[] | null
  // Recorrência/cadência (null = combinado simples / ciclo completo).
  recorrencia_tipo?: 'periodo' | 'avulsas' | null
  recorrencia_freq?: 'mensal' | 'semanal' | null
  recorrencia_intervalo?: number | null
  ocorrencias_total?: number | null
  ocorrencia_atual?: number | null
  cadencia_etapas?: EtapaEnvio[] | null
  aceite_token_hash: string | null
  aceite_token_expira_em: Date | null
  acao_token_hash: string | null
  /** E5/H5.7: expiração FIXA de 7 dias do combinado em aguardando_aceite (now()+7d). null no agenda. */
  convite_expira_em: Date | null
  /** Item 21: código curto do combinado (6 alfanumérico, sem ambíguos), gerado pelo
   *  serviço (node:crypto) ANTES do insert, já conferido único (ver gerarCodigoUnico). */
  codigo: string
}

export async function inserirAviso(ex: Executor, novo: NovoAviso): Promise<Aviso> {
  const { rows } = await ex.query<LinhaAviso>(
    `insert into public.avisos
       (cobrador_id, devedor_profile_id, direcao, criador_papel, status,
        nome_devedor, telefone_devedor, nome_cobrador, telefone_cobrador, motivo,
        valor_centavos, data_combinada, pix_chave, pix_titular, pix_banco,
        recorrencia_tipo, recorrencia_freq, recorrencia_intervalo,
        ocorrencias_total, ocorrencia_atual, cadencia_etapas,
        aceite_token_hash, aceite_token_expira_em, acao_token_hash, convite_expira_em,
        valor_custo_centavos, itens, pix_tipo, codigo)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
             coalesce($18,1),$19,$20,$21::etapa_envio[],$22,$23,$24,$25,$26,$27::jsonb,
             $28::tipo_chave_pix,$29)
     returning ${COLS}`,
    [
      novo.cobrador_id, novo.devedor_profile_id, novo.direcao, novo.criador_papel, novo.status,
      novo.nome_devedor, novo.telefone_devedor, novo.nome_cobrador, novo.telefone_cobrador,
      novo.motivo, novo.valor_centavos, novo.data_combinada, novo.pix_chave,
      novo.pix_titular, novo.pix_banco,
      novo.recorrencia_tipo ?? null, novo.recorrencia_freq ?? null, novo.recorrencia_intervalo ?? null,
      novo.ocorrencias_total ?? null, novo.ocorrencia_atual ?? null,
      novo.cadencia_etapas ?? null,
      novo.aceite_token_hash, novo.aceite_token_expira_em, novo.acao_token_hash,
      novo.convite_expira_em, novo.valor_custo_centavos ?? null,
      // jsonb: node-pg serializa Array como array literal do Postgres, não como json; então
      // passamos a string JSON (null = coluna null). Espelha inserirEdicao/atualizarItens.
      novo.itens == null ? null : JSON.stringify(novo.itens),
      novo.pix_tipo ?? null,
      novo.codigo,
    ],
  )
  return mapear(rows[0]!)
}

/**
 * Item 21: existe algum aviso com este código? Usado pelo serviço para conferir
 * disponibilidade ANTES do insert (defesa em profundidade: a coluna também tem índice
 * único, que é quem realmente garante a unicidade sob corrida).
 */
export async function codigoExiste(ex: Executor, codigo: string): Promise<boolean> {
  const { rows } = await ex.query<{ existe: boolean }>(
    `select exists(select 1 from public.avisos where codigo = $1) as existe`,
    [codigo],
  )
  return rows[0]?.existe ?? false
}

/**
 * Item 21: lê só o código do combinado. Rota dedicada (GET /avisos/:id/codigo): o
 * campo `codigo` ainda não entra no contrato Zod geral do Aviso nesta rodada (ver nota
 * do grupo 1B no relatório), então é exposto separado em vez de ir dentro de `Aviso`.
 */
export async function buscarCodigo(ex: Executor, avisoId: string): Promise<string | null> {
  const { rows } = await ex.query<{ codigo: string | null }>(
    `select codigo from public.avisos where id = $1`,
    [avisoId],
  )
  return rows[0]?.codigo ?? null
}

export async function inserirEvento(
  ex: Executor,
  avisoId: string,
  tipo: string,
  ator: string,
  detalhes?: Record<string, unknown>,
): Promise<void> {
  await ex.query(
    `insert into public.eventos_aviso (aviso_id, tipo, ator, detalhes) values ($1,$2,$3,$4)`,
    [avisoId, tipo, ator, detalhes ?? null],
  )
}

/** Telefone do perfil (E.164) ou null. Usado para os lembretes do criador-devedor (invertido). */
export async function telefoneDoPerfil(ex: Executor, uid: string): Promise<string | null> {
  const { rows } = await ex.query<{ telefone: string | null }>(
    `select telefone from public.profiles where id = $1`,
    [uid],
  )
  return rows[0]?.telefone ?? null
}

/** Nome do perfil ('' quando ausente/vazio). Usado no preview do combinado (nome de saudação). */
export async function nomeDoPerfil(ex: Executor, uid: string): Promise<string> {
  const { rows } = await ex.query<{ nome: string | null }>(
    `select nome from public.profiles where id = $1`,
    [uid],
  )
  return rows[0]?.nome ?? ''
}

/** Conteúdo estruturado do template `combinado.resumo` (espelha o jsonb da tabela). */
interface ConteudoCombinado {
  texto?: string
  botoes?: { acao: string; rotulo: string }[]
}

/**
 * Lê o template ATIVO de `combinado.resumo` para o preview (módulo nunca importa o zap;
 * consultar a tabela compartilhada `templates` é permitido). Espelha `carregarTemplateAtivo`
 * do zap, fixo nesta chave: se `contexto='revisao'` e houver variante ativa, ela vence;
 * senão cai no 'padrao'. node-pg devolve `conteudo` como objeto JS e `variaveis` como array JS.
 */
export async function carregarTemplateCombinado(
  ex: Executor,
  contexto: 'padrao' | 'revisao',
): Promise<{ conteudo: ConteudoCombinado; variaveis: string[] } | null> {
  const { rows } = await ex.query<{ conteudo: ConteudoCombinado; variaveis: string[] }>(
    `select conteudo, variaveis
       from public.templates
      where chave = 'combinado.resumo' and ativo
        and contexto in ('padrao'::template_contexto, $1::template_contexto)
      order by (contexto = $1::template_contexto) desc
      limit 1`,
    [contexto],
  )
  return rows[0] ?? null
}

// A contagem de avisos ATIVOS (vagas de ativo) e da AGENDA (balde único) vive em
// shared/planos (`contarAtivos`/`contarAgenda`), fonte única lida pelos gates de
// criar/ativar. NÃO duplicamos aqui (E4/G-M4: `sem_aviso` NÃO conta como ativo).

export interface FiltroLista {
  uid: string
  status?: StatusAviso
  direcao?: DirecaoAviso
  /** H9.1: papel do usuário NAQUELE combinado (cobre o invertido), não a direção. */
  papel?: PapelAviso
  /** H9.3/H9.8: conjunto de estados decidido pelo SERVIDOR (estados.ts). */
  estados?: readonly StatusAviso[]
  /** H9.3: busca por nome da outra ponta OU motivo (server-side). */
  busca?: string
  /** H9.3: ordenação (default criado_em desc). */
  ordenar?: 'data_combinada' | 'criado_em'
  dir?: 'asc' | 'desc'
  /** E9 H9.6: filtro por período (data da linha). Com de/ate, lê a VIEW combinado_linhas
   *  (uma linha por OCORRÊNCIA do recorrente); sem de/ate, lê public.avisos (uma por combinado). */
  de?: string
  ate?: string
  /** E16 H16.4: filtra por uma categoria específica (id) ou pelos sem categoria. */
  categoria_id?: string
  sem_categoria?: boolean
  limit: number
  offset: number
}

export async function listarAvisos(
  ex: Executor,
  f: FiltroLista,
): Promise<{ itens: Aviso[]; total: number }> {
  // Com período, a fonte é a VIEW de ocorrências (desmembra o recorrente, H9.6); sem
  // período, é a tabela avisos (comportamento de sempre: uma linha por combinado).
  const usaPeriodo = Boolean(f.de || f.ate)
  const fonte = usaPeriodo ? 'public.combinado_linhas' : 'public.avisos'
  const cols = usaPeriodo ? COLS_VIEW : COLS
  // O nome da coluna de situação difere entre a view (linha_status) e a tabela (status).
  const colStatus = usaPeriodo ? 'linha_status' : 'status'
  const colData = usaPeriodo ? 'linha_data' : 'data_combinada'

  const cond: string[] = []
  const params: unknown[] = [f.uid]
  // Visibilidade por PAPEL (H9.1): cobrador = cobrador_id; devedor = devedor_profile_id;
  // sem papel = qualquer um dos dois (visibilidade geral, isolada pelo uid).
  if (f.papel === 'cobrador') cond.push('cobrador_id = $1')
  else if (f.papel === 'devedor') cond.push('devedor_profile_id = $1')
  else cond.push('(cobrador_id = $1 or devedor_profile_id = $1)')
  if (f.status) {
    params.push(f.status)
    cond.push(`${colStatus} = $${params.length}`)
  }
  if (f.estados && f.estados.length > 0) {
    params.push(f.estados as unknown as string[])
    cond.push(`${colStatus} = any($${params.length})`)
  }
  if (f.direcao) {
    params.push(f.direcao)
    cond.push(`direcao = $${params.length}`)
  }
  if (f.busca) {
    // Nome da outra ponta (devedor OU cobrador) OU motivo. ILIKE, sem PII em log.
    params.push(`%${f.busca}%`)
    const i = params.length
    cond.push(
      `(nome_devedor ilike $${i} or coalesce(nome_cobrador,'') ilike $${i} or motivo ilike $${i})`,
    )
  }
  if (f.de) {
    params.push(f.de)
    cond.push(`${colData} >= $${params.length}`)
  }
  if (f.ate) {
    params.push(f.ate)
    cond.push(`${colData} <= $${params.length}`)
  }
  // E16 H16.4 (multi): filtro por categoria com semântica "CONTÉM" (o combinado aparece se
  // UMA das suas categorias for a escolhida). No caminho por período a view já projeta
  // `categoria_ids` (array) -> `= any(...)`; sem período consultamos a junção via exists.
  if (f.categoria_id) {
    params.push(f.categoria_id)
    cond.push(
      usaPeriodo
        ? `$${params.length} = any(categoria_ids)`
        : `exists (select 1 from public.aviso_categorias ac
                    where ac.aviso_id = public.avisos.id and ac.categoria_id = $${params.length})`,
    )
  } else if (f.sem_categoria) {
    cond.push(
      usaPeriodo
        ? `coalesce(array_length(categoria_ids, 1), 0) = 0`
        : `not exists (select 1 from public.aviso_categorias ac where ac.aviso_id = public.avisos.id)`,
    )
  }
  const where = cond.join(' and ')
  const total = await ex.query<{ n: string }>(
    `select count(*) as n from ${fonte} where ${where}`,
    params,
  )
  const colOrdem = f.ordenar === 'data_combinada' ? colData : 'criado_em'
  const dirOrdem = f.dir === 'asc' ? 'asc' : 'desc'
  // Na view, o índice agrupa as ocorrências do mesmo combinado de forma estável.
  const desempate = usaPeriodo ? 'criado_em desc, indice asc' : 'criado_em desc'
  params.push(f.limit, f.offset)
  const { rows } = await ex.query<LinhaAviso>(
    `select ${cols} from ${fonte} where ${where}
     order by ${colOrdem} ${dirOrdem}, ${desempate}
     limit $${params.length - 1} offset $${params.length}`,
    params,
  )
  return { itens: rows.map(mapear), total: Number(total.rows[0]!.n) }
}

export async function buscarAvisoVisivel(
  ex: Executor,
  id: string,
  uid: string,
): Promise<Aviso | null> {
  const { rows } = await ex.query<LinhaAviso>(
    `select ${COLS} from public.avisos
     where id = $1 and (cobrador_id = $2 or devedor_profile_id = $2)`,
    [id, uid],
  )
  return rows[0] ? mapear(rows[0]) : null
}

export async function buscarComoCobrador(
  ex: Executor,
  id: string,
  cobradorId: string,
): Promise<Aviso | null> {
  const { rows } = await ex.query<LinhaAviso>(
    `select ${COLS} from public.avisos where id = $1 and cobrador_id = $2`,
    [id, cobradorId],
  )
  return rows[0] ? mapear(rows[0]) : null
}

/** Aviso visto como CRIADOR (cobrador no receber; devedor no invertido). Para cancelar. */
export async function buscarComoCriador(
  ex: Executor,
  id: string,
  uid: string,
): Promise<Aviso | null> {
  const { rows } = await ex.query<LinhaAviso>(
    `select ${COLS} from public.avisos
     where id = $1
       and ((criador_papel = 'cobrador' and cobrador_id = $2)
            or (criador_papel = 'devedor' and devedor_profile_id = $2))`,
    [id, uid],
  )
  return rows[0] ? mapear(rows[0]) : null
}

export async function atualizarStatus(ex: Executor, id: string, status: StatusAviso): Promise<void> {
  await ex.query(`update public.avisos set status = $2 where id = $1`, [id, status])
}

/** Dados que a ATIVAÇÃO (H4.3) preenche/completa na anotação antes de gerar o convite. */
export interface DadosAtivacao {
  telefone_devedor?: string | null
  nome_cobrador?: string | null
  telefone_cobrador?: string | null
  pix_chave?: string | null
  pix_titular?: string | null
  pix_banco?: string | null
  pix_tipo?: TipoChavePix | null
}

/**
 * ATIVA a anotação (H4.3) numa só query, sob o lock já tomado: completa os dados
 * faltantes (telefone/Pix da outra ponta), grava os hashes de token e a expiração de 7
 * dias, e transita sem_aviso -> aguardando_aceite. O CHECK `status<>'sem_aviso'`
 * passa a EXIGIR o destino, então telefone/Pix já devem estar consistentes aqui (o
 * serviço valida antes com mensagem amigável). Retorna a linha atualizada.
 */
export async function ativarAviso(
  ex: Executor,
  id: string,
  dados: DadosAtivacao,
  convite: {
    aceite_token_hash: string
    aceite_token_expira_em: Date
    acao_token_hash: string
    convite_expira_em: Date
  },
  // Recorrência definida (ou redefinida) na ativação (E6 H6.10). undefined = mantém o que
  // estava (combinado simples ou recorrência já gravada na criação).
  recorrencia?: RecorrenciaAviso,
  // Cadência (subconjunto de etapas) definida na ativação; SEPARADA da recorrência (vale
  // para simples também). undefined = mantém o que estava. Quando `recorrencia` traz a
  // própria cadência, o serviço repassa a mesma aqui para o update ficar consistente.
  cadenciaEtapas?: EtapaEnvio[] | null,
): Promise<Aviso> {
  const { rows } = await ex.query<LinhaAviso>(
    `update public.avisos set
       status = 'aguardando_aceite',
       telefone_devedor = coalesce($2, telefone_devedor),
       nome_cobrador = coalesce($3, nome_cobrador),
       telefone_cobrador = coalesce($4, telefone_cobrador),
       pix_chave = coalesce($5, pix_chave),
       pix_titular = coalesce($6, pix_titular),
       pix_banco = coalesce($7, pix_banco),
       pix_tipo = coalesce($20::tipo_chave_pix, pix_tipo),
       recorrencia_tipo = case when $12::boolean then $13 else recorrencia_tipo end,
       recorrencia_freq = case when $12::boolean then $14 else recorrencia_freq end,
       recorrencia_intervalo = case when $12::boolean then coalesce($15,1) else recorrencia_intervalo end,
       ocorrencias_total = case when $12::boolean then $16 else ocorrencias_total end,
       ocorrencia_atual = case when $12::boolean then $17 else ocorrencia_atual end,
       cadencia_etapas = case when $18::boolean then $19::etapa_envio[] else cadencia_etapas end,
       aceite_token_hash = $8,
       aceite_token_expira_em = $9,
       acao_token_hash = $10,
       convite_expira_em = $11
     where id = $1
     returning ${COLS}`,
    [
      id,
      dados.telefone_devedor ?? null,
      dados.nome_cobrador ?? null,
      dados.telefone_cobrador ?? null,
      dados.pix_chave ?? null,
      dados.pix_titular ?? null,
      dados.pix_banco ?? null,
      convite.aceite_token_hash,
      convite.aceite_token_expira_em,
      convite.acao_token_hash,
      convite.convite_expira_em,
      recorrencia !== undefined,
      recorrencia?.recorrencia_tipo ?? null,
      recorrencia?.recorrencia_freq ?? null,
      recorrencia?.recorrencia_intervalo ?? null,
      recorrencia?.ocorrencias_total ?? null,
      recorrencia?.ocorrencia_atual ?? null,
      cadenciaEtapas !== undefined,
      cadenciaEtapas ?? null,
      dados.pix_tipo ?? null,
    ],
  )
  return mapear(rows[0]!)
}

/**
 * E7/H7.3: atualiza SÓ o snapshot do tipo da chave no aviso. Chamado quando a chave é
 * (re)escrita fora da criação/ativação (edição H2.5, desfazer/recusar), para o tipo
 * acompanhar a chave sem carona no snapshot de avisos_edicoes (que só guarda os campos do
 * acordo). null = sem tipo resolvido (o zap reinferre no envio).
 */
export async function atualizarPixTipo(ex: Executor, id: string, tipo: TipoChavePix | null): Promise<void> {
  await ex.query(`update public.avisos set pix_tipo = $2::tipo_chave_pix where id = $1`, [id, tipo])
}

// ---- Ocorrências de combinado recorrente (E8 H8.7) -------------------------------------

/**
 * Materializa as N ocorrências de um combinado recorrente (índice 1..N, status
 * 'programado'). Idempotente: ON CONFLICT (aviso_id, indice) não duplica. As datas vêm
 * já expandidas pelo serviço (`expandirOcorrencias`, em America/Sao_Paulo).
 *
 * P2 (auditoria de SQL): batch único via unnest, em vez de até MAX_OCORRENCIAS (60)
 * INSERTs sequenciais. `datas` vazio não dispara query (unnest de array vazio já
 * devolveria 0 linhas, mas evitamos a viagem ao banco à toa).
 */
export async function inserirOcorrencias(
  ex: Executor,
  avisoId: string,
  datas: string[],
): Promise<void> {
  if (datas.length === 0) return
  const indices = datas.map((_, i) => i + 1)
  await ex.query(
    `insert into public.aviso_ocorrencias (aviso_id, indice, data_combinada, status)
       select $1, idx, dt, 'programado'
         from unnest($2::int[], $3::date[]) as t(idx, dt)
     on conflict (aviso_id, indice) do nothing`,
    [avisoId, indices, datas],
  )
}

/** Ocorrências do combinado (ordem por índice). Para o "k de N" e o desmembramento no painel. */
export async function listarOcorrencias(ex: Executor, avisoId: string): Promise<Ocorrencia[]> {
  const { rows } = await ex.query<Ocorrencia>(
    `select id, aviso_id, indice,
            to_char(data_combinada, 'YYYY-MM-DD') as data_combinada,
            status, confirmado_em, criado_em
       from public.aviso_ocorrencias where aviso_id = $1 order by indice asc`,
    [avisoId],
  )
  return rows
}

/** Aviso como CRIADOR com FOR UPDATE (serializa editar/pausar/cancelar concorrentes). */
export async function buscarComoCriadorParaUpdate(
  ex: Executor,
  id: string,
  uid: string,
): Promise<Aviso | null> {
  const { rows } = await ex.query<LinhaAviso>(
    `select ${COLS} from public.avisos
     where id = $1
       and ((criador_papel = 'cobrador' and cobrador_id = $2)
            or (criador_papel = 'devedor' and devedor_profile_id = $2))
     for update`,
    [id, uid],
  )
  return rows[0] ? mapear(rows[0]) : null
}

// Campos editáveis do combinado (H2.5). pix_titular/pix_banco acompanham a chave.
// itens entra no snapshot porque o valor é DERIVADO deles: uma edição de itens que muda o
// total anda junto com valor_centavos pelo caminho do acordo (desfazer/recusar reverte ambos).
export interface DadosEditaveis {
  nome_devedor: string
  motivo: string
  valor_centavos: number
  data_combinada: string
  pix_chave: string | null
  pix_titular: string | null
  pix_banco: string | null
  itens: ItemPedido[] | null
}

/** Lê os dados editáveis atuais (snapshot do "antes" da edição). */
export async function lerDadosEditaveis(ex: Executor, id: string): Promise<DadosEditaveis | null> {
  const { rows } = await ex.query<{
    nome_devedor: string
    motivo: string
    valor_centavos: string
    data_combinada: string
    pix_chave: string | null
    pix_titular: string | null
    pix_banco: string | null
    itens: ItemPedido[] | null
  }>(
    `select nome_devedor, motivo, valor_centavos::bigint as valor_centavos,
            to_char(data_combinada,'YYYY-MM-DD') as data_combinada,
            pix_chave, pix_titular, pix_banco, itens
     from public.avisos where id = $1`,
    [id],
  )
  const r = rows[0]
  if (!r) return null
  return { ...r, valor_centavos: Number(r.valor_centavos) }
}

/** Aplica os dados editados (parcial). Só os campos passados são alterados. */
export async function atualizarDados(
  ex: Executor,
  id: string,
  campos: Partial<DadosEditaveis>,
): Promise<void> {
  const sets: string[] = []
  const params: unknown[] = [id]
  for (const [k, v] of Object.entries(campos)) {
    if (v === undefined) continue
    // itens é jsonb: passamos a string JSON e casteamos (senão node-pg trata o array JS como
    // array literal do Postgres). Espelha inserirAviso/atualizarItens. null limpa a coluna.
    if (k === 'itens') {
      params.push(v == null ? null : JSON.stringify(v))
      sets.push(`itens = $${params.length}::jsonb`)
      continue
    }
    params.push(v)
    sets.push(`${k} = $${params.length}`)
  }
  if (sets.length === 0) return
  await ex.query(`update public.avisos set ${sets.join(', ')} where id = $1`, params)
}

/** Insere o snapshot append-only de uma edição (condições anteriores). */
export async function inserirEdicao(
  ex: Executor,
  avisoId: string,
  dadosAnteriores: DadosEditaveis,
  statusAnterior: StatusAviso,
): Promise<void> {
  await ex.query(
    `insert into public.avisos_edicoes (aviso_id, dados_anteriores, status_anterior)
     values ($1, $2, $3)`,
    [avisoId, JSON.stringify(dadosAnteriores), statusAnterior],
  )
}

/** Edição PENDENTE (resolucao null) do aviso, com o snapshot do "antes". */
export async function edicaoPendente(
  ex: Executor,
  avisoId: string,
): Promise<{ id: string; dados_anteriores: DadosEditaveis } | null> {
  const { rows } = await ex.query<{ id: string; dados_anteriores: DadosEditaveis }>(
    `select id::text as id, dados_anteriores from public.avisos_edicoes
     where aviso_id = $1 and resolucao is null
     order by criado_em desc limit 1
     for update`,
    [avisoId],
  )
  return rows[0] ?? null
}

/** Fecha o sub-ciclo de uma edição (aprovada/recusada/desfeita). Append-only update. */
export async function resolverEdicao(
  ex: Executor,
  edicaoId: string,
  resolucao: 'aprovada' | 'recusada' | 'desfeita',
): Promise<void> {
  await ex.query(
    `update public.avisos_edicoes set resolucao = $2, resolvida_em = now() where id = $1`,
    [edicaoId, resolucao],
  )
}

/**
 * Conta as edições já APLICADAS do combinado (para o limite por plano, H2.5/G-C2).
 * Cada linha em avisos_edicoes é uma edição que foi aplicada (entrou em reaprovação);
 * desfazer/recusar fecham a linha mas ela CONTA (a edição foi consumida). Derivado de
 * count(*), sem coluna redundante a manter em sync.
 */
export async function contarEdicoes(ex: Executor, avisoId: string): Promise<number> {
  const { rows } = await ex.query<{ n: string }>(
    `select count(*) as n from public.avisos_edicoes where aviso_id = $1`,
    [avisoId],
  )
  return Number(rows[0]!.n)
}

/** Arquiva a anotação (soft-delete, sai da contagem da agenda). Nunca DELETE físico. */
export async function arquivarAviso(ex: Executor, id: string): Promise<void> {
  await ex.query(`update public.avisos set arquivado_em = now() where id = $1`, [id])
}

/** Campos mínimos para rotear uma notificação (sem PII em log; só roteamento). */
export interface AvisoParaNotificar {
  id: string
  criador_papel: PapelAviso
  cobrador_id: string | null
  devedor_profile_id: string | null
  telefone_cobrador: string | null
  telefone_devedor: string | null
}

/** Lê os campos de roteamento de notificação de um aviso por id (sem filtro de dono). */
export async function buscarParaNotificar(
  ex: Executor,
  id: string,
): Promise<AvisoParaNotificar | null> {
  const { rows } = await ex.query<AvisoParaNotificar>(
    `select id, criador_papel, cobrador_id, devedor_profile_id, telefone_cobrador, telefone_devedor
     from public.avisos where id = $1`,
    [id],
  )
  return rows[0] ?? null
}

const ENVIO_COLS = `
  id, aviso_id, etapa, status, agendado_para, enviado_em, tentativas,
  proxima_tentativa_em, wamid, entrega_status, erro
`

/** Envios do ciclo (ordem cronológica de agendamento). */
export async function listarEnviosDoAviso(ex: Executor, avisoId: string): Promise<Envio[]> {
  const { rows } = await ex.query<Envio>(
    `select ${ENVIO_COLS} from public.envios where aviso_id = $1 order by agendado_para asc`,
    [avisoId],
  )
  return rows
}

/**
 * Estado bruto do envio do combinado (outbox notificacoes_cobrador, tipo 'combinado_enviar').
 * Lê a linha mais recente do aviso; o service mapeia para o estado semântico. Retorna null
 * quando não há envio enfileirado (ex.: modo agenda). Não expõe telefone/Pix (só status/erro).
 */
export async function buscarEnvioCombinado(
  ex: Executor,
  avisoId: string,
): Promise<{ status: string; erro: string | null; enviado_em: Date | null } | null> {
  const { rows } = await ex.query<{ status: string; erro: string | null; enviado_em: Date | null }>(
    `select status, erro, enviado_em from public.notificacoes_cobrador
      where aviso_id = $1 and tipo = 'combinado_enviar' order by criado_em desc limit 1`,
    [avisoId],
  )
  return rows[0] ?? null
}

/** Eventos de auditoria do aviso (ordem cronológica, append-only). */
export async function listarEventosDoAviso(ex: Executor, avisoId: string): Promise<EventoAviso[]> {
  // id é bigint: o driver pg o devolve como string; convertemos para number (cabe com folga).
  const { rows } = await ex.query<EventoAviso>(
    `select id::int as id, aviso_id, tipo, ator, detalhes, criado_em
     from public.eventos_aviso where aviso_id = $1 order by criado_em asc, id asc`,
    [avisoId],
  )
  return rows
}

// ---- Categoria do combinado (E16) -------------------------------------------------------

/**
 * Confirma que TODAS as categorias são do dono e estão ativas (H16.3 multi), por query direta
 * na tabela `categorias` (módulo nunca importa módulo; consultar tabela compartilhada é
 * permitido). Espera `ids` já deduplicado; compara count = ids.length. [] = válido (vazio).
 */
export async function categoriasValidasDoDono(
  ex: Executor,
  uid: string,
  ids: readonly string[],
): Promise<boolean> {
  if (ids.length === 0) return true
  const { rows } = await ex.query<{ n: number }>(
    `select count(*)::int as n from public.categorias
      where profile_id = $1 and not arquivada and id = any($2::uuid[])`,
    [uid, ids as string[]],
  )
  return (rows[0]?.n ?? 0) === ids.length
}

/**
 * DEFINE as categorias de um combinado (H16.3 multi): delete-all + insert na junção
 * aviso_categorias (idempotente). `ids` vazio limpa todas. Junção pura (grant de DELETE é
 * exceção deliberada, ver MODULE.md); nunca apaga o combinado nem a categoria do catálogo.
 */
export async function definirCategorias(
  ex: Executor,
  avisoId: string,
  ids: readonly string[],
): Promise<void> {
  await ex.query(`delete from public.aviso_categorias where aviso_id = $1`, [avisoId])
  if (ids.length > 0) {
    await ex.query(
      `insert into public.aviso_categorias (aviso_id, categoria_id)
       select $1, unnest($2::uuid[]) on conflict do nothing`,
      [avisoId, ids as string[]],
    )
  }
}

/** Grava/limpa o custo (centavos) de um combinado (Fase A). null limpa. Dado interno. */
export async function atualizarCusto(
  ex: Executor,
  id: string,
  custoCentavos: number | null,
): Promise<void> {
  await ex.query(`update public.avisos set valor_custo_centavos = $2 where id = $1`, [id, custoCentavos])
}

/** Grava/limpa a composição do pedido (itens) de um combinado (Fase A). null limpa. Interno.
 *  jsonb: passa a string JSON (node-pg trataria Array como array literal do Postgres). */
export async function atualizarItens(
  ex: Executor,
  id: string,
  itens: ItemPedido[] | null,
): Promise<void> {
  await ex.query(`update public.avisos set itens = $2::jsonb where id = $1`, [
    id,
    itens == null ? null : JSON.stringify(itens),
  ])
}

// ---- Reporte de dado incorreto (item 7, migration 0092) --------------------------------

/** Campo do combinado que o devedor apontou como incorreto. Pix NÃO entra (sinal
 *  próprio, `pix_incorreto`, 0035). Espelha o CHECK de `avisos_reportes.campo`. */
export type CampoReporte = 'valor' | 'data' | 'nome_motivo'

/** Valores que o DEVEDOR informou como CORRETOS ao reportar (formato depende de
 *  `campo`): o zap (grupo 1E) escreve; a api só lê para reabrir a edição pré-preenchida. */
export interface DadosReporte {
  valor_centavos?: number | null
  data_combinada?: string | null
  nome_devedor?: string | null
  motivo?: string | null
}

export interface ReportePendente {
  id: string
  campo: CampoReporte
  dados_corretos: DadosReporte
}

/**
 * Reporte PENDENTE (resolucao='pendente') do aviso, com os dados corretos informados
 * pelo devedor. FOR UPDATE: serializa aprovar/recusar concorrentes (mesmo padrão de
 * `edicaoPendente`).
 */
export async function reportePendente(ex: Executor, avisoId: string): Promise<ReportePendente | null> {
  const { rows } = await ex.query<ReportePendente>(
    `select id::text as id, campo, dados_corretos
       from public.avisos_reportes
      where aviso_id = $1 and resolucao = 'pendente'
      order by criado_em desc limit 1
      for update`,
    [avisoId],
  )
  return rows[0] ?? null
}

/** Fecha o reporte (aprovado/recusado). Append-only update (nunca DELETE). */
export async function resolverReporte(
  ex: Executor,
  reporteId: string,
  resolucao: 'aprovado' | 'recusado',
): Promise<void> {
  await ex.query(
    `update public.avisos_reportes set resolucao = $2, resolvido_em = now() where id = $1`,
    [reporteId, resolucao],
  )
}

export interface ReporteResolvidoRecente {
  campo: CampoReporte
  dados_corretos: DadosReporte
}

/**
 * Reporte de dado incorreto já APROVADO cuja correção ainda não foi aplicada: o ÚLTIMO
 * evento do aviso é `dado_incorreto_aprovado`. Sem coluna nova: uma edição normal em
 * seguida (PATCH /avisos/:id) gera um evento `editado` mais recente, e este método passa
 * a devolver null (a correção já foi tratada). Necessário porque a aprovação pode
 * acontecer por WhatsApp (texto "aprovar" ao telefone do cobrador, grupo 1E wave 2), que
 * resolve `avisos_reportes` direto pelo zap e não tem uma resposta HTTP síncrona para o
 * painel carregar o reporte (só `POST /avisos/:id/aprovar-dado-incorreto` tem isso).
 */
export async function reporteAprovadoPendenteDeEdicao(
  ex: Executor,
  avisoId: string,
): Promise<ReporteResolvidoRecente | null> {
  const { rows } = await ex.query<{ tipo: string; detalhes: { reporte_id?: string } | null }>(
    `select tipo, detalhes from public.eventos_aviso
      where aviso_id = $1 order by criado_em desc limit 1`,
    [avisoId],
  )
  const ultimo = rows[0]
  if (!ultimo || ultimo.tipo !== 'dado_incorreto_aprovado' || !ultimo.detalhes?.reporte_id) return null
  const { rows: repRows } = await ex.query<ReporteResolvidoRecente>(
    `select campo, dados_corretos from public.avisos_reportes where id = $1`,
    [ultimo.detalhes.reporte_id],
  )
  return repRows[0] ?? null
}
