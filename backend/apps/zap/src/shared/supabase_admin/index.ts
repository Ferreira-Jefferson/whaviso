// Kernel compartilhado do zap: ADMIN API do Supabase (GoTrue). Vive em shared/ porque
// módulo nunca importa módulo; o `webhook_whatsapp` consome este especialista.
//
// Único uso aqui (H1.4 / E5 H5.3): criar a conta do convidado por baixo dos panos no
// ACEITE pelo WhatsApp, por TELEFONE confirmado (`phone` + `phone_confirm: true`). No
// inbound do Baileys NÃO há sessão de login (G3); por isso o vínculo é sempre por
// telefone, e a conta-no-aceite gera/recupera o profile do convidado para que o aviso
// passe a apontar para o `profile.id` (não fica órfão). O JWT continua sendo do
// Supabase (este endpoint só CRIA o usuário em auth.users; a sessão nasce no login por
// WhatsApp). O trigger handle_new_user cria o profile + a assinatura FREE; o nome vai
// no user_metadata.
//
// SEGREDO DE SERVIDOR: usa a SERVICE ROLE KEY. NUNCA exponha no front. Espelha o helper
// da api (apps/api/src/shared/supabase_admin); duplicado porque cada app é
// self-contained e o zap não importa internals da api.
//
// REGRA DE OURO: nunca logar telefone. Em erro, só o status/código, sem o número.

/** Resultado da tentativa de garantir a conta por telefone. */
export interface ContaPorTelefone {
  /** uid do auth.users (criado agora ou já existente). null se a Admin API não resolveu. */
  uid: string | null
  /** true se a conta JÁ existia (422 idempotente); false se foi criada agora. */
  jaExistia: boolean
}

/**
 * Idempotência (G2): a unicidade é garantida pelo PRÓPRIO Auth (telefone único) + o
 * tratamento do 422. NÃO fazemos SELECT-then-INSERT (que abriria janela de corrida).
 * Dois aceites concorrentes do mesmo telefone: o GoTrue serializa; um cria, o outro
 * recebe 422 e nós resolvemos o uid existente. Resultado: UMA só conta.
 */
export interface AdminSupabase {
  garantirContaPorTelefone(telefoneE164: string, nome: string): Promise<ContaPorTelefone>
}

interface UsuarioGoTrue {
  id?: string
  phone?: string
}

/**
 * Fábrica do cliente Admin real (fetch contra o GoTrue). Sem a service role key, o
 * chamador decide não construir o cliente (passa null em DepsInbound) e o aceite só
 * vincula por telefone (comportamento degradado, sem conta).
 */
export function criarAdminSupabase(supabaseUrl: string, serviceRoleKey: string): AdminSupabase {
  const base = supabaseUrl.replace(/\/$/, '')
  const headers = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    'content-type': 'application/json',
  }

  async function buscarUidPorTelefone(telefoneE164: string): Promise<string | null> {
    // O GoTrue guarda o telefone SEM o '+'. A Admin API filtra por `phone`.
    const phone = telefoneE164.replace(/^\+/, '')
    const resp = await fetch(`${base}/auth/v1/admin/users?phone=${encodeURIComponent(phone)}`, {
      method: 'GET',
      headers,
    })
    if (!resp.ok) return null
    const corpo = (await resp.json()) as { users?: UsuarioGoTrue[] }
    const achado = corpo.users?.find((u) => u.phone === phone || u.phone === telefoneE164)
    return achado?.id ?? corpo.users?.[0]?.id ?? null
  }

  return {
    async garantirContaPorTelefone(telefoneE164, nome) {
      const resp = await fetch(`${base}/auth/v1/admin/users`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phone: telefoneE164.replace(/^\+/, ''),
          phone_confirm: true,
          // O trigger handle_new_user lê raw_user_meta_data->>'nome' para o profile.
          user_metadata: { nome },
        }),
      })

      if (resp.status === 422) {
        // Telefone já existe (idempotente). Resolve o uid existente para vincular.
        const uid = await buscarUidPorTelefone(telefoneE164)
        return { uid, jaExistia: true }
      }
      if (!resp.ok) {
        // Nunca logar o telefone; o chamador decide o que fazer com null.
        return { uid: null, jaExistia: false }
      }
      const corpo = (await resp.json()) as UsuarioGoTrue
      return { uid: corpo.id ?? null, jaExistia: false }
    },
  }
}
