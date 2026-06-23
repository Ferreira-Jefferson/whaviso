// Cria (ou reaproveita) um usuário no Supabase Auth JÁ CONFIRMADO, sem enviar e-mail.
// Serve para destravar o teste do fluxo de cadastro/login no front sem esbarrar no
// rate limit do SMTP embutido do Supabase (~2 e-mails/hora).
//
// Usa a Admin API do GoTrue (POST /auth/v1/admin/users) com a SERVICE ROLE KEY:
// SEGREDO DE SERVIDOR. NUNCA exponha essa chave no front (lá só vale a publishable).
// É só para dev/seed; não vai para o bundle do app.
//
// Uso (de dentro de backend/, com as vars no ambiente):
//   set -a && . ../secrets/production.env && set +a            # carrega SUPABASE_URL + key
//   npx tsx scripts/criar_usuario_confirmado.ts <email> <senha>
//
// O trigger handle_new_user cria o profile (nome vazio, role padrão), igual ao cadastro real.

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const [email, senha] = process.argv.slice(2)

  if (!url || !key) {
    console.error('Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no ambiente.')
    process.exit(1)
  }
  if (!email || !senha) {
    console.error('Uso: tsx scripts/criar_usuario_confirmado.ts <email> <senha>')
    process.exit(1)
  }

  const resp = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password: senha, email_confirm: true }),
  })

  const corpo = (await resp.json()) as Record<string, unknown>

  if (resp.status === 422) {
    // Já existe: não é erro fatal; o objetivo (poder logar com esse e-mail) já está atendido.
    console.log(`• ${email} já existe no Auth; nada a criar. Use a senha já cadastrada (ou redefina).`)
    return
  }
  if (!resp.ok) {
    const msg = corpo.msg ?? corpo.error_description ?? corpo.error ?? JSON.stringify(corpo)
    console.error(`Falha (${resp.status}): ${String(msg)}`)
    process.exit(1)
  }

  console.log(`✓ ${String(corpo.email)} criado e confirmado (id ${String(corpo.id)}). Já dá para entrar no front.`)
}

main().catch((e) => {
  console.error('Erro inesperado:', e instanceof Error ? e.message : e)
  process.exit(1)
})
