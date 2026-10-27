// Integracao do funil (banco real, role whaviso_api): CRUD, duplicata por hash, estagios com
// historico, atividades append-only, agenda, vinculo de conta, quadro e seguranca (SEC-003/041,
// SEC-023/024, SEC-033, SEC-080/081).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { chamar, cifra, criarConta, encerrar, montarMundo, novoProspecto, online, poolSuper, type Mundo } from './test/apoio'

const d = online ? describe : describe.skip

d('plataforma_funil', () => {
  let m: Mundo

  beforeAll(async () => {
    m = await montarMundo()
  })
  afterAll(async () => {
    await encerrar(m)
  })

  describe('escopo (SEC-003/041)', () => {
    it('sem token 401; membro de loja 403 em todas as rotas; operador passa', async () => {
      const p = (await novoProspecto(m, m.opA)).corpo.id as string
      const rotas: [string, string, unknown][] = [
        ['GET', '/prospectos', undefined],
        ['POST', '/prospectos', { nome_restaurante: 'x' }],
        ['GET', `/prospectos/${p}`, undefined],
        ['PATCH', `/prospectos/${p}`, { cidade: 'x' }],
        ['POST', `/prospectos/${p}/estagio`, { estagio: 'contato' }],
        ['GET', `/prospectos/${p}/atividades`, undefined],
        ['POST', `/prospectos/${p}/atividades`, { tipo: 'nota', descricao: 'x' }],
        ['POST', `/prospectos/${p}/vincular-conta`, { conta_id: m.contaDono }],
        ['GET', '/funil/quadro', undefined],
        ['GET', '/funil/agenda', undefined],
      ]
      for (const [metodo, url, corpo] of rotas) {
        const sem = await chamar(m, null, metodo as 'GET', url, corpo)
        expect(sem.status, `${metodo} ${url} sem token`).toBe(401)
        const loja = await chamar(m, m.dono, metodo as 'GET', url, corpo)
        expect(loja.status, `${metodo} ${url} membro de loja`).toBe(403)
      }
      expect((await chamar(m, m.opA, 'GET', '/funil/quadro')).status).toBe(200)
    })
  })

  describe('CRUD e PII', () => {
    it('cria com responsavel default, hash+cifra no banco, mascara na listagem e claro so no detalhe', async () => {
      const r = await novoProspecto(m, m.opA, {
        nome_restaurante: 'TESTE-FUNIL Cantina',
        contato_telefone: '(11) 98765-4321',
        contato_email: 'dono@cantina.test',
        cidade: 'Campinas',
      })
      expect(r.status).toBe(201)
      expect(r.corpo.estagio).toBe('novo')
      expect(r.corpo.responsavel_operador_id).toBe(m.opAId)
      expect(r.corpo.contato_telefone).toBe('+5511987654321')
      const id = r.corpo.id as string

      const { rows } = await poolSuper.query<{ h: string; c: Buffer }>(
        'select contato_telefone_hash as h, contato_telefone_cifrado as c from public.prospectos where id = $1',
        [id],
      )
      expect(rows[0]!.h).toBe(cifra.hashTelefone('+5511987654321'))
      expect(rows[0]!.c.toString('utf8')).not.toContain('987654321')

      const lista = await chamar(m, m.opA, 'GET', '/prospectos?cidade=campinas')
      expect(lista.status).toBe(200)
      expect(lista.body).not.toContain('987654321')
      expect(lista.body).not.toContain('contato_telefone"')
      const item = lista.corpo.itens.find((x: { id: string }) => x.id === id)
      expect(item.contato_telefone_mascarado).toMatch(/4321$/)

      const det = await chamar(m, m.opB, 'GET', `/prospectos/${id}`)
      expect(det.corpo.contato_telefone).toBe('+5511987654321')
    })

    it('duplicata por hash devolve 409 com o id existente (criar e editar)', async () => {
      const a = await novoProspecto(m, m.opA, { contato_telefone: '11 91111-2222' })
      const dup = await novoProspecto(m, m.opA, { nome_restaurante: 'outro', contato_telefone: '+55 (11) 91111-2222' })
      expect(dup.status).toBe(409)
      expect(dup.corpo.error.code).toBe('prospecto_duplicado')
      expect(dup.corpo.error.message).toContain(a.corpo.id)

      const b = await novoProspecto(m, m.opA, { contato_telefone: '11 93333-4444' })
      const edit = await chamar(m, m.opA, 'PATCH', `/prospectos/${b.corpo.id}`, { contato_telefone: '11911112222' })
      expect(edit.status).toBe(409)
      // O proprio telefone nao conflita consigo mesmo.
      const ok = await chamar(m, m.opA, 'PATCH', `/prospectos/${b.corpo.id}`, { contato_telefone: '11 93333-4444', cidade: 'Santos' })
      expect(ok.status).toBe(200)
      expect(ok.corpo.cidade).toBe('Santos')
    })

    it('telefone invalido 422; responsavel inexistente 422; patch limpa com null', async () => {
      expect((await novoProspecto(m, m.opA, { contato_telefone: '123' })).corpo.error.code).toBe('telefone_invalido')
      const r = await novoProspecto(m, m.opA, { responsavel_operador_id: randomUUID() })
      expect(r.status).toBe(422)
      expect(r.corpo.error.code).toBe('responsavel_invalido')

      const p = await novoProspecto(m, m.opA, { contato_telefone: '11 94444-5555', cidade: 'Rio' })
      const limpo = await chamar(m, m.opA, 'PATCH', `/prospectos/${p.corpo.id}`, {
        contato_telefone: null,
        cidade: null,
        responsavel_operador_id: m.opBId,
      })
      expect(limpo.status).toBe(200)
      expect(limpo.corpo.contato_telefone).toBeNull()
      expect(limpo.corpo.cidade).toBeNull()
      expect(limpo.corpo.responsavel_operador_id).toBe(m.opBId)
    })

    it('404 em id inexistente', async () => {
      expect((await chamar(m, m.opA, 'GET', `/prospectos/${randomUUID()}`)).status).toBe(404)
      expect((await chamar(m, m.opA, 'GET', `/prospectos/${randomUUID()}/atividades`)).status).toBe(404)
    })

    it('filtros e paginacao por cursor', async () => {
      const marca = `TESTE-FUNIL-PAG-${randomUUID().slice(0, 8)}`
      for (let i = 0; i < 3; i++) await novoProspecto(m, m.opA, { nome_restaurante: `${marca} ${i}`, cidade: 'Pagtown' })
      const p1 = await chamar(m, m.opA, 'GET', `/prospectos?q=${marca}&limite=2`)
      expect(p1.corpo.itens).toHaveLength(2)
      expect(p1.corpo.proximoCursor).not.toBeNull()
      const p2 = await chamar(m, m.opA, 'GET', `/prospectos?q=${marca}&limite=2&cursor=${p1.corpo.proximoCursor}`)
      expect(p2.corpo.itens).toHaveLength(1)
      expect(p2.corpo.proximoCursor).toBeNull()
      const ids = [...p1.corpo.itens, ...p2.corpo.itens].map((x: { id: string }) => x.id)
      expect(new Set(ids).size).toBe(3)
      // % na busca e literal, nao curinga.
      expect((await chamar(m, m.opA, 'GET', '/prospectos?q=%25')).corpo.itens).toHaveLength(0)
      expect((await chamar(m, m.opA, 'GET', '/prospectos?cursor=lixo')).status).toBe(422)
      expect((await chamar(m, m.opA, 'GET', `/prospectos?responsavel_id=${m.opBId}&estagio=novo`)).status).toBe(200)
    })
  })

  describe('estagios', () => {
    it('transicao valida grava nota automatica e evento; invalida 422; ativo manual 422', async () => {
      const id = (await novoProspecto(m, m.opA)).corpo.id as string
      const ok = await chamar(m, m.opA, 'POST', `/prospectos/${id}/estagio`, { estagio: 'contato', motivo: 'ligou' })
      expect(ok.status).toBe(200)
      expect(ok.corpo.estagio).toBe('contato')

      const hist = await chamar(m, m.opA, 'GET', `/prospectos/${id}/atividades`)
      expect(hist.corpo.itens[0].tipo).toBe('nota')
      expect(hist.corpo.itens[0].descricao).toContain('novo -> contato')
      expect(hist.corpo.itens[0].descricao).toContain('ligou')

      const { rows } = await poolSuper.query(
        "select detalhes from public.eventos where tipo = 'prospecto.estagio_alterado' and entidade_id = $1",
        [id],
      )
      expect(rows).toHaveLength(1)
      expect(JSON.stringify(rows[0].detalhes)).not.toContain('ligou')

      const inv = await chamar(m, m.opA, 'POST', `/prospectos/${id}/estagio`, { estagio: 'novo' })
      expect(inv.status).toBe(200) // contato -> novo e permitido
      const inv2 = await chamar(m, m.opA, 'POST', `/prospectos/${id}/estagio`, { estagio: 'proposta' })
      expect(inv2.status).toBe(422)
      expect(inv2.corpo.error.code).toBe('transicao_invalida')
      const ativo = await chamar(m, m.opA, 'POST', `/prospectos/${id}/estagio`, { estagio: 'ativo' })
      expect(ativo.corpo.error.code).toBe('estagio_ativo_via_vinculo')
      expect((await chamar(m, m.opA, 'POST', `/prospectos/${id}/estagio`, { estagio: 'inexistente' })).status).toBe(400)
    })

    it('perdido reabre para novo', async () => {
      const id = (await novoProspecto(m, m.opA)).corpo.id as string
      await chamar(m, m.opA, 'POST', `/prospectos/${id}/estagio`, { estagio: 'perdido' })
      const r = await chamar(m, m.opA, 'POST', `/prospectos/${id}/estagio`, { estagio: 'novo' })
      expect(r.corpo.estagio).toBe('novo')
    })
  })

  describe('atividades e agenda', () => {
    it('follow-up exige data; conclusao e nova atividade; agenda exclui concluidos', async () => {
      const id = (await novoProspecto(m, m.opA)).corpo.id as string
      expect((await chamar(m, m.opA, 'POST', `/prospectos/${id}/atividades`, { tipo: 'follow_up' })).status).toBe(400)
      expect((await chamar(m, m.opA, 'POST', `/prospectos/${id}/atividades`, { tipo: 'nota', descricao: 'x', agendada_para: '2030-01-01T10:00:00Z' })).status).toBe(400)

      const amanha = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
      const fu = await chamar(m, m.opA, 'POST', `/prospectos/${id}/atividades`, { tipo: 'follow_up', descricao: 'ligar de novo', agendada_para: amanha })
      expect(fu.status).toBe(201)
      const fuId = fu.corpo.id as number
      expect(fu.corpo.operador_nome).toBe('Operador de teste')

      const ag = await chamar(m, m.opA, 'GET', '/funil/agenda?dias=7')
      const naAgenda = ag.corpo.itens.find((x: { atividade_id: number }) => x.atividade_id === fuId)
      expect(naAgenda.nome_restaurante).toBe('TESTE-FUNIL Restaurante')
      expect(naAgenda.atrasado).toBe(false)
      // Outro operador, sem "todos", nao ve (responsavel do prospecto e o opA).
      const agB = await chamar(m, m.opB, 'GET', '/funil/agenda?dias=7')
      expect(agB.corpo.itens.find((x: { atividade_id: number }) => x.atividade_id === fuId)).toBeUndefined()
      const agTodos = await chamar(m, m.opB, 'GET', '/funil/agenda?dias=7&todos=true')
      expect(agTodos.corpo.itens.find((x: { atividade_id: number }) => x.atividade_id === fuId)).toBeDefined()
      // Fora da janela de 0 dias (amanha): nao entra.
      const ag0 = await chamar(m, m.opA, 'GET', '/funil/agenda?dias=0')
      expect(ag0.corpo.itens.find((x: { atividade_id: number }) => x.atividade_id === fuId)).toBeUndefined()

      const conc = await chamar(m, m.opA, 'POST', `/prospectos/${id}/atividades`, { tipo: 'ligacao', descricao: 'atendeu', conclui_atividade_id: fuId })
      expect(conc.status).toBe(201)
      expect(conc.corpo.conclui_atividade_id).toBe(fuId)
      expect(conc.corpo.descricao).toBe('atendeu')

      const ag2 = await chamar(m, m.opA, 'GET', '/funil/agenda?dias=7')
      expect(ag2.corpo.itens.find((x: { atividade_id: number }) => x.atividade_id === fuId)).toBeUndefined()

      const de_novo = await chamar(m, m.opA, 'POST', `/prospectos/${id}/atividades`, { tipo: 'nota', descricao: 'x', conclui_atividade_id: fuId })
      expect(de_novo.corpo.error.code).toBe('followup_ja_concluido')
    })

    it('follow-up atrasado entra na agenda marcado como atrasado', async () => {
      const id = (await novoProspecto(m, m.opA)).corpo.id as string
      const ontem = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
      const fu = await chamar(m, m.opA, 'POST', `/prospectos/${id}/atividades`, { tipo: 'follow_up', agendada_para: ontem })
      const ag = await chamar(m, m.opA, 'GET', '/funil/agenda?dias=0')
      const item = ag.corpo.itens.find((x: { atividade_id: number }) => x.atividade_id === fu.corpo.id)
      expect(item.atrasado).toBe(true)
    })

    it('conclusao so vale para follow-up do mesmo prospecto; descricao nao forja conclusao', async () => {
      const a = (await novoProspecto(m, m.opA)).corpo.id as string
      const b = (await novoProspecto(m, m.opA)).corpo.id as string
      const fu = await chamar(m, m.opA, 'POST', `/prospectos/${a}/atividades`, { tipo: 'follow_up', agendada_para: new Date(Date.now() + 3600_000).toISOString() })
      const nota = await chamar(m, m.opA, 'POST', `/prospectos/${a}/atividades`, { tipo: 'nota', descricao: 'n' })
      const cruzada = await chamar(m, m.opA, 'POST', `/prospectos/${b}/atividades`, { tipo: 'nota', descricao: 'n', conclui_atividade_id: fu.corpo.id })
      expect(cruzada.corpo.error.code).toBe('followup_invalido')
      const naoFu = await chamar(m, m.opA, 'POST', `/prospectos/${a}/atividades`, { tipo: 'nota', descricao: 'n', conclui_atividade_id: nota.corpo.id })
      expect(naoFu.corpo.error.code).toBe('followup_invalido')
      const forja = await chamar(m, m.opA, 'POST', `/prospectos/${a}/atividades`, { tipo: 'nota', descricao: `{"conclui":${fu.corpo.id}}` })
      expect(forja.status).toBe(422)
    })

    it('SEC-033: atividade nao aceita UPDATE nem DELETE pelo role da api', async () => {
      const id = (await novoProspecto(m, m.opA)).corpo.id as string
      await chamar(m, m.opA, 'POST', `/prospectos/${id}/atividades`, { tipo: 'nota', descricao: 'imutavel' })
      for (const cmd of [
        "update public.prospecto_atividades set descricao = 'x' where prospecto_id = $1",
        'delete from public.prospecto_atividades where prospecto_id = $1',
      ]) {
        const c = await poolSuper.connect()
        try {
          await c.query('begin')
          await c.query('set local role whaviso_api')
          await expect(c.query(cmd, [id])).rejects.toThrow()
        } finally {
          await c.query('rollback').catch(() => {})
          c.release()
        }
      }
    })
  })

  describe('vinculo de conta e quadro', () => {
    it('vincula, vira ativo, conta unica por prospecto, ativo e terminal', async () => {
      const conta = await criarConta(m.cenario, m.dono)
      const p1 = (await novoProspecto(m, m.opA)).corpo.id as string
      const p2 = (await novoProspecto(m, m.opA)).corpo.id as string

      const inex = await chamar(m, m.opA, 'POST', `/prospectos/${p1}/vincular-conta`, { conta_id: randomUUID() })
      expect(inex.corpo.error.code).toBe('conta_inexistente')

      const ok = await chamar(m, m.opA, 'POST', `/prospectos/${p1}/vincular-conta`, { conta_id: conta })
      expect(ok.status).toBe(200)
      expect(ok.corpo.estagio).toBe('ativo')
      expect(ok.corpo.conta_id).toBe(conta)
      expect(ok.corpo.conta_nome).toBe('Conta de teste')

      const outro = await chamar(m, m.opA, 'POST', `/prospectos/${p2}/vincular-conta`, { conta_id: conta })
      expect(outro.status).toBe(409)
      expect(outro.corpo.error.code).toBe('conta_ja_vinculada')

      const again = await chamar(m, m.opA, 'POST', `/prospectos/${p1}/vincular-conta`, { conta_id: conta })
      expect(again.corpo.error.code).toBe('prospecto_ja_vinculado')
      const sai = await chamar(m, m.opA, 'POST', `/prospectos/${p1}/estagio`, { estagio: 'perdido' })
      expect(sai.corpo.error.code).toBe('estagio_terminal')

      const ev = await poolSuper.query("select detalhes from public.eventos where tipo = 'prospecto.vinculado' and entidade_id = $1", [p1])
      expect(ev.rows).toHaveLength(1)
    })

    it('perdido nao vincula sem reabrir', async () => {
      const conta = await criarConta(m.cenario, m.dono)
      const p = (await novoProspecto(m, m.opA)).corpo.id as string
      await chamar(m, m.opA, 'POST', `/prospectos/${p}/estagio`, { estagio: 'perdido' })
      const r = await chamar(m, m.opA, 'POST', `/prospectos/${p}/vincular-conta`, { conta_id: conta })
      expect(r.corpo.error.code).toBe('estagio_nao_vinculavel')
    })

    it('quadro traz as 5 colunas com total e top N', async () => {
      const q = await chamar(m, m.opA, 'GET', '/funil/quadro?limite_por_estagio=1')
      expect(q.status).toBe(200)
      expect(q.corpo.colunas.map((c: { estagio: string }) => c.estagio)).toEqual(['novo', 'contato', 'proposta', 'ativo', 'perdido'])
      const novo = q.corpo.colunas[0]
      expect(novo.total).toBeGreaterThan(1)
      expect(novo.itens).toHaveLength(1)
      expect(q.body).not.toMatch(/"contato_telefone"/)
    })
  })

  describe('SEC-080/081: validacao', () => {
    it('schema estrito e limites', async () => {
      const casos: [string, string, unknown][] = [
        ['POST', '/prospectos', { nome_restaurante: '' }],
        ['POST', '/prospectos', { nome_restaurante: 'x', estagio: 'ativo' }],
        ['POST', '/prospectos', { nome_restaurante: 'x', conta_id: randomUUID() }],
        ['POST', '/prospectos', { nome_restaurante: 'x', contato_email: 'nao-e-email' }],
        ['POST', '/prospectos', { nome_restaurante: 'x', observacoes: 'a'.repeat(4001) }],
        ['POST', '/prospectos', { nome_restaurante: 'x', responsavel_operador_id: 'nao-uuid' }],
        ['GET', '/prospectos?estagio=xyz', undefined],
        ['GET', '/prospectos?limite=1000', undefined],
        ['GET', '/prospectos/nao-uuid', undefined],
        ['GET', '/funil/agenda?dias=9999', undefined],
      ]
      for (const [metodo, url, corpo] of casos) {
        const r = await chamar(m, m.opA, metodo as 'GET', url, corpo)
        expect(r.status, `${metodo} ${url}`).toBe(400)
        expect(r.corpo.error.code).toBe('entrada_invalida')
      }
      const p = (await novoProspecto(m, m.opA)).corpo.id as string
      expect((await chamar(m, m.opA, 'PATCH', `/prospectos/${p}`, {})).status).toBe(400)
      expect((await chamar(m, m.opA, 'POST', `/prospectos/${p}/atividades`, { tipo: 'nota', descricao: 'a'.repeat(2001) })).status).toBe(400)
      // SQL injection na busca e so texto.
      expect((await chamar(m, m.opA, 'GET', `/prospectos?q=${encodeURIComponent("'; drop table prospectos;--")}`)).status).toBe(200)
    })
  })
})
