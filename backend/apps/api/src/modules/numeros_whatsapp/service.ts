// Regra do modulo. Sem acesso HTTP aqui; erros de dominio via shared/http_errors.
//
// Fluxo de segredo: o token em claro existe SO dentro destas funcoes, o tempo minimo para
// ser cifrado; nunca e devolvido, logado nem persistido em claro. O numero (E.164) so vira
// `numero_hash = sha256(E.164)`; o claro e descartado ao sair do escopo da funcao.
import type { Executor } from '@whaviso/shared/db'
import { HttpError, NaoEncontrado } from '../../shared/http_errors'
import { sha256Hex } from '../../shared/tokens'
import type { Cripto } from './cripto'
import type { MetaOnboarding } from './meta_onboarding'
import { ErroMeta } from './meta_onboarding'
import type { NumeroSaida, NumeroStatusEntrada } from './schemas'
import * as repo from './repo'

export interface DepsNumeros {
  onboarding: MetaOnboarding
  cripto: Cripto
}

/** Erro padronizado para qualquer falha de integracao com a Meta (sem vazar detalhe). */
function erroMeta(): HttpError {
  return new HttpError(502, 'meta_indisponivel', 'Nao foi possivel concluir com a Meta')
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

/** Lista os numeros da loja ativa. */
export async function listar(exec: Executor, lojaId: string): Promise<NumeroSaida[]> {
  return repo.listarPorLoja(exec, lojaId)
}

/** Detalhe de um numero da loja ativa; 404 fora do escopo (nao confirma existencia). */
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
