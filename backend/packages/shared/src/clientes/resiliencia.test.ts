import { describe, expect, it } from 'vitest'
import { falha, ok, Permanente, RateLimit, Transitorio, type ErroProvedor, type Resultado } from './erros'
import { comTimeout, Disjuntor, LimitadorTaxa, type Agendar } from './resiliencia'

const okR = <T>(v: T): Resultado<T, ErroProvedor> => ok(v)
const falhaR = (e: ErroProvedor): Resultado<never, ErroProvedor> => falha(e)

describe('comTimeout', () => {
  const nuncaAgenda: Agendar = () => () => {}

  it('devolve o resultado quando fn conclui antes do estouro', async () => {
    const r = await comTimeout(async () => okR(42), 1_000, nuncaAgenda)
    expect(r.ok && r.valor).toBe(42)
  })

  it('devolve Transitorio timeout e aborta o sinal quando estoura', async () => {
    let disparar: () => void = () => {}
    const agendar: Agendar = (_ms, cb) => {
      disparar = cb
      return () => {}
    }
    let abortado = false
    const r = await comTimeout(
      (sinal) =>
        new Promise<Resultado<never, ErroProvedor>>(() => {
          // fn nunca resolve sozinho: so o estouro encerra (e deve abortar o sinal repassado ao transporte).
          sinal.addEventListener('abort', () => { abortado = true })
          disparar() // simula o timer estourando durante a chamada
        }),
      5_000,
      agendar,
    )
    expect(abortado).toBe(true)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro.codigo).toBe('timeout')
  })

  it('propaga rejeicao de fn (o disjuntor trata)', async () => {
    await expect(comTimeout(async () => { throw new Error('boom') }, 1_000, nuncaAgenda)).rejects.toThrow('boom')
  })
})

describe('Disjuntor', () => {
  const disj = (relogio: () => number) => new Disjuntor({ limiar: 3, reabrirAposMs: 1_000, relogio })

  it('abre apos N falhas retentaveis seguidas e recusa sem chamar o provedor', async () => {
    const t = 0
    const d = disj(() => t)
    const transit = async () => falhaR(new Transitorio('x'))
    for (let i = 0; i < 3; i++) await d.executar(transit)
    expect(d.estado).toBe('aberto')
    let chamou = false
    const r = await d.executar(async () => {
      chamou = true
      return okR(1)
    })
    expect(chamou).toBe(false)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro.codigo).toBe('circuito_aberto')
  })

  it('falha permanente nao abre e zera o contador', async () => {
    const t = 0
    const d = disj(() => t)
    await d.executar(async () => falhaR(new Transitorio('x')))
    await d.executar(async () => falhaR(new Transitorio('x')))
    await d.executar(async () => falhaR(new Permanente('nao encontrado'))) // zera
    await d.executar(async () => falhaR(new Transitorio('x')))
    expect(d.estado).toBe('fechado')
  })

  it('apos o tempo de reabrir, uma sonda ok fecha o circuito', async () => {
    let t = 0
    const d = disj(() => t)
    for (let i = 0; i < 3; i++) await d.executar(async () => falhaR(new Transitorio('x')))
    expect(d.estado).toBe('aberto')
    t = 1_000 // passou o reabrirAposMs
    expect(d.estado).toBe('meio_aberto')
    const r = await d.executar(async () => okR('sonda'))
    expect(r.ok).toBe(true)
    expect(d.estado).toBe('fechado')
  })

  it('sonda com falha reabre o circuito', async () => {
    let t = 0
    const d = disj(() => t)
    for (let i = 0; i < 3; i++) await d.executar(async () => falhaR(new Transitorio('x')))
    t = 1_000
    await d.executar(async () => falhaR(new RateLimit('ainda caido')))
    expect(d.estado).toBe('aberto')
  })

  it('em meio-aberto, concorrentes a mais sao recusados ate a sonda terminar', async () => {
    let t = 0
    const d = disj(() => t)
    for (let i = 0; i < 3; i++) await d.executar(async () => falhaR(new Transitorio('x')))
    t = 1_000
    let liberar: () => void = () => {}
    const sonda = d.executar(
      () =>
        new Promise<Resultado<string, ErroProvedor>>((resolve) => {
          liberar = () => resolve(okR('ok'))
        }),
    )
    const concorrente = await d.executar(async () => okR('nao deveria rodar'))
    expect(concorrente.ok).toBe(false)
    if (!concorrente.ok) expect(concorrente.erro.codigo).toBe('circuito_aberto')
    liberar()
    expect((await sonda).ok).toBe(true)
  })
})

describe('LimitadorTaxa', () => {
  it('espaca chamadas pelo intervalo minimo mesmo disparadas juntas', async () => {
    const t = 0
    const esperas: number[] = []
    const lim = new LimitadorTaxa(1_000, { relogio: () => t, dormir: async (ms) => { esperas.push(ms) } })
    await lim.aguardar() // 1a: sem espera
    await lim.aguardar() // 2a: +1000
    await lim.aguardar() // 3a: +1000
    expect(esperas).toEqual([1_000, 2_000])
  })

  it('nao espaca quando ja passou tempo suficiente entre chamadas', async () => {
    let t = 0
    const esperas: number[] = []
    const lim = new LimitadorTaxa(1_000, { relogio: () => t, dormir: async (ms) => { esperas.push(ms) } })
    await lim.aguardar()
    t = 5_000
    await lim.aguardar()
    expect(esperas).toEqual([])
  })
})
