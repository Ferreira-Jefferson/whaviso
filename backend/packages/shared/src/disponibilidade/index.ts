// Disponibilidade da loja: derivacao pura (fonte unica, regras-negocio/05). Consumida pela api
// (endpoint "agora", telas) e pelo motor do atendente (modo atendimento|agendamento|fechado).
export {
  type FaixaHorario,
  type Excecao,
  type DadosDisponibilidade,
  type ModoAtendente,
  type Agendamento,
  paraMinutos,
  faixasSobrepoem,
  momentoSp,
  lojaAceitandoAgora,
  dentroAgendamento,
  modoAtendente,
} from './calculo'
