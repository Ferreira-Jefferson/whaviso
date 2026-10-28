// Apresentacao das contas a pagar: rotulos de tipo de credor e status, e dia de negocio.
// Nada de regra de negocio aqui.
import type { CredorTipo, StatusContaPagar } from '@/shared/contracts/_generated/enums'

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
