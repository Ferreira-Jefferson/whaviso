// Helper compartilhado da api: ENFILEIRA e-mail na outbox `emails_outbox` (migration 0082). A api
// so PRODUZ (enfileira); o zap DRENA e envia via Resend. Nunca envia e-mail direto daqui.
// Escrita parametrizada (SEC-080), dedupe por chave logica (indice unico parcial no banco: o
// segundo insert da mesma chave e um no-op). O `para` ja carrega o e-mail; o payload leva so o
// que o render do zap precisa, sem segredo.
import { consultar, consultarUm, sql, type Executor } from '@whaviso/shared/db'

/** Template logico renderizado no zap. Unica chave por ora: boas-vindas de acesso liberado. */
export type TemplateEmail = 'boas_vindas'

/**
 * Enfileira um e-mail. Idempotente por `dedupeChave` (indice unico parcial): enfileirar a mesma
 * chave duas vezes insere uma linha so. Devolve true se criou a linha, false se ja existia.
 */
export async function enfileirarEmail(
  exec: Executor,
  dados: { para: string; template: TemplateEmail; payload?: object; dedupeChave: string },
): Promise<boolean> {
  const linhas = await consultar<{ id: string }>(
    exec,
    sql`insert into public.emails_outbox (para, template, payload, dedupe_chave)
        values (${dados.para}, ${dados.template}, ${JSON.stringify(dados.payload ?? {})}::jsonb,
                ${dados.dedupeChave})
        on conflict (dedupe_chave) where dedupe_chave is not null do nothing
        returning id`,
  )
  return linhas.length === 1
}

/** Chave de dedupe do boas-vindas: uma por e-mail (case-insensitive). */
export function chaveBoasVindas(email: string): string {
  return `boas_vindas:${email.trim().toLowerCase()}`
}

/** Atalho: enfileira o boas-vindas de acesso liberado para um e-mail. */
export async function enfileirarBoasVindas(exec: Executor, email: string): Promise<boolean> {
  return enfileirarEmail(exec, {
    para: email,
    template: 'boas_vindas',
    payload: {},
    dedupeChave: chaveBoasVindas(email),
  })
}

/**
 * Gancho de pagamento (migration 0082): LIBERA o dono de uma conta na baixa de fatura. Resolve o
 * e-mail do dono (contas.dono_user_id + plataforma_auth_info), marca o acesso como APROVADO (origem
 * pagamento, vinculado a conta) e enfileira o boas-vindas uma unica vez. Idempotente: sem dono com
 * e-mail e no-op; `boas_vindas_enviado_em` + o dedupe no banco evitam reenfileirar. Helper
 * compartilhado para o modulo plataforma_cobranca chamar sem escrever a allowlist nele (coordenacao
 * por banco, sem import de modulo). Deve rodar DENTRO da transacao da baixa (passe o `tx`). Nenhum
 * e-mail vai para log. Devolve true se liberou um dono com e-mail.
 */
export async function aprovarDonoPorPagamento(exec: Executor, contaId: string): Promise<boolean> {
  const dono = await consultarUm<{ email: string | null }>(
    exec,
    sql`select ai.email as email
          from public.contas c,
               lateral public.plataforma_auth_info(array[c.dono_user_id]::uuid[]) ai
         where c.id = ${contaId}`,
  )
  const email = dono?.email ?? null
  if (!email) return false

  const acesso = await consultarUm<{ id: string; boas_vindas_enviado_em: string | null }>(
    exec,
    sql`insert into public.acessos_permitidos (email, status, origem, conta_id, aprovado_em)
        values (${email}, 'aprovado', 'pagamento', ${contaId}, now())
        on conflict (lower(email)) do update set
          status = 'aprovado',
          conta_id = coalesce(public.acessos_permitidos.conta_id, excluded.conta_id),
          aprovado_em = coalesce(public.acessos_permitidos.aprovado_em, now())
        returning id, boas_vindas_enviado_em`,
  )
  if (acesso && !acesso.boas_vindas_enviado_em) {
    await enfileirarBoasVindas(exec, email)
    await consultar(
      exec,
      sql`update public.acessos_permitidos set boas_vindas_enviado_em = now()
           where id = ${acesso.id} and boas_vindas_enviado_em is null`,
    )
  }
  return true
}
