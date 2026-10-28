// Regras do modulo lojas. Sem Fastify aqui: recebe pool e dados ja validados na borda.
import { comTransacao, type Pool } from '@whaviso/shared/db'
import type { EscopoLoja, PapelMembro } from '@whaviso/shared/contracts'
import { lojaAceitandoAgora, momentoSp } from '@whaviso/shared/disponibilidade'
import { Conflito, NaoEncontrado, Proibido, regraNegocio } from '../../shared/http_errors'
import * as repo from './repo'
import {
  Cores,
  Endereco,
  type LojaAtualizarEntrada,
  type LojaBrandingEntrada,
  type LojaCapacidadeEntrada,
  type LojaCriarEntrada,
  type LojaPausarEntrada,
  type LojaSaida,
} from './schemas'

/** Faixas + excecoes de hoje de uma loja, para derivar `aberta_agora` pelo kernel. */
interface DispoLoja {
  faixas: repo.FaixaDeLoja[]
  excecoes: repo.ExcecaoDeLoja[]
}

// jsonb sempre lido via schema (SEC-081); dado fora do contrato vira vazio, nunca vaza cru.
const ler = <T>(s: { safeParse(v: unknown): { success: boolean; data?: T } }, v: unknown): T | null => {
  const r = s.safeParse(v)
  return r.success ? (r.data as T) : null
}

/**
 * Mapa loja_id -> disponibilidade (faixas ativas + excecoes de hoje), carregado em LOTE (uma query
 * por tabela, sem N+1). Fonte unica da disponibilidade (regras-negocio/05): aqui so lemos as tabelas
 * compartilhadas e deixamos o kernel derivar o estado, sem importar o modulo disponibilidade.
 */
async function carregarDispo(
  pool: Pool,
  lojaIds: string[],
  agora: Date,
): Promise<Map<string, DispoLoja>> {
  const mapa = new Map<string, DispoLoja>()
  if (lojaIds.length === 0) return mapa
  for (const id of lojaIds) mapa.set(id, { faixas: [], excecoes: [] })
  const [faixas, excecoes] = await Promise.all([
    repo.faixasAtivas(pool, lojaIds),
    repo.excecoesNaData(pool, lojaIds, momentoSp(agora).data),
  ])
  for (const f of faixas) mapa.get(f.loja_id)?.faixas.push(f)
  for (const e of excecoes) mapa.get(e.loja_id)?.excecoes.push(e)
  return mapa
}

/** `aberta_agora`: null quando a loja nao tem faixa cadastrada; senao deriva do kernel. */
function abertaAgora(dispo: DispoLoja | undefined, agora: Date): boolean | null {
  if (!dispo || dispo.faixas.length === 0) return null
  return lojaAceitandoAgora({ horarios: dispo.faixas, excecoes: dispo.excecoes }, agora)
}

export function paraSaida(
  l: repo.LojaLinha,
  papel: PapelMembro,
  dispo: DispoLoja | undefined,
  agora = new Date(),
): LojaSaida {
  return {
    id: l.id,
    nome: l.nome,
    logo_url: l.logo_url,
    cores: ler<Cores>(Cores, l.cores) ?? {},
    endereco: l.endereco ? ler<Endereco>(Endereco, l.endereco) : null,
    ativo: l.ativo,
    pausada: l.pausada,
    pausada_motivo: l.pausada_motivo,
    pausada_ate: l.pausada_ate ? l.pausada_ate.toISOString() : null,
    capacidade_por_janela: l.capacidade_por_janela,
    capacidade_janela_minutos: l.capacidade_janela_minutos,
    papel,
    aberta_agora: abertaAgora(dispo, agora),
    numeros_whatsapp: { total: l.numeros_total, conectados: l.numeros_conectados },
    criado_em: l.criado_em.toISOString(),
    atualizado_em: l.atualizado_em.toISOString(),
  }
}

/** Carrega a disponibilidade de UMA loja e monta o LojaSaida (usado pelos chamadores de loja unica). */
async function saidaDeUma(
  pool: Pool,
  l: repo.LojaLinha,
  papel: PapelMembro,
): Promise<LojaSaida> {
  const agora = new Date()
  const dispo = await carregarDispo(pool, [l.id], agora)
  return paraSaida(l, papel, dispo.get(l.id), agora)
}

/** Conta onde o usuario e dono (membro dono "todas as lojas"). 403 se nao for; 409 se ambigua. */
export async function contaDoDono(pool: Pool, userId: string): Promise<string> {
  const contas = await repo.contasDoDono(pool, userId)
  if (contas.length === 0) throw new Proibido('Apenas o dono da conta pode fazer isto')
  if (contas.length > 1) throw new Conflito('Escopo de conta ambiguo', 'conta_ambigua')
  return contas[0]!
}

export async function listar(
  pool: Pool,
  escopo: EscopoLoja,
  incluirInativas: boolean,
): Promise<LojaSaida[]> {
  const papeis = Object.values(escopo.papel_por_loja)
  const ehDono = papeis.length > 0 && papeis.every((p) => p === 'dono')
  const contaInativas = incluirInativas && ehDono ? await contaDonoOuNull(pool, escopo) : null
  const linhas = await repo.listar(pool, escopo.loja_ids, contaInativas)
  const agora = new Date()
  const dispo = await carregarDispo(pool, linhas.map((l) => l.id), agora)
  return linhas.map((l) => paraSaida(l, escopo.papel_por_loja[l.id] ?? 'dono', dispo.get(l.id), agora))
}

async function contaDonoOuNull(pool: Pool, escopo: EscopoLoja): Promise<string | null> {
  const contas = await repo.contasDoDono(pool, escopo.user_id)
  return contas.includes(escopo.conta_id) ? escopo.conta_id : null
}

/** Loja do escopo por id; fora do escopo = 404 (nao confirma existencia). */
export async function obter(pool: Pool, escopo: EscopoLoja, id: string): Promise<LojaSaida> {
  const papel = escopo.papel_por_loja[id]
  if (!escopo.loja_ids.includes(id) || !papel) throw new NaoEncontrado()
  const l = await repo.buscar(pool, id, escopo.conta_id)
  if (!l) throw new NaoEncontrado()
  return saidaDeUma(pool, l, papel)
}

export async function criar(pool: Pool, userId: string, entrada: LojaCriarEntrada): Promise<LojaSaida> {
  const contaId = await contaDoDono(pool, userId)
  const id = await comTransacao(pool, async (tx) => {
    const novo = await repo.inserir(tx, contaId, {
      nome: entrada.nome,
      endereco: entrada.endereco,
    })
    await repo.registrarEvento(tx, novo, 'loja.criada', [])
    return novo
  })
  const l = await repo.buscar(pool, id, contaId)
  return saidaDeUma(pool, l!, 'dono')
}

function exigirGestor(escopo: EscopoLoja, id: string): PapelMembro {
  const papel = escopo.papel_por_loja[id]
  if (!escopo.loja_ids.includes(id) || !papel) throw new NaoEncontrado()
  if (papel === 'atendente') throw new Proibido()
  return papel
}

async function aplicar(
  pool: Pool,
  escopo: EscopoLoja,
  id: string,
  parcial: repo.Parcial,
): Promise<LojaSaida> {
  const papel = exigirGestor(escopo, id)
  const campos = Object.keys(parcial).filter((k) => parcial[k as keyof repo.Parcial] !== undefined)
  await comTransacao(pool, async (tx) => {
    await repo.atualizar(tx, id, escopo.conta_id, parcial)
    await repo.registrarEvento(tx, id, 'loja.atualizada', campos)
  })
  const l = await repo.buscar(pool, id, escopo.conta_id)
  if (!l) throw new NaoEncontrado()
  return saidaDeUma(pool, l, papel)
}

export function atualizar(pool: Pool, escopo: EscopoLoja, id: string, e: LojaAtualizarEntrada) {
  return aplicar(pool, escopo, id, e)
}

/** G7: pausar a loja agora (nao aceita pedido novo enquanto pausada). So gestor. */
export async function pausar(
  pool: Pool,
  escopo: EscopoLoja,
  id: string,
  e: LojaPausarEntrada,
): Promise<LojaSaida> {
  const papel = exigirGestor(escopo, id)
  await comTransacao(pool, async (tx) => {
    await repo.pausar(tx, id, escopo.conta_id, { motivo: e.motivo ?? null, ate: e.ate ?? null })
    await repo.registrarEvento(tx, id, 'loja.pausada', Object.keys(e))
  })
  const l = await repo.buscar(pool, id, escopo.conta_id)
  if (!l) throw new NaoEncontrado()
  return saidaDeUma(pool, l, papel)
}

/** G7: despausar a loja. So gestor. */
export async function despausar(pool: Pool, escopo: EscopoLoja, id: string): Promise<LojaSaida> {
  const papel = exigirGestor(escopo, id)
  await comTransacao(pool, async (tx) => {
    await repo.despausar(tx, id, escopo.conta_id)
    await repo.registrarEvento(tx, id, 'loja.despausada', [])
  })
  const l = await repo.buscar(pool, id, escopo.conta_id)
  if (!l) throw new NaoEncontrado()
  return saidaDeUma(pool, l, papel)
}

/** G7: define a capacidade de pedidos por janela (null = sem limite). So gestor. */
export async function definirCapacidade(
  pool: Pool,
  escopo: EscopoLoja,
  id: string,
  e: LojaCapacidadeEntrada,
): Promise<LojaSaida> {
  const papel = exigirGestor(escopo, id)
  await comTransacao(pool, async (tx) => {
    await repo.definirCapacidade(tx, id, escopo.conta_id, {
      porJanela: e.por_janela,
      janelaMinutos: e.janela_minutos,
    })
    await repo.registrarEvento(tx, id, 'loja.capacidade_definida', Object.keys(e))
  })
  const l = await repo.buscar(pool, id, escopo.conta_id)
  if (!l) throw new NaoEncontrado()
  return saidaDeUma(pool, l, papel)
}

/** Allowlist de host do logo: exatamente o host (ou subdominio) de algum permitido. */
export function logoPermitido(url: string, hosts: readonly string[]): boolean {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return false
  }
  return hosts.some((h) => host === h || host.endsWith(`.${h}`))
}

export function branding(
  pool: Pool,
  escopo: EscopoLoja,
  id: string,
  e: LojaBrandingEntrada,
  hostsLogo: readonly string[],
) {
  exigirGestor(escopo, id)
  if (e.logo_url && !logoPermitido(e.logo_url, hostsLogo)) {
    throw regraNegocio('logo_host_nao_permitido', 'Host do logo nao permitido')
  }
  return aplicar(pool, escopo, id, { cores: e.cores, logo_url: e.logo_url })
}

/** Desativar/reativar (so dono da conta). Desativar bloqueia a ultima loja ativa. Sem DELETE. */
export async function alterarAtivo(
  pool: Pool,
  userId: string,
  id: string,
  ativar: boolean,
): Promise<LojaSaida> {
  const contaId = await contaDoDono(pool, userId)
  await comTransacao(pool, async (tx) => {
    const ativas = await repo.travarAtivas(tx, contaId)
    const l = await repo.buscar(tx, id, contaId)
    if (!l) throw new NaoEncontrado()
    if (ativar) {
      if (l.ativo) throw new Conflito('Loja ja esta ativa', 'loja_ja_ativa')
    } else {
      if (!l.ativo) throw new Conflito('Loja ja esta inativa', 'loja_ja_inativa')
      if (ativas.length <= 1) {
        throw regraNegocio('ultima_loja_ativa', 'A conta precisa de ao menos uma loja ativa')
      }
    }
    await repo.definirAtivo(tx, id, contaId, ativar)
    await repo.registrarEvento(tx, id, ativar ? 'loja.reativada' : 'loja.desativada', [])
  })
  const l = await repo.buscar(pool, id, contaId)
  return saidaDeUma(pool, l!, 'dono')
}
