// Montagem PURA do cardapio vivo (CardapioCtx) a partir das linhas cruas, aplicando as regras:
// categoria ativa E dentro da programacao de agora; item ativo E nao esgotado; grupos efetivos por
// heranca categoria -> item (item_grupos.incluir); opcoes ativas E nao esgotadas. America/Sao_Paulo
// na programacao (via lojaAberta). O `esgotado_ate` expirado volta a vender (comparacao com agora).
import { lojaAberta } from './horario'
import type {
  CardapioRaw,
  RawGrupo,
  RawOpcao,
  RawVinculoCategoria,
  RawVinculoItem,
} from './repo_leitura'
import type { CardapioCtx, CategoriaCtx, GrupoCtx, ItemCtx, OpcaoCtx } from './tipos'

function disponivel(e: { ativo: boolean; esgotado_ate: Date | null }, agora: Date): boolean {
  if (!e.ativo) return false
  return !(e.esgotado_ate && e.esgotado_ate.getTime() > agora.getTime())
}

/** Grupos efetivos do item: (categoria) menos (item incluir=false) mais (item incluir=true); inativo some. */
function gruposEfetivosIds(
  daCategoria: readonly RawVinculoCategoria[],
  doItem: readonly RawVinculoItem[],
): Set<string> {
  const ids = new Set(daCategoria.map((v) => v.grupo_id))
  for (const v of doItem) {
    if (v.incluir) ids.add(v.grupo_id)
    else ids.delete(v.grupo_id)
  }
  return ids
}

function montarGrupo(g: RawGrupo, opcoesDoGrupo: readonly RawOpcao[], agora: Date): GrupoCtx {
  const opcoes: OpcaoCtx[] = opcoesDoGrupo
    .filter((o) => disponivel(o, agora))
    .sort((a, b) => a.ordem - b.ordem || (a.id < b.id ? -1 : 1))
    .map((o) => ({ id: o.id, grupo_id: o.grupo_id, nome: o.nome, preco_centavos: o.preco_centavos }))
  return {
    id: g.id,
    nome: g.nome,
    obrigatorio: g.obrigatorio,
    min_escolhas: g.min_escolhas,
    max_escolhas: g.max_escolhas,
    aplica_a_opcao_id: g.aplica_a_opcao_id,
    ordem: g.ordem,
    opcoes,
  }
}

export function montarCardapio(raw: CardapioRaw, agora: Date): CardapioCtx {
  const grupoPorId = new Map(raw.grupos.map((g) => [g.id, g]))
  const opcoesPorGrupo = new Map<string, RawOpcao[]>()
  for (const o of raw.opcoes) {
    const lista = opcoesPorGrupo.get(o.grupo_id) ?? []
    lista.push(o)
    opcoesPorGrupo.set(o.grupo_id, lista)
  }
  const vincCatPorCat = new Map<string, RawVinculoCategoria[]>()
  for (const v of raw.vinculosCategoria) {
    const lista = vincCatPorCat.get(v.categoria_id) ?? []
    lista.push(v)
    vincCatPorCat.set(v.categoria_id, lista)
  }
  const vincItemPorItem = new Map<string, RawVinculoItem[]>()
  for (const v of raw.vinculosItem) {
    const lista = vincItemPorItem.get(v.item_id) ?? []
    lista.push(v)
    vincItemPorItem.set(v.item_id, lista)
  }

  const categoriasAtivas = raw.categorias.filter((c) => c.ativo && lojaAberta(c.programacao, agora))
  const categoriasAtivasIds = new Set(categoriasAtivas.map((c) => c.id))

  const categorias: CategoriaCtx[] = categoriasAtivas.map((c) => ({ id: c.id, nome: c.nome }))
  const itensPorCategoria = new Map<string, ItemCtx[]>()
  const itensPorId = new Map<string, ItemCtx>()
  const gruposPorItem = new Map<string, GrupoCtx[]>()

  for (const it of raw.itens) {
    if (!categoriasAtivasIds.has(it.categoria_id) || !disponivel(it, agora)) continue
    const item: ItemCtx = { id: it.id, categoria_id: it.categoria_id, nome: it.nome, preco_centavos: it.preco_centavos }
    const lista = itensPorCategoria.get(it.categoria_id) ?? []
    lista.push(item)
    itensPorCategoria.set(it.categoria_id, lista)
    itensPorId.set(it.id, item)

    const efetivosIds = gruposEfetivosIds(vincCatPorCat.get(it.categoria_id) ?? [], vincItemPorItem.get(it.id) ?? [])
    const grupos: GrupoCtx[] = []
    for (const gid of efetivosIds) {
      const g = grupoPorId.get(gid)
      if (g?.ativo) grupos.push(montarGrupo(g, opcoesPorGrupo.get(gid) ?? [], agora))
    }
    grupos.sort((a, b) => a.ordem - b.ordem || (a.id < b.id ? -1 : 1))
    gruposPorItem.set(it.id, grupos)
  }

  return { categorias, itensPorCategoria, itensPorId, gruposPorItem }
}
