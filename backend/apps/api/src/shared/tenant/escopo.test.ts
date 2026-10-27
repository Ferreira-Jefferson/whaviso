// Unidade: montagem do EscopoLoja (expansao de loja_id NULL ja feita no leitor; dedup de
// papel; conta ambigua falha fechada).
import { describe, it, expect } from 'vitest'
import { montarEscopoLoja, ErroEscopoAmbiguo } from './escopo'
import { fragmentoLojaIds, escopoTemPapel, papelNaLojaAtiva } from './consulta'
import type { VinculoLoja } from './leitor_escopo'

const U = '22222222-2222-2222-2222-222222222222'
const CONTA = '33333333-3333-3333-3333-333333333333'
const LOJA_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const LOJA_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

describe('montarEscopoLoja', () => {
  it('vinculos vazios => null (sem acesso)', () => {
    expect(montarEscopoLoja(U, [])).toBeNull()
  })

  it('um vinculo de loja => escopo com uma loja e o papel', () => {
    const v: VinculoLoja[] = [{ conta_id: CONTA, loja_id: LOJA_A, papel: 'gerente' }]
    const e = montarEscopoLoja(U, v)!
    expect(e.loja_ids).toEqual([LOJA_A])
    expect(e.papel_por_loja[LOJA_A]).toBe('gerente')
    expect(e.conta_id).toBe(CONTA)
    expect(e.loja_ativa).toBeNull()
  })

  it('vinculo "todas" ja expandido => conjunto de lojas da conta', () => {
    const v: VinculoLoja[] = [
      { conta_id: CONTA, loja_id: LOJA_A, papel: 'dono' },
      { conta_id: CONTA, loja_id: LOJA_B, papel: 'dono' },
    ]
    const e = montarEscopoLoja(U, v)!
    expect(e.loja_ids.sort()).toEqual([LOJA_A, LOJA_B].sort())
  })

  it('dedup por loja mantem o papel mais forte', () => {
    const v: VinculoLoja[] = [
      { conta_id: CONTA, loja_id: LOJA_A, papel: 'atendente' },
      { conta_id: CONTA, loja_id: LOJA_A, papel: 'dono' },
    ]
    const e = montarEscopoLoja(U, v)!
    expect(e.papel_por_loja[LOJA_A]).toBe('dono')
  })

  it('vinculos em mais de uma conta => falha fechada', () => {
    const v: VinculoLoja[] = [
      { conta_id: CONTA, loja_id: LOJA_A, papel: 'dono' },
      { conta_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', loja_id: LOJA_B, papel: 'dono' },
    ]
    expect(() => montarEscopoLoja(U, v)).toThrow(ErroEscopoAmbiguo)
  })
})

describe('helpers de consulta', () => {
  const escopo = montarEscopoLoja(U, [
    { conta_id: CONTA, loja_id: LOJA_A, papel: 'gerente' },
    { conta_id: CONTA, loja_id: LOJA_B, papel: 'atendente' },
  ])!

  it('fragmentoLojaIds parametriza loja_id = ANY($n)', () => {
    const f = fragmentoLojaIds(escopo, 1)
    expect(f.sql).toBe('loja_id = any($1)')
    expect(f.valores).toEqual([[LOJA_A, LOJA_B].sort()])
  })

  it('papel/permissao da loja ativa', () => {
    expect(papelNaLojaAtiva(escopo)).toBeNull()
    const comAtiva = { ...escopo, loja_ativa: LOJA_B }
    expect(papelNaLojaAtiva(comAtiva)).toBe('atendente')
    expect(escopoTemPapel(comAtiva, ['dono', 'gerente'])).toBe(false)
    expect(escopoTemPapel({ ...escopo, loja_ativa: LOJA_A }, ['gerente'])).toBe(true)
  })
})
