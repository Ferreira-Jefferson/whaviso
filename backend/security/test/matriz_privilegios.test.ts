// Executor da matriz de privilegio (SEC-021, 022, 030, 031, 032, 033).
//
// Para cada linha da matriz declarativa: executa a operacao como o role (SET ROLE) e afirma o
// esperado. `negado` exige SQLSTATE 42501 (insufficient_privilege). `permitido` nao pode falhar
// por privilegio (outros erros, que nao ocorrem com `where false`, seriam tolerados). Cada caso
// roda em transacao com rollback: nao suja o banco.
//
// Mais o teste de COMPLETUDE: toda tabela de public tem que estar na matriz (via TABELAS_CONHECIDAS),
// senao uma tabela nova entraria sem decisao de privilegio. E a prova do TRIGGER append-only.
import { describe, it, expect, afterAll } from 'vitest'
import { bancoAcessivel, fecharPoolSuper, garantirBancoLocal, poolSuper } from '../helpers/conexao'
import { PRIVILEGIO_INSUFICIENTE } from '../helpers/db_roles'
import { avaliarLinha } from '../helpers/avaliacao'
import { TABELAS_CONHECIDAS, TABELAS_APPEND_ONLY, EXCECOES_DELETE_API, matrizCompleta } from '../matriz/privilegios'

garantirBancoLocal()
const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[F7] whaviso_dev inacessivel: matriz de privilegio PULADA (rode validate_migrations.sh).')

afterAll(async () => {
  await fecharPoolSuper()
})

d('SEC-cat: completude da matriz de privilegio', () => {
  it('SEC-030: toda tabela de public esta na matriz (nenhuma tabela nova sem decisao)', async () => {
    const { rows } = await poolSuper.query<{ relname: string }>(
      `select c.relname from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r','p')
        order by c.relname`,
    )
    const noBanco = new Set(rows.map((r) => r.relname))
    const naMatriz = new Set(Object.keys(TABELAS_CONHECIDAS))

    const faltamNaMatriz = [...noBanco].filter((t) => !naMatriz.has(t))
    const sobramNaMatriz = [...naMatriz].filter((t) => !noBanco.has(t))

    // Mensagem acionavel: tabela nova no banco precisa de uma linha na matriz (com decisao de
    // apiDelete); tabela removida precisa sair da matriz.
    expect(faltamNaMatriz, `tabelas em public FORA da matriz (adicione em TABELAS_CONHECIDAS): ${faltamNaMatriz.join(', ')}`).toEqual([])
    expect(sobramNaMatriz, `tabelas na matriz que nao existem no banco: ${sobramNaMatriz.join(', ')}`).toEqual([])
  })

  it('SEC-030: a lista de excecoes de DELETE da api e exatamente {templates}', () => {
    expect([...EXCECOES_DELETE_API].sort()).toEqual(['templates'])
  })
})

d('matriz de privilegio por role (SET ROLE)', () => {
  const linhas = matrizCompleta()
  const titulo = (l: (typeof linhas)[number]) =>
    `${l.sec}: ${l.role} ${l.operacao}${l.coluna ? ` (${l.coluna})` : ''} em ${l.tabela} -> ${l.esperado}`

  it.each(linhas.map((l) => [titulo(l), l] as const))('%s', async (_t, linha) => {
    const a = await avaliarLinha(linha)
    const alvo = `${linha.role}.${linha.operacao} em ${linha.tabela}${linha.coluna ? '.' + linha.coluna : ''}`
    // Mensagem acionavel em falha; NUNCA imprime valor de segredo (aqui nao ha nenhum).
    const detalhe =
      linha.esperado === 'negado'
        ? `esperava ${PRIVILEGIO_INSUFICIENTE} (negado) em ${alvo}; obtido code=${a.code ?? '(sem erro: a operacao PASSOU)'}`
        : `${alvo} deveria ser permitido, mas foi negado por privilegio (${a.code})`
    expect(a.conforme, detalhe).toBe(true)
  })
})

d('SEC-033: trilhas append-only recusam UPDATE por TRIGGER, mesmo para o dono da tabela', () => {
  // Prova no nivel do trigger (nao so do grant): com uma linha real, o UPDATE dispara a excecao
  // append-only mesmo como superusuario (dono). Usa as tabelas sem FK obrigatoria (eventos,
  // eventos_auth); as demais (uso_llm, motoboy_lancamentos) usam o MESMO trigger e estao cobertas
  // no nivel de privilegio pela matriz acima.
  const casos: { tabela: string; insert: string; update: string }[] = [
    {
      tabela: 'eventos',
      insert: `insert into public.eventos (tipo, ator) values ('sec033_append', 'sistema')`,
      update: `update public.eventos set detalhes = '{}'::jsonb where tipo = 'sec033_append'`,
    },
    {
      tabela: 'eventos_auth',
      insert: `insert into public.eventos_auth (tipo) values ('login_ok')`,
      update: `update public.eventos_auth set detalhes = '{}'::jsonb where tipo = 'login_ok' and detalhes is null`,
    },
  ]

  it.each(casos.map((c) => [c.tabela, c] as const))('SEC-033: update em %s dispara o trigger', async (_t, caso) => {
    expect(TABELAS_APPEND_ONLY).toContain(caso.tabela)
    const client = await poolSuper.connect()
    try {
      await client.query('begin')
      await client.query(caso.insert)
      let code: string | undefined
      try {
        await client.query(caso.update)
      } catch (e) {
        code = (e as { code?: string }).code
      }
      expect(code, `o trigger append-only de ${caso.tabela} deveria barrar o UPDATE`).toBe(PRIVILEGIO_INSUFICIENTE)
    } finally {
      await client.query('rollback').catch(() => {})
      client.release()
    }
  })
})
