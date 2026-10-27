// Camada de leitura do escopo (F3, etapa 6). INJETAVEL: ate o `shared/db` do F4 existir,
// os modulos e testes passam uma implementacao (fake nos testes unitarios, SQL real nos
// de integracao). Toda query e PARAMETRIZADA (sem interpolacao de string; SEC-080).
//
// `loja_id` NULL em `membros` = "todas as lojas da conta": a expansao acontece aqui, no
// JOIN com `lojas`, e so inclui loja ATIVA. Vinculo e loja inativos ficam de fora.
import type { Pool, PoolClient } from '@whaviso/shared/db'
import type { PapelMembro, PapelOperador } from '@whaviso/shared/contracts'

/** Uma linha de vinculo de loja ja resolvida (loja ativa, membro ativo). */
export interface VinculoLoja {
  conta_id: string
  loja_id: string
  papel: PapelMembro
}

export interface OperadorResolvido {
  papel: PapelOperador
}

/**
 * Contrato de leitura do escopo. NAO cacheia entre requisicoes (revogacao imediata:
 * um membro removido perde acesso na requisicao seguinte). Um cache CURTO por
 * requisicao, se desejado, e responsabilidade de quem consome dentro do ciclo.
 */
export interface LeitorEscopo {
  /** Vinculos de loja do usuario (expande `loja_id` NULL para as lojas ativas da conta). */
  lojasDoUsuario(userId: string): Promise<VinculoLoja[]>
  /** Linha de operador ativa do usuario, ou null se nao for operador da plataforma. */
  operadorDoUsuario(userId: string): Promise<OperadorResolvido | null>
}

type Executor = Pick<Pool | PoolClient, 'query'>

// Vinculo direto (loja especifica) UNION vinculo "todas as lojas" (loja_id NULL expandido).
// So membros e lojas ATIVOS entram. Parametrizado em $1 (user_id).
const SQL_LOJAS = `
  select m.conta_id, m.loja_id, m.papel
    from public.membros m
    join public.lojas l on l.id = m.loja_id
   where m.user_id = $1 and m.ativo and l.ativo and m.loja_id is not null
  union all
  select m.conta_id, l.id as loja_id, m.papel
    from public.membros m
    join public.lojas l on l.conta_id = m.conta_id
   where m.user_id = $1 and m.ativo and l.ativo and m.loja_id is null
`

const SQL_OPERADOR = `
  select papel from public.operadores where user_id = $1 and ativo limit 1
`

/** Implementacao SQL real, rodando sob o role `whaviso_api` (SELECT em membros/lojas/operadores). */
export function criarLeitorEscopoSql(executor: Executor): LeitorEscopo {
  return {
    async lojasDoUsuario(userId) {
      const { rows } = await executor.query<VinculoLoja>(SQL_LOJAS, [userId])
      return rows
    },
    async operadorDoUsuario(userId) {
      const { rows } = await executor.query<OperadorResolvido>(SQL_OPERADOR, [userId])
      return rows[0] ?? null
    },
  }
}
