// Formatação e rótulos da UI.
import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { StatusEnvio, TipoChavePix, Envio } from '../contracts'

const FUSO = 'America/Sao_Paulo'

/** Converte centavos (int) em string BRL. Único ponto de conversão de dinheiro. */
export function brl(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

/** Hoje em America/Sao_Paulo como 'YYYY-MM-DD' (data de negócio). Para `min` de
 *  campos de data que só aceitam datas a partir de hoje (combinado futuro). */
export function hojeIso(): string {
  return format(new TZDate(new Date(), FUSO), 'yyyy-MM-dd')
}

/** Formata uma data de negócio (Date ou 'YYYY-MM-DD') em pt-BR, fuso de SP. */
export function dataPtBR(date: Date | string): string {
  const d =
    typeof date === 'string'
      ? new TZDate(`${date}T12:00:00`, FUSO)
      : new TZDate(date, FUSO)
  return format(d, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
}

/** Formata data + hora (Date ou ISO) em pt-BR, fuso de SP. Para eventos/envios. */
export function dataHoraPtBR(date: Date | string): string {
  const d = typeof date === 'string' ? new TZDate(date, FUSO) : new TZDate(date, FUSO)
  return format(d, "dd 'de' MMM 'de' yyyy 'às' HH:mm", { locale: ptBR })
}

/** Formata só o dia curto (Date ou 'YYYY-MM-DD') em pt-BR, fuso de SP. Para a timeline. */
export function diaCurtoPtBR(date: Date | string): string {
  const d =
    typeof date === 'string'
      ? new TZDate(`${date}T12:00:00`, FUSO)
      : new TZDate(date, FUSO)
  return format(d, "dd 'de' MMM", { locale: ptBR })
}

/** Formata um telefone E.164 (+5511999998888) de forma legível. */
export function telefone(e164: string | null | undefined): string {
  if (!e164) return ''
  const m = /^\+(\d{2})(\d{2})(\d{4,5})(\d{4})$/.exec(e164)
  if (!m) return e164
  const [, pais, ddd, parte1, parte2] = m
  return `+${pais} (${ddd}) ${parte1}-${parte2}`
}

// ---- Rótulos de status do envio (processando é exibido como agendado) ----
export const ROTULO_STATUS_ENVIO: Record<StatusEnvio, string> = {
  agendado: 'Agendado',
  processando: 'Agendado',
  enviado: 'Enviado',
  falhou: 'Não enviado',
  cancelado: 'Cancelado',
}

// Situação visível de um envio (H9.7): refina o status cru com a semântica de RETRY.
// `falhou` = falha PERSISTENTE (3 retries esgotados, ver E6 H6.8); enquanto há nova
// tentativa marcada o backend mantém o envio em agendado/processando com tentativas>0
// e proxima_tentativa_em futura -> exibimos "Em nova tentativa". Nada sensível.
export type SituacaoEnvio = 'agendado' | 'em_retry' | 'enviado' | 'falhou' | 'cancelado'

export function situacaoEnvio(envio: Pick<Envio, 'status' | 'tentativas' | 'proxima_tentativa_em'>): SituacaoEnvio {
  if (envio.status === 'enviado') return 'enviado'
  if (envio.status === 'cancelado') return 'cancelado'
  if (envio.status === 'falhou') return 'falhou' // persistente (retries esgotados)
  // agendado/processando: se já tentou e há próxima tentativa futura, é retry.
  const proxima = envio.proxima_tentativa_em
  if (envio.tentativas > 0 && proxima && proxima.getTime() > Date.now()) return 'em_retry'
  return 'agendado'
}

export const ROTULO_SITUACAO_ENVIO: Record<SituacaoEnvio, string> = {
  agendado: 'Agendado',
  em_retry: 'Em nova tentativa',
  enviado: 'Enviado',
  falhou: 'Não enviado',
  cancelado: 'Cancelado',
}

// ---- Rótulos do tipo de chave Pix ----
export const ROTULO_TIPO_CHAVE: Record<TipoChavePix, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'E-mail',
  telefone: 'Telefone',
  aleatoria: 'Chave aleatória',
}

export { formatarCentavos } from './moeda'
export { FUSO_NEGOCIO, diaSaoPaulo, formatarData, formatarHora, formatarDataHora } from './data'

export { telefoneBrParaE164 } from './telefone_br'
