// SEC-025 (sem service_role no bundle): o build do front (frontend/dist) nao pode conter a
// service_role, chaves privadas (META_*, *_SECRET, *_PRIVATE_KEY, SUPABASE_SERVICE_ROLE) nem uma
// sentinela de segredo em claro; so a anon key publica pode aparecer. O trilho e o script
// backend/scripts/check_bundle_secrets.sh (le frontend/dist, NUNCA constroi nem importa o front).
//
// Duas provas:
//   - scan vivo: quando o dist existe (local, e no CI dentro do proprio step de build do front),
//     o script varre o bundle real e sai 0, confirmando que varreu (">> OK").
//   - meta (sempre): o detector REPROVA (exit != 0) um padrao de segredo plantado de proposito, de
//     modo que o verde nunca e vazio. O padrao plantado e a palavra-chave `service_role`, nunca um
//     segredo real.
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { bashDisponivel, rodarScriptBash, RAIZ_BACKEND } from '../helpers/shell'

const DIST_FRONT = resolve(RAIZ_BACKEND, '../frontend/dist')
const temBash = bashDisponivel()
const temDist = existsSync(DIST_FRONT)

describe('SEC-025: sem service_role no bundle do front', () => {
  it.runIf(temBash && temDist)('SEC-025: o bundle real (frontend/dist) nao contem service_role / chave privada', () => {
    const r = rodarScriptBash(['scripts/check_bundle_secrets.sh'])
    expect(r.disponivel).toBe(true)
    expect(r.code, `check_bundle_secrets.sh deveria passar; stderr: ${r.stderr}`).toBe(0)
    // Confirma que o dist foi de fato varrido (e nao o caminho "ausente" que sai 0 sem olhar nada).
    expect(r.stdout, 'o script deveria ter varrido o dist, nao pulado por ausencia').toMatch(/>> OK/)
  })

  it.runIf(temBash)('SEC-025 (meta): o detector REPROVA um service_role plantado no bundle', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sec025-'))
    try {
      // Padrao de segredo plantado (palavra-chave, nao um valor real) num arquivo do "bundle".
      writeFileSync(join(dir, 'app.js'), 'const cfg={role:"service_role"};export default cfg;\n')
      const r = rodarScriptBash(['scripts/check_bundle_secrets.sh', dir])
      expect(r.disponivel).toBe(true)
      expect(r.code, 'o script deveria detectar o padrao plantado (exit != 0)').not.toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
