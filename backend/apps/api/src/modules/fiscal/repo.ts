// Acesso a dados: SO via @whaviso/shared/db, sempre com sql`...` (parametrizado); toda consulta
// filtra por loja_id. Pedido e itens sao lidos por SQL (sem importar o modulo pedidos).
// A credencial cifrada so e projetada em `obterConfigComCredencial` (uso interno da emissao);
// as projecoes publicas nunca a trazem.
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'

const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)

export interface ConfigMeta {
  cnpj: string
  regime: 'mei' | 'simples_nacional' | 'lucro_presumido' | 'lucro_real'
  serie_nfce: number
  serie_nfse: number
  ambiente: 'homologacao' | 'producao'
  ativo: boolean
  auto_emitir: boolean
  ultimos4: string | null
  criado_em: string
  atualizado_em: string
}
export interface ConfigComCredencial extends ConfigMeta {
  credencial_cifrada: Buffer
}

const META = sql`${sqlBruto('cnpj, regime, serie_nfce, serie_nfse, ambiente, ativo, auto_emitir, ultimos4')},
  ${TS('criado_em')} as criado_em, ${TS('atualizado_em')} as atualizado_em`

export async function obterConfig(exec: Executor, lojaId: string) {
  return consultarUm<ConfigMeta>(exec, sql`select ${META} from public.fiscal_config where loja_id = ${lojaId}`)
}

export async function obterConfigComCredencial(exec: Executor, lojaId: string) {
  return consultarUm<ConfigComCredencial>(
    exec,
    sql`select ${META}, credencial_cifrada from public.fiscal_config where loja_id = ${lojaId}`,
  )
}

export interface DadosConfig {
  lojaId: string
  credencialCifrada: Buffer
  ultimos4: string
  cnpj: string
  regime: string
  serieNfce: number
  serieNfse: number
  ambiente: string
}

/** Set/rotate por loja (unique). Reativa a configuracao. */
export async function upsertConfig(exec: Executor, d: DadosConfig): Promise<ConfigMeta> {
  const r = await consultarUm<ConfigMeta>(
    exec,
    sql`insert into public.fiscal_config
          (loja_id, credencial_cifrada, ultimos4, cnpj, regime, serie_nfce, serie_nfse, ambiente, ativo)
        values (${d.lojaId}, ${d.credencialCifrada}, ${d.ultimos4}, ${d.cnpj}, ${d.regime},
                ${d.serieNfce}, ${d.serieNfse}, ${d.ambiente}, true)
        on conflict (loja_id) do update set
          credencial_cifrada = ${d.credencialCifrada}, ultimos4 = excluded.ultimos4, cnpj = excluded.cnpj,
          regime = excluded.regime, serie_nfce = excluded.serie_nfce, serie_nfse = excluded.serie_nfse,
          ambiente = excluded.ambiente, ativo = true
        returning ${META}`,
  )
  return r!
}

export async function ajustarConfig(
  exec: Executor,
  lojaId: string,
  c: {
    cnpj?: string
    regime?: string
    serie_nfce?: number
    serie_nfse?: number
    ambiente?: string
    ativo?: boolean
    auto_emitir?: boolean
  },
): Promise<ConfigMeta | null> {
  const sets: Consulta[] = []
  if (c.cnpj !== undefined) sets.push(sql`cnpj = ${c.cnpj}`)
  if (c.regime !== undefined) sets.push(sql`regime = ${c.regime}`)
  if (c.serie_nfce !== undefined) sets.push(sql`serie_nfce = ${c.serie_nfce}`)
  if (c.serie_nfse !== undefined) sets.push(sql`serie_nfse = ${c.serie_nfse}`)
  if (c.ambiente !== undefined) sets.push(sql`ambiente = ${c.ambiente}`)
  if (c.ativo !== undefined) sets.push(sql`ativo = ${c.ativo}`)
  if (c.auto_emitir !== undefined) sets.push(sql`auto_emitir = ${c.auto_emitir}`)
  if (sets.length === 0) return obterConfig(exec, lojaId)
  let clausula = sets[0]!
  for (let i = 1; i < sets.length; i++) clausula = sql`${clausula}, ${sets[i]!}`
  return consultarUm<ConfigMeta>(
    exec,
    sql`update public.fiscal_config set ${clausula} where loja_id = ${lojaId} returning ${META}`,
  )
}

// ---- Pedido (leitura por SQL) ------------------------------------------------------------------

export interface PedidoFiscal {
  id: string
  codigo: string
  status: string
  total_centavos: number
}
export async function obterPedido(exec: Executor, lojaId: string, pedidoId: string) {
  return consultarUm<PedidoFiscal>(
    exec,
    sql`select id, codigo, status::text as status, total_centavos
          from public.pedidos where id = ${pedidoId} and loja_id = ${lojaId}`,
  )
}

export interface ItemPedidoFiscal {
  nome: string
  quantidade: number
  unitario: number
  total: number
  /** Dado fiscal do item do catalogo (nulo quando o item nao tem referencia ou cadastro fiscal). */
  ncm: string | null
  cfop: string | null
  origem: number | null
  unidade: string | null
  csosn: string | null
  cst: string | null
}
/**
 * Itens do pedido com o dado fiscal do item do catalogo (left join por item_id). Snapshot manda
 * no texto/valores; o dado fiscal vem da linha de catalogo (itens_fiscais), quando existir. Itens
 * sem referencia (item_id null) ou sem cadastro fiscal vem com os campos fiscais nulos: a emissao
 * de NFC-e os aponta como pendentes.
 */
export async function itensDoPedidoComFiscal(exec: Executor, lojaId: string, pedidoId: string) {
  return consultar<ItemPedidoFiscal>(
    exec,
    sql`select ip.nome_snapshot as nome, ip.quantidade::int as quantidade,
               ip.preco_unitario_centavos as unitario, ip.total_centavos as total,
               itf.ncm, itf.cfop, itf.origem::int as origem, itf.unidade, itf.csosn, itf.cst
          from public.itens_pedido ip
          left join public.itens_fiscais itf
            on itf.item_id = ip.item_id and itf.loja_id = ip.loja_id
         where ip.pedido_id = ${pedidoId} and ip.loja_id = ${lojaId} and not ip.cancelado
         order by ip.criado_em, ip.id`,
  )
}

// ---- Dados fiscais por item (catalogo) ---------------------------------------------------------

export interface ItemFiscalLinha {
  item_id: string
  nome: string
  categoria_nome: string | null
  ativo: boolean
  ncm: string | null
  cfop: string | null
  origem: number | null
  unidade: string | null
  csosn: string | null
  cst: string | null
}

/** Itens do catalogo da loja com o dado fiscal (left join), para o editor em massa. */
export async function listarItensComFiscal(exec: Executor, lojaId: string) {
  return consultar<ItemFiscalLinha>(
    exec,
    sql`select it.id as item_id, it.nome, c.nome as categoria_nome, it.ativo,
               itf.ncm, itf.cfop, itf.origem::int as origem, itf.unidade, itf.csosn, itf.cst
          from public.itens it
          join public.categorias c on c.id = it.categoria_id
          left join public.itens_fiscais itf on itf.item_id = it.id and itf.loja_id = it.loja_id
         where it.loja_id = ${lojaId}
         order by c.ordem, c.nome, it.ordem, it.nome`,
  )
}

/** Confere que o item existe e pertence a loja (antes do upsert fiscal). */
export async function itemPertenceALoja(exec: Executor, lojaId: string, itemId: string): Promise<boolean> {
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`select id from public.itens where id = ${itemId} and loja_id = ${lojaId}`,
  )
  return r != null
}

export interface DadoFiscalItem {
  ncm: string
  cfop: string
  origem: number
  unidade: string
  csosn: string | null
  cst: string | null
}

/** Set/ajuste do dado fiscal de um item (unique por loja+item). */
export async function upsertItemFiscal(
  exec: Executor,
  lojaId: string,
  itemId: string,
  d: DadoFiscalItem,
): Promise<ItemFiscalLinha | null> {
  await consultar(
    exec,
    sql`insert into public.itens_fiscais (loja_id, item_id, ncm, cfop, origem, unidade, csosn, cst)
        values (${lojaId}, ${itemId}, ${d.ncm}, ${d.cfop}, ${d.origem}, ${d.unidade}, ${d.csosn}, ${d.cst})
        on conflict (loja_id, item_id) do update set
          ncm = ${d.ncm}, cfop = ${d.cfop}, origem = ${d.origem}, unidade = ${d.unidade},
          csosn = ${d.csosn}, cst = ${d.cst}`,
  )
  return consultarUm<ItemFiscalLinha>(
    exec,
    sql`select it.id as item_id, it.nome, c.nome as categoria_nome, it.ativo,
               itf.ncm, itf.cfop, itf.origem::int as origem, itf.unidade, itf.csosn, itf.cst
          from public.itens it
          join public.categorias c on c.id = it.categoria_id
          left join public.itens_fiscais itf on itf.item_id = it.id and itf.loja_id = it.loja_id
         where it.id = ${itemId} and it.loja_id = ${lojaId}`,
  )
}

// ---- Pedidos elegiveis a emissao ---------------------------------------------------------------

export interface PedidoEmissivel {
  pedido_id: string
  codigo: string
  status: string
  total_centavos: number
  criado_em: string
}

/**
 * Pedidos concluidos (`entregue`) que ainda nao tem NFC-e. Base para o painel oferecer a emissao e
 * para a emissao automatica em lote. Exclui os que ja tem documento do tipo (nao-erro).
 */
export async function pedidosEmissiveis(exec: Executor, lojaId: string, limite: number) {
  return consultar<PedidoEmissivel>(
    exec,
    sql`select p.id as pedido_id, p.codigo, p.status::text as status, p.total_centavos,
               ${TS('p.criado_em')} as criado_em
          from public.pedidos p
         where p.loja_id = ${lojaId}
           and p.status = 'entregue'
           and not exists (
             select 1 from public.documentos_fiscais d
              where d.pedido_id = p.id and d.tipo = 'nfce' and d.status <> 'erro'
           )
         order by p.criado_em desc, p.id desc
         limit ${limite}`,
  )
}

// ---- Documentos --------------------------------------------------------------------------------

export interface DocumentoLinha {
  id: string
  pedido_id: string
  pedido_codigo: string
  tipo: 'nfce' | 'nfse'
  status: 'pendente' | 'emitido' | 'erro'
  chave: string | null
  link: string | null
  erro: string | null
  valor_total_centavos: number
  tentativas: number
  emitido_em: string | null
  criado_em: string
  atualizado_em: string
}

const DOC_COLS = sql`${sqlBruto('d.id, d.pedido_id, p.codigo as pedido_codigo, d.tipo, d.status, d.chave, d.link, d.erro, d.valor_total_centavos, d.tentativas')},
  ${TS('d.emitido_em')} as emitido_em, ${TS('d.criado_em')} as criado_em, ${TS('d.atualizado_em')} as atualizado_em`

const DOC_FROM = sqlBruto('public.documentos_fiscais d join public.pedidos p on p.id = d.pedido_id')

/**
 * Reserva a emissao (idempotente, corrida resolvida no banco): cria o documento `pendente` ou
 * reaproveita um em `erro` (ou `pendente` parado ha mais de 5 min, ex.: queda no meio da chamada),
 * incrementando `tentativas`. Devolve null se ja ha documento emitido ou emissao em andamento.
 */
export async function reservar(
  exec: Executor,
  d: { lojaId: string; pedidoId: string; tipo: string; valorTotalCentavos: number },
): Promise<string | null> {
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.documentos_fiscais (loja_id, pedido_id, tipo, status, valor_total_centavos)
        values (${d.lojaId}, ${d.pedidoId}, ${d.tipo}, 'pendente', ${d.valorTotalCentavos})
        on conflict (pedido_id, tipo) do update set
          status = 'pendente', erro = null, tentativas = public.documentos_fiscais.tentativas + 1
        where public.documentos_fiscais.status = 'erro'
           or (public.documentos_fiscais.status = 'pendente'
               and public.documentos_fiscais.atualizado_em < now() - interval '5 minutes')
        returning id`,
  )
  return r?.id ?? null
}

export async function registrarResultado(
  exec: Executor,
  lojaId: string,
  id: string,
  r: { status: 'pendente' | 'emitido' | 'erro'; chave: string | null; link: string | null; erro: string | null },
): Promise<void> {
  await consultar(
    exec,
    sql`update public.documentos_fiscais set
          status = ${r.status}, chave = ${r.chave}, link = ${r.link}, erro = ${r.erro},
          emitido_em = ${r.status === 'emitido' ? sql`now()` : sql`null`}
        where id = ${id} and loja_id = ${lojaId}`,
  )
}

export async function obterDocumento(exec: Executor, lojaId: string, id: string) {
  return consultarUm<DocumentoLinha>(
    exec,
    sql`select ${DOC_COLS} from ${DOC_FROM} where d.id = ${id} and d.loja_id = ${lojaId}`,
  )
}

export async function listarDocumentos(
  exec: Executor,
  lojaId: string,
  f: { status?: string | undefined; pedidoId?: string | undefined; limite: number },
) {
  return consultar<DocumentoLinha>(
    exec,
    sql`select ${DOC_COLS} from ${DOC_FROM}
         where d.loja_id = ${lojaId}
           and (${f.status ?? null}::text is null or d.status = ${f.status ?? null})
           and (${f.pedidoId ?? null}::uuid is null or d.pedido_id = ${f.pedidoId ?? null})
         order by d.criado_em desc, d.id desc
         limit ${f.limite}`,
  )
}

/** Auditoria sem segredo nem PII (tabela eventos). */
export async function registrarEvento(
  exec: Executor,
  e: { lojaId: string; tipo: string; entidade: string; entidadeId: string | null; detalhes: object },
): Promise<void> {
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${e.lojaId}, ${e.tipo}, ${e.entidade}, ${e.entidadeId}, 'loja', ${JSON.stringify(e.detalhes)}::jsonb)`,
  )
}
