// Linhas do banco -> DTOs de saida (datas em ISO UTC, disponibilidade calculada pelo servidor).
import { estaDisponivel, excecoesReais } from './resolvedor'
import type {
  CategoriaRow,
  GrupoRow,
  ItemRow,
  OpcaoRow,
  VinculoCategoriaRow,
  VinculoItemRow,
} from './repo'
import type { CategoriaSaida, GrupoSaida, ItemSaida, OpcaoSaida } from './schemas'

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null)

export function opcaoSaida(o: OpcaoRow, agora: Date): OpcaoSaida {
  return {
    id: o.id,
    grupo_id: o.grupo_id,
    nome: o.nome,
    preco_centavos: o.preco_centavos,
    padrao: o.padrao,
    ativo: o.ativo,
    esgotado_ate: iso(o.esgotado_ate),
    ordem: o.ordem,
    disponivel: estaDisponivel(o, agora),
  }
}

export function grupoSaida(g: GrupoRow, opcoes: readonly OpcaoRow[], agora: Date): GrupoSaida {
  return {
    id: g.id,
    nome: g.nome,
    tipo: g.tipo,
    obrigatorio: g.obrigatorio,
    min_escolhas: g.min_escolhas,
    max_escolhas: g.max_escolhas,
    aplica_a_opcao_id: g.aplica_a_opcao_id,
    ativo: g.ativo,
    ordem: g.ordem,
    opcoes: opcoes.map((o) => opcaoSaida(o, agora)),
  }
}

export function categoriaSaida(c: CategoriaRow, vinculos: readonly VinculoCategoriaRow[]): CategoriaSaida {
  return {
    id: c.id,
    nome: c.nome,
    descricao: c.descricao,
    programacao: c.programacao,
    ativo: c.ativo,
    ordem: c.ordem,
    grupos: [...vinculos]
      .sort((a, b) => a.ordem - b.ordem || (a.grupo_id < b.grupo_id ? -1 : 1))
      .map((v) => ({ grupo_id: v.grupo_id, ordem: v.ordem })),
  }
}

/** `vinculosCategoria`: os da categoria do item (para filtrar so as excecoes reais). */
export function itemSaida(
  i: ItemRow,
  vinculosCategoria: readonly { grupo_id: string }[],
  vinculosItem: readonly VinculoItemRow[],
  agora: Date,
): ItemSaida {
  const herdados = new Set(vinculosCategoria.map((v) => v.grupo_id))
  return {
    id: i.id,
    categoria_id: i.categoria_id,
    nome: i.nome,
    descricao: i.descricao,
    preco_centavos: i.preco_centavos,
    imagem_url: i.imagem_url,
    sugerivel: i.sugerivel,
    ativo: i.ativo,
    esgotado_ate: iso(i.esgotado_ate),
    ordem: i.ordem,
    disponivel: estaDisponivel(i, agora),
    excecoes: excecoesReais(herdados, vinculosItem)
      .sort((a, b) => a.ordem - b.ordem || (a.grupo_id < b.grupo_id ? -1 : 1))
      .map((v) => ({ grupo_id: v.grupo_id, incluir: v.incluir, ordem: v.ordem })),
  }
}
