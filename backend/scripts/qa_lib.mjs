// Logica compartilhada para gerar uma sessao real do usuario de TESTE (qa@whaviso.com por padrao)
// via Admin API do Supabase. Usada por qa_session.mjs (grava em arquivo) e qa_login.mjs (abre o
// navegador ja logado). O guardrail de producao e o unico lugar que decide isso, para as duas
// ferramentas nunca divergirem.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Raiz do repo calculada a partir da localizacao deste arquivo (backend/scripts/qa_lib.mjs), nao
// do cwd: assim os scripts rodam igual de dentro de backend/ ou da raiz do projeto. WROOT ainda
// pode sobrepor, se precisar.
export const RAIZ_PADRAO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

export function lerEnv(caminho, chave) {
  for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && m[1] === chave) return m[2].trim()
  }
  return null
}

/**
 * Gera uma sessao completa (identica a de um login real) para o usuario de teste.
 * Nunca imprime o token: devolve a sessao pro chamador decidir onde ela vai (arquivo fora do
 * repo, ou servida so em 127.0.0.1 para o navegador buscar).
 */
export async function obterSessaoQa({ root = RAIZ_PADRAO, email, permitirProducao = false } = {}) {
  const URL = lerEnv(`${root}/frontend/.env`, 'VITE_SUPABASE_URL')
  const ANON = lerEnv(`${root}/frontend/.env`, 'VITE_SUPABASE_PUBLISHABLE_KEY')
  const SERVICE = lerEnv(`${root}/secrets/production.env`, 'SUPABASE_SERVICE_ROLE_KEY')
  const EMAIL = email ?? process.env.QA_EMAIL ?? 'qa@whaviso.com'
  if (!URL || !ANON || !SERVICE) {
    throw new Error(`faltam env: ${JSON.stringify({ URL: !!URL, ANON: !!ANON, SERVICE: !!SERVICE })}`)
  }

  // Guardrail: a URL alvo (host publico de producao conhecido) exige flag explicita.
  const ehProducao = /whaviso\.com/.test(URL)
  if (ehProducao && !permitirProducao) {
    throw new Error(`RECUSADO: alvo parece producao (${URL}). Rode so contra dev/teste, ou permita explicitamente.`)
  }
  console.log('alvo:', URL)

  const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }

  // 1. cria usuario de teste confirmado e marcado (ignora se ja existe)
  let r = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST', headers: admin,
    body: JSON.stringify({ email: EMAIL, email_confirm: true, user_metadata: { qa: true } }),
  })
  if (!r.ok && r.status !== 422) throw new Error(`create user falhou ${r.status}: ${await r.text()}`)

  // 2. gera magiclink -> hashed_token (sem envio de email)
  r = await fetch(`${URL}/auth/v1/admin/generate_link`, {
    method: 'POST', headers: admin, body: JSON.stringify({ type: 'magiclink', email: EMAIL }),
  })
  if (!r.ok) throw new Error(`generate_link falhou ${r.status}: ${await r.text()}`)
  const link = await r.json()
  const hashed = link.hashed_token ?? link.properties?.hashed_token
  if (!hashed) throw new Error(`sem hashed_token: ${Object.keys(link)}`)

  // 3. troca o token_hash por uma sessao real (apikey anon, como o front faria)
  r = await fetch(`${URL}/auth/v1/verify`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: hashed }),
  })
  if (!r.ok) throw new Error(`verify falhou ${r.status}: ${await r.text()}`)
  const sess = await r.json()
  if (!sess.access_token) throw new Error(`sem access_token: ${Object.keys(sess)}`)

  // storage key do supabase-js v2: sb-<ref>-auth-token
  const ref = new globalThis.URL(URL).hostname.split('.')[0]
  return { url: URL, key: `sb-${ref}-auth-token`, session: sess, userId: sess.user?.id, email: EMAIL }
}
