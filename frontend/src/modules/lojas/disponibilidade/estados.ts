// Rotulos e helpers de apresentacao da disponibilidade da loja. Nada de regra de negocio:
// a decisao de "aceitando agora" e o modo do atendente sao do servidor; aqui so rotulamos
// dias e faixas de horario. Vive dentro do modulo lojas (a disponibilidade e informacao da loja).

/** Nome completo do dia da semana (0 = domingo ... 6 = sabado), na ordem do contrato. */
export const DIAS_SEMANA = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
] as const

/** Abreviacao de 3 letras do dia da semana (para pilulas estreitas no mobile). */
export const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const

/** Ordem de exibicao: comeca na segunda-feira e termina no domingo (semana comercial). */
export const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0] as const

/**
 * Rotulo de uma faixa "HH:mm as HH:mm". Quando `fecha <= abre` a faixa cruza a meia-noite
 * (ex.: 18:00 as 02:00): marcamos "(dia seguinte)" so para leitura, sem recalcular nada.
 */
export function rotuloFaixa(abre: string, fecha: string): string {
  const cruzaMeiaNoite = fecha <= abre
  return cruzaMeiaNoite ? `${abre} às ${fecha} (dia seguinte)` : `${abre} às ${fecha}`
}

/** Lista de dias (indices 0..6) em texto curto, na ordem comercial. Ex.: "Seg, Ter, Qua". */
export function rotuloDias(dias: readonly number[]): string {
  const presentes = new Set(dias)
  return ORDEM_DIAS.filter((d) => presentes.has(d))
    .map((d) => DIAS_CURTOS[d])
    .join(', ')
}
