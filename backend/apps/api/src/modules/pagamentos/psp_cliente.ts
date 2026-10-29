// Fronteira do PSP (Asaas na 1a implementacao) para o pagamento intermediado, isolada atras de uma
// interface, no mesmo molde de ClienteFiscal/ClienteCanal: implementacao real quando ativada por
// ambiente/credencial, senao `null` (caminho intermediado responde 501 `psp_nao_integrado`).
//
// A credencial chega em claro SO em memoria (decifrada pontualmente); nunca e logada. Dinheiro em
// centavos. A traducao do payload do provedor (split, Pix dinamico, cartao, webhook) e responsabilidade
// da implementacao real; aqui fica so o contrato canonico.
import { HttpError } from '../../shared/http_errors'

/** Credencial do PSP em claro (so em memoria, o tempo minimo de uma chamada). */
export interface CredencialPsp {
  chave: string
}

/** Parametros canonicos de uma cobranca intermediada. */
export interface ParamsCobrancaPsp {
  meio: 'pix' | 'cartao'
  /** Quanto o cliente paga (ja composto por absorve/repassa). */
  valorCobradoCentavos: number
  /** Parte do whaviso no split (a taxa de intermediacao aplicada). */
  encargoWhavisoCentavos: number
  /** Recebedor (subconta do restaurante) no PSP: para onde vai o liquido do pedido. */
  subcontaRef: string
  /** Referencia idempotente da cobranca (ex.: codigo/txid do pedido). */
  referencia: string
}

export interface CobrancaPspCriada {
  /** Id da cobranca no PSP (idempotencia do webhook: unico por provider). */
  chargeRef: string
  /** Payload para o cliente: Pix copia-e-cola dinamico ou link de cartao, conforme o meio. */
  payload: string
}

/** Evento de pagamento extraido de um webhook ja verificado. */
export interface EventoWebhookPsp {
  chargeRef: string
  pago: boolean
  /** Custo do PSP na transacao, quando informado. */
  taxaPspCentavos: number | null
}

export interface ClientePagamento {
  /** Cria a cobranca no PSP com split (recebedor + encargo do whaviso). */
  criarCobranca(cred: CredencialPsp, p: ParamsCobrancaPsp): Promise<CobrancaPspCriada>
  /**
   * Verifica a assinatura do webhook e extrai o evento canonico; devolve null se a assinatura for
   * invalida (a rota responde 401 e NAO concilia). O segredo e a credencial do PSP (em claro).
   */
  interpretarWebhook(
    segredo: string,
    assinatura: string | undefined,
    corpoBruto: string,
  ): EventoWebhookPsp | null
}

/** Erro quando o caminho intermediado e acionado sem PSP integrado (sem as chaves do Asaas ainda). */
export function erroPspNaoIntegrado(): HttpError {
  return new HttpError(501, 'psp_nao_integrado', 'Pagamento intermediado ainda nao esta disponivel')
}

/**
 * Implementacao real do Asaas. PENDENTE das chaves e da doc da API do Asaas (formato do split, da
 * assinatura do webhook e do onboarding de subconta). Ate la retorna `null`, e o caminho intermediado
 * responde 501 `psp_nao_integrado`. O restante do fluxo (config, credencial, subconta, webhook,
 * persistencia da cobranca intermediada) ja esta construido e testado com um cliente injetado.
 */
export function criarAsaasDoAmbiente(): ClientePagamento | null {
  return null
}
