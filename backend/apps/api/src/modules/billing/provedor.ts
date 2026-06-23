// Adaptador de gateway de pagamento, AGNÓSTICO de provedor. O resto do billing
// não conhece o provedor concreto: fala só com esta interface. Para ligar um
// gateway real (Mercado Pago, Stripe, Asaas, etc.), implemente um objeto que
// satisfaça `ProvedorPagamento` e troque `provedorAtivo` abaixo.
//
// Hoje há só o `provedorStub`: a estrutura está montada (cria fatura pendente,
// recebe webhook), mas não processa pagamento real. A integração de verdade liga
// depois (H11.7 gateway 🟡).
//
// Vocabulário neutro (Regras de Ouro, Épico 13): usamos "fatura" (do gateway de
// pagamento), nunca o termo proibido. "fatura" é o documento de pagamento da
// assinatura; não confundir com os avisos/lembretes do produto.
import { randomUUID } from 'node:crypto'

/** Status interno de uma fatura (espelha o check da migration 0019). */
export type StatusPagamento = 'pendente' | 'pago' | 'falhou' | 'estornado' | 'cancelado'

export interface FaturaCriada {
  provedor: string
  /** id da fatura no provedor (idempotência do webhook). */
  provedor_ref: string
  /** URL de checkout do provedor; null quando não se aplica (ex.: stub). */
  checkout_url: string | null
}

export interface EventoFatura {
  provedor: string
  provedor_ref: string
  /** status interno já traduzido do vocabulário do provedor. */
  status: StatusPagamento
  /** rótulo do evento bruto (para o log em eventos_pagamento). */
  tipo: string
}

export interface ProvedorPagamento {
  nome: string
  criarFatura(args: {
    valor_centavos: number
    descricao: string
    profile_id: string
  }): Promise<FaturaCriada>
  /** Traduz o payload bruto do webhook para um evento interno (null = ignorar). */
  interpretarWebhook(payload: unknown): EventoFatura | null
}

// --- Stub (sem pagamento real) ---------------------------------------------
// Aceita um webhook de teste no formato { provedor_ref, status, tipo? }.
export const provedorStub: ProvedorPagamento = {
  nome: 'stub',
  async criarFatura() {
    return { provedor: 'stub', provedor_ref: randomUUID(), checkout_url: null }
  },
  interpretarWebhook(payload) {
    const p = payload as Record<string, unknown> | null
    const ref = p?.['provedor_ref']
    const status = p?.['status']
    const statusValidos: StatusPagamento[] = [
      'pendente',
      'pago',
      'falhou',
      'estornado',
      'cancelado',
    ]
    if (typeof ref !== 'string' || !statusValidos.includes(status as StatusPagamento)) {
      return null
    }
    return {
      provedor: 'stub',
      provedor_ref: ref,
      status: status as StatusPagamento,
      tipo: typeof p?.['tipo'] === 'string' ? (p['tipo'] as string) : 'atualizacao',
    }
  },
}

/** Provedor em uso. Trocar aqui quando o gateway real entrar. */
export const provedorAtivo: ProvedorPagamento = provedorStub
