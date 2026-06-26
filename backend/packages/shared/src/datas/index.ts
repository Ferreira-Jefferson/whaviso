import { TZDate } from '@date-fns/tz'
import { addDays, addMonths, format } from 'date-fns'
import type { EtapaEnvio } from '../contracts/enums'

/** Todas as datas de negócio do whaviso vivem neste fuso. */
export const TZ = 'America/Sao_Paulo'

export const ORDEM_ETAPAS: readonly EtapaEnvio[] = [
  'd_menos_2',
  'd_menos_1',
  'd',
  'd_mais_1',
] as const

const OFFSET_DIAS: Record<EtapaEnvio, number> = {
  d_menos_2: -2,
  d_menos_1: -1,
  d: 0,
  d_mais_1: 1,
}

/**
 * Constrói o instante (Date puro, em UTC) correspondente a data+hora em America/Sao_Paulo.
 * Retorna Date nativo (não TZDate) para serializar como UTC no pg e em toISOString().
 */
function instanteSp(dataIso: string, hora: number, minuto: number, seg = 0, ms = 0): Date {
  const [ano, mes, dia] = dataIso.split('-').map(Number)
  return new Date(new TZDate(ano!, mes! - 1, dia!, hora, minuto, seg, ms, TZ).getTime())
}

/**
 * Instante (UTC) de um dia de negócio (SP) num dado SEGUNDO do dia (0..86399). É o
 * timestamp de disparo de uma etapa: data da etapa + horário reservado (H6.9). Construído
 * em segundos para nunca deslocar o dia civil por horário de verão (o dia é fixo; só o
 * segundo dentro dele varia).
 */
export function instanteNoSegundoSp(dataIso: string, segundoDoDia: number): Date {
  return instanteSp(dataIso, 0, 0, segundoDoDia)
}

/** 'YYYY-MM-DD' do dia atual em America/Sao_Paulo. */
export function hojeSp(agora: Date = new Date()): string {
  return format(new TZDate(agora.getTime(), TZ), 'yyyy-MM-dd')
}

/** Dia ('YYYY-MM-DD') em que uma etapa do ciclo acontece. */
export function diaDaEtapa(dataCombinada: string, etapa: EtapaEnvio): string {
  const meioDia = new TZDate(instanteSp(dataCombinada, 12, 0).getTime(), TZ)
  return format(addDays(meioDia, OFFSET_DIAS[etapa]), 'yyyy-MM-dd')
}

/** Instante UTC de 23:59:59.999 (SP) de um dia de negócio. */
export function fimDoDiaSp(dataIso: string): Date {
  return instanteSp(dataIso, 23, 59, 59, 999)
}

/** A janela da etapa já passou? (depois de 23:59 SP do dia da etapa) */
export function janelaPerdida(dataCombinada: string, etapa: EtapaEnvio, agora: Date): boolean {
  return agora.getTime() > fimDoDiaSp(diaDaEtapa(dataCombinada, etapa)).getTime()
}

/** Expiração do link de aceite: fim do dia (SP) de D+1. */
export function aceiteExpiraEm(dataCombinada: string): Date {
  return fimDoDiaSp(diaDaEtapa(dataCombinada, 'd_mais_1'))
}

/** Dias fixos de validade do convite (E5/H5.7): igual para todos os planos. */
export const DIAS_EXPIRA_CONVITE = 7

/**
 * Expiração do CONVITE (E5/H5.7): now()+7 dias, FIXO para todos os planos (não varia por
 * plano nem por data combinada, diferente de `aceiteExpiraEm`). Calculado em UTC; a
 * exibição ao criador, se houver, é convertida para America/Sao_Paulo na borda.
 */
export function conviteExpiraEm(agora: Date = new Date()): Date {
  return addDays(agora, DIAS_EXPIRA_CONVITE)
}

export interface Agendamento {
  etapa: EtapaEnvio
  agendado_para: Date
}

/**
 * Calcula os envios do ciclo a partir do HORÁRIO RESERVADO do combinado (H6.1/H6.7/H6.9):
 * - cada etapa dispara no MESMO `horarioSeg` (segundo do dia, SP), na sua própria data;
 * - CATCH-UP: etapa cujo instante de disparo já passou NÃO é criada, EXCETO se o dia da
 *   etapa for hoje (SP), aí ela ainda sai HOJE (instante no passado é reivindicado de
 *   imediato pelo scheduler, e `janelaPerdida` só descarta após 23:59 SP);
 * - aceite/retomada depois do fim de D+1 → nenhum envio (o sweep expira o aviso).
 * O `horarioSeg` deve estar na janela 08:00:00..17:59:59 (garantido pela alocação, H6.9).
 * Usado tanto no aceite quanto ao RETOMAR de pausa (mesma lógica de etapa aplicável).
 */
export function calcularAgendamentos(
  dataCombinada: string,
  horarioSeg: number,
  agora: Date = new Date(),
  // Cadência configurável (E6 H6.10): subconjunto de etapas a enviar. Default = ciclo
  // completo. A ordem de envio segue ORDEM_ETAPAS, não a ordem do array recebido.
  etapas: readonly EtapaEnvio[] = ORDEM_ETAPAS,
): Agendamento[] {
  const resultado: Agendamento[] = []
  const hoje = hojeSp(agora)
  const selecionadas = new Set(etapas)

  for (const etapa of ORDEM_ETAPAS) {
    if (!selecionadas.has(etapa)) continue
    const dia = diaDaEtapa(dataCombinada, etapa)
    const disparo = instanteNoSegundoSp(dia, horarioSeg)

    if (disparo.getTime() > agora.getTime()) {
      resultado.push({ etapa, agendado_para: disparo })
    } else if (dia === hoje) {
      // Etapa de hoje cujo segundo reservado já passou: ainda sai hoje (claim imediato).
      resultado.push({ etapa, agendado_para: disparo })
    }
    // senão: etapa em dia já vencido, não cria (catch-up: nada de lote vencido em bloco).
  }

  return resultado
}

/** Teto duro de ocorrências de um combinado recorrente (trava de outbox; o limite de
 *  plano é checado à parte, na api). 60 = 5 anos mensais. */
export const MAX_OCORRENCIAS = 60

/** Configuração de recorrência aceita por `expandirOcorrencias` (espelha recorrenciaInput). */
export type RecorrenciaCfg =
  | {
      tipo: 'periodo'
      freq: 'mensal' | 'semanal'
      ocorrencias: number
    }
  | { tipo: 'avulsas'; datas: string[] }

/**
 * Expande a recorrência em DATAS de ocorrência ('YYYY-MM-DD'), incluindo a 1ª (a própria
 * data combinada). Servidor é autoridade (E6 H6.10); o cliente nunca calcula ocorrência.
 *  - periodo: âncora + k (TODO mês ou toda semana, sempre intervalo 1), por N ocorrências
 *    (TOTAL, incluindo a 1ª). Mensal mantém o mesmo dia, clampando ao último dia do mês
 *    quando não existe (ex.: 31 -> 28/30); semanal soma 7 dias por ocorrência.
 *  - avulsas: [dataCombinada, ...datas] deduplicado e ordenado.
 * A âncora entra SEMPRE (>= 1 ocorrência).
 */
export function expandirOcorrencias(dataCombinada: string, cfg: RecorrenciaCfg): string[] {
  if (cfg.tipo === 'avulsas') {
    const unicas = Array.from(new Set([dataCombinada, ...cfg.datas])).sort()
    return unicas.slice(0, MAX_OCORRENCIAS)
  }

  const ancora = new TZDate(instanteSp(dataCombinada, 12, 0).getTime(), TZ)
  const total = Math.min(cfg.ocorrencias, MAX_OCORRENCIAS)

  const datas: string[] = [dataCombinada] // âncora sempre presente (ocorrência 1)
  for (let k = 1; datas.length < total; k++) {
    const d = cfg.freq === 'mensal' ? addMonths(ancora, k) : addDays(ancora, k * 7)
    datas.push(format(d, 'yyyy-MM-dd'))
  }
  return datas
}

/** Formata data de negócio para exibição nas mensagens (dd/MM/yyyy). */
export function formatarDataBr(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split('-')
  return `${dia}/${mes}/${ano}`
}

/** Formata centavos como "R$ 1.234,56" (sem Intl para ser determinístico). */
export function formatarValorBr(centavos: number): string {
  const reais = Math.trunc(centavos / 100)
  const resto = Math.abs(centavos % 100).toString().padStart(2, '0')
  const inteiro = reais.toLocaleString('pt-BR')
  return `R$ ${inteiro},${resto}`
}

// Alocação do horário reservado por segundo (H6.9): núcleo puro + constantes.
export * from './horario_reservado'
