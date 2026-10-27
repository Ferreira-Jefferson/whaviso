// META-TESTE (etapa 5): prova que o harness REPROVA uma violacao. Um harness quebrado que passa
// verde em silencio e o pior resultado possivel, entao aqui fabricamos de proposito os dois tipos
// de brecha e confirmamos que as checagens falham:
//   (1) um grant indevido a `anon` numa tabela sem RLS -> a avaliacao da matriz detecta
//       (uma expectativa "negado" seria reprovada; uma "permitido" errada tambem);
//   (2) uma tabela sem RLS -> `check_rls_coverage.sh` sai != 0.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { bancoAcessivel, fecharPoolSuper, garantirBancoLocal, poolSuper, BANCO } from '../helpers/conexao'
import { avaliarLinha } from '../helpers/avaliacao'
import { bashDisponivel, rodarScriptBash } from '../helpers/shell'

garantirBancoLocal()
const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[F7] whaviso_dev inacessivel: meta-teste PULADO.')

const TABELA_BRECHA = '_sec_meta_brecha'

d('SEC-meta: o harness reprova violacao (etapa 5)', () => {
  beforeAll(async () => {
    // Tabela de brecha: SEM RLS e com SELECT concedido a anon (exatamente o que o deny-all proibe).
    await poolSuper.query(`drop table if exists public.${TABELA_BRECHA}`)
    await poolSuper.query(`create table public.${TABELA_BRECHA} (id int)`)
    await poolSuper.query(`grant select on public.${TABELA_BRECHA} to anon`)
  })
  afterAll(async () => {
    await poolSuper.query(`drop table if exists public.${TABELA_BRECHA}`).catch(() => {})
    await fecharPoolSuper()
  })

  it('a matriz detecta grant indevido: expectativa "negado" numa brecha e REPROVADA', async () => {
    // Realidade: anon PODE ler a tabela de brecha. Se a matriz dissesse "negado", teria que reprovar.
    const a = await avaliarLinha({
      role: 'anon',
      tabela: TABELA_BRECHA,
      operacao: 'select',
      esperado: 'negado',
      sec: 'SEC-meta',
    })
    expect(a.conforme, 'o harness deixou passar um grant indevido a anon (falso verde)').toBe(false)
    // A leitura realmente aconteceu (nao foi 42501): a brecha e real.
    expect(a.code).not.toBe('42501')
  })

  it('a mesma brecha e "permitido" de verdade (controle positivo da avaliacao)', async () => {
    const a = await avaliarLinha({
      role: 'anon',
      tabela: TABELA_BRECHA,
      operacao: 'select',
      esperado: 'permitido',
      sec: 'SEC-meta',
    })
    expect(a.conforme).toBe(true)
  })

  it('a matriz detecta ausencia de grant: expectativa "permitido" sem grant e REPROVADA', async () => {
    // anon NAO tem insert na tabela de brecha; afirmar "permitido" tem que reprovar.
    const a = await avaliarLinha({
      role: 'anon',
      tabela: TABELA_BRECHA,
      coluna: 'id',
      operacao: 'insert',
      esperado: 'permitido',
      sec: 'SEC-meta',
    })
    expect(a.conforme, 'o harness deixou passar uma expectativa "permitido" sem grant (falso verde)').toBe(false)
    expect(a.code).toBe('42501')
  })

  it.runIf(bashDisponivel())('SEC-011: check_rls_coverage.sh REPROVA (exit != 0) uma tabela sem RLS', () => {
    // A tabela de brecha nao tem RLS: o gate de cobertura tem que quebrar com codigo != 0.
    const r = rodarScriptBash(['scripts/check_rls_coverage.sh', BANCO])
    expect(r.disponivel).toBe(true)
    expect(r.code, 'check_rls_coverage.sh deveria sair != 0 com uma tabela sem RLS').not.toBe(0)
    expect(r.code).not.toBeNull()
  })
})
