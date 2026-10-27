// Segredos SENTINELA: valores unicos, com prefixo grep-avel, que NUNCA sao valor real. Todos os
// testes de vazamento (dump, log, resposta HTTP, bundle) procuram exatamente estas sentinelas.
//
// IMPORTANTE: nenhum teste ou artefato de CI pode imprimir o VALOR de uma sentinela em falha; o
// relatorio mostra rota/arquivo/linha. A sentinela so aparece em codigo de teste, jamais em copy
// de producao.
//
// Caminho de semeadura: hoje os modulos donos (API-config-llm, API-numeros, API-pagamentos) ainda
// nao existem, entao nao ha helper `cifrar()` de producao para chamar. Como stand-in honesto,
// semeamos pela cifra do proprio Postgres (pgcrypto, `pgp_sym_encrypt`) + sha256, que produz a
// MESMA forma em repouso (bytea cifrado + hash hex) que o caminho real vai produzir. Quando o
// `cifrar()` da aplicacao existir, troca-se `semearSegredos` para chama-lo (ver README). A
// propriedade testada (texto claro ausente, cifra e hash presentes) nao muda.
import type { PoolClient } from 'pg'
import { randomUUID } from 'node:crypto'

/** Prefixo unico e fixo para `grep -F`; marca tudo que e sentinela. */
export const PREFIXO_SENTINELA = 'WHV_SENTINEL_'

export const SENTINELAS = {
  chaveLlm: 'WHV_SENTINEL_LLM_KEY_7b3f9c2a1d',
  tokenMeta: 'WHV_SENTINEL_META_TOKEN_4e8d1a6f0c',
  pix: 'WHV_SENTINEL_PIX_9c2b5e7a3f',
  telefone: 'WHV_SENTINEL_TEL_5531988887777',
} as const

export type NomeSentinela = keyof typeof SENTINELAS

/** Lista de valores sentinela, para varreduras genericas. */
export const VALORES_SENTINELA: readonly string[] = Object.values(SENTINELAS)

/** Chave mestra de cifra APENAS para o stand-in de teste (jamais um segredo real). */
const CHAVE_MESTRA_TESTE = 'chave-mestra-de-teste-do-harness-nao-usar-em-producao'

export interface LojaSemeada {
  userId: string
  contaId: string
  lojaId: string
  /** hex do sha256 do telefone sentinela (deve aparecer no dump; o claro, nunca). */
  telefoneHash: string
  pixHash: string
  /** hex do bytea cifrado da chave LLM (prova de que a cifra foi gravada). */
  chaveLlmCifradaHex: string
}

/**
 * Semeia uma loja de teste com os quatro segredos sentinela gravados na forma de REPOUSO
 * (cifra da aplicacao + sha256), pelas tabelas reais. Commita (o pg_dump precisa do estado
 * commitado). Devolve os ids e os digests para o teste conferir presenca da cifra/hash.
 * Use `limparSegredos` no finally.
 */
export async function semearSegredos(client: PoolClient): Promise<LojaSemeada> {
  const userId = randomUUID()
  const contaId = randomUUID()
  const lojaId = randomUUID()

  await client.query('insert into auth.users (id) values ($1)', [userId])
  await client.query('insert into public.contas (id, dono_user_id, nome) values ($1,$2,$3)', [
    contaId,
    userId,
    'Conta sentinela (teste seguranca)',
  ])
  await client.query('insert into public.lojas (id, conta_id, nome) values ($1,$2,$3)', [
    lojaId,
    contaId,
    'Loja sentinela (teste seguranca)',
  ])

  // credenciais_llm: chave cifrada (bytea), nunca em claro.
  await client.query(
    `insert into public.credenciais_llm (loja_id, provedor, chave_cifrada, ultimos4)
       values ($1, 'outro', pgp_sym_encrypt($2, $3), '1d')`,
    [lojaId, SENTINELAS.chaveLlm, CHAVE_MESTRA_TESTE],
  )

  // numeros_whatsapp: token cifrado + numero so como hash.
  await client.query(
    `insert into public.numeros_whatsapp (loja_id, phone_number_id, waba_id, numero_hash, token_cifrado)
       values ($1, $2, $3, encode(digest($4,'sha256'),'hex'), pgp_sym_encrypt($5, $6))`,
    [lojaId, `pnid_${lojaId.slice(0, 8)}`, `waba_${lojaId.slice(0, 8)}`, SENTINELAS.telefone, SENTINELAS.tokenMeta, CHAVE_MESTRA_TESTE],
  )

  // loja_pix: chave Pix so como hash + cifra.
  await client.query(
    `insert into public.loja_pix (loja_id, tipo, chave_hash, chave_cifrada, titular)
       values ($1, 'aleatoria', encode(digest($2,'sha256'),'hex'), pgp_sym_encrypt($2, $3), $4)`,
    [lojaId, SENTINELAS.pix, CHAVE_MESTRA_TESTE, 'Titular Sentinela'],
  )

  // clientes: telefone so como hash + cifra.
  await client.query(
    `insert into public.clientes (loja_id, telefone_hash, telefone_cifrado)
       values ($1, encode(digest($2,'sha256'),'hex'), pgp_sym_encrypt($2, $3))`,
    [lojaId, SENTINELAS.telefone, CHAVE_MESTRA_TESTE],
  )

  const { rows } = await client.query<{ telhash: string; pixhash: string; cifra: string }>(
    `select encode(digest($1,'sha256'),'hex') as telhash,
            encode(digest($2,'sha256'),'hex') as pixhash,
            encode(chave_cifrada,'hex') as cifra
       from public.credenciais_llm where loja_id = $3`,
    [SENTINELAS.telefone, SENTINELAS.pix, lojaId],
  )
  const r = rows[0]!
  return {
    userId,
    contaId,
    lojaId,
    telefoneHash: r.telhash,
    pixHash: r.pixhash,
    chaveLlmCifradaHex: r.cifra,
  }
}

/** Remove a loja sentinela (cascade da conta) e o usuario. Idempotente. */
export async function limparSegredos(client: PoolClient, s: Pick<LojaSemeada, 'contaId' | 'userId'>): Promise<void> {
  await client.query('delete from public.contas where id = $1', [s.contaId]).catch(() => {})
  await client.query('delete from auth.users where id = $1', [s.userId]).catch(() => {})
}
