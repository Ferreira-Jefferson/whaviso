// Persistencia do modulo acessos. So INSERT/UPDATE na grade (sem DELETE). Colunas explicitas.
// A grade `papel_permissoes` e GLOBAL por desenho: a chave e (escopo, papel, permissao_chave), SEM
// conta_id. Editar uma celula vale para TODAS as contas de uma vez (plataforma-wide); e intencional e
// nao burlavel por usuario de loja (so o admin fixo tem `acessos:gerir`). Nao adicionar coluna de conta.
import { consultar, sql, type Executor } from '@whaviso/shared/db'

export interface PermissaoLinha {
  chave: string
  escopo: 'console' | 'loja'
  rotulo: string
  ordem: number
}

export function listarPermissoes(exec: Executor): Promise<PermissaoLinha[]> {
  return consultar<PermissaoLinha>(
    exec,
    sql`select chave, escopo, rotulo, ordem from public.permissoes order by escopo, ordem, chave`,
  )
}

export async function gravarCelula(
  exec: Executor,
  d: { escopo: string; papel: string; permissao: string; permitido: boolean; userId: string },
): Promise<void> {
  await consultar(
    exec,
    sql`insert into public.papel_permissoes (escopo, papel, permissao_chave, permitido, atualizado_por)
        values (${d.escopo}, ${d.papel}, ${d.permissao}, ${d.permitido}, ${d.userId}::uuid)
        on conflict (escopo, papel, permissao_chave)
        do update set permitido = excluded.permitido, atualizado_em = now(),
                      atualizado_por = excluded.atualizado_por`,
  )
}

/** Auditoria (append-only). `detalhes` so com ids/chaves; nada de dado pessoal. Evento global. */
export async function registrarEvento(
  exec: Executor,
  e: { tipo: string; detalhes: Record<string, unknown> },
): Promise<void> {
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (null, ${e.tipo}, 'papel_permissao', null, 'operador', ${JSON.stringify(e.detalhes)}::jsonb)`,
  )
}

/**
 * Avisa todas as instancias da api (LISTEN) de que a grade mudou. Chamar DENTRO da transacao do
 * save: o Postgres so entrega o NOTIFY no COMMIT (nunca antes do dado estar visivel).
 */
export async function notificarGrade(exec: Executor, canal: string): Promise<void> {
  await consultar(exec, sql`select pg_notify(${canal}, '')`)
}
