// Disponibilidade (liga/desliga, esgotado hoje/ate), papeis e auditoria, contra o banco real.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { poolSuper } from '../../../test/db'
import { chamar, encerrar, montarMundo, online, type Mundo } from './test/apoio'

const d = online ? describe : describe.skip

d('cardapio: disponibilidade', () => {
  let m: Mundo
  const dono = () => m.dono
  const A = () => m.lojaA
  beforeAll(async () => {
    m = await montarMundo()
  })
  afterAll(async () => {
    await encerrar(m)
  })

  async function novoItem(): Promise<string> {
    const c = await chamar(m, dono(), A(), 'POST', '/categorias', { nome: `D${Math.random()}` })
    const i = await chamar(m, dono(), A(), 'POST', '/itens', { categoria_id: c.corpo.id, nome: 'Suco' })
    return i.corpo.id
  }

  it('esgotado hoje = fim do dia em SP; esgotado_hoje=false limpa', async () => {
    const id = await novoItem()
    const r = await chamar(m, dono(), A(), 'POST', `/itens/${id}/disponibilidade`, { esgotado_hoje: true })
    expect(r.status).toBe(200)
    expect(r.corpo.disponivel).toBe(false)
    expect(new Date(r.corpo.esgotado_ate).getTime()).toBeGreaterThan(Date.now())
    expect(new Date(r.corpo.esgotado_ate).getTime() - Date.now()).toBeLessThanOrEqual(24 * 3600 * 1000)
    const limpa = await chamar(m, dono(), A(), 'POST', `/itens/${id}/disponibilidade`, { esgotado_hoje: false })
    expect(limpa.corpo.disponivel).toBe(true)
    expect(limpa.corpo.esgotado_ate).toBeNull()
  })

  it('indisponivel ate o instante informado (futuro); passado e rejeitado', async () => {
    const id = await novoItem()
    const futuro = new Date(Date.now() + 3600_000).toISOString()
    const ok = await chamar(m, dono(), A(), 'POST', `/itens/${id}/disponibilidade`, { esgotado_ate: futuro })
    expect(ok.corpo.disponivel).toBe(false)
    const passado = await chamar(m, dono(), A(), 'POST', `/itens/${id}/disponibilidade`, {
      esgotado_ate: new Date(Date.now() - 1000).toISOString(),
    })
    expect(passado.status).toBe(422)
    expect(passado.corpo.error.code).toBe('esgotado_ate_no_passado')
    const ambos = await chamar(m, dono(), A(), 'POST', `/itens/${id}/disponibilidade`, {
      esgotado_ate: futuro,
      esgotado_hoje: true,
    })
    expect(ambos.status).toBe(400)
  })

  it('volta sozinho: esgotado_ate vencido = disponivel sem job', async () => {
    const id = await novoItem()
    await chamar(m, dono(), A(), 'POST', `/itens/${id}/disponibilidade`, {
      esgotado_ate: new Date(Date.now() + 3600_000).toISOString(),
    })
    const antes = await chamar(m, dono(), A(), 'GET', '/publico-resolvido')
    const achar = (c: { categorias: { itens: { id: string }[] }[] }) =>
      c.categorias.flatMap((x) => x.itens).some((x) => x.id === id)
    expect(achar(antes.corpo)).toBe(false)
    await poolSuper.query("update public.itens set esgotado_ate = now() - interval '1 minute' where id = $1", [id])
    const depois = await chamar(m, dono(), A(), 'GET', '/publico-resolvido')
    expect(achar(depois.corpo)).toBe(true)
  })

  it('opcao: liga/desliga e esgotado; atendente consegue, mas nao edita estrutura', async () => {
    const g = await chamar(m, dono(), A(), 'POST', '/grupos', { nome: 'Molhos', opcoes: [{ nome: 'Alho' }] })
    const op = g.corpo.opcoes[0].id
    const off = await chamar(m, m.atendente, A(), 'POST', `/opcoes/${op}/disponibilidade`, { ativo: false })
    expect(off.status).toBe(200)
    expect(off.corpo.disponivel).toBe(false)
    const negado = await chamar(m, m.atendente, A(), 'PATCH', `/opcoes/${op}`, { nome: 'Novo' })
    expect(negado.status).toBe(403)
    expect((await chamar(m, m.atendente, A(), 'POST', '/grupos', { nome: 'Nao' })).status).toBe(403)
    expect((await chamar(m, m.atendente, A(), 'GET', '/')).status).toBe(200)
    expect((await chamar(m, m.gerente, A(), 'POST', '/grupos', { nome: 'Gerente pode' })).status).toBe(201)
  })

  it('auditoria sem PII: so ids e flags', async () => {
    const { rows } = await poolSuper.query<{ tipo: string; detalhes: unknown }>(
      'select tipo, detalhes from public.eventos where loja_id = $1 and tipo like $2',
      [m.lojaA, 'cardapio.%'],
    )
    const tipos = new Set(rows.map((r) => r.tipo))
    expect(tipos).toEqual(
      new Set(['cardapio.grupo_alterado', 'cardapio.item_alterado', 'cardapio.disponibilidade_alterada']),
    )
    expect(JSON.stringify(rows)).not.toMatch(/Feijoada|Bacon|Suco|telefone|pix/i)
  })
})
