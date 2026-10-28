// Apresentacao das contas a pagar: rotulos de tipo de credor e status, e dia de negocio.
// Nada de regra de negocio aqui.
import type {
  CredorTipo,
  PeriodicidadeFixo,
  RegimePagamento,
  StatusContaPagar,
} from '@/shared/contracts/_generated/enums'

export const ROTULO_CREDOR: Record<CredorTipo, string> = {
  fornecedor: 'Fornecedor',
  pessoa: 'Pessoa',
}

export const ROTULO_STATUS: Record<StatusContaPagar, string> = {
  a_pagar: 'A pagar',
  pago: 'Pago',
}

/** 'YYYY-MM-DD' -> 'dd/MM/yyyy' sem passar por Date (evita deslocar o dia pelo fuso). */
export function dataBr(iso: string | null): string {
  if (!iso) return ''
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

/**
 * Rotulo legivel do regime de pagamento do motoboy. O rotulo do regime `fixo`
 * depende da periodicidade da parcela fixa (dia ou mes). So apresentacao.
 */
export function rotuloRegime(regime: RegimePagamento, periodicidade: PeriodicidadeFixo): string {
  switch (regime) {
    case 'por_entrega':
      return 'Por entrega'
    case 'fixo':
      return periodicidade === 'mes' ? 'Fixo por mês' : 'Fixo por dia'
    case 'fixo_mais_entrega':
      return 'Fixo + entregas'
  }
}

/** Hoje em America/Sao_Paulo como 'YYYY-MM-DD' (dia de negocio; o UTC do navegador nao serve). */
export function hojeSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()) // en-CA formata como YYYY-MM-DD
}

/** Primeiro dia do mes corrente em America/Sao_Paulo como 'YYYY-MM-DD'. */
export function primeiroDiaDoMesSaoPaulo(): string {
  return `${hojeSaoPaulo().slice(0, 7)}-01`
}
