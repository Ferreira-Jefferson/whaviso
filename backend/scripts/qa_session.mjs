// Padrao de acesso para AMBIENTE DE TESTE (nao e brecha de seguranca).
//
// Gera uma sessao de um usuario de TESTE sem privilegio, para QA automatizado (ex.: Chrome
// sob controle do MCP, onde o Google recusa o consentimento). NAO adiciona nenhum bypass ao
// app: usa a Admin API oficial do Supabase (admin/generate_link + /verify) server-side, e a
// sessao resultante e identica a de um login real. Modelo de seguranca:
//   * A SUPABASE_SERVICE_ROLE_KEY e lida de secrets/production.env (gitignored) e vive SO aqui,
//     no node; nunca vai para o browser, o bundle do front ou o repo (SEC-025 garante no dist).
//     Quem ja tem a service_role pode tudo: este script nao cria superficie nova de ataque.
//   * O usuario de teste (QA_EMAIL, default qa@whaviso.com) nasce com metadata { qa: true },
//     e um usuario COMUM (dono de uma loja, isolado por RLS/loja_id); nao e operador nem admin.
//   * A sessao sai SO para o arquivo em --out (que deve estar fora do repo / gitignored). Nunca
//     imprime o token.
//   * Guardrail de producao: por padrao recusa rodar se a URL alvo parecer producao; passe
//     --permitir-producao so se for intencional (nunca em CI de deploy).
//
// Uso (de dentro de backend/):
//   WROOT=.. OUT=<path fora do repo> node scripts/qa_session.mjs [--permitir-producao]
import { readFileSync, writeFileSync } from 'node:fs'

function lerEnv(caminho, chave) {
  for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && m[1] === chave) return m[2].trim()
  }
  return null
}

const ROOT = process.env.WROOT ?? '..'
const OUT = process.env.OUT
if (!OUT) { console.error('faltou OUT=<arquivo fora do repo p/ gravar a sessao>'); process.exit(1) }

const URL = lerEnv(`${ROOT}/frontend/.env`, 'VITE_SUPABASE_URL')
const ANON = lerEnv(`${ROOT}/frontend/.env`, 'VITE_SUPABASE_PUBLISHABLE_KEY')
const SERVICE = lerEnv(`${ROOT}/secrets/production.env`, 'SUPABASE_SERVICE_ROLE_KEY')
const EMAIL = process.env.QA_EMAIL ?? 'qa@whaviso.com'
if (!URL || !ANON || !SERVICE) { console.error('faltam env:', { URL: !!URL, ANON: !!ANON, SERVICE: !!SERVICE }); process.exit(1) }

// Guardrail: a URL alvo (host publico de producao conhecido) exige flag explicita.
const ehProducao = /whaviso\.com/.test(URL)
if (ehProducao && !process.argv.includes('--permitir-producao')) {
  console.error(`RECUSADO: alvo parece producao (${URL}). Rode so contra dev/teste, ou passe --permitir-producao se for intencional.`)
  process.exit(1)
}
console.log('alvo:', URL)

const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }

// 1. cria usuario de teste confirmado e marcado (ignora se ja existe)
let r = await fetch(`${URL}/auth/v1/admin/users`, { method: 'POST', headers: admin, body: JSON.stringify({ email: EMAIL, email_confirm: true, user_metadata: { qa: true } }) })
if (!r.ok && r.status !== 422) { console.error('create user falhou', r.status, await r.text()); process.exit(1) }

// 2. gera magiclink -> hashed_token (sem envio de email)
r = await fetch(`${URL}/auth/v1/admin/generate_link`, { method: 'POST', headers: admin, body: JSON.stringify({ type: 'magiclink', email: EMAIL }) })
if (!r.ok) { console.error('generate_link falhou', r.status, await r.text()); process.exit(1) }
const link = await r.json()
const hashed = link.hashed_token ?? link.properties?.hashed_token
if (!hashed) { console.error('sem hashed_token', Object.keys(link)); process.exit(1) }

// 3. troca o token_hash por uma sessao real (apikey anon, como o front faria)
r = await fetch(`${URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: hashed }) })
if (!r.ok) { console.error('verify falhou', r.status, await r.text()); process.exit(1) }
const sess = await r.json()
if (!sess.access_token) { console.error('sem access_token', Object.keys(sess)); process.exit(1) }

// storage key do supabase-js v2: sb-<ref>-auth-token
const ref = new globalThis.URL(URL).hostname.split('.')[0]
writeFileSync(OUT, JSON.stringify({ key: `sb-${ref}-auth-token`, session: sess, userId: sess.user?.id, email: EMAIL }))
console.log('OK usuario de teste=', sess.user?.id, 'storageKey=', `sb-${ref}-auth-token`, '(sessao gravada fora do repo, token nao impresso)')
