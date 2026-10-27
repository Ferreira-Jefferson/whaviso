// Acesso a dados do módulo: SÓ via @whaviso/shared/db, sempre com sql`...` (parametrizado).
//
// REGRA DE SEGREDO (SEC-020/023): `chave_cifrada` e `chave_hash` NUNCA entram nas projeções de
// leitura de estado (`COLS_PIX_PUBLICAS`). A única leitura da cifra é `lerChaveParaBrCode`, um
// método dedicado usado só na geração do BR Code (decifrada em memória, descartada em seguida).
// A api grava a cifra em `upsertPix`, cujo RETURNING também é só das colunas públicas.
import { consultar, consultarUm, sql, sqlBruto, type Executor } from '@whaviso/shared/db'
import type { LojaPixEstado, PagamentoSaida, PagamentosFiltro } from '@whaviso/shared/contracts'
import type { StatusPagamento, TipoChavePix } from '@whaviso/shared/contracts'

// ---- loja_pix -------------------------------------------------------------------------------

/** Projeção pública da chave Pix: SEM `chave_hash` e SEM `chave_cifrada`. Fragmento fixo. */
const COLS_PIX_PUBLICAS = sqlBruto('loja_id, tipo, ultimos4, titular, cidade, atualizado_em')

interface LinhaPix {
  loja_id: string
  tipo: TipoChavePix
  ultimos4: string | null
  titular: string
  cidade: string | null
  atualizado_em: Date | string
}

function iso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : String(v)
}

function mapearPix(l: LinhaPix): LojaPixEstado {
  return {
    loja_id: l.loja_id,
    tipo: l.tipo,
    ultimos4: l.ultimos4,
    titular: l.titular,
    cidade: l.cidade,
    atualizado_em: iso(l.atualizado_em),
  }
}

export interface DadosPix {
  lojaId: string
  tipo: TipoChavePix
  chaveHash: string
  chaveCifrada: Buffer
  ultimos4: string
  titular: string
  cidade: string | null
}

/** Set/rotate da chave Pix (uma por loja: PK loja_id). Grava hash+cifra; devolve só metadado. */
export async function upsertPix(exec: Executor, d: DadosPix): Promise<LojaPixEstado> {
  const linha = await consultarUm<LinhaPix>(
    exec,
    sql`insert into public.loja_pix
          (loja_id, tipo, chave_hash, chave_cifrada, ultimos4, titular, cidade)
        values (${d.lojaId}, ${d.tipo}, ${d.chaveHash}, ${d.chaveCifrada}, ${d.ultimos4}, ${d.titular}, ${d.cidade})
        on conflict (loja_id) do update
          set tipo = excluded.tipo,
              chave_hash = excluded.chave_hash,
              chave_cifrada = excluded.chave_cifrada,
              ultimos4 = excluded.ultimos4,
              titular = excluded.titular,
              cidade = excluded.cidade
        returning ${COLS_PIX_PUBLICAS}`,
  )
  // RETURNING sempre devolve a linha; null seria impossível.
  return mapearPix(linha!)
}

/** Estado (metadado) da chave Pix da loja, ou null se ainda não cadastrada. */
export async function buscarPixEstado(exec: Executor, lojaId: string): Promise<LojaPixEstado | null> {
  const linha = await consultarUm<LinhaPix>(
    exec,
    sql`select ${COLS_PIX_PUBLICAS} from public.loja_pix where loja_id = ${lojaId}`,
  )
  return linha ? mapearPix(linha) : null
}

export interface ChaveParaBrCode {
  tipo: TipoChavePix
  chaveCifrada: Buffer
  titular: string
  cidade: string | null
}

/**
 * Leitura DEDICADA da cifra, usada SÓ para gerar o BR Code. Fora deste método, nenhuma query do
 * módulo seleciona `chave_cifrada`. A chave em claro só existe em memória dentro do service, o
 * tempo mínimo para montar o payload.
 */
export async function lerChaveParaBrCode(
  exec: Executor,
  lojaId: string,
): Promise<ChaveParaBrCode | null> {
  const linha = await consultarUm<{
    tipo: TipoChavePix
    chave_cifrada: Buffer
    titular: string
    cidade: string | null
  }>(exec, sql`select tipo, chave_cifrada, titular, cidade from public.loja_pix where loja_id = ${lojaId}`)
  return linha
    ? { tipo: linha.tipo, chaveCifrada: linha.chave_cifrada, titular: linha.titular, cidade: linha.cidade }
    : null
}

// ---- pedidos (read-model) -------------------------------------------------------------------

export interface PedidoParaCobranca {
  id: string
  loja_id: string
  status: string
  total_centavos: number
  codigo: string
}

/**
 * Lê o pedido restrito à loja ativa (isolamento multi-tenant). Null fora do escopo.
 * `paraAtualizar` adiciona `for update`: dentro da transação de criação da cobrança ele
 * serializa criadores concorrentes do MESMO pedido (o segundo espera e reusa a pendente).
 */
export async function buscarPedido(
  exec: Executor,
  pedidoId: string,
  lojaId: string,
  paraAtualizar = false,
): Promise<PedidoParaCobranca | null> {
  const lock = paraAtualizar ? sqlBruto(' for update') : sqlBruto('')
  return consultarUm<PedidoParaCobranca>(
    exec,
    sql`select id, loja_id, status, total_centavos, codigo
          from public.pedidos where id = ${pedidoId} and loja_id = ${lojaId}${lock}`,
  )
}

// ---- pagamentos -----------------------------------------------------------------------------

const COLS_PAG = sqlBruto(
  'id, loja_id, pedido_id, status, valor_centavos, txid, br_code, expira_em, pago_em, criado_em, atualizado_em',
)

interface LinhaPag {
  id: string
  loja_id: string
  pedido_id: string
  status: StatusPagamento
  valor_centavos: number
  txid: string | null
  br_code: string | null
  expira_em: Date | string | null
  pago_em: Date | string | null
  criado_em: Date | string
  atualizado_em: Date | string
}

function mapearPag(l: LinhaPag): PagamentoSaida {
  return {
    id: l.id,
    loja_id: l.loja_id,
    pedido_id: l.pedido_id,
    status: l.status,
    valor_centavos: l.valor_centavos,
    txid: l.txid,
    br_code: l.br_code,
    expira_em: l.expira_em == null ? null : iso(l.expira_em),
    pago_em: l.pago_em == null ? null : iso(l.pago_em),
    criado_em: iso(l.criado_em),
    atualizado_em: iso(l.atualizado_em),
  }
}

export interface DadosCobranca {
  lojaId: string
  pedidoId: string
  valorCentavos: number
  txid: string
  brCode: string
  expiraEm: string
}

/**
 * Insere a cobrança. Em colisão do unique `(loja_id, txid)` o pg lança e `@whaviso/shared/db`
 * traduz para `ErroBanco` tipo 'unique'; o service tenta o próximo txid.
 */
export async function inserirCobranca(exec: Executor, d: DadosCobranca): Promise<PagamentoSaida> {
  const linha = await consultarUm<LinhaPag>(
    exec,
    sql`insert into public.pagamentos
          (loja_id, pedido_id, status, valor_centavos, txid, br_code, expira_em)
        values (${d.lojaId}, ${d.pedidoId}, 'pendente', ${d.valorCentavos}, ${d.txid}, ${d.brCode}, ${d.expiraEm})
        returning ${COLS_PAG}`,
  )
  return mapearPag(linha!)
}

/** Cobrança pendente e ainda não vencida do pedido (idempotência: reusa em vez de duplicar). */
export async function buscarPendenteAtiva(
  exec: Executor,
  pedidoId: string,
  lojaId: string,
): Promise<PagamentoSaida | null> {
  const linha = await consultarUm<LinhaPag>(
    exec,
    sql`select ${COLS_PAG} from public.pagamentos
          where pedido_id = ${pedidoId} and loja_id = ${lojaId}
            and status = 'pendente' and (expira_em is null or expira_em > now())
          order by criado_em desc limit 1`,
  )
  return linha ? mapearPag(linha) : null
}

/** Detalhe de uma cobrança, restrito à loja ativa. */
export async function buscarPagamento(
  exec: Executor,
  id: string,
  lojaId: string,
): Promise<PagamentoSaida | null> {
  const linha = await consultarUm<LinhaPag>(
    exec,
    sql`select ${COLS_PAG} from public.pagamentos where id = ${id} and loja_id = ${lojaId}`,
  )
  return linha ? mapearPag(linha) : null
}

/** Lista as cobranças da loja (opcionalmente por pedido e/ou status), mais recente primeiro. */
export async function listar(
  exec: Executor,
  lojaId: string,
  filtro: PagamentosFiltro,
): Promise<PagamentoSaida[]> {
  const porPedido = filtro.pedido_id ? sql`and pedido_id = ${filtro.pedido_id}` : sqlBruto('')
  const porStatus = filtro.status ? sql`and status = ${filtro.status}` : sqlBruto('')
  const linhas = await consultar<LinhaPag>(
    exec,
    sql`select ${COLS_PAG} from public.pagamentos
          where loja_id = ${lojaId} ${porPedido} ${porStatus}
          order by criado_em desc`,
  )
  return linhas.map(mapearPag)
}

/** Expiração preguiçosa: vencidas pendentes viram `expirado`. Devolve quantas mudaram. */
export async function expirarVencidas(exec: Executor, lojaId: string): Promise<number> {
  const linhas = await consultar<{ id: string }>(
    exec,
    sql`update public.pagamentos set status = 'expirado'
          where loja_id = ${lojaId} and status = 'pendente'
            and expira_em is not null and expira_em <= now()
        returning id`,
  )
  return linhas.length
}

/** Transição pendente -> pago (com `pago_em`). Só afeta linha pendente; devolve null se não pôde. */
export async function marcarPago(
  exec: Executor,
  id: string,
  lojaId: string,
  pagoEm: string,
): Promise<PagamentoSaida | null> {
  const linha = await consultarUm<LinhaPag>(
    exec,
    sql`update public.pagamentos set status = 'pago', pago_em = ${pagoEm}
          where id = ${id} and loja_id = ${lojaId} and status = 'pendente'
        returning ${COLS_PAG}`,
  )
  return linha ? mapearPag(linha) : null
}

/** Transição pendente -> cancelado. Só afeta linha pendente; devolve null se não pôde. */
export async function cancelar(
  exec: Executor,
  id: string,
  lojaId: string,
): Promise<PagamentoSaida | null> {
  const linha = await consultarUm<LinhaPag>(
    exec,
    sql`update public.pagamentos set status = 'cancelado'
          where id = ${id} and loja_id = ${lojaId} and status = 'pendente'
        returning ${COLS_PAG}`,
  )
  return linha ? mapearPag(linha) : null
}
