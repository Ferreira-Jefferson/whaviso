// Kernel compartilhado: ADMIN API do Supabase (GoTrue). Vive em shared/ porque
// módulo nunca importa módulo; o `aceite` consome este especialista, não o contrário.
//
// Único uso hoje (H1.4): criar a conta do convidado por baixo dos panos no ACEITE,
// por TELEFONE confirmado (`phone` + `phone_confirm: true`). O JWT continua sendo do
// Supabase (este endpoint só CRIA o usuário em auth.users; a sessão nasce depois, no
// login por WhatsApp da H1.2). O trigger handle_new_user cria o profile (nome vazio)
// e a assinatura FREE; por isso fazemos o BACKFILL do nome aqui (M1).
//
// SEGREDO DE SERVIDOR: usa a SERVICE ROLE KEY. NUNCA exponha no front. Precedente:
// scripts/criar_usuario_confirmado.ts (cria por e-mail; aqui é por telefone), incluindo
// o tratamento idempotente do 422 (telefone já existe).
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
 * Cria (ou reaproveita) um usuário no Supabase Auth a partir do TELEFONE, já confirmado.
 *
 * Idempotência (M2): a unicidade é garantida pelo PRÓPRIO Auth (telefone único) + o
 * tratamento do 422. NÃO fazemos SELECT-then-INSERT (que abriria janela de corrida).
 * Dois aceites concorrentes do mesmo telefone: o GoTrue serializa; um cria, o outro
 * recebe 422 e nós resolvemos o uid existente. Resultado: UMA só conta.
 *
 * Em 422 (telefone já existe), buscamos o uid pelo telefone (GET admin/users?phone=...)
 * para que o aceite consiga vincular o aviso à conta certa.
 */
export interface AdminSupabase {
  garantirContaPorTelefone(
    telefoneE164: string,
    nome: string,
  ): Promise<ContaPorTelefone>
}

interface UsuarioGoTrue {
  id?: string
  phone?: string
}

/**
 * Fábrica do cliente Admin real (fetch contra o GoTrue). `criar` é injetável para
 * teste, mas o caminho padrão usa fetch. Sem a service role key, lança ao ser usado
 * (o chamador decide não chamar quando a chave falta).
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
