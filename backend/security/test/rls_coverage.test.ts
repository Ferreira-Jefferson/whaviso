// SEC-011 (verde via harness): a cobertura de RLS do banco de teste passa. E o espelho positivo do
// meta-teste (que prova a reprovacao com uma tabela sem RLS). O gate obrigatorio roda o mesmo
// script no CI (ver .github/workflows/cicd.yml e harness.md etapa 11).
import { describe, it, expect } from 'vitest'
import { bancoAcessivel, garantirBancoLocal, BANCO } from '../helpers/conexao'
import { bashDisponivel, rodarScriptBash } from '../helpers/shell'

garantirBancoLocal()
const online = await bancoAcessivel()
const d = online && bashDisponivel() ? describe : describe.skip
if (!online) console.warn('[F7] whaviso_dev inacessivel: SEC-011 PULADO.')
else if (!bashDisponivel()) console.warn('[F7] bash indisponivel: SEC-011 (script) PULADO.')

d('SEC-011: cobertura de RLS', () => {
  it('SEC-011: check_rls_coverage.sh passa (exit 0) em whaviso_dev', () => {
    const r = rodarScriptBash(['scripts/check_rls_coverage.sh', BANCO])
    expect(r.disponivel).toBe(true)
    expect(r.code, `check_rls_coverage.sh falhou; stderr: ${r.stderr}`).toBe(0)
  })
})
