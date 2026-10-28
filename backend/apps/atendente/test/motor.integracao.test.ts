// Integracao do motor deterministico (AT-motor-min) no Postgres local, sob o role whaviso_atendente.
// Prova: dialogo feliz ponta a ponta cria pedido `novo` com itens/totais corretos e respostas na
// outbox; handoff humano suprime a resposta; claim idempotente (reentrega e concorrencia nao
// duplicam); isolamento multi-tenant. Sem LLM, sem rede.
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { criarLogger, type Logger } from '@whaviso/shared/logger'
import { criarPixDecifra, criarRegistry, processarProximaMensagem, type DepsMotor } from '../src/modules/motor_fluxo'
import { EstadoFluxo } from '../src/modules/motor_fluxo/tipos'
import {
  bancoAcessivel, contexto, esgotarItem, fecharPools, inserirEntrada, lerEnderecos, lerEnvios, lerItens,
  lerOpcoesItem, lerPedidos, limpar, MASTER_KEY, processadaEm, resetProcessada, semear, setContexto,
  statusConversa, poolAtendente, poolSuper, type Cenario,
} from './db'

const online = await bancoAcessivel()
const logger: Logger = criarLogger('atendente-teste', 'silent')
const registry = criarRegistry()
const pixDecifra = criarPixDecifra(MASTER_KEY) // mesma MASTER_KEY que semeou a cifra em db.ts

function deps(conversaId: string): DepsMotor {
  return { pool: poolAtendente, logger, registry, conversaId, pixDecifra }
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
  await turno(c, 'texto', '2') // escolhe Grande -> injeta Adicionais (dependente de Grande)
  await turno(c, 'texto', '0') // pula Adicionais  -> resumo + confirmar
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
    const textos = envios.map((e) => (e.payload as { texto?: string }).texto ?? '')
    // Aviso de pedido recebido com o codigo.
    expect(textos.some((t) => t.includes('Pedido') && t.includes(pedido.codigo))).toBe(true)
    // Pix na conversa: o BR Code "copia e cola" (payload EMV comeca em 000201) e enfileirado.
    expect(textos.some((t) => t.startsWith('000201') && t.includes(c.pix!.chave))).toBe(true)

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
    await turno(a, 'texto', '1') // Burger
    await turno(a, 'texto', '2') // Grande
    await turno(a, 'texto', '0') // pula Adicionais
    await turno(a, 'interativo', 'conf:ok')
    await turno(a, 'interativo', 'end:ultimo')
    await turno(a, 'interativo', 'pag:pix')

    expect(await lerPedidos(a.lojaId)).toHaveLength(1)
    expect(await lerPedidos(b.lojaId)).toHaveLength(0)
    expect(await statusConversa(b.conversaId)).toBe('ia')
  })

  it('ALTO: item com grupo dependente (Adicionais no Grande) e multi pode ser pedido com o adicional', async () => {
    const c = await novoCenario({ bairro: 'Centro', taxaZonaCentavos: 700 })
    await turno(c, 'texto', 'oi')
    await turno(c, 'texto', '1') // Lanches
    await turno(c, 'texto', '1') // Burger
    await turno(c, 'texto', '2') // Grande -> injeta Adicionais (dependente)
    await turno(c, 'texto', '1') // Bacon (adicional, grupo multi max 2)
    await turno(c, 'texto', '0') // finaliza Adicionais -> confirmar
    await turno(c, 'interativo', 'conf:ok')
    await turno(c, 'interativo', 'end:ultimo')
    await turno(c, 'interativo', 'pag:pix')

    const pedidos = await lerPedidos(c.lojaId)
    expect(pedidos).toHaveLength(1)
    expect(pedidos[0]!.subtotal_centavos).toBe(2800) // 2000 + Grande 500 + Bacon 300
    expect(pedidos[0]!.total_centavos).toBe(3500) // + taxa 700
    const opcoes = await lerOpcoesItem(pedidos[0]!.id)
    expect(opcoes.sort()).toEqual(['Bacon', 'Grande'])
  })

  it('CRITICO: linha invalida (item esgotado) na efetivacao nao envenena a fila; marca processada, sem pedido', async () => {
    const c = await novoCenario({ bairro: 'Centro', taxaZonaCentavos: 700 })
    const estado = EstadoFluxo.parse({
      etapa: 'pagamento', pagamento: 'pix', endereco_id: c.enderecoId,
      carrinho: [{ item_id: c.cardapio.burger, quantidade: 1, opcoes_ids: [c.cardapio.grande] }],
    })
    await setContexto(c.conversaId, estado)
    await esgotarItem(c.cardapio.burger) // o item some entre confirmar e pagar

    const msgId = await inserirEntrada(c, 'interativo', 'pag:pix')
    expect(await processarProximaMensagem(deps(c.conversaId))).toBe('processada')
    expect(await processadaEm(msgId)).not.toBeNull() // mensagem consumida: fila nao trava
    expect(await lerPedidos(c.lojaId)).toHaveLength(0) // nao cria pedido divergente
    expect((await lerEnvios(c.conversaId)).length).toBeGreaterThanOrEqual(1) // cliente recebe resposta
    expect((await contexto(c.conversaId))['etapa']).toBe('pedir_categoria') // volta a escolher
  })

  it('MEDIO divergencia: com 1 de 2 itens indisponivel, nao cria pedido divergente; avisa e volta a confirmar', async () => {
    const c = await novoCenario({ bairro: 'Centro', taxaZonaCentavos: 700 })
    const estado = EstadoFluxo.parse({
      etapa: 'pagamento', pagamento: 'pix', endereco_id: c.enderecoId,
      carrinho: [
        { item_id: c.cardapio.burger, quantidade: 1, opcoes_ids: [c.cardapio.grande] },
        { item_id: c.cardapio.suco, quantidade: 1, opcoes_ids: [] },
      ],
    })
    await setContexto(c.conversaId, estado)
    await esgotarItem(c.cardapio.burger) // so o Burger some; o Suco segue valido

    const msgId = await inserirEntrada(c, 'interativo', 'pag:pix')
    expect(await processarProximaMensagem(deps(c.conversaId))).toBe('processada')
    expect(await processadaEm(msgId)).not.toBeNull()
    expect(await lerPedidos(c.lojaId)).toHaveLength(0)
    const ctx = await contexto(c.conversaId)
    expect(ctx['etapa']).toBe('confirmar')
    expect((ctx['carrinho'] as unknown[]).length).toBe(1) // so a linha valida (Suco) restou
    expect((await lerEnvios(c.conversaId)).length).toBeGreaterThanOrEqual(1)
  })

  it('MEDIO frete: endereco novo captura o bairro e a taxa da zona e aplicada (nao fica 0)', async () => {
    const c = await novoCenario({ bairro: 'Centro', taxaZonaCentavos: 700 })
    await turno(c, 'texto', 'oi')
    await turno(c, 'texto', '1')
    await turno(c, 'texto', '1')
    await turno(c, 'texto', '2')
    await turno(c, 'texto', '0')
    await turno(c, 'interativo', 'conf:ok')
    await turno(c, 'interativo', 'end:novo') // informar outro -> pergunta o bairro (zonas)
    await turno(c, 'texto', '1') // bairro Centro (unica zona)
    await turno(c, 'texto', 'Rua Nova 123') // rua -> cria endereco e vai ao pagamento
    await turno(c, 'interativo', 'pag:pix')

    const pedidos = await lerPedidos(c.lojaId)
    expect(pedidos).toHaveLength(1)
    expect(pedidos[0]!.taxa_entrega_centavos).toBe(700) // bairro capturado -> zona resolvida
    const ends = await lerEnderecos(c.clienteId)
    expect(ends.some((e) => e.bairro === 'Centro' && e.logradouro === 'Rua Nova 123')).toBe(true)
  })

  it('MEDIO fora de area: ultimo endereco em bairro sem zona e bloqueado (sem pedido, pede outro)', async () => {
    const c = await novoCenario({ bairro: 'Centro', zonaBairro: 'Jardim', taxaZonaCentavos: 500 })
    await turno(c, 'texto', 'oi')
    await turno(c, 'texto', '1')
    await turno(c, 'texto', '1')
    await turno(c, 'texto', '2')
    await turno(c, 'texto', '0')
    await turno(c, 'interativo', 'conf:ok')
    await turno(c, 'interativo', 'end:ultimo') // Centro nao esta na zona (Jardim): fora de area

    expect(await lerPedidos(c.lojaId)).toHaveLength(0)
    const ctx = await contexto(c.conversaId)
    expect(ctx['etapa']).toBe('endereco')
    expect(ctx['aguardando']).toBe('endereco_bairro') // oferece informar outro endereco
    const envios = await lerEnvios(c.conversaId)
    expect(JSON.stringify(envios.map((e) => e.payload))).toContain('nao entregamos')
  })
})
