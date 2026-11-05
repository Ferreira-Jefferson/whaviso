// Regra de dominio do numero (kernel compartilhado). Sem acesso HTTP aqui; erros de dominio
// via shared/http_errors. Consumido pelas rotas da LOJA e pelas rotas do CONSOLE: a `lojaId`
// SEMPRE chega como parametro (da loja ativa no caso da loja, ou da loja alvo resolvida por
// params/numero no caso do console). O kernel nao conhece escopo nem papel; isso fica nas rotas.
//
// Fluxo de segredo: o token em claro existe SO dentro destas funcoes, o tempo minimo para
// ser cifrado; nunca e devolvido, logado nem persistido em claro. O numero (E.164) so vira
// `numero_hash = sha256(E.164)`; o claro e descartado ao sair do escopo da funcao.
import type { Executor } from '@whaviso/shared/db'
import type { NumeroSaida, NumeroStatusEntrada } from '@whaviso/shared/contracts'
import { criarLogger } from '@whaviso/shared/logger'
import { HttpError, NaoEncontrado } from '../http_errors'
import { sha256Hex } from '../tokens'
import type { Cripto } from './cripto'
import type { MetaOnboarding } from './meta_onboarding'
import { ErroMeta } from './meta_onboarding'
import * as repo from './repo'

export interface DepsNumeros {
  onboarding: MetaOnboarding
  cripto: Cripto
}

const log = criarLogger('numeros')

/** Erro padronizado para qualquer falha de integracao com a Meta (sem vazar detalhe). */
function erroMeta(): HttpError {
  return new HttpError(502, 'meta_indisponivel', 'Nao foi possivel concluir com a Meta')
}

/**
 * Passo `register` do Embedded Signup, BEST-EFFORT. So roda se a porta expoe `registrarNumero`
 * (ha PIN configurado); senao, pula em silencio. Qualquer erro (numero ja registrado, PIN errado,
 * 4xx/5xx, transporte) e ENGOLIDO: apenas registra um aviso com ids/estado (nunca token/pin/
 * telefone, SEC-024) e deixa a conexao seguir. O register NUNCA pode derrubar a conexao do numero.
 */
async function registrarBestEffort(
  deps: DepsNumeros,
  token: string,
  phoneNumberId: string,
  lojaId: string,
): Promise<void> {
  if (!deps.onboarding.registrarNumero) return
  try {
    await deps.onboarding.registrarNumero(token, phoneNumberId)
    log.info({ loja_id: lojaId, passo: 'register' }, 'numero registrado na Meta')
  } catch {
    log.warn({ loja_id: lojaId, passo: 'register' }, 'register best-effort falhou; conexao segue')
  }
}

export interface EntradaConectar {
  lojaId: string
  codigo: string
  wabaId: string
  phoneNumberId: string
}

/**
 * Conecta um numero: troca o code por token, le o telefone, cifra o token, calcula o hash
 * e grava. So grava APOS o sucesso da Meta (sem registro parcial). `phone_number_id`
 * duplicado vira 409 pelo unique (traduzido no handler), sem revelar a loja dona.
 */
export async function conectar(
  exec: Executor,
  deps: DepsNumeros,
  e: EntradaConectar,
): Promise<NumeroSaida> {
  let tokenCifrado: Buffer
  let numeroHash: string
  let verificado: boolean
  try {
    const { token } = await deps.onboarding.trocarCodigo(e.codigo)
    const tel = await deps.onboarding.lerTelefone(token, e.phoneNumberId)
    await deps.onboarding.assinarWebhook(token, e.wabaId)
    // Register best-effort (pulado sem PIN): nunca falha a conexao, por isso roda antes de cifrar.
    await registrarBestEffort(deps, token, e.phoneNumberId, e.lojaId)
    numeroHash = sha256Hex(tel.numero_e164)
    verificado = tel.verificado
    tokenCifrado = deps.cripto.cifrar(token)
    // token (claro) sai de escopo aqui; nada alem do cifrado segue adiante.
  } catch (err) {
    if (err instanceof ErroMeta) throw erroMeta()
    throw err
  }

  return repo.inserir(exec, {
    lojaId: e.lojaId,
    phoneNumberId: e.phoneNumberId,
    wabaId: e.wabaId,
    numeroHash,
    tokenCifrado,
    verificado,
  })
}

/** Lista os numeros da loja. */
export async function listar(exec: Executor, lojaId: string): Promise<NumeroSaida[]> {
  return repo.listarPorLoja(exec, lojaId)
}

/** Detalhe de um numero da loja; 404 fora do escopo (nao confirma existencia). */
export async function detalhar(
  exec: Executor,
  lojaId: string,
  id: string,
): Promise<NumeroSaida> {
  const numero = await repo.buscarPorId(exec, id, lojaId)
  if (!numero) throw new NaoEncontrado('Numero nao encontrado')
  return numero
}

const STATUS_POR_ACAO = {
  pausar: 'pausado',
  reativar: 'conectado',
  remover: 'removido',
} as const

/** Pausa, reativa ou remove (sem DELETE). Remover zera o token cifrado. */
export async function mudarStatus(
  exec: Executor,
  lojaId: string,
  id: string,
  acao: NumeroStatusEntrada['acao'],
): Promise<NumeroSaida> {
  const status = STATUS_POR_ACAO[acao]
  const atualizado = await repo.atualizarStatus(exec, id, lojaId, status, acao === 'remover')
  if (!atualizado) throw new NaoEncontrado('Numero nao encontrado')
  return atualizado
}

/** Reconecta (rotaciona o token) pelo mesmo fluxo de code, substituindo `token_cifrado`. */
export async function reconectar(
  exec: Executor,
  deps: DepsNumeros,
  lojaId: string,
  id: string,
  codigo: string,
): Promise<NumeroSaida> {
  const atual = await repo.buscarPorId(exec, id, lojaId)
  if (!atual) throw new NaoEncontrado('Numero nao encontrado')

  let tokenCifrado: Buffer
  let numeroHash: string
  let verificado: boolean
  try {
    const { token } = await deps.onboarding.trocarCodigo(codigo)
    const tel = await deps.onboarding.lerTelefone(token, atual.phone_number_id)
    await deps.onboarding.assinarWebhook(token, atual.waba_id)
    // Register best-effort tambem na rotacao do token (pulado sem PIN; nunca falha a reconexao).
    await registrarBestEffort(deps, token, atual.phone_number_id, lojaId)
    numeroHash = sha256Hex(tel.numero_e164)
    verificado = tel.verificado
    tokenCifrado = deps.cripto.cifrar(token)
  } catch (err) {
    if (err instanceof ErroMeta) throw erroMeta()
    throw err
  }

  const trocado = await repo.trocarToken(exec, id, lojaId, tokenCifrado, numeroHash, verificado)
  if (!trocado) throw new NaoEncontrado('Numero nao encontrado')
  return trocado
}

/**
 * Resolve a loja dona de um numero (uso do CONSOLE, global). 404 se o numero nao existe.
 * Nao verifica escopo: a rota ja passou por `escopoOperador` + permissao de console.
 */
export async function resolverLoja(exec: Executor, id: string): Promise<string> {
  const lojaId = await repo.lojaDoNumero(exec, id)
  if (!lojaId) throw new NaoEncontrado('Numero nao encontrado')
  return lojaId
}

/** Garante que a loja alvo existe (uso do CONSOLE); 404 caso contrario. */
export async function garantirLoja(exec: Executor, lojaId: string): Promise<void> {
  if (!(await repo.lojaExiste(exec, lojaId))) throw new NaoEncontrado('Loja nao encontrada')
}
