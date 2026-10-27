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
 */
export async function lerCredencialAtiva(exec: Executor, lojaId: string): Promise<CredencialLlmRow | null> {
  return consultarUm<CredencialLlmRow>(
    exec,
    sql`select id, provedor, chave_cifrada, modelo_preferido
          from public.credenciais_llm
         where loja_id = ${lojaId} and ativo = true`,
  )
}
