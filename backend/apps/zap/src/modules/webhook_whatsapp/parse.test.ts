// Testes do parser PURO (sem banco): mapeamento de tipos de mensagem e de recibos de status.
import { describe, expect, it } from 'vitest'
import { extrairEventos, type PayloadWebhook } from './parse'

function comMensagem(m: Record<string, unknown>): PayloadWebhook {
  return { entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: 'pn1' }, messages: [m] } }] }] }
}
function comStatus(s: Record<string, unknown>): PayloadWebhook {
  return { entry: [{ changes: [{ value: { metadata: { phone_number_id: 'pn1' }, statuses: [s] } }] }] }
}

describe('extrairEventos: mensagens', () => {
  it('texto', () => {
    const { mensagens } = extrairEventos(comMensagem({ id: 'w1', from: '55119999', type: 'text', text: { body: ' oi ' } }))
    expect(mensagens).toEqual([
      { phoneNumberId: 'pn1', wamid: 'w1', telefone: '55119999', tipo: 'texto', conteudo: 'oi', midiaRef: null },
    ])
  })

  it('botao de template (quick_reply) vira interativo com o payload como conteudo', () => {
    const { mensagens } = extrairEventos(
      comMensagem({ id: 'w2', from: '55119999', type: 'button', button: { payload: 'acao:1', text: 'Sim' } }),
    )
    expect(mensagens[0]).toMatchObject({ tipo: 'interativo', conteudo: 'acao:1' })
  })

  it('resposta interativa (button_reply) vira interativo com o id', () => {
    const { mensagens } = extrairEventos(
      comMensagem({ id: 'w3', from: '55119999', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'opt_a', title: 'A' } } }),
    )
    expect(mensagens[0]).toMatchObject({ tipo: 'interativo', conteudo: 'opt_a' })
  })

  it('imagem guarda o media_id e a legenda', () => {
    const { mensagens } = extrairEventos(
      comMensagem({ id: 'w4', from: '55119999', type: 'image', image: { id: 'mid1', caption: 'foto' } }),
    )
    expect(mensagens[0]).toMatchObject({ tipo: 'imagem', conteudo: 'foto', midiaRef: 'mid1' })
  })

  it('audio guarda o media_id, sem conteudo', () => {
    const { mensagens } = extrairEventos(comMensagem({ id: 'w5', from: '55119999', type: 'audio', audio: { id: 'mid2' } }))
    expect(mensagens[0]).toMatchObject({ tipo: 'audio', conteudo: null, midiaRef: 'mid2' })
  })

  it('tipo nao suportado (sticker) vira outro, nao descarta', () => {
    const { mensagens } = extrairEventos(comMensagem({ id: 'w6', from: '55119999', type: 'sticker' }))
    expect(mensagens[0]).toMatchObject({ tipo: 'outro', conteudo: null })
  })

  it('mensagem sem id ou sem remetente e ignorada', () => {
    expect(extrairEventos(comMensagem({ from: '55119999', type: 'text', text: { body: 'x' } })).mensagens).toHaveLength(0)
    expect(extrairEventos(comMensagem({ id: 'w7', type: 'text', text: { body: 'x' } })).mensagens).toHaveLength(0)
  })
})

describe('extrairEventos: recibos', () => {
  it('delivered', () => {
    expect(extrairEventos(comStatus({ id: 'w8', status: 'delivered' })).statuses).toEqual([
      { wamid: 'w8', status: 'delivered', erro: null },
    ])
  })
  it('failed carrega codigo curto do erro (sem PII)', () => {
    expect(extrairEventos(comStatus({ id: 'w9', status: 'failed', errors: [{ code: 131026 }] })).statuses[0]).toEqual({
      wamid: 'w9',
      status: 'failed',
      erro: 'erro_131026',
    })
  })
  it('status desconhecido e ignorado', () => {
    expect(extrairEventos(comStatus({ id: 'w10', status: 'carimbado' })).statuses).toHaveLength(0)
  })
})
