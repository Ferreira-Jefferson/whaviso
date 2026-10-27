// Integracao do motor deterministico (AT-motor-min) no Postgres local, sob o role whaviso_atendente.
// Prova: dialogo feliz ponta a ponta cria pedido `novo` com itens/totais corretos e respostas na
// outbox; handoff humano suprime a resposta; claim idempotente (reentrega e concorrencia nao
// duplicam); isolamento multi-tenant. Sem LLM, sem rede.
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { criarLogger, type Logger } from '@whaviso/shared/logger'
import { criarRegistry, processarProximaMensagem, type DepsMotor } from '../src/modules/motor_fluxo'
import {
  bancoAcessivel, contexto, fecharPools, inserirEntrada, lerEnvios, lerItens, lerPedidos, limpar,
  resetProcessada, semear, statusConversa, poolAtendente, poolSuper, type Cenario,
} from './db'

const online = await bancoAcessivel()
const logger: Logger = criarLogger('atendente-teste', 'silent')
const registry = criarRegistry()

function deps(conversaId: string): DepsMotor {
  return { pool: poolAtendente, logger, registry, conversaId }
}

/** Insere uma entrada e processa um turno (claim restrito a esta conversa). */
async function turno(c: Cenario, tipo: 'texto' | 'interativo', conteudo: string): Promise<string> {
  const id = await inserirEntrada(c, tipo, conteudo)
  const desfecho = await processarProximaMensagem(deps(c.conversaId))
  expect(desfecho).toBe('processada')
  return id
}

/** Dirige o dialogo feliz ate o pedido criado. Devolve o id da ultima mensagem (pagamento). */
async function dialogoFeliz(c: Cenario): Promise<string> {
  await turno(c, 'texto', 'oi') // saudacao -> lista de categorias
  await turno(c, 'texto', '1') // escolhe categoria Lanches -> lista de itens
  await turno(c, 'texto', '1') // escolhe Burger -> pergunta Tamanho
  await turno(c, 'texto', '2') // escolhe Grande -> resumo + confirmar
  await turno(c, 'interativo', 'conf:ok') // confirma -> endereco
  await turno(c, 'interativo', 'end:ultimo') // usa ultimo endereco -> pagamento
  return turno(c, 'interativo', 'pag:pix') // paga -> cria pedido novo + avisa
}

const cenarios: string[] = []
async function novoCenario(op?: Parameters<typeof semear>[0]): Promise<Cenario> {
  const c = await semear(op)
  cenarios.push(c.contaId)
  return c
}

afterEach(async () => {
  while (cenarios.length) await limpar(cenarios.pop()!)
})
afterAll(fecharPools)

describe.skipIf(!online)('motor_fluxo (integracao)', () => {
  it('dialogo feliz: cria pedido novo com itens e totais corretos e enfileira as respostas', async () => {
    const c = await novoCenario({ bairro: 'Centro', taxaZonaCentavos: 700 })
    await dialogoFeliz(c)

    const pedidos = await lerPedidos(c.lojaId)
    expect(pedidos).toHaveLength(1)
    const pedido = pedidos[0]!
    expect(pedido.status).toBe('novo')
    expect(pedido.subtotal_centavos).toBe(2500) // Burger 2000 + Grande 500
    expect(pedido.taxa_entrega_centavos).toBe(700) // zona Centro
    expect(pedido.total_centavos).toBe(3200)
    expect(pedido.codigo).toMatch(/^\d{6}-\d{3}$/)

    const itens = await lerItens(pedido.id)
    expect(itens).toHaveLength(1)
    expect(itens[0]!.nome_snapshot).toBe('Burger')
    expect(itens[0]!.total_centavos).toBe(2500)

    const envios = await lerEnvios(c.conversaId)
    expect(envios.length).toBeGreaterThanOrEqual(7)
    const ultimo = envios.at(-1)!.payload as { tipo: string; texto: string }
    expect(ultimo.texto).toContain('Pedido')
    expect(ultimo.texto).toContain(pedido.codigo)

    const ctx = await contexto(c.conversaId)
    expect(ctx['etapa']).toBe('acompanhar')
    expect(ctx['pedido_id']).toBe(pedido.id)
  })

  it('handoff humano: conversa em "humano" nao gera resposta automatica, so marca processada', async () => {
    const c = await novoCenario({ statusConversa: 'humano' })
    const msgId = await inserirEntrada(c, 'texto', 'oi')
    const desfecho = await processarProximaMensagem(deps(c.conversaId))
    expect(desfecho).toBe('suprimida')

    const envios = await lerEnvios(c.conversaId)
    expect(envios).toHaveLength(0)
    const { rows } = await poolSuper.query('select processada_em from public.mensagens where id = $1', [msgId])
    expect(rows[0].processada_em).not.toBeNull()
  })

  it('idempotencia: reprocessar a mesma mensagem (reentrega) nao duplica pedido nem resposta', async () => {
    const c = await novoCenario({ bairro: 'Centro', taxaZonaCentavos: 700 })
    const ultimaMsg = await dialogoFeliz(c)

    const enviosAntes = (await lerEnvios(c.conversaId)).length
    // Simula a reentrega: a marca de processamento e desfeita e a mesma mensagem reivindicada.
    await resetProcessada(ultimaMsg)
    const desfecho = await processarProximaMensagem(deps(c.conversaId))
    expect(desfecho).toBe('processada')

    expect(await lerPedidos(c.lojaId)).toHaveLength(1) // guarda por estado.pedido_id
    expect((await lerEnvios(c.conversaId)).length).toBe(enviosAntes) // dedupe por chave
  })

  it('concorrencia: dois turnos simultaneos da mesma mensagem processam uma vez so', async () => {
    const c = await novoCenario()
    await inserirEntrada(c, 'texto', 'oi')
    const [a, b] = await Promise.all([
      processarProximaMensagem(deps(c.conversaId)),
      processarProximaMensagem(deps(c.conversaId)),
    ])
    const desfechos = [a, b].sort()
    expect(desfechos).toEqual(['processada', 'vazio'])

    // Uma unica saudacao enfileirada (nao duas).
    const saudacoes = await lerEnvios(c.conversaId)
    expect(saudacoes).toHaveLength(1)
  })

  it('multi-tenant: pedido e conversa ficam na loja certa; item de outra loja nao e aceito', async () => {
    const a = await novoCenario({ bairro: 'Centro', taxaZonaCentavos: 700 })
    const b = await novoCenario({ bairro: 'Centro', taxaZonaCentavos: 700 })

    await turno(a, 'texto', 'oi')
    await turno(a, 'texto', '1')
    // Tenta forjar o id do Burger da loja B como escolha na conversa da loja A: deve ser recusado
    // (nao esta nos apresentados nem no cardapio da loja A) e reapresentar, sem avancar.
    await turno(a, 'interativo', b.cardapio.burger)
    const ctxA = await contexto(a.conversaId)
    expect(ctxA['etapa']).toBe('montar_pedido')
    expect(ctxA['item_id']).toBeNull()

    // Conclui o pedido na loja A normalmente e confere o isolamento.
    await turno(a, 'texto', '1')
    await turno(a, 'texto', '2')
    await turno(a, 'interativo', 'conf:ok')
    await turno(a, 'interativo', 'end:ultimo')
    await turno(a, 'interativo', 'pag:pix')

    expect(await lerPedidos(a.lojaId)).toHaveLength(1)
    expect(await lerPedidos(b.lojaId)).toHaveLength(0)
    expect(await statusConversa(b.conversaId)).toBe('ia')
  })
})
