// Escrita do cardapio (dono unico das 6 tabelas). Toda query parametrizada e filtrada por loja_id
// do escopo. Sem DELETE (grant inexistente): remocao e `ativo = false`. Atualizacoes sao
// "le, funde, grava tudo" para manter o SQL fixo.
import { consultar, consultarUm, sql, type Executor } from '@whaviso/shared/db'
import type { CategoriaRow, GrupoRow, ItemRow, OpcaoRow } from './repo'
import type { ExcecaoItem } from './schemas'

export async function inserirGrupo(
  exec: Executor,
  lojaId: string,
  g: Omit<GrupoRow, 'id' | 'ativo' | 'ordem'> & { ordem?: number },
): Promise<string> {
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.grupos_opcoes
          (loja_id, nome, tipo, obrigatorio, min_escolhas, max_escolhas, aplica_a_opcao_id, ordem)
        values (${lojaId}, ${g.nome}, ${g.tipo}, ${g.obrigatorio}, ${g.min_escolhas}, ${g.max_escolhas},
          ${g.aplica_a_opcao_id},
          coalesce(${g.ordem ?? null}::int,
            (select coalesce(max(ordem), -1) + 1 from public.grupos_opcoes where loja_id = ${lojaId})))
        returning id`,
  )
  return r!.id
}

export async function gravarGrupo(exec: Executor, lojaId: string, g: GrupoRow): Promise<void> {
  await consultar(
    exec,
    sql`update public.grupos_opcoes set nome = ${g.nome}, tipo = ${g.tipo}, obrigatorio = ${g.obrigatorio},
          min_escolhas = ${g.min_escolhas}, max_escolhas = ${g.max_escolhas},
          aplica_a_opcao_id = ${g.aplica_a_opcao_id}, ativo = ${g.ativo}, ordem = ${g.ordem}
        where loja_id = ${lojaId} and id = ${g.id}`,
  )
}

export async function inserirOpcao(
  exec: Executor,
  lojaId: string,
  grupoId: string,
  o: { nome: string; preco_centavos: number; padrao: boolean; ordem?: number },
): Promise<string> {
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.opcoes (loja_id, grupo_id, nome, preco_centavos, padrao, ordem)
        values (${lojaId}, ${grupoId}, ${o.nome}, ${o.preco_centavos}, ${o.padrao},
          coalesce(${o.ordem ?? null}::int,
            (select coalesce(max(ordem), -1) + 1 from public.opcoes where loja_id = ${lojaId} and grupo_id = ${grupoId})))
        returning id`,
  )
  return r!.id
}

export async function gravarOpcao(exec: Executor, lojaId: string, o: OpcaoRow): Promise<void> {
  await consultar(
    exec,
    sql`update public.opcoes set nome = ${o.nome}, preco_centavos = ${o.preco_centavos}, padrao = ${o.padrao},
          ativo = ${o.ativo}, esgotado_ate = ${o.esgotado_ate}, ordem = ${o.ordem}
        where loja_id = ${lojaId} and id = ${o.id}`,
  )
}

export async function inserirCategoria(
  exec: Executor,
  lojaId: string,
  c: { nome: string; descricao: string | null; programacao: unknown; ordem?: number },
): Promise<string> {
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.categorias (loja_id, nome, descricao, programacao, ordem)
        values (${lojaId}, ${c.nome}, ${c.descricao}, ${c.programacao ? JSON.stringify(c.programacao) : null}::jsonb,
          coalesce(${c.ordem ?? null}::int,
            (select coalesce(max(ordem), -1) + 1 from public.categorias where loja_id = ${lojaId})))
        returning id`,
  )
  return r!.id
}

export async function gravarCategoria(exec: Executor, lojaId: string, c: CategoriaRow): Promise<void> {
  await consultar(
    exec,
    sql`update public.categorias set nome = ${c.nome}, descricao = ${c.descricao},
          programacao = ${c.programacao ? JSON.stringify(c.programacao) : null}::jsonb,
          ativo = ${c.ativo}, ordem = ${c.ordem}
        where loja_id = ${lojaId} and id = ${c.id}`,
  )
}

export async function inserirItem(
  exec: Executor,
  lojaId: string,
  i: Omit<ItemRow, 'id' | 'ativo' | 'esgotado_ate' | 'ordem'> & { ordem?: number },
): Promise<string> {
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.itens
          (loja_id, categoria_id, nome, descricao, preco_centavos, imagem_url, sugerivel, ordem)
        values (${lojaId}, ${i.categoria_id}, ${i.nome}, ${i.descricao}, ${i.preco_centavos}, ${i.imagem_url},
          ${i.sugerivel},
          coalesce(${i.ordem ?? null}::int,
            (select coalesce(max(ordem), -1) + 1 from public.itens where loja_id = ${lojaId} and categoria_id = ${i.categoria_id})))
        returning id`,
  )
  return r!.id
}

export async function gravarItem(exec: Executor, lojaId: string, i: ItemRow): Promise<void> {
  await consultar(
    exec,
    sql`update public.itens set categoria_id = ${i.categoria_id}, nome = ${i.nome}, descricao = ${i.descricao},
          preco_centavos = ${i.preco_centavos}, imagem_url = ${i.imagem_url}, sugerivel = ${i.sugerivel},
          ativo = ${i.ativo}, esgotado_ate = ${i.esgotado_ate}, ordem = ${i.ordem}
        where loja_id = ${lojaId} and id = ${i.id}`,
  )
}

export async function reordenar(
  exec: Executor,
  lojaId: string,
  tabela: 'grupos_opcoes' | 'categorias',
  ids: readonly string[],
): Promise<number> {
  // Tabela vem de uniao fechada no codigo, nunca de entrada externa.
  const alvo = tabela === 'grupos_opcoes' ? sql`public.grupos_opcoes` : sql`public.categorias`
  const r = await consultar<{ id: string }>(
    exec,
    sql`update ${alvo} t set ordem = p.pos
        from unnest(${ids as string[]}::uuid[]) with ordinality as p(id, pos)
        where t.id = p.id and t.loja_id = ${lojaId} returning t.id`,
  )
  return r.length
}

export async function reordenarOpcoes(
  exec: Executor,
  lojaId: string,
  grupoId: string,
  ids: readonly string[],
): Promise<number> {
  const r = await consultar<{ id: string }>(
    exec,
    sql`update public.opcoes t set ordem = p.pos
        from unnest(${ids as string[]}::uuid[]) with ordinality as p(id, pos)
        where t.id = p.id and t.loja_id = ${lojaId} and t.grupo_id = ${grupoId} returning t.id`,
  )
  return r.length
}

/** Upsert de vinculo categoria<->grupo (sem DELETE: so insere ou atualiza `ordem`). */
export async function upsertVinculoCategoria(
  exec: Executor,
  lojaId: string,
  categoriaId: string,
  grupoId: string,
  ordem: number,
): Promise<void> {
  await consultar(
    exec,
    sql`insert into public.categoria_grupos (categoria_id, grupo_id, loja_id, ordem)
        values (${categoriaId}, ${grupoId}, ${lojaId}, ${ordem})
        on conflict (categoria_id, grupo_id) do update set ordem = excluded.ordem`,
  )
}

/**
 * Ao categoria ganhar o grupo G, as linhas (item, G, incluir=false) dos itens dela eram rastro
 * neutro (remover o que nao era herdado); viram (incluir=true), tambem neutras. Mantem o invariante
 * "linha real = acrescenta o nao herdado ou remove o herdado".
 */
export async function neutralizarRastroAposHerdar(
  exec: Executor,
  lojaId: string,
  categoriaId: string,
  grupoId: string,
): Promise<void> {
  await consultar(
    exec,
    sql`update public.item_grupos ig set incluir = true
        from public.itens i
        where ig.item_id = i.id and ig.loja_id = ${lojaId} and i.loja_id = ${lojaId}
          and i.categoria_id = ${categoriaId} and ig.grupo_id = ${grupoId} and not ig.incluir`,
  )
}

export async function upsertVinculoItem(
  exec: Executor,
  lojaId: string,
  itemId: string,
  e: ExcecaoItem,
): Promise<void> {
  await consultar(
    exec,
    sql`insert into public.item_grupos (item_id, grupo_id, loja_id, incluir, ordem)
        values (${itemId}, ${e.grupo_id}, ${lojaId}, ${e.incluir}, ${e.ordem})
        on conflict (item_id, grupo_id) do update set incluir = excluded.incluir, ordem = excluded.ordem`,
  )
}

/** Marca como neutro (sem efeito no resolvedor) um vinculo de item. Sem DELETE. */
export async function neutralizarVinculoItem(
  exec: Executor,
  lojaId: string,
  itemId: string,
  grupoId: string,
  herdado: boolean,
): Promise<void> {
  await consultar(
    exec,
    sql`update public.item_grupos set incluir = ${herdado}, ordem = 0
        where loja_id = ${lojaId} and item_id = ${itemId} and grupo_id = ${grupoId}`,
  )
}

export async function auditar(
  exec: Executor,
  lojaId: string,
  tipo: 'cardapio.grupo_alterado' | 'cardapio.item_alterado' | 'cardapio.disponibilidade_alterada',
  entidade: string,
  entidadeId: string,
  detalhes: Record<string, unknown>,
): Promise<void> {
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${lojaId}, ${tipo}, ${entidade}, ${entidadeId}, 'loja', ${JSON.stringify(detalhes)}::jsonb)`,
  )
}
