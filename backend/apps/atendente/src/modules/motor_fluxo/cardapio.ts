// Calculo PURO de preco e snapshot de uma linha do pedido, a partir do cardapio vivo da loja.
// Espelha as regras do montador da api (heranca categoria -> item ja resolvida em GrupoCtx):
// opcao tem que pertencer a um grupo efetivo do item; grupo obrigatorio exige o minimo; o maximo
// e respeitado; add-on preso a uma opcao (aplica_a_opcao_id) so vale se aquela opcao foi escolhida.
// O preco NUNCA vem do cliente: soma item + opcoes em centavos inteiros, no servidor.
import type { GrupoCtx, ItemCtx, LinhaCarrinho } from './tipos'

export interface OpcaoSnapshot {
  opcao_id: string
  grupo_nome_snapshot: string
  nome_snapshot: string
  preco_centavos: number
}
export interface LinhaSnapshot {
  item_id: string
  nome_snapshot: string
  preco_unitario_centavos: number
  quantidade: number
  total_centavos: number
  opcoes: OpcaoSnapshot[]
}

export class ErroMontagem extends Error {
  constructor(public readonly codigo: string) {
    super(codigo)
    this.name = 'ErroMontagem'
  }
}

/** Monta e precifica uma linha; lanca ErroMontagem se a escolha violar o cardapio. */
export function montarLinha(item: ItemCtx, grupos: readonly GrupoCtx[], linha: LinhaCarrinho): LinhaSnapshot {
  const escolhidasIds = new Set(linha.opcoes_ids)
  if (escolhidasIds.size !== linha.opcoes_ids.length) throw new ErroMontagem('opcao_duplicada')

  const porOpcao = new Map<string, { opcao: GrupoCtx['opcoes'][number]; grupo: GrupoCtx }>()
  for (const g of grupos) for (const o of g.opcoes) porOpcao.set(o.id, { opcao: o, grupo: g })

  const opcoes: OpcaoSnapshot[] = []
  for (const id of escolhidasIds) {
    const achou = porOpcao.get(id)
    if (!achou) throw new ErroMontagem('opcao_invalida')
    opcoes.push({
      opcao_id: achou.opcao.id,
      grupo_nome_snapshot: achou.grupo.nome,
      nome_snapshot: achou.opcao.nome,
      preco_centavos: achou.opcao.preco_centavos,
    })
  }

  for (const g of grupos) {
    const doGrupo = [...escolhidasIds].filter((id) => porOpcao.get(id)?.grupo.id === g.id)
    // Add-on preso a uma opcao (ex.: adicional so no tamanho grande): so se aplica se escolhida.
    if (g.aplica_a_opcao_id !== null && !escolhidasIds.has(g.aplica_a_opcao_id)) {
      if (doGrupo.length > 0) throw new ErroMontagem('opcao_invalida')
      continue
    }
    const minimo = g.obrigatorio ? Math.max(g.min_escolhas, 1) : g.min_escolhas
    if (doGrupo.length < minimo) throw new ErroMontagem('grupo_obrigatorio')
    if (g.max_escolhas !== null && doGrupo.length > g.max_escolhas) throw new ErroMontagem('grupo_excede_maximo')
  }

  const unitario = item.preco_centavos + opcoes.reduce((s, o) => s + o.preco_centavos, 0)
  return {
    item_id: item.id,
    nome_snapshot: item.nome,
    preco_unitario_centavos: item.preco_centavos,
    quantidade: linha.quantidade,
    total_centavos: unitario * linha.quantidade,
    opcoes,
  }
}

/** Grupos obrigatorios do item ainda a perguntar, em ordem (os opcionais o motor-min pula). */
export function gruposObrigatorios(grupos: readonly GrupoCtx[]): GrupoCtx[] {
  return grupos
    .filter((g) => g.obrigatorio && g.aplica_a_opcao_id === null)
    .sort((a, b) => a.ordem - b.ordem || (a.id < b.id ? -1 : 1))
}
