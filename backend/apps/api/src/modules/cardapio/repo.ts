// Leitura do cardapio. Acesso a dados SO via @whaviso/shared/db, sempre com sql`...` (parametrizado)
// e SEMPRE filtrando por loja_id do escopo (SEC-001/002). Escrita fica em repo_escrita.ts.
import { consultar, consultarUm, sql, type Executor } from '@whaviso/shared/db'
import type { Programacao, TipoGrupo } from './schemas'

export interface GrupoRow {
  id: string
  nome: string
  tipo: TipoGrupo
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
  padrao: boolean
  ativo: boolean
  esgotado_ate: Date | null
  ordem: number
}
export interface CategoriaRow {
  id: string
  nome: string
  descricao: string | null
  programacao: Programacao | null
  ativo: boolean
  ordem: number
}
export interface ItemRow {
  id: string
  categoria_id: string
  nome: string
  descricao: string | null
  preco_centavos: number
  imagem_url: string | null
  sugerivel: boolean
  ativo: boolean
  esgotado_ate: Date | null
  ordem: number
}
export interface VinculoCategoriaRow {
  categoria_id: string
  grupo_id: string
  ordem: number
}
export interface VinculoItemRow {
  item_id: string
  grupo_id: string
  incluir: boolean
  ordem: number
}

export interface DadosCardapio {
  grupos: GrupoRow[]
  opcoes: OpcaoRow[]
  categorias: CategoriaRow[]
  vinculosCategoria: VinculoCategoriaRow[]
  itens: ItemRow[]
  vinculosItem: VinculoItemRow[]
}

const COLS_GRUPO = sql`id, nome, tipo, obrigatorio, min_escolhas::int as min_escolhas, max_escolhas::int as max_escolhas, aplica_a_opcao_id, ativo, ordem`
const COLS_OPCAO = sql`id, grupo_id, nome, preco_centavos, padrao, ativo, esgotado_ate, ordem`
const COLS_CATEGORIA = sql`id, nome, descricao, programacao, ativo, ordem`
const COLS_ITEM = sql`id, categoria_id, nome, descricao, preco_centavos, imagem_url, sugerivel, ativo, esgotado_ate, ordem`

export async function listarGrupos(exec: Executor, lojaId: string): Promise<GrupoRow[]> {
  return consultar<GrupoRow>(
    exec,
    sql`select ${COLS_GRUPO} from public.grupos_opcoes where loja_id = ${lojaId} order by ordem, id`,
  )
}
export async function listarOpcoes(exec: Executor, lojaId: string): Promise<OpcaoRow[]> {
  return consultar<OpcaoRow>(
    exec,
    sql`select ${COLS_OPCAO} from public.opcoes where loja_id = ${lojaId} order by ordem, id`,
  )
}

export async function carregarDados(exec: Executor, lojaId: string): Promise<DadosCardapio> {
  const [grupos, opcoes, categorias, vinculosCategoria, itens, vinculosItem] = await Promise.all([
    listarGrupos(exec, lojaId),
    listarOpcoes(exec, lojaId),
    consultar<CategoriaRow>(
      exec,
      sql`select ${COLS_CATEGORIA} from public.categorias where loja_id = ${lojaId} order by ordem, id`,
    ),
    consultar<VinculoCategoriaRow>(
      exec,
      sql`select categoria_id, grupo_id, ordem from public.categoria_grupos where loja_id = ${lojaId}`,
    ),
    consultar<ItemRow>(
      exec,
      sql`select ${COLS_ITEM} from public.itens where loja_id = ${lojaId} order by ordem, id`,
    ),
    consultar<VinculoItemRow>(
      exec,
      sql`select item_id, grupo_id, incluir, ordem from public.item_grupos where loja_id = ${lojaId}`,
    ),
  ])
  return { grupos, opcoes, categorias, vinculosCategoria, itens, vinculosItem }
}

export async function obterGrupo(exec: Executor, lojaId: string, id: string): Promise<GrupoRow | null> {
  return consultarUm<GrupoRow>(
    exec,
    sql`select ${COLS_GRUPO} from public.grupos_opcoes where loja_id = ${lojaId} and id = ${id}`,
  )
}
export async function obterOpcao(exec: Executor, lojaId: string, id: string): Promise<OpcaoRow | null> {
  return consultarUm<OpcaoRow>(
    exec,
    sql`select ${COLS_OPCAO} from public.opcoes where loja_id = ${lojaId} and id = ${id}`,
  )
}
export async function opcoesDoGrupo(exec: Executor, lojaId: string, grupoId: string): Promise<OpcaoRow[]> {
  return consultar<OpcaoRow>(
    exec,
    sql`select ${COLS_OPCAO} from public.opcoes where loja_id = ${lojaId} and grupo_id = ${grupoId} order by ordem, id`,
  )
}
export async function obterCategoria(exec: Executor, lojaId: string, id: string): Promise<CategoriaRow | null> {
  return consultarUm<CategoriaRow>(
    exec,
    sql`select ${COLS_CATEGORIA} from public.categorias where loja_id = ${lojaId} and id = ${id}`,
  )
}
export async function vinculosDaCategoria(
  exec: Executor,
  lojaId: string,
  categoriaId: string,
): Promise<VinculoCategoriaRow[]> {
  return consultar<VinculoCategoriaRow>(
    exec,
    sql`select categoria_id, grupo_id, ordem from public.categoria_grupos
        where loja_id = ${lojaId} and categoria_id = ${categoriaId} order by ordem, grupo_id`,
  )
}
export async function obterItem(exec: Executor, lojaId: string, id: string): Promise<ItemRow | null> {
  return consultarUm<ItemRow>(
    exec,
    sql`select ${COLS_ITEM} from public.itens where loja_id = ${lojaId} and id = ${id}`,
  )
}
export async function vinculosDoItem(exec: Executor, lojaId: string, itemId: string): Promise<VinculoItemRow[]> {
  return consultar<VinculoItemRow>(
    exec,
    sql`select item_id, grupo_id, incluir, ordem from public.item_grupos
        where loja_id = ${lojaId} and item_id = ${itemId} order by ordem, grupo_id`,
  )
}

/** Quantos dos ids existem na loja (guarda de pertencimento em todo vinculo, SEC-002). */
export async function contarGruposDaLoja(
  exec: Executor,
  lojaId: string,
  ids: readonly string[],
): Promise<number> {
  const r = await consultarUm<{ n: number }>(
    exec,
    sql`select count(*)::int as n from public.grupos_opcoes where loja_id = ${lojaId} and id = any(${ids as string[]}::uuid[])`,
  )
  return r?.n ?? 0
}

/** Grupos ATIVOS cujo `aplica_a_opcao_id` aponta para uma das opcoes (impacto de desativar). */
export async function gruposDependentes(
  exec: Executor,
  lojaId: string,
  opcaoIds: readonly string[],
): Promise<{ grupo_id: string; nome: string }[]> {
  if (opcaoIds.length === 0) return []
  return consultar<{ grupo_id: string; nome: string }>(
    exec,
    sql`select id as grupo_id, nome from public.grupos_opcoes
        where loja_id = ${lojaId} and ativo and aplica_a_opcao_id = any(${opcaoIds as string[]}::uuid[])
        order by ordem, id`,
  )
}

export async function contarItensAtivosDaCategoria(
  exec: Executor,
  lojaId: string,
  categoriaId: string,
): Promise<number> {
  const r = await consultarUm<{ n: number }>(
    exec,
    sql`select count(*)::int as n from public.itens where loja_id = ${lojaId} and categoria_id = ${categoriaId} and ativo`,
  )
  return r?.n ?? 0
}
