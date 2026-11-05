// Regra de dominio do acesso assistido (consentimento temporario da loja para o operador ver o
// conteudo). Dono da regra e das tabelas `acessos_suporte`/`acessos_suporte_log` (via repo). Sem
// acesso HTTP aqui; erros de dominio via shared/http_errors. NAO toca `chamados_suporte` (do
// modulo `suporte`): fronteira feature-first.
import type { Executor } from '@whaviso/shared/db'
import type { AcessoSuporte } from '@whaviso/shared/contracts'
import { DURACAO_ACESSO_MAX_HORAS } from '@whaviso/shared/contracts'
import { naoEncontrado, regraNegocio } from '../http_errors'
import * as repo from './repo'

const MAX_MS = DURACAO_ACESSO_MAX_HORAS * 60 * 60 * 1000

export interface EntradaConceder {
  lojaId: string
  concedidoPor: string
  motivo?: string | null
  /** Instante de expiracao (ISO/UTC). Tem que ser futuro e no maximo 7 dias a frente. */
  expiraEm: string
  chamadoId?: string | null
}

/**
 * Concede um acesso assistido. Valida a janela: `expiraEm` tem que ser futuro e caber na duracao
 * maxima (7 dias). A loja efetiva ja vem resolvida pelo chamador (escopo), nunca do corpo.
 */
export async function conceder(exec: Executor, e: EntradaConceder): Promise<AcessoSuporte> {
  const expira = Date.parse(e.expiraEm)
  if (Number.isNaN(expira)) throw regraNegocio('acesso_expira_invalido', 'Data de expiracao invalida')
  const agora = Date.now()
  if (expira <= agora) throw regraNegocio('acesso_expira_passado', 'A expiracao tem que ser no futuro')
  if (expira - agora > MAX_MS) {
    throw regraNegocio('acesso_duracao_excedida', 'O acesso assistido dura no maximo 7 dias')
  }
  return repo.inserir(exec, {
    lojaId: e.lojaId,
    concedidoPor: e.concedidoPor,
    motivo: e.motivo ?? null,
    expiraEm: new Date(expira).toISOString(),
    chamadoId: e.chamadoId ?? null,
  })
}

export interface EntradaRevogar {
  id: string
  lojaId: string
  revogadoPor: string
}

/** Revoga um grant da loja (idempotente). 404 se o grant nao pertence a loja. */
export async function revogar(exec: Executor, e: EntradaRevogar): Promise<AcessoSuporte> {
  const atual = await repo.revogar(exec, e.id, e.lojaId, e.revogadoPor)
  if (!atual) throw naoEncontrado('Acesso assistido nao encontrado')
  return atual
}

/** Grants da loja (ativos e passados). */
export function listarPorLoja(exec: Executor, lojaId: string): Promise<AcessoSuporte[]> {
  return repo.listarPorLoja(exec, lojaId)
}

/** Grant ativo da loja, ou null. Usado pela ponte de acesso assistido (shared/tenant). */
export function acessoAtivo(exec: Executor, lojaId: string): Promise<AcessoSuporte | null> {
  return repo.ativoDaLoja(exec, lojaId)
}

export interface EntradaUso {
  acessoId: string | null
  operadorUserId: string
  lojaId: string
  acao: string
  recurso?: string | null
}

/** Append-only: registra uma leitura de conteudo pelo operador na sessao assistida. */
export function registrarUso(exec: Executor, e: EntradaUso): Promise<void> {
  return repo.registrarUso(exec, {
    acessoId: e.acessoId,
    operadorUserId: e.operadorUserId,
    lojaId: e.lojaId,
    acao: e.acao,
    recurso: e.recurso ?? null,
  })
}
