// Resiliencia das fronteiras de provedor externo (RES-001). O helper reutilizavel vive em
// @whaviso/shared/clientes/resiliencia.ts (comTimeout, Disjuntor, LimitadorTaxa) e e usado hoje pelo
// ClienteMapasOsm; aqui provamos as garantias que sustentam "LLM/Meta/Mapas fora do ar degrada para
// botoes, nunca derruba a conversa". Tudo deterministico: relogio e agenda injetados, sem rede nem
// timer real.
//
// RES-002 (estado da conversa sobrevive a crash / inbound persistido) e RES-003 (carga + caos +
// idempotencia sob crash) sao de nivel de integracao e seguem `pendente` no catalogo: ja ha cobertura
// em espirito na persistencia do inbound (apps/zap/test/webhook.integracao.test.ts, idempotencia por
// wamid, SEC-051), na retomada do motor (apps/atendente/test/motor.integracao.test.ts) e na
// idempotencia de acao do harness (SEC-066, apps/atendente/src/modules/tools/tools.test.ts:246); a
// promocao a um teste carregando a tag RES-002/RES-003 fica para o harness de caos.
import { describe, it, expect } from 'vitest'
import {
  comTimeout,
  Disjuntor,
  type Agendar,
  ok,
  falha,
  Transitorio,
  Permanente,
} from '@whaviso/shared/clientes'

describe('RES-001: timeout de fronteira degrada sem travar a conversa', () => {
  it('RES-001: comTimeout aborta a chamada travada e resolve falha transitoria `timeout`', async () => {
    // Agenda que dispara o estouro na hora (sem timer real): simula o provedor que nunca responde.
    const agendarJa: Agendar = (_ms, cb) => {
      cb()
      return () => {}
    }
    let sinalRecebido: AbortSignal | undefined
    const r = await comTimeout<string>(
      (sinal) => {
        sinalRecebido = sinal
        return new Promise(() => {}) // trava de proposito: nunca resolve
      },
      1_000,
      agendarJa,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.erro.codigo).toBe('timeout')
      expect(r.erro.retentavel).toBe(true) // o chamador pode degradar/reenfileirar, nao e erro cru
    }
    // O transporte recebeu o aborto: nada fica pendurado consumindo recurso.
    expect(sinalRecebido?.aborted).toBe(true)
  })

  it('RES-001: comTimeout devolve o resultado quando a chamada conclui dentro do prazo', async () => {
    const r = await comTimeout<string>(async () => ok('pronto'), 1_000)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.valor).toBe('pronto')
  })
})

describe('RES-001: disjuntor (circuit breaker) por Cliente*', () => {
  it('RES-001: abre apos N falhas retentaveis, recusa sem chamar o provedor e recupera no meio-aberto', async () => {
    let agora = 0
    const d = new Disjuntor({ limiar: 3, reabrirAposMs: 1_000, relogio: () => agora })
    let chamadas = 0
    const falhar = async () => {
      chamadas++
      return falha(new Transitorio('provedor fora', { codigo: 'rede' }))
    }
    const responder = async () => {
      chamadas++
      return ok('ok')
    }

    expect(d.estado).toBe('fechado')
    for (let i = 0; i < 3; i++) await d.executar(falhar)
    expect(d.estado).toBe('aberto')
    expect(chamadas).toBe(3)

    // Circuito aberto: recusa na hora, SEM chamar o provedor (protege o provedor e o turno).
    const recusa = await d.executar(falhar)
    expect(recusa.ok).toBe(false)
    if (!recusa.ok) expect(recusa.erro.codigo).toBe('circuito_aberto')
    expect(chamadas).toBe(3) // nao incrementou: o provedor nem foi chamado

    // Passou o tempo de espera -> meio-aberto; libera UMA sonda, que ao dar certo fecha o circuito.
    agora += 1_000
    expect(d.estado).toBe('meio_aberto')
    const sonda = await d.executar(responder)
    expect(sonda.ok).toBe(true)
    expect(chamadas).toBe(4) // a sonda rodou
    expect(d.estado).toBe('fechado')
  })

  it('RES-001: sonda que falha no meio-aberto reabre o circuito', async () => {
    let agora = 0
    const d = new Disjuntor({ limiar: 2, reabrirAposMs: 500, relogio: () => agora })
    const falhar = async () => falha(new Transitorio('indisponivel', { codigo: 'rede' }))

    for (let i = 0; i < 2; i++) await d.executar(falhar)
    expect(d.estado).toBe('aberto')

    agora += 500
    expect(d.estado).toBe('meio_aberto')
    const sonda = await d.executar(falhar) // a sonda tambem falha
    expect(sonda.ok).toBe(false)
    expect(d.estado).toBe('aberto') // reabriu, sem fechar cedo demais
  })

  it('RES-001: falha PERMANENTE (resposta saudavel do provedor) nao abre o circuito', async () => {
    const d = new Disjuntor({ limiar: 2, reabrirAposMs: 1_000 })
    // Erro permanente (ex.: endereco nao encontrado) e um resultado valido do provedor, nao uma queda.
    const permanente = async () => falha(new Permanente('endereco nao encontrado', { codigo: 'nao_encontrado' }))
    for (let i = 0; i < 5; i++) {
      const r = await d.executar(permanente)
      expect(r.ok).toBe(false)
    }
    expect(d.estado).toBe('fechado') // nao derruba o cliente por erro de negocio do provedor
  })
})
