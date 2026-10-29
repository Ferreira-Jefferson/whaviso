// Leitura de cardapio para montar pedido (read-model, SEM importar o modulo cardapio).
// Replica as regras PURAS do resolvedor do cardapio (heranca categoria -> item, disponibilidade,
// programacao em America/Sao_Paulo) porque ele ainda nao subiu ao kernel. Se as regras divergirem,
// o MODULE.md do cardapio manda; qualquer mudanca la deve ser espelhada aqui.
import { TZ } from '@whaviso/shared/datas'

export interface GrupoRow {
  id: string
  nome: string
  obrigatorio: boolean
  min_escolhas: number
  max_escolhas: number | null
  aplica_a_opcao_id: string | null
  ativo: boolean
  ordem: number
}
export interface OpcaoRow {
  id: string
  grupo_id: string
  nome: string
  preco_centavos: number
  ativo: boolean
  esgotado_ate: Date | null
}
export interface ItemRow {
  id: string
  categoria_id: string
  nome: string
  preco_centavos: number
  ativo: boolean
  esgotado_ate: Date | null
  // Contador de estoque do item (historia 03): saldo zerado tira o item da oferta. Opcionais
  // porque opcoes reusam `estaDisponivel` e nao tem contador.
  controla_estoque?: boolean
  quantidade_disponivel?: number | null
}
export interface CategoriaRow {
  id: string
  ativo: boolean
  programacao: { janelas: { dias: number[]; inicio: string; fim: string }[] } | null
}
export interface VinculoRow {
  grupo_id: string
  ordem: number
}
export interface VinculoItemRow extends VinculoRow {
  item_id: string
  incluir: boolean
}

export function estaDisponivel(
  e: { ativo: boolean; esgotado_ate: Date | null; controla_estoque?: boolean; quantidade_disponivel?: number | null },
  agora: Date,
): boolean {
  if (!e.ativo) return false
  if (e.esgotado_ate && e.esgotado_ate.getTime() > agora.getTime()) return false
  // Item com contador: saldo zero esgota (ilimitado/sem controle nao esgota por aqui).
  if (e.controla_estoque && e.quantidade_disponivel != null && e.quantidade_disponivel <= 0) return false
  return true
}

const DIAS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
const min = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

export function dentroDaProgramacao(prog: CategoriaRow['programacao'], agora: Date): boolean {
  if (!prog) return true
  const p = Object.fromEntries(fmt.formatToParts(agora).map((x) => [x.type, x.value]))
  const dia = DIAS[p['weekday'] ?? ''] ?? 0
  const minuto = Number(p['hour']) * 60 + Number(p['minute'])
  const ontem = (dia + 6) % 7
  return prog.janelas.some((j) => {
    const ini = min(j.inicio)
    const fim = min(j.fim)
    if (ini < fim) return j.dias.includes(dia) && minuto >= ini && minuto < fim
    return (j.dias.includes(dia) && minuto >= ini) || (j.dias.includes(ontem) && minuto < fim)
  })
}

/** Grupos efetivos do item: (categoria) menos (item incluir=false) mais (item incluir=true); inativo some. */
export function gruposEfetivos(
  daCategoria: readonly VinculoRow[],
  doItem: readonly VinculoItemRow[],
  grupos: ReadonlyMap<string, GrupoRow>,
): GrupoRow[] {
  const ids = new Set(daCategoria.map((v) => v.grupo_id))
  for (const v of doItem) {
    if (v.incluir) ids.add(v.grupo_id)
    else ids.delete(v.grupo_id)
  }
  const lista: GrupoRow[] = []
  for (const id of ids) {
    const g = grupos.get(id)
    if (g?.ativo) lista.push(g)
  }
  return lista.sort((a, b) => a.ordem - b.ordem || (a.id < b.id ? -1 : 1))
}
