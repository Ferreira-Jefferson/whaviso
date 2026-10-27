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
  ultimos4: string | null
  criado_em: string
  atualizado_em: string
}
export interface ConfigComCredencial extends ConfigMeta {
  credencial_cifrada: Buffer
}

const META = sql`${sqlBruto('cnpj, regime, serie_nfce, serie_nfse, ambiente, ativo, ultimos4')},
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
  c: { cnpj?: string; regime?: string; serie_nfce?: number; serie_nfse?: number; ambiente?: string; ativo?: boolean },
): Promise<ConfigMeta | null> {
  const sets: Consulta[] = []
  if (c.cnpj !== undefined) sets.push(sql`cnpj = ${c.cnpj}`)
  if (c.regime !== undefined) sets.push(sql`regime = ${c.regime}`)
  if (c.serie_nfce !== undefined) sets.push(sql`serie_nfce = ${c.serie_nfce}`)
  if (c.serie_nfse !== undefined) sets.push(sql`serie_nfse = ${c.serie_nfse}`)
  if (c.ambiente !== undefined) sets.push(sql`ambiente = ${c.ambiente}`)
  if (c.ativo !== undefined) sets.push(sql`ativo = ${c.ativo}`)
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
}
export async function itensDoPedido(exec: Executor, lojaId: string, pedidoId: string) {
  return consultar<ItemPedidoFiscal>(
    exec,
    sql`select nome_snapshot as nome, quantidade::int as quantidade,
               preco_unitario_centavos as unitario, total_centavos as total
          from public.itens_pedido
         where pedido_id = ${pedidoId} and loja_id = ${lojaId} and not cancelado
         order by criado_em, id`,
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
