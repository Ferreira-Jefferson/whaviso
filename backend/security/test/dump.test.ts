// SEC-023 (cifrado em repouso): um pg_dump completo nao pode conter segredo em claro. Semeia as
// sentinelas pela forma de repouso (cifra + sha256), roda o dump e confirma:
//   - nenhuma sentinela em CLARO;
//   - o hash (sha256) e a CIFRA (bytea hex) ESTAO no dump (prova de que o dado foi gravado e de
//     que o teste nao e vazio);
//   - o script check_dump_secrets.sh sai 0 nesse estado e REPROVA (exit != 0) quando um claro e
//     plantado de proposito (meta-prova do proprio teste de dump).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { bancoAcessivel, fecharPoolSuper, garantirBancoLocal, poolSuper, BANCO } from '../helpers/conexao'
import { bashDisponivel, pgDumpDisponivel, rodarPgDump, rodarScriptBash } from '../helpers/shell'
import { semearSegredos, limparSegredos, VALORES_SENTINELA, PREFIXO_SENTINELA, type LojaSemeada } from '../fixtures/segredos'

garantirBancoLocal()
const online = await bancoAcessivel()
const temFerramentas = online && pgDumpDisponivel()
const d = temFerramentas ? describe : describe.skip
if (online && !pgDumpDisponivel()) console.warn('[F7] pg_dump indisponivel: teste de dump (SEC-023) PULADO.')
if (!online) console.warn('[F7] whaviso_dev inacessivel: teste de dump PULADO.')

const TABELA_VAZAMENTO = '_sec_dump_vazamento'

d('SEC-023: dump do banco nao contem segredo em claro', () => {
  let semeada: LojaSemeada

  beforeAll(async () => {
    const client = await poolSuper.connect()
    try {
      // Commitado: o pg_dump le o estado persistido.
      semeada = await semearSegredos(client)
    } finally {
      client.release()
    }
    await poolSuper.query(`drop table if exists public.${TABELA_VAZAMENTO}`)
  })

  afterAll(async () => {
    const client = await poolSuper.connect()
    try {
      if (semeada) await limparSegredos(client, semeada)
    } finally {
      client.release()
    }
    await poolSuper.query(`drop table if exists public.${TABELA_VAZAMENTO}`).catch(() => {})
    await fecharPoolSuper()
  })

  it('SEC-023: nenhuma sentinela em claro; cifra e hash presentes no dump', () => {
    const { code, dump } = rodarPgDump(BANCO)
    expect(code, 'pg_dump deveria rodar com sucesso').toBe(0)

    // (1) Nenhum segredo em claro.
    const vazadas = VALORES_SENTINELA.filter((v) => dump.includes(v))
    // Nao imprime o valor: so quantas e o indice.
    expect(vazadas.length, `sentinelas em claro no dump: ${vazadas.length}`).toBe(0)
    expect(dump.includes(PREFIXO_SENTINELA), 'prefixo sentinela em claro no dump').toBe(false)

    // (2) Prova de que o teste nao e vazio: a forma de repouso (hash + cifra) esta la.
    expect(dump.includes(semeada.telefoneHash), 'o sha256 do telefone deveria estar no dump').toBe(true)
    expect(dump.includes(semeada.pixHash), 'o sha256 do Pix deveria estar no dump').toBe(true)
    expect(dump.includes(semeada.chaveLlmCifradaHex), 'a cifra (bytea) da chave LLM deveria estar no dump').toBe(true)
  })

  it.runIf(bashDisponivel())('SEC-023: check_dump_secrets.sh sai 0 com os segredos cifrados', () => {
    const r = rodarScriptBash(['scripts/check_dump_secrets.sh', BANCO])
    expect(r.disponivel).toBe(true)
    expect(r.code, `check_dump_secrets.sh deveria passar; stderr: ${r.stderr}`).toBe(0)
  })

  it.runIf(bashDisponivel())('SEC-023 (meta): o script REPROVA um claro plantado de proposito', async () => {
    // Planta uma sentinela em CLARO numa tabela e confirma que o script a pega (exit != 0).
    await poolSuper.query(`create table public.${TABELA_VAZAMENTO} (v text)`)
    await poolSuper.query(`insert into public.${TABELA_VAZAMENTO} (v) values ($1)`, [VALORES_SENTINELA[0]!])
    try {
      const r = rodarScriptBash(['scripts/check_dump_secrets.sh', BANCO])
      expect(r.code, 'o script deveria detectar o claro plantado (exit != 0)').not.toBe(0)
      // Garante que o relatorio de falha NAO imprime o valor do segredo.
      expect((r.stdout + r.stderr).includes(VALORES_SENTINELA[0]!), 'o script vazou o valor do segredo na saida').toBe(false)
    } finally {
      await poolSuper.query(`drop table if exists public.${TABELA_VAZAMENTO}`).catch(() => {})
    }
  })
})
