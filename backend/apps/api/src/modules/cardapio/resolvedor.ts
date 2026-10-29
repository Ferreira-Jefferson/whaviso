// Resolvedor PURO do cardapio (sem I/O, sem regra de escrita): heranca da categoria + excecao por
// item, disponibilidade e programacao em America/Sao_Paulo, preco final em centavos.
// Hoje vive no modulo (o kernel packages/shared nao faz parte do escopo desta entrega); a funcao e
// pura e autocontida para subir ao kernel sem mudar de assinatura.
import { TZ } from '@whaviso/shared/datas'
import type { Programacao } from './schemas'

export interface GrupoBase {
  id: string
  ativo: boolean
  ordem: number
}
export interface VinculoCategoriaBase {
  grupo_id: string
  ordem: number
}
export interface VinculoItemBase {
  grupo_id: string
  incluir: boolean
  ordem: number
}
export interface GrupoEfetivo<G extends GrupoBase> {
  grupo: G
  origem: 'categoria' | 'item'
  ordemEfetiva: number
}

/**
 * Grupos efetivos de um item = (grupos da categoria) menos (item_grupos incluir=false) mais
 * (item_grupos incluir=true). Grupo inativo (ou ausente do mapa) some. Ordem: item_grupos.ordem
 * para o grupo ACRESCENTADO pelo item, categoria_grupos.ordem para o herdado; depois
 * grupos_opcoes.ordem; desempate por id (resultado independe da ordem de insercao).
 */
export function resolverGruposDoItem<G extends GrupoBase>(
  vinculosCategoria: readonly VinculoCategoriaBase[],
  vinculosItem: readonly VinculoItemBase[],
  gruposPorId: ReadonlyMap<string, G>,
): GrupoEfetivo<G>[] {
  const removidos = new Set(vinculosItem.filter((v) => !v.incluir).map((v) => v.grupo_id))
  const acrescentados = new Map(vinculosItem.filter((v) => v.incluir).map((v) => [v.grupo_id, v]))
  const efetivos = new Map<string, { origem: 'categoria' | 'item'; ordemEfetiva: number }>()

  for (const v of vinculosCategoria) {
    if (removidos.has(v.grupo_id)) continue
    // Linha incluir=true de um grupo ja herdado e redundante (rastro neutro): a ordem e da categoria.
    efetivos.set(v.grupo_id, { origem: 'categoria', ordemEfetiva: v.ordem })
  }
  for (const v of acrescentados.values()) {
    if (!efetivos.has(v.grupo_id)) efetivos.set(v.grupo_id, { origem: 'item', ordemEfetiva: v.ordem })
  }

  const lista: GrupoEfetivo<G>[] = []
  for (const [grupoId, info] of efetivos) {
    const grupo = gruposPorId.get(grupoId)
    if (grupo?.ativo) lista.push({ grupo, ...info })
  }
  return lista.sort(
    (a, b) =>
      a.ordemEfetiva - b.ordemEfetiva ||
      a.grupo.ordem - b.grupo.ordem ||
      (a.grupo.id < b.grupo.id ? -1 : a.grupo.id > b.grupo.id ? 1 : 0),
  )
}

/**
 * Excecoes REAIS de um item, dado o que a categoria herda. Linhas neutras (acrescentar o que ja e
 * herdado; remover o que nao e herdado) sao rastro de reconciliacao sem DELETE e nao contam.
 */
export function excecoesReais(
  idsHerdados: ReadonlySet<string>,
  vinculosItem: readonly VinculoItemBase[],
): VinculoItemBase[] {
  return vinculosItem.filter((v) => (v.incluir ? !idsHerdados.has(v.grupo_id) : idsHerdados.has(v.grupo_id)))
}

export interface Disponivel {
  ativo: boolean
  esgotado_ate: Date | null
  /**
   * Contador de estoque do item (historia 03): quando o item controla contagem finita e o saldo
   * chega a zero, ele sai da oferta como esgotado. Opcional porque opcoes nao tem contador (campos
   * ausentes = item sem contagem, sempre ofertavel por este criterio).
   */
  controla_estoque?: boolean
  quantidade_disponivel?: number | null
}
/**
 * Disponivel = ativo, sem `esgotado_ate` no futuro (no passado ou null = disponivel) e, para item
 * com contador de estoque, com saldo > 0 (saldo zero esgota e tira da oferta; contagem ilimitada
 * (quantidade null) ou item sem controle nunca esgotam por este criterio).
 */
export function estaDisponivel(e: Disponivel, agora: Date): boolean {
  if (!e.ativo) return false
  if (e.esgotado_ate && e.esgotado_ate.getTime() > agora.getTime()) return false
  if (e.controla_estoque && e.quantidade_disponivel != null && e.quantidade_disponivel <= 0) return false
  return true
}

const DIAS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const formatadorSp = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** Dia da semana (0=domingo) e minuto do dia no relogio de Sao Paulo. */
export function relogioSp(agora: Date): { dia: number; minuto: number } {
  const partes = Object.fromEntries(formatadorSp.formatToParts(agora).map((p) => [p.type, p.value]))
  return {
    dia: DIAS[partes['weekday'] ?? ''] ?? 0,
    minuto: Number(partes['hour']) * 60 + Number(partes['minute']),
  }
}

const minutos = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/**
 * null = sempre. Janela [inicio, fim) em SP; fim < inicio cruza a meia-noite: vale do inicio ate
 * 24:00 no dia listado e de 00:00 ate o fim no dia seguinte.
 */
export function dentroDaProgramacao(prog: Programacao | null, agora: Date): boolean {
  if (!prog) return true
  const { dia, minuto } = relogioSp(agora)
  const ontem = (dia + 6) % 7
  return prog.janelas.some((j) => {
    const ini = minutos(j.inicio)
    const fim = minutos(j.fim)
    if (ini < fim) return j.dias.includes(dia) && minuto >= ini && minuto < fim
    return (j.dias.includes(dia) && minuto >= ini) || (j.dias.includes(ontem) && minuto < fim)
  })
}

/** Preco final = preco base do item + soma dos precos das opcoes escolhidas (centavos inteiros). */
export function calcularPrecoItem(
  precoBaseCentavos: number,
  opcoesEscolhidas: readonly { preco_centavos: number }[],
): number {
  return opcoesEscolhidas.reduce((total, o) => total + o.preco_centavos, precoBaseCentavos)
}
