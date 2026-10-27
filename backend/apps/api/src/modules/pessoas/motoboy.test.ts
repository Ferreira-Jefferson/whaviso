// Prova do invariante: o cargo de sistema 'motoboy' e FIXO. Nao pode ser apagado, desativado nem
// ter a chave alterada, nem pela api (guarda no service) nem no banco (trigger proteger_cargo_sistema,
// que vale ate para o dono da tabela). O nome segue editavel.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { poolSuper } from '../../../test/db'
import { chamar, encerrar, montarMundo, online, type Mundo } from './test/apoio'

const d = online ? describe : describe.skip

interface CargoItem { id: string; chave: string | null; sistema: boolean }

d('pessoas: cargo motoboy fixo', () => {
  let m: Mundo
  let motoboyId = ''

  beforeAll(async () => {
    m = await montarMundo()
    const cargos = (await chamar(m, m.dono, m.lojaA, 'GET', '/cargos')).corpo.itens as CargoItem[]
    const motoboy = cargos.find((c) => c.chave === 'motoboy')!
    motoboyId = motoboy.id
    expect(motoboy.sistema).toBe(true)
  })
  afterAll(async () => {
    await encerrar(m)
  })

  it('api: nao da para desativar nem editar o motoboy (preset de plataforma, read-only p/ loja)', async () => {
    const desativar = await chamar(m, m.dono, m.lojaA, 'PATCH', `/cargos/${motoboyId}`, { ativo: false })
    expect(desativar.status).toBe(422)
    expect(desativar.corpo.error.code).toBe('cargo_nao_editavel')
    const renomear = await chamar(m, m.dono, m.lojaA, 'PATCH', `/cargos/${motoboyId}`, { nome: 'Entregador' })
    expect(renomear.status).toBe(422)
  })

  it('banco: trigger barra DELETE do motoboy mesmo para o dono da tabela', async () => {
    await poolSuper.query('begin')
    await expect(poolSuper.query("delete from public.cargos where chave = 'motoboy'")).rejects.toThrow(/sistema/i)
    await poolSuper.query('rollback')
  })

  it('banco: trigger barra desativar e alterar a chave do motoboy; nome segue editavel', async () => {
    await poolSuper.query('begin')
    await expect(
      poolSuper.query("update public.cargos set ativo = false where chave = 'motoboy'"),
    ).rejects.toThrow(/sistema/i)
    await poolSuper.query('rollback')

    await poolSuper.query('begin')
    await expect(
      poolSuper.query("update public.cargos set chave = 'moto' where chave = 'motoboy'"),
    ).rejects.toThrow(/sistema/i)
    await poolSuper.query('rollback')

    // nome e editavel (rollback para nao poluir o catalogo global compartilhado).
    await poolSuper.query('begin')
    const ok = await poolSuper.query("update public.cargos set nome = 'Motoboy X' where chave = 'motoboy'")
    expect(ok.rowCount).toBe(1)
    await poolSuper.query('rollback')
  })

  it('o motoboy continua ativo no catalogo apos as tentativas (nada foi comitado)', async () => {
    const { rows } = await poolSuper.query<{ ativo: boolean; chave: string }>(
      "select ativo, chave from public.cargos where chave = 'motoboy' and loja_id is null",
    )
    expect(rows[0]).toMatchObject({ ativo: true, chave: 'motoboy' })
  })
})
