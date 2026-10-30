// Rotulos pt-BR (neutros quanto a genero) e formatadores da Central de Evals.
import type {
  EvalFamilia,
  EvalStatusExecucao,
  EvalStatusResultado,
  EvalTipo,
} from '@/shared/contracts/_generated/plataforma_evals'
import { formatarCentavos, formatarDataHora } from '@/shared/format'

type Tom = 'neutro' | 'marca' | 'sucesso' | 'atencao' | 'erro' | 'revisao'

export const ROTULO_TIPO: Record<EvalTipo, string> = {
  nlu_intencao: 'Intenção (NLU)',
  harness_turno: 'Turno completo',
  rag_faithfulness: 'RAG: fidelidade',
  rag_retrieval: 'RAG: recuperação',
}

export const ROTULO_FAMILIA: Record<EvalFamilia, string> = {
  capability: 'Capacidade',
  regression: 'Regressão',
}

export const TOM_FAMILIA: Record<EvalFamilia, Tom> = { capability: 'marca', regression: 'revisao' }

export const ROTULO_STATUS_EXECUCAO: Record<EvalStatusExecucao, string> = {
  fila: 'Na fila',
  rodando: 'Rodando',
  concluida: 'Concluída',
  falha: 'Falhou',
  cancelada: 'Cancelada',
}

export const TOM_STATUS_EXECUCAO: Record<EvalStatusExecucao, Tom> = {
  fila: 'neutro',
  rodando: 'atencao',
  concluida: 'sucesso',
  falha: 'erro',
  cancelada: 'neutro',
}

export const ROTULO_STATUS_RESULTADO: Record<EvalStatusResultado, string> = {
  passou: 'Passou',
  falhou: 'Falhou',
  erro: 'Erro',
}

export const TOM_STATUS_RESULTADO: Record<EvalStatusResultado, Tom> = {
  passou: 'sucesso',
  falhou: 'erro',
  erro: 'atencao',
}

/** Execucao ainda em andamento: a tela refaz a consulta ate virar um estado final. */
export function emAndamento(status: EvalStatusExecucao): boolean {
  return status === 'fila' || status === 'rodando'
}

const SEM_DADO = 'Sem dado'

/** Score 0..1 -> "87,5%". `null` = sem base (nunca "0%" falso). */
export function pct(razao: number | null | undefined): string {
  if (razao == null) return SEM_DADO
  return `${(razao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

/** Delta de score (B menos A) em pontos percentuais com sinal: "+2,5 pp". */
export function deltaPp(delta: number | null | undefined): string {
  if (delta == null) return SEM_DADO
  const v = (delta * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1, signDisplay: 'exceptZero' })
  return `${v} pp`
}

/** Delta inteiro com sinal ("+3", "-2", "0"). */
export function deltaInt(delta: number): string {
  return delta.toLocaleString('pt-BR', { signDisplay: 'exceptZero' })
}

export function ms(valor: number | null | undefined): string {
  if (valor == null) return SEM_DADO
  return `${Math.round(valor).toLocaleString('pt-BR')} ms`
}

export function inteiro(valor: number): string {
  return valor.toLocaleString('pt-BR')
}

/** Custo em R$ a partir de centavos (inteiro). */
export function reais(centavos: number): string {
  return formatarCentavos(centavos)
}

/** Delta de custo com sinal, em R$. */
export function deltaReais(centavos: number): string {
  if (centavos === 0) return reais(0)
  return `${centavos > 0 ? '+' : '-'}${reais(Math.abs(centavos))}`
}

/** Tom do delta: melhora (sucesso), piora (erro) ou neutro. `maiorMelhor` inverte para custo/latencia. */
export function tomDelta(delta: number | null | undefined, maiorMelhor = true): Tom {
  if (delta == null || delta === 0) return 'neutro'
  return delta > 0 === maiorMelhor ? 'sucesso' : 'erro'
}

/** Rotulo curto de uma execucao em seletores: "modelo, dd/MM/yyyy HH:mm, score". */
export function rotuloExecucao(e: {
  modelo: string | null
  criada_em: string
  resumo: { scoreMedio: number | null } | null
}): string {
  const score = e.resumo ? `, ${pct(e.resumo.scoreMedio)}` : ''
  return `${e.modelo ?? 'Modelo padrão'}, ${formatarDataHora(e.criada_em)}${score}`
}
