// Regras de grupos de opcoes e opcoes. Sem acesso HTTP; erros de dominio via shared/http_errors.
import { comTransacao, type Executor, type Pool } from '@whaviso/shared/db'
import { naoEncontrado, regraNegocio } from '../../shared/http_errors'
import { grupoSaida, opcaoSaida } from './mapeadores'
import {
  gruposDependentes,
  listarGrupos,
  listarOpcoes,
  obterGrupo,
  obterOpcao,
  opcoesDoGrupo,
  type GrupoRow,
  type OpcaoRow,
} from './repo'
import {
  auditar,
  gravarGrupo,
  gravarOpcao,
  inserirGrupo,
  inserirOpcao,
  reordenar,
  reordenarOpcoes,
} from './repo_escrita'
import type {
  GrupoAtualizar,
  GrupoCriar,
  GrupoSaida,
  Impacto,
  OpcaoAtualizar,
  OpcaoCriar,
  OpcaoSaida,
} from './schemas'

export type GrupoMutacao = GrupoSaida & { impactos: Impacto[] }
export type OpcaoMutacao = OpcaoSaida & { impactos: Impacto[] }

const agora = (): Date => new Date()

/** Limites coerentes entre si, com as opcoes ativas e com `padrao`. */
export function validarGrupo(g: GrupoRow, opcoes: readonly OpcaoRow[]): void {
  if (g.obrigatorio && g.min_escolhas < 1) {
    throw regraNegocio('grupo_obrigatorio_sem_minimo', 'Grupo obrigatorio exige minimo de 1 escolha')
  }
  if (g.max_escolhas !== null && g.max_escolhas < Math.max(g.min_escolhas, 1)) {
    throw regraNegocio('grupo_limites_invalidos', 'O maximo de escolhas nao pode ser menor que o minimo')
  }
  const ativas = opcoes.filter((o) => o.ativo)
  if (ativas.length > 0 && g.min_escolhas > ativas.length) {
    throw regraNegocio('grupo_minimo_maior_que_opcoes', 'O minimo de escolhas excede o numero de opcoes ativas')
  }
  const padroes = ativas.filter((o) => o.padrao).length
  if (g.max_escolhas !== null && padroes > g.max_escolhas) {
    throw regraNegocio('padrao_excede_maximo', 'Ha mais opcoes padrao do que o maximo de escolhas')
  }
}

/** `aplica_a_opcao_id` so aceita opcao de grupo do tipo tamanho da MESMA loja (e grupo nao-tamanho). */
async function validarAplicaA(
  exec: Executor,
  lojaId: string,
  g: Pick<GrupoRow, 'tipo' | 'aplica_a_opcao_id'>,
): Promise<void> {
  if (g.aplica_a_opcao_id === null) return
  if (g.tipo === 'tamanho') {
    throw regraNegocio('aplica_a_opcao_invalida', 'Grupo de tamanho nao pode depender de outra opcao')
  }
  const opcao = await obterOpcao(exec, lojaId, g.aplica_a_opcao_id)
  const dono = opcao ? await obterGrupo(exec, lojaId, opcao.grupo_id) : null
  if (!dono || dono.tipo !== 'tamanho') {
    throw regraNegocio('aplica_a_opcao_invalida', 'aplica_a_opcao_id deve ser uma opcao de um grupo de tamanho da loja')
  }
}

async function dependentes(exec: Executor, lojaId: string, opcaoIds: readonly string[]): Promise<Impacto[]> {
  return gruposDependentes(exec, lojaId, opcaoIds)
}

export async function listarGruposComOpcoes(pool: Pool, lojaId: string): Promise<GrupoSaida[]> {
  const [grupos, opcoes] = await Promise.all([listarGrupos(pool, lojaId), listarOpcoes(pool, lojaId)])
  const t = agora()
  return grupos.map((g) =>
    grupoSaida(
      g,
      opcoes.filter((o) => o.grupo_id === g.id),
      t,
    ),
  )
}

export async function criarGrupo(pool: Pool, lojaId: string, e: GrupoCriar): Promise<GrupoMutacao> {
  return comTransacao(pool, async (tx) => {
    const base = {
      nome: e.nome,
      tipo: e.tipo,
      obrigatorio: e.obrigatorio,
      min_escolhas: e.min_escolhas ?? (e.obrigatorio ? 1 : 0),
      max_escolhas: e.max_escolhas,
      aplica_a_opcao_id: e.aplica_a_opcao_id,
    }
    const provisorio: GrupoRow = { ...base, id: '', ativo: true, ordem: e.ordem ?? 0 }
    const provOpcoes = e.opcoes.map((o, i) => ({ padrao: o.padrao, ativo: true, ordem: i })) as OpcaoRow[]
    validarGrupo(provisorio, provOpcoes)
    await validarAplicaA(tx, lojaId, base)

    const id = await inserirGrupo(tx, lojaId, { ...base, ordem: e.ordem })
    for (const o of e.opcoes) await inserirOpcao(tx, lojaId, id, o)
    await auditar(tx, lojaId, 'cardapio.grupo_alterado', 'grupo', id, { acao: 'criado' })
    return { ...(await montarGrupo(tx, lojaId, id)), impactos: [] }
  })
}

async function montarGrupo(exec: Executor, lojaId: string, id: string): Promise<GrupoSaida> {
  const g = await obterGrupo(exec, lojaId, id)
  if (!g) throw naoEncontrado()
  return grupoSaida(g, await opcoesDoGrupo(exec, lojaId, id), agora())
}

export async function atualizarGrupo(
  pool: Pool,
  lojaId: string,
  id: string,
  p: GrupoAtualizar,
): Promise<GrupoMutacao> {
  return comTransacao(pool, async (tx) => {
    const atual = await obterGrupo(tx, lojaId, id)
    if (!atual) throw naoEncontrado()
    const opcoes = await opcoesDoGrupo(tx, lojaId, id)
    const novo: GrupoRow = {
      ...atual,
      nome: p.nome ?? atual.nome,
      tipo: p.tipo ?? atual.tipo,
      obrigatorio: p.obrigatorio ?? atual.obrigatorio,
      min_escolhas: p.min_escolhas ?? atual.min_escolhas,
      max_escolhas: p.max_escolhas === undefined ? atual.max_escolhas : p.max_escolhas,
      aplica_a_opcao_id: p.aplica_a_opcao_id === undefined ? atual.aplica_a_opcao_id : p.aplica_a_opcao_id,
      ativo: p.ativo ?? atual.ativo,
      ordem: p.ordem ?? atual.ordem,
    }
    // Marcar obrigatorio sem informar o minimo sobe o minimo para 1 (o banco exige).
    if (p.obrigatorio === true && p.min_escolhas === undefined && novo.min_escolhas < 1) novo.min_escolhas = 1

    validarGrupo(novo, opcoes)
    await validarAplicaA(tx, lojaId, novo)

    const ids = opcoes.map((o) => o.id)
    const deps = await dependentes(tx, lojaId, ids)
    if (atual.tipo === 'tamanho' && novo.tipo !== 'tamanho' && deps.length > 0) {
      throw regraNegocio('grupo_tamanho_referenciado', 'Ha grupos de adicional que dependem das opcoes deste tamanho')
    }
    await gravarGrupo(tx, lojaId, novo)
    await auditar(tx, lojaId, 'cardapio.grupo_alterado', 'grupo', id, {
      acao: 'atualizado',
      campos: Object.keys(p),
    })
    // Desativar um tamanho deixa os add-ons presos a ele inalcancaveis: avisa, nao bloqueia.
    const impactos = atual.ativo && !novo.ativo ? deps : []
    return { ...(await montarGrupo(tx, lojaId, id)), impactos }
  })
}

export async function criarOpcao(
  pool: Pool,
  lojaId: string,
  grupoId: string,
  e: OpcaoCriar,
): Promise<OpcaoMutacao> {
  return comTransacao(pool, async (tx) => {
    const g = await obterGrupo(tx, lojaId, grupoId)
    if (!g) throw naoEncontrado()
    const existentes = await opcoesDoGrupo(tx, lojaId, grupoId)
    validarGrupo(g, [...existentes, { padrao: e.padrao, ativo: true } as OpcaoRow])
    const id = await inserirOpcao(tx, lojaId, grupoId, e)
    await auditar(tx, lojaId, 'cardapio.grupo_alterado', 'opcao', id, { acao: 'criada', grupo_id: grupoId })
    const o = await obterOpcao(tx, lojaId, id)
    return { ...opcaoSaida(o!, agora()), impactos: [] }
  })
}

export async function atualizarOpcao(
  pool: Pool,
  lojaId: string,
  id: string,
  p: OpcaoAtualizar,
): Promise<OpcaoMutacao> {
  return comTransacao(pool, async (tx) => {
    const atual = await obterOpcao(tx, lojaId, id)
    if (!atual) throw naoEncontrado()
    const g = await obterGrupo(tx, lojaId, atual.grupo_id)
    if (!g) throw naoEncontrado()
    const novo: OpcaoRow = {
      ...atual,
      nome: p.nome ?? atual.nome,
      preco_centavos: p.preco_centavos ?? atual.preco_centavos,
      padrao: p.padrao ?? atual.padrao,
      ativo: p.ativo ?? atual.ativo,
      ordem: p.ordem ?? atual.ordem,
    }
    const irmas = (await opcoesDoGrupo(tx, lojaId, g.id)).map((o) => (o.id === id ? novo : o))
    validarGrupo(g, irmas)
    await gravarOpcao(tx, lojaId, novo)
    await auditar(tx, lojaId, 'cardapio.grupo_alterado', 'opcao', id, { acao: 'atualizada', campos: Object.keys(p) })
    const impactos = atual.ativo && !novo.ativo ? await dependentes(tx, lojaId, [id]) : []
    return { ...opcaoSaida(novo, agora()), impactos }
  })
}

export async function reordenarGrupos(pool: Pool, lojaId: string, ids: readonly string[]): Promise<void> {
  await comTransacao(pool, async (tx) => {
    if (new Set(ids).size !== ids.length) throw regraNegocio('ids_duplicados', 'Ids repetidos na ordem')
    const n = await reordenar(tx, lojaId, 'grupos_opcoes', ids)
    if (n !== ids.length) throw regraNegocio('referencia_invalida', 'Algum grupo nao pertence a loja')
  })
}

export async function reordenarOpcoesDoGrupo(
  pool: Pool,
  lojaId: string,
  grupoId: string,
  ids: readonly string[],
): Promise<void> {
  await comTransacao(pool, async (tx) => {
    if (!(await obterGrupo(tx, lojaId, grupoId))) throw naoEncontrado()
    if (new Set(ids).size !== ids.length) throw regraNegocio('ids_duplicados', 'Ids repetidos na ordem')
    const n = await reordenarOpcoes(tx, lojaId, grupoId, ids)
    if (n !== ids.length) throw regraNegocio('referencia_invalida', 'Alguma opcao nao pertence ao grupo')
  })
}
