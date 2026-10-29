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

// ---- loja_pagamento_config (modo do Pix + encargo) ------------------------------------------

export interface PagamentoConfigLinha {
  pix_modo: 'chave_propria' | 'intermediado'
  encargo_modo: 'absorve' | 'repassa'
  cartao_habilitado: boolean
  atualizado_em: Date | string
}

/** Config de pagamento da loja, ou null se ainda nao salva (o service aplica o default). */
export async function obterPagamentoConfig(
  exec: Executor,
  lojaId: string,
): Promise<PagamentoConfigLinha | null> {
  return consultarUm<PagamentoConfigLinha>(
    exec,
    sql`select pix_modo, encargo_modo, cartao_habilitado, atualizado_em
          from public.loja_pagamento_config where loja_id = ${lojaId}`,
  )
}

/** Upsert parcial: coalesce mantem o valor atual (ou o default do schema) em campo nao informado. */
export async function upsertPagamentoConfig(
  exec: Executor,
  lojaId: string,
  c: {
    pixModo: 'chave_propria' | 'intermediado' | null
    encargoModo: 'absorve' | 'repassa' | null
    cartaoHabilitado: boolean | null
  },
): Promise<PagamentoConfigLinha> {
  const linha = await consultarUm<PagamentoConfigLinha>(
    exec,
    sql`insert into public.loja_pagamento_config (loja_id, pix_modo, encargo_modo, cartao_habilitado)
        values (${lojaId},
                coalesce(${c.pixModo}::pix_modo, 'chave_propria'),
                coalesce(${c.encargoModo}::encargo_modo, 'absorve'),
                coalesce(${c.cartaoHabilitado}::boolean, false))
        on conflict (loja_id) do update set
          pix_modo = coalesce(${c.pixModo}::pix_modo, public.loja_pagamento_config.pix_modo),
          encargo_modo = coalesce(${c.encargoModo}::encargo_modo, public.loja_pagamento_config.encargo_modo),
          cartao_habilitado = coalesce(${c.cartaoHabilitado}::boolean, public.loja_pagamento_config.cartao_habilitado)
        returning pix_modo, encargo_modo, cartao_habilitado, atualizado_em`,
  )
  return linha!
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

// ---- Credencial do PSP (plataforma; segredo cifrado) ----------------------------------------

/** Leitura DEDICADA da cifra da credencial do PSP (decifrada só em memória pelo service). */
export async function lerCredencialPspCifrada(
  exec: Executor,
  provider = 'asaas',
): Promise<Buffer | null> {
  const linha = await consultarUm<{ chave_cifrada: Buffer }>(
    exec,
    sql`select chave_cifrada from public.credenciais_psp where provider = ${provider}`,
  )
  return linha ? linha.chave_cifrada : null
}

/** Metadado da credencial (NUNCA a cifra): existe e quando foi atualizada. */
export async function statusCredencialPsp(
  exec: Executor,
  provider = 'asaas',
): Promise<{ configurada: boolean; atualizado_em: string | null }> {
  const linha = await consultarUm<{ atualizado_em: Date | string }>(
    exec,
    sql`select atualizado_em from public.credenciais_psp where provider = ${provider}`,
  )
  return linha ? { configurada: true, atualizado_em: iso(linha.atualizado_em) } : { configurada: false, atualizado_em: null }
}

/** Set/rotate da credencial do PSP (cifra em repouso). RETURNING só o metadado. */
export async function upsertCredencialPsp(
  exec: Executor,
  provider: string,
  chaveCifrada: Buffer,
): Promise<{ atualizado_em: string }> {
  const linha = await consultarUm<{ atualizado_em: Date | string }>(
    exec,
    sql`insert into public.credenciais_psp (provider, chave_cifrada)
        values (${provider}, ${chaveCifrada})
        on conflict (provider) do update set chave_cifrada = excluded.chave_cifrada
        returning atualizado_em`,
  )
  return { atualizado_em: iso(linha!.atualizado_em) }
}

// ---- Subconta (recebedor) do PSP por loja ---------------------------------------------------

export interface SubcontaLinha {
  id: string
  loja_id: string
  provider: string
  subconta_ref: string | null
  status_kyc: 'pendente' | 'aprovada' | 'recusada'
  atualizado_em: Date | string
}

export interface SubcontaSaida {
  provider: string
  subconta_ref: string | null
  status_kyc: 'pendente' | 'aprovada' | 'recusada'
  atualizado_em: string
}

function mapearSubconta(l: SubcontaLinha): SubcontaSaida {
  return {
    provider: l.provider,
    subconta_ref: l.subconta_ref,
    status_kyc: l.status_kyc,
    atualizado_em: iso(l.atualizado_em),
  }
}

export async function obterSubconta(
  exec: Executor,
  lojaId: string,
  provider = 'asaas',
): Promise<SubcontaSaida | null> {
  const linha = await consultarUm<SubcontaLinha>(
    exec,
    sql`select id, loja_id, provider, subconta_ref, status_kyc, atualizado_em
          from public.psp_subcontas where loja_id = ${lojaId} and provider = ${provider}`,
  )
  return linha ? mapearSubconta(linha) : null
}

/**
 * Cria/atualiza a subconta (onboarding). Campos nulos preservam o valor atual (coalesce). `apiKeyCifrada`
 * e o SEGREDO da subconta (modelo B): gravado so por este caminho, nunca devolvido no RETURNING (que e
 * so a projecao publica de status).
 */
export async function upsertSubconta(
  exec: Executor,
  lojaId: string,
  provider: string,
  c: {
    subcontaRef: string | null
    statusKyc: 'pendente' | 'aprovada' | 'recusada' | null
    apiKeyCifrada?: Buffer | null
    customerRef?: string | null
  },
): Promise<SubcontaSaida> {
  const apiKey = c.apiKeyCifrada ?? null
  const customer = c.customerRef ?? null
  const linha = await consultarUm<SubcontaLinha>(
    exec,
    sql`insert into public.psp_subcontas (loja_id, provider, subconta_ref, status_kyc, api_key_cifrada, customer_ref)
        values (${lojaId}, ${provider}, ${c.subcontaRef}, coalesce(${c.statusKyc}::status_subconta_psp, 'pendente'),
                ${apiKey}, ${customer})
        on conflict (loja_id, provider) do update set
          subconta_ref = coalesce(excluded.subconta_ref, public.psp_subcontas.subconta_ref),
          status_kyc = coalesce(${c.statusKyc}::status_subconta_psp, public.psp_subcontas.status_kyc),
          api_key_cifrada = coalesce(${apiKey}, public.psp_subcontas.api_key_cifrada),
          customer_ref = coalesce(${customer}, public.psp_subcontas.customer_ref)
        returning id, loja_id, provider, subconta_ref, status_kyc, atualizado_em`,
  )
  return mapearSubconta(linha!)
}

export interface SubcontaParaCobranca {
  apiKeyCifrada: Buffer
  customerRef: string | null
  statusKyc: 'pendente' | 'aprovada' | 'recusada'
}

/**
 * Leitura DEDICADA da credencial da subconta (cifra + customer), usada SO para montar a cobranca
 * intermediada. Fora deste metodo, nenhuma query do modulo seleciona `api_key_cifrada`. Null se a
 * subconta ainda nao foi provisionada com a chave.
 */
export async function lerSubcontaParaCobranca(
  exec: Executor,
  lojaId: string,
  provider = 'asaas',
): Promise<SubcontaParaCobranca | null> {
  const linha = await consultarUm<{
    api_key_cifrada: Buffer | null
    customer_ref: string | null
    status_kyc: 'pendente' | 'aprovada' | 'recusada'
  }>(
    exec,
    sql`select api_key_cifrada, customer_ref, status_kyc
          from public.psp_subcontas where loja_id = ${lojaId} and provider = ${provider}`,
  )
  if (!linha || !linha.api_key_cifrada) return null
  return { apiKeyCifrada: linha.api_key_cifrada, customerRef: linha.customer_ref, statusKyc: linha.status_kyc }
}

// ---- Cobranca intermediada (PSP) ------------------------------------------------------------

export interface DadosCobrancaIntermediada {
  lojaId: string
  pedidoId: string
  valorCobradoCentavos: number
  encargoCentavos: number
  meio: 'pix' | 'cartao'
  chargeRef: string
  payload: string
  expiraEm: string | null
}

/** Insere a cobranca do caminho intermediado (provider='asaas'); `payload` vai em br_code. */
export async function inserirCobrancaIntermediada(
  exec: Executor,
  d: DadosCobrancaIntermediada,
): Promise<PagamentoSaida> {
  const linha = await consultarUm<LinhaPag>(
    exec,
    sql`insert into public.pagamentos
          (loja_id, pedido_id, status, valor_centavos, br_code, expira_em,
           provider, meio, charge_ref, encargo_centavos)
        values (${d.lojaId}, ${d.pedidoId}, 'pendente', ${d.valorCobradoCentavos}, ${d.payload}, ${d.expiraEm},
                'asaas', ${d.meio}, ${d.chargeRef}, ${d.encargoCentavos})
        returning ${COLS_PAG}`,
  )
  return mapearPag(linha!)
}

/** Conciliacao por webhook: pendente -> pago via (provider, charge_ref). Idempotente (null se nao pendente). */
export async function marcarPagoPorCharge(
  exec: Executor,
  provider: string,
  chargeRef: string,
  taxaPspCentavos: number | null,
): Promise<PagamentoSaida | null> {
  const linha = await consultarUm<LinhaPag>(
    exec,
    sql`update public.pagamentos set status = 'pago', pago_em = now(), taxa_psp_centavos = ${taxaPspCentavos}
          where provider = ${provider} and charge_ref = ${chargeRef} and status = 'pendente'
        returning ${COLS_PAG}`,
  )
  return linha ? mapearPag(linha) : null
}

/** Cobranca por (provider, charge_ref), para o webhook decidir idempotencia. */
export async function buscarPorCharge(
  exec: Executor,
  provider: string,
  chargeRef: string,
): Promise<PagamentoSaida | null> {
  const linha = await consultarUm<LinhaPag>(
    exec,
    sql`select ${COLS_PAG} from public.pagamentos where provider = ${provider} and charge_ref = ${chargeRef}`,
  )
  return linha ? mapearPag(linha) : null
}
