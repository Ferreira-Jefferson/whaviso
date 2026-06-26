import type { Pool, PoolClient } from '@whaviso/shared/db'
import type {
  Aviso,
  DirecaoAviso,
  Envio,
  EtapaEnvio,
  EventoAviso,
  Ocorrencia,
  PapelAviso,
  StatusAviso,
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
  recorrencia_tipo, recorrencia_freq, recorrencia_intervalo,
  ocorrencias_total, ocorrencia_atual,
  -- node-pg não auto-parseia arrays de ENUM (etapa_envio[]) -> cast p/ text[] (parseado em JS).
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
  recorrencia_tipo: 'periodo' | 'avulsas' | null
  recorrencia_freq: 'mensal' | 'semanal' | 'diaria' | null
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
  return { ...l, valor_centavos: Number(l.valor_centavos) }
}

/** Configuração de recorrência/cadência gravada nas colunas do aviso (E6 H6.10 / E8 H8.7).
 *  Combinado simples = tudo null/undefined; o serviço já expandiu as datas e passa o N. */
export interface RecorrenciaAviso {
  recorrencia_tipo: 'periodo' | 'avulsas' | null
  recorrencia_freq: 'mensal' | 'semanal' | 'diaria' | null
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
  // Recorrência/cadência (null = combinado simples / ciclo completo).
  recorrencia_tipo?: 'periodo' | 'avulsas' | null
  recorrencia_freq?: 'mensal' | 'semanal' | 'diaria' | null
  recorrencia_intervalo?: number | null
  ocorrencias_total?: number | null
  ocorrencia_atual?: number | null
  cadencia_etapas?: EtapaEnvio[] | null
  aceite_token_hash: string | null
  aceite_token_expira_em: Date | null
  acao_token_hash: string | null
  /** Hash sha256 do número de convite de 6 dígitos (H2.2). null no agenda/invertido. */
  convite_hash: string | null
  /** E5/H5.7: expiração FIXA de 7 dias do convite (now()+7d). null no agenda. */
  convite_expira_em: Date | null
}

/** Código Postgres de violação de unicidade (usado no retry de geração do convite). */
export const UNIQUE_VIOLATION = '23505'

export async function inserirAviso(ex: Executor, novo: NovoAviso): Promise<Aviso> {
  const { rows } = await ex.query<LinhaAviso>(
    `insert into public.avisos
       (cobrador_id, devedor_profile_id, direcao, criador_papel, status,
        nome_devedor, telefone_devedor, nome_cobrador, telefone_cobrador, motivo,
        valor_centavos, data_combinada, pix_chave, pix_titular, pix_banco,
        recorrencia_tipo, recorrencia_freq, recorrencia_intervalo,
        ocorrencias_total, ocorrencia_atual, cadencia_etapas,
        aceite_token_hash, aceite_token_expira_em, acao_token_hash, convite_hash, convite_expira_em)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
             coalesce($18,1),$19,$20,$21::etapa_envio[],$22,$23,$24,$25,$26)
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
      novo.convite_hash, novo.convite_expira_em,
    ],
  )
  return mapear(rows[0]!)
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
  limit: number
  offset: number
}

export async function listarAvisos(
  ex: Executor,
  f: FiltroLista,
): Promise<{ itens: Aviso[]; total: number }> {
  const cond: string[] = []
  const params: unknown[] = [f.uid]
  // Visibilidade por PAPEL (H9.1): cobrador = cobrador_id; devedor = devedor_profile_id;
  // sem papel = qualquer um dos dois (visibilidade geral, isolada pelo uid).
  if (f.papel === 'cobrador') cond.push('cobrador_id = $1')
  else if (f.papel === 'devedor') cond.push('devedor_profile_id = $1')
  else cond.push('(cobrador_id = $1 or devedor_profile_id = $1)')
  if (f.status) {
    params.push(f.status)
    cond.push(`status = $${params.length}`)
  }
  if (f.estados && f.estados.length > 0) {
    params.push(f.estados as unknown as string[])
    cond.push(`status = any($${params.length})`)
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
  const where = cond.join(' and ')
  const total = await ex.query<{ n: string }>(
    `select count(*) as n from public.avisos where ${where}`,
    params,
  )
  const colOrdem = f.ordenar === 'data_combinada' ? 'data_combinada' : 'criado_em'
  const dirOrdem = f.dir === 'asc' ? 'asc' : 'desc'
  params.push(f.limit, f.offset)
  const { rows } = await ex.query<LinhaAviso>(
    `select ${COLS} from public.avisos where ${where}
     order by ${colOrdem} ${dirOrdem}, criado_em desc
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
}

/**
 * ATIVA a anotação (H4.3) numa só query, sob o lock já tomado: completa os dados
 * faltantes (telefone/Pix da outra ponta), grava os HASHES do convite (claro nunca
 * persiste) e transita sem_aviso -> aguardando_aceite. O CHECK `status<>'sem_aviso'`
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
    convite_hash: string
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
       recorrencia_tipo = case when $13::boolean then $14 else recorrencia_tipo end,
       recorrencia_freq = case when $13::boolean then $15 else recorrencia_freq end,
       recorrencia_intervalo = case when $13::boolean then coalesce($16,1) else recorrencia_intervalo end,
       ocorrencias_total = case when $13::boolean then $17 else ocorrencias_total end,
       ocorrencia_atual = case when $13::boolean then $18 else ocorrencia_atual end,
       cadencia_etapas = case when $19::boolean then $20::etapa_envio[] else cadencia_etapas end,
       aceite_token_hash = $8,
       aceite_token_expira_em = $9,
       acao_token_hash = $10,
       convite_hash = $11,
       convite_expira_em = $12
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
      convite.convite_hash,
      convite.convite_expira_em,
      recorrencia !== undefined,
      recorrencia?.recorrencia_tipo ?? null,
      recorrencia?.recorrencia_freq ?? null,
      recorrencia?.recorrencia_intervalo ?? null,
      recorrencia?.ocorrencias_total ?? null,
      recorrencia?.ocorrencia_atual ?? null,
      cadenciaEtapas !== undefined,
      cadenciaEtapas ?? null,
    ],
  )
  return mapear(rows[0]!)
}

// ---- Ocorrências de combinado recorrente (E8 H8.7) -------------------------------------

/**
 * Materializa as N ocorrências de um combinado recorrente (índice 1..N, status
 * 'programado'). Idempotente: ON CONFLICT (aviso_id, indice) não duplica. As datas vêm
 * já expandidas pelo serviço (`expandirOcorrencias`, em America/Sao_Paulo).
 */
export async function inserirOcorrencias(
  ex: Executor,
  avisoId: string,
  datas: string[],
): Promise<void> {
  for (let i = 0; i < datas.length; i++) {
    await ex.query(
      `insert into public.aviso_ocorrencias (aviso_id, indice, data_combinada, status)
         values ($1, $2, $3, 'programado')
       on conflict (aviso_id, indice) do nothing`,
      [avisoId, i + 1, datas[i]],
    )
  }
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

/**
 * E5/H5.9 (G4): ao criar/ativar um combinado para um telefone, LIMPA o bloqueio e zera o
 * contador anti-brute-force desse telefone ("bloqueado até que um novo combinado seja
 * enviado"). Idempotente (no-op se o telefone nunca tentou). Sem PII em log. Recebe os
 * telefones-alvo possíveis (devedor e/ou cobrador); ignora nulos.
 */
export async function limparBloqueioTelefone(
  ex: Executor,
  telefones: (string | null)[],
): Promise<void> {
  const alvos = telefones.filter((t): t is string => !!t)
  if (alvos.length === 0) return
  await ex.query(
    `update public.convite_tentativas_telefone
        set erros = 0, bloqueado = false, atualizado_em = now()
      where telefone = any($1)`,
    [alvos],
  )
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
export interface DadosEditaveis {
  nome_devedor: string
  motivo: string
  valor_centavos: number
  data_combinada: string
  pix_chave: string | null
  pix_titular: string | null
  pix_banco: string | null
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
  }>(
    `select nome_devedor, motivo, valor_centavos::bigint as valor_centavos,
            to_char(data_combinada,'YYYY-MM-DD') as data_combinada,
            pix_chave, pix_titular, pix_banco
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
