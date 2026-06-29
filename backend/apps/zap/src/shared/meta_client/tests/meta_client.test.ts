import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { assinaturaMetaValida } from '../verificar_assinatura'
import { extrairEventosWebhook } from '../inbound'
import { classificarErroGraph } from '../erros'
import { montarBody } from '../index'
import type { MensagemWhats } from '../../whats'

const SECRET = 'app_secret_de_teste'
function assinar(body: string): string {
  return 'sha256=' + createHmac('sha256', SECRET).update(Buffer.from(body, 'utf8')).digest('hex')
}

describe('assinaturaMetaValida', () => {
  it('aceita assinatura correta (hex sobre o corpo cru)', () => {
    const body = JSON.stringify({ ok: true })
    expect(assinaturaMetaValida(Buffer.from(body), assinar(body), SECRET)).toBe(true)
  })
  it('rejeita assinatura de corpo diferente', () => {
    const assinada = assinar('{"a":1}')
    expect(assinaturaMetaValida(Buffer.from('{"a":2}'), assinada, SECRET)).toBe(false)
  })
  it('rejeita header ausente ou secret vazio', () => {
    const body = '{"x":1}'
    expect(assinaturaMetaValida(Buffer.from(body), undefined, SECRET)).toBe(false)
    expect(assinaturaMetaValida(Buffer.from(body), assinar(body), '')).toBe(false)
  })
})

describe('extrairEventosWebhook', () => {
  it('mapeia botão de template (button.payload) com contexto', () => {
    const { botoes } = extrairEventosWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: '5511999999999',
                    id: 'wamid.A',
                    type: 'button',
                    button: { payload: 'ja_paguei:aviso1:d', text: 'Já paguei' },
                    context: { id: 'wamid.ORIG' },
                  },
                ],
              },
            },
          ],
        },
      ],
    })
    expect(botoes).toEqual([
      { wamid: 'wamid.A', telefone: '5511999999999', buttonId: 'ja_paguei:aviso1:d', contextoMsgId: 'wamid.ORIG' },
    ])
  })

  it('mapeia interactive.button_reply e texto', () => {
    const { botoes, textos } = extrairEventosWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: '5511888888888',
                    id: 'wamid.B',
                    type: 'interactive',
                    interactive: { type: 'button_reply', button_reply: { id: 'aceite:aviso2', title: 'Aceitar' } },
                  },
                  { from: '5511777777777', id: 'wamid.C', type: 'text', text: { body: '  oi  ' } },
                ],
              },
            },
          ],
        },
      ],
    })
    expect(botoes).toEqual([{ wamid: 'wamid.B', telefone: '5511888888888', buttonId: 'aceite:aviso2' }])
    expect(textos).toEqual([{ wamid: 'wamid.C', telefone: '5511777777777', texto: 'oi' }])
  })

  it('mapeia statuses[] com erro', () => {
    const { statuses } = extrairEventosWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  { id: 'wamid.D', status: 'delivered' },
                  { id: 'wamid.E', status: 'failed', errors: [{ code: 131026, message: 'undeliverable' }] },
                  { id: 'wamid.F', status: 'desconhecido' },
                ],
              },
            },
          ],
        },
      ],
    })
    expect(statuses).toEqual([
      { wamid: 'wamid.D', status: 'delivered' },
      { wamid: 'wamid.E', status: 'failed', erro: 'undeliverable' },
    ])
  })
})

describe('classificarErroGraph', () => {
  it('130497 (empresa não verificada) é permanente', () => {
    const e = classificarErroGraph(130497, 'restricted country', 400)
    expect(e.codigo).toBe(130497)
    expect(e.permanente).toBe(true)
  })
  it('130429 (rate limit) é transitório', () => {
    expect(classificarErroGraph(130429, 'rate', 400).permanente).toBe(false)
  })
  it('5xx sem código é transitório; 4xx sem código é permanente', () => {
    expect(classificarErroGraph(undefined, 'erro', 503).permanente).toBe(false)
    expect(classificarErroGraph(undefined, 'erro', 400).permanente).toBe(true)
  })
})

describe('montarBody', () => {
  const base: MensagemWhats = { para: '+55 (11) 99999-9999', texto: 'Oi, João.' }

  it('com template: type template + body params + botões quick_reply', () => {
    const body = montarBody({
      ...base,
      template: {
        nome: 'whaviso_d2_antecipado',
        idioma: 'pt_BR',
        parametros: ['João', 'Maria'],
        botoesPayload: ['ja_paguei:aviso1', 'ver_pix:aviso1'],
      },
    }) as Record<string, unknown>
    expect(body.type).toBe('template')
    expect(body.to).toBe('5511999999999')
    const tpl = body.template as Record<string, unknown>
    expect(tpl.name).toBe('whaviso_d2_antecipado')
    expect((tpl.language as Record<string, unknown>).code).toBe('pt_BR')
    const comps = tpl.components as Array<Record<string, unknown>>
    expect(comps[0]).toEqual({ type: 'body', parameters: [{ type: 'text', text: 'João' }, { type: 'text', text: 'Maria' }] })
    expect(comps[1]).toEqual({ type: 'button', sub_type: 'quick_reply', index: 0, parameters: [{ type: 'payload', payload: 'ja_paguei:aviso1' }] })
  })

  it('sem template, com botões: type interactive', () => {
    const body = montarBody({ ...base, botoes: [{ id: 'ja_paguei:aviso1', rotulo: 'Já paguei' }] }) as Record<string, unknown>
    expect(body.type).toBe('interactive')
  })

  it('sem template, sem botões: type text', () => {
    const body = montarBody(base) as Record<string, unknown>
    expect(body.type).toBe('text')
    expect((body.text as Record<string, unknown>).body).toBe('Oi, João.')
  })

  it('mídia: type da mídia + caption (exceto áudio)', () => {
    const img = montarBody({ ...base, midia: { tipo: 'imagem', url: 'https://x/y.png' } }) as Record<string, unknown>
    expect(img.type).toBe('image')
    expect((img.image as Record<string, unknown>).caption).toBe('Oi, João.')
  })
})
