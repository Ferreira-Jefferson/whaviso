// Resolver de credencial de LLM por loja. Leitura SO via @whaviso/shared/db (sql parametrizado),
// escolha EXPLICITA de colunas (sem `select *`), sempre filtrando por `loja_id` (SEC-062).
//
// `whaviso_atendente` e o UNICO role com SELECT em `credenciais_llm.chave_cifrada` (migration 0012,
// SEC-021/022). Ausencia de linha OU `ativo = false` => null => o chamador trata como
// `llm_indisponivel` e degrada (FALHA FECHADA: nunca cai na chave de outra loja nem em global).
import { consultarUm, sql, type Executor } from '@whaviso/shared/db'
import type { ProvedorLlm } from './config'

/** Linha da credencial ativa (inclui a `chave_cifrada`, so para decifrar no instante do uso). */
export interface CredencialLlmRow {
  id: string
  provedor: ProvedorLlm
  chave_cifrada: Buffer
  modelo_preferido: string | null
}

/**
 * Credencial ATIVA da loja, ou null. Projeta so as colunas necessarias (nunca `ultimos4`/datas que
 * nao usamos aqui). `ativo = true` embutido no WHERE: credencial inativa resolve como ausente.
 *
 * Fonte unica (SEC-021): `credenciais_llm.chave_cifrada` (BYO, a propria loja) OU
 * `credenciais_llm_pool.chave_cifrada` (quando `pool_chave_id` aponta pra uma chave do pool,
 * atribuida pelo operador). `coalesce` pega a que estiver setada; o join so entra quando ha
 * `pool_chave_id`. Chave do pool DESATIVADA (`p.ativo = false`) resolve como ausente tambem
 * (falha fechada: uma loja nunca "cai" numa chave diferente so porque a atribuida foi desligada).
 */
export async function lerCredencialAtiva(exec: Executor, lojaId: string): Promise<CredencialLlmRow | null> {
  return consultarUm<CredencialLlmRow>(
    exec,
    sql`select c.id, c.provedor, coalesce(p.chave_cifrada, c.chave_cifrada) as chave_cifrada, c.modelo_preferido
          from public.credenciais_llm c
          left join public.credenciais_llm_pool p on p.id = c.pool_chave_id
         where c.loja_id = ${lojaId} and c.ativo = true
           and (c.pool_chave_id is null or p.ativo = true)`,
  )
}
