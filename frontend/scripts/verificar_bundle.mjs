// SEC-025: o build do front nao pode conter service_role nem segredo de servidor.
// Roda depois do `vite build` (npm run build). Falha com exit 1 se achar.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIST = new URL('../dist', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const PROIBIDOS = [/service_role/i, /SERVICE_ROLE_KEY/, /SUPABASE_SERVICE/i, /POSTGRES_PASSWORD/, /META_ACCESS_TOKEN/]

function listar(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) listar(p, acc)
    else if (/\.(js|css|html|map|json|txt)$/.test(n)) acc.push(p)
  }
  return acc
}

const achados = []
for (const arq of listar(DIST)) {
  const txt = readFileSync(arq, 'utf8')
  for (const re of PROIBIDOS) if (re.test(txt)) achados.push(`${arq}: ${re}`)
  // Chave JWT do Supabase embutida: so a anon/publishable e permitida (claim role=anon).
  for (const m of txt.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g)) {
    try {
      const claims = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'))
      if (claims.role && claims.role !== 'anon') achados.push(`${arq}: JWT com role=${claims.role}`)
    } catch {
      // nao e JWT
    }
  }
}

if (achados.length > 0) {
  console.error('SEC-025 FALHOU: segredo no bundle:\n' + achados.join('\n'))
  process.exit(1)
}
console.log('SEC-025 ok: dist/ sem service_role e sem JWT privilegiado.')
