// Fronteira do PSP (Asaas) para o pagamento intermediado, isolada atras de uma interface, no mesmo
// molde de ClienteFiscal/ClienteCanal: implementacao real quando ativada por ambiente/credencial,
// senao `null` (caminho intermediado responde 501 `psp_nao_integrado`).
//
// MODELO B (split do Asaas): a COBRANCA e criada autenticando como a SUBCONTA da loja (dona do
// dinheiro); o split entrega SO a taxa do whaviso para a wallet do whaviso (`ASAAS_WALLET_ID`). Assim
// o whaviso nunca centraliza o dinheiro do cliente final (regra de ouro). A credencial da subconta
// chega em claro SO em memoria (decifrada pontualmente); nunca e logada. Dinheiro em centavos.
//
// Webhook: o Asaas autentica por TOKEN FIXO (header `asaas-access-token`), nao por HMAC. A validacao
// e comparar, em tempo constante, o token recebido com o `ASAAS_WEBHOOK_TOKEN` configurado.
import { timingSafeEqual } from 'node:crypto'
import type { EnvApiTipado as EnvApi } from '@whaviso/shared/config'
import { fetchSeguro, type ResolverDns } from '@whaviso/shared/clientes'
import { HttpError } from '../../shared/http_errors'

/** Credencial da subconta da loja no PSP (API key em claro; so em memoria, o tempo minimo de uma chamada). */
export interface CredencialPsp {
  chave: string
}

/** Parametros canonicos de uma cobranca intermediada (modelo B: criada na subconta da loja). */
export interface ParamsCobrancaPsp {
  meio: 'pix' | 'cartao'
  /** Quanto o cliente paga (ja composto por absorve/repassa). */
  valorCobradoCentavos: number
  /** Parte do whaviso no split (a taxa de intermediacao aplicada), entregue a wallet do whaviso. */
  encargoWhavisoCentavos: number
  /** Cliente ('Consumidor final', cus_...) da subconta, pagador exigido pelo Asaas em toda cobranca. */
  customerRef: string
  /** Referencia idempotente/externa da cobranca (codigo do pedido). */
  referencia: string
}

export interface CobrancaPspCriada {
  /** Id da cobranca no PSP (idempotencia do webhook: unico por provider). */
  chargeRef: string
  /** Payload para o cliente: Pix copia-e-cola dinamico, ou o link de checkout no cartao. */
  payload: string
}

/** Evento de pagamento extraido de um webhook ja verificado. */
export interface EventoWebhookPsp {
  chargeRef: string
  pago: boolean
  /** Custo do PSP na transacao (value - netValue), quando informado. */
  taxaPspCentavos: number | null
}

export interface ClientePagamento {
  /** Cria a cobranca autenticando como a subconta (cred) e faz o split da taxa para a wallet do whaviso. */
  criarCobranca(cred: CredencialPsp, p: ParamsCobrancaPsp): Promise<CobrancaPspCriada>
  /**
   * Valida o token do webhook (`asaas-access-token`) contra o configurado, em tempo constante, e
   * extrai o evento canonico. Devolve null SO quando o token e invalido (a rota responde 401 e NAO
   * concilia). Token valido com evento irrelevante devolve um evento `pago: false` (ack 200).
   */
  interpretarWebhook(tokenRecebido: string | undefined, corpoBruto: string): EventoWebhookPsp | null
}

/** Erro quando o caminho intermediado e acionado sem PSP integrado (sem as chaves do Asaas ainda). */
export function erroPspNaoIntegrado(): HttpError {
  return new HttpError(501, 'psp_nao_integrado', 'Pagamento intermediado ainda nao esta disponivel')
}

const BASE_URL = {
  sandbox: 'https://api-sandbox.asaas.com/v3',
  producao: 'https://api.asaas.com/v3',
} as const

/** centavos -> reais com 2 casas, no formato numerico que o Asaas espera. */
function reais(centavos: number): number {
  return Number((centavos / 100).toFixed(2))
}

/** Data de hoje (America/Sao_Paulo) em 'YYYY-MM-DD' para o dueDate da cobranca. */
function hojeSaoPaulo(): string {
  // en-CA formata como YYYY-MM-DD; o timeZone resolve o dia civil correto independentemente do host.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

/** Comparacao de tokens em tempo constante (tamanhos diferentes => false, sem vazar por timing). */
function tokensIguais(a: string | undefined, b: string): boolean {
  if (!a) return false
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/** Injecao de transporte para testes (fetch e DNS). Em producao ambos sao os padroes do fetchSeguro. */
export interface InjecaoPsp {
  fetchImpl?: typeof fetch
  resolverDns?: ResolverDns
}

/** Erro de chamada ao Asaas: so status e mensagem segura (NUNCA a API key ou corpo com dado sensivel). */
function erroAsaas(status: number): HttpError {
  // 5xx mascarado como 502 (falha do upstream); demais como 422 (requisicao rejeitada pelo PSP).
  const code = status >= 500 ? 'psp_indisponivel' : 'psp_rejeitou'
  return new HttpError(status >= 500 ? 502 : 422, code, 'O provedor de pagamento recusou a operacao')
}

/** Implementacao real do Asaas (modelo B). Construida so quando `ASAAS_AMBIENTE` esta configurado. */
class ClienteAsaas implements ClientePagamento {
  private readonly hosts: readonly string[]
  constructor(
    private readonly baseUrl: string,
    private readonly walletId: string,
    private readonly webhookToken: string,
    private readonly inj: InjecaoPsp = {},
  ) {
    this.hosts = [new URL(baseUrl).hostname]
  }

  // Todo HTTP de saida passa pelo fetchSeguro (SEC-070): so HTTPS, host na allowlist, sem rede privada.
  private async pedir<T>(apiKey: string, caminho: string, init?: RequestInit): Promise<T> {
    let resp: Response
    try {
      resp = await fetchSeguro(`${this.baseUrl}${caminho}`, {
        hostsPermitidos: this.hosts,
        init: {
          ...init,
          headers: {
            'Content-Type': 'application/json',
            access_token: apiKey, // segredo: so no header, nunca logado
            ...(init?.headers ?? {}),
          },
        },
        fetchImpl: this.inj.fetchImpl,
        resolverDns: this.inj.resolverDns,
      })
    } catch {
      // Falha de transporte/SSRF/timeout: upstream indisponivel (nunca vaza detalhe nem a chave).
      throw new HttpError(502, 'psp_indisponivel', 'O provedor de pagamento esta indisponivel')
    }
    if (!resp.ok) throw erroAsaas(resp.status)
    return (await resp.json()) as T
  }

  async criarCobranca(cred: CredencialPsp, p: ParamsCobrancaPsp): Promise<CobrancaPspCriada> {
    const split = p.encargoWhavisoCentavos > 0
      ? [{ walletId: this.walletId, fixedValue: reais(p.encargoWhavisoCentavos) }]
      : undefined
    const cobranca = await this.pedir<{ id: string; invoiceUrl?: string }>(cred.chave, '/payments', {
      method: 'POST',
      body: JSON.stringify({
        customer: p.customerRef,
        billingType: p.meio === 'pix' ? 'PIX' : 'CREDIT_CARD',
        value: reais(p.valorCobradoCentavos),
        dueDate: hojeSaoPaulo(),
        externalReference: p.referencia,
        split,
      }),
    })

    if (p.meio === 'pix') {
      const qr = await this.pedir<{ payload: string }>(cred.chave, `/payments/${cobranca.id}/pixQrCode`)
      return { chargeRef: cobranca.id, payload: qr.payload }
    }
    // Cartao: nao capturamos dados do cartao (fora de escopo PCI); devolvemos o checkout hospedado.
    return { chargeRef: cobranca.id, payload: cobranca.invoiceUrl ?? '' }
  }

  interpretarWebhook(tokenRecebido: string | undefined, corpoBruto: string): EventoWebhookPsp | null {
    if (!tokensIguais(tokenRecebido, this.webhookToken)) return null
    let ev: { event?: string; payment?: { id?: string; value?: number; netValue?: number } }
    try {
      ev = JSON.parse(corpoBruto)
    } catch {
      // Token valido mas corpo invalido: ack sem conciliar (nao e falha de autenticacao).
      return { chargeRef: '', pago: false, taxaPspCentavos: null }
    }
    const pago = ev.event === 'PAYMENT_RECEIVED' || ev.event === 'PAYMENT_CONFIRMED'
    const { id, value, netValue } = ev.payment ?? {}
    const taxaPspCentavos =
      typeof value === 'number' && typeof netValue === 'number'
        ? Math.round((value - netValue) * 100)
        : null
    return { chargeRef: id ?? '', pago, taxaPspCentavos }
  }
}

/**
 * Cliente real do Asaas quando o ambiente esta configurado; `null` caso contrario (caminho
 * intermediado responde 501 `psp_nao_integrado`). `ASAAS_AMBIENTE` ativa; sem `ASAAS_WALLET_ID` ou
 * `ASAAS_WEBHOOK_TOKEN` junto, lanca erro de config (ativacao parcial e perigosa, falha claro).
 * `fetchImpl` permite injetar fetch nos testes.
 */
export function criarAsaasDoAmbiente(env: EnvApi, inj: InjecaoPsp = {}): ClientePagamento | null {
  if (!env.ASAAS_AMBIENTE) return null
  if (!env.ASAAS_WALLET_ID || !env.ASAAS_WEBHOOK_TOKEN) {
    throw new Error('ASAAS_AMBIENTE definido sem ASAAS_WALLET_ID/ASAAS_WEBHOOK_TOKEN: config incompleta do PSP')
  }
  return new ClienteAsaas(BASE_URL[env.ASAAS_AMBIENTE], env.ASAAS_WALLET_ID, env.ASAAS_WEBHOOK_TOKEN, inj)
}
