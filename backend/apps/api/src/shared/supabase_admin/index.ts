// Kernel compartilhado: ADMIN API do Supabase (GoTrue). Vive em shared/ porque
// módulo nunca importa módulo; o `aceite` consome este especialista, não o contrário.
//
// Único uso hoje (H1.4): criar a conta do convidado por baixo dos panos no ACEITE,
// por TELEFONE confirmado (`phone` + `phone_confirm: true`). O JWT continua sendo do
// Supabase (este endpoint só CRIA o usuário em auth.users; a sessão nasce depois, no
// login por WhatsApp da H1.2). O trigger handle_new_user cria o profile (nome vazio)
// e a assinatura FREE; por isso fazemos o BACKFILL do nome aqui (M1).
//
// SEGREDO DE SERVIDOR: usa a SERVICE ROLE KEY. NUNCA exponha no front. Trata o 422 de
// forma idempotente (telefone já existe) para não abrir janela de corrida no aceite.
//
// REGRA DE OURO: nunca logar telefone. Em erro, só o status/código, sem o número.

/** Resultado da tentativa de garantir a conta por telefone. */
export interface ContaPorTelefone {
  /** uid do auth.users (criado agora ou já existente). null se a Admin API não resolveu. */
  uid: string | null
  /** true se a conta JÁ existia (422 idempotente); false se foi criada agora. */
  jaExistia: boolean
}

/** Resultado do merge de conta split (phone-only → Google). */
export interface ResultadoMesclagem {
  /** Token hashed para o frontend fazer verifyOtp e obter sessão da conta Google. null se o merge falhou. */
  magicToken: string | null
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

  /**
   * Merge de conta split (H1.2): um usuário logou por OTP e Supabase criou uma conta
   * phone-only separada da conta Google que já existia para aquele telefone.
   *
   * Sequência:
   *  1. Busca e-mail do usuário Google (necessário para gerar o magic link).
   *  2. Gera magic link para o usuário Google (obter antes de qualquer deleção).
   *  3. Deleta o usuário phone-only (libera o número para o próximo passo).
   *  4. Vincula o telefone à conta Google (phone identity).
   *  5. Devolve o hashed_token; o frontend troca a sessão pelo Google account.
   *
   * Retorna { magicToken: null } em qualquer falha: o frontend trata como "novo
   * usuário" (onboarding) em vez de expor o erro ao usuário.
   */
  mesclarContas(
    phoneUserId: string,
    googleUserId: string,
    telefoneE164: string,
  ): Promise<ResultadoMesclagem>
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
    async mesclarContas(phoneUserId, googleUserId, telefoneE164) {
      // 1. Busca e-mail do usuário Google.
      const userResp = await fetch(`${base}/auth/v1/admin/users/${googleUserId}`, {
        method: 'GET',
        headers,
      })
      if (!userResp.ok) return { magicToken: null }
      const googleUser = (await userResp.json()) as { email?: string }
      const email = googleUser.email
      if (!email) return { magicToken: null }

      // 2. Gera magic link antes de qualquer deleção (garante o token mesmo se os
      //    passos seguintes falharem parcialmente).
      const linkResp = await fetch(`${base}/auth/v1/admin/generate_link`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ type: 'magiclink', email }),
      })
      if (!linkResp.ok) return { magicToken: null }
      const linkData = (await linkResp.json()) as { hashed_token?: string }
      const magicToken = linkData.hashed_token ?? null
      if (!magicToken) return { magicToken: null }

      // 3. Deleta o usuário phone-only (libera o número; sem o '+' no GoTrue).
      await fetch(`${base}/auth/v1/admin/users/${phoneUserId}`, {
        method: 'DELETE',
        headers,
      }).catch(() => undefined)

      // 4. Vincula o telefone à conta Google.
      await fetch(`${base}/auth/v1/admin/users/${googleUserId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          phone: telefoneE164.replace(/^\+/, ''),
          phone_confirm: true,
        }),
      }).catch(() => undefined)

      return { magicToken }
    },

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
