// Monta os corpos (body JSON) de cada tipo de mensagem da Cloud API a partir das entradas
// ja validadas do contrato ClienteWhats. So transforma dados; nenhuma regra de negocio e
// nenhuma chamada de rede aqui.
import type {
  EnviarInterativoEntrada,
  EnviarMidiaEntrada,
  EnviarTemplateAutenticacaoEntrada,
  EnviarTemplateEntrada,
  EnviarTextoEntrada,
} from '@whaviso/shared/clientes'
import { EnviarTemplateEntrada as TemplateSchema } from '@whaviso/shared/clientes'

type Json = Record<string, unknown>

/** Meta aceita o destino so com digitos (E.164 sem o '+'). */
function digitos(para: string): string {
  return para.replace(/\D/g, '')
}

/**
 * Anexa o rastreio como `biz_opaque_callback_data` (campo de nivel de mensagem da Cloud API):
 * a Meta devolve esse rotulo opaco no webhook de status, permitindo casar entrega/leitura com
 * a linha da outbox. So e incluido quando o chamador informa um rastreio.
 */
function comRastreio(corpo: Json, rastreio: string | undefined): Json {
  return rastreio !== undefined ? { ...corpo, biz_opaque_callback_data: rastreio } : corpo
}

export function corpoTexto(e: EnviarTextoEntrada): Json {
  return comRastreio(
    {
      messaging_product: 'whatsapp',
      to: digitos(e.para),
      type: 'text',
      text: { body: e.texto, preview_url: e.previewUrl ?? false },
    },
    e.rastreio,
  )
}

export function corpoTemplate(e: EnviarTemplateEntrada): Json {
  // `componentes` e opcional na entrada (default []); parse normaliza para o tipo de saida.
  const { nome, idioma, componentes } = TemplateSchema.parse(e)
  let indiceBotao = 0
  const components = componentes.map((c) => {
    if (c.tipo === 'button') {
      // Botoes de quick_reply do template: cada componente 'button' recebe um indice proprio.
      const index = indiceBotao
      indiceBotao += 1
      return {
        type: 'button',
        sub_type: 'quick_reply',
        index,
        parameters: c.parametros.map((payload) => ({ type: 'payload', payload })),
      }
    }
    return { type: c.tipo, parameters: c.parametros.map((text) => ({ type: 'text', text })) }
  })
  return comRastreio(
    {
      messaging_product: 'whatsapp',
      to: digitos(e.para),
      type: 'template',
      template: {
        name: nome,
        language: { code: idioma },
        ...(components.length ? { components } : {}),
      },
    },
    e.rastreio,
  )
}

export function corpoTemplateAutenticacao(e: EnviarTemplateAutenticacaoEntrada): Json {
  // Formato fixo da Meta para AUTHENTICATION: o codigo vai no corpo (body) E no botao de
  // copiar/auto-preencher (sub_type 'url', indice 0). Os dois sao obrigatorios no envio.
  return comRastreio(
    {
      messaging_product: 'whatsapp',
      to: digitos(e.para),
      type: 'template',
      template: {
        name: e.nome,
        language: { code: e.idioma },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: e.codigo }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: e.codigo }] },
        ],
      },
    },
    e.rastreio,
  )
}

export function corpoInterativo(e: EnviarInterativoEntrada): Json {
  const interactive: Json =
    e.interacao.tipo === 'botoes'
      ? {
          type: 'button',
          body: { text: e.corpo },
          action: {
            buttons: e.interacao.botoes.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.titulo } })),
          },
        }
      : {
          type: 'list',
          body: { text: e.corpo },
          action: {
            button: e.interacao.rotuloBotao,
            sections: e.interacao.secoes.map((s) => ({
              ...(s.titulo ? { title: s.titulo } : {}),
              rows: s.linhas.map((l) => ({
                id: l.id,
                title: l.titulo,
                ...(l.descricao ? { description: l.descricao } : {}),
              })),
            })),
          },
        }
  return comRastreio(
    { messaging_product: 'whatsapp', to: digitos(e.para), type: 'interactive', interactive },
    e.rastreio,
  )
}

export function corpoMidia(e: EnviarMidiaEntrada): Json {
  const midia: Json = e.mediaId !== undefined ? { id: e.mediaId } : { link: e.url }
  // A Cloud API nao aceita caption em audio; filename so faz sentido em documento.
  if (e.legenda !== undefined && e.tipo !== 'audio') midia.caption = e.legenda
  if (e.nomeArquivo !== undefined && e.tipo === 'document') midia.filename = e.nomeArquivo
  return comRastreio(
    { messaging_product: 'whatsapp', to: digitos(e.para), type: e.tipo, [e.tipo]: midia },
    e.rastreio,
  )
}

export function corpoMarcarLida(wamid: string): Json {
  return { messaging_product: 'whatsapp', status: 'read', message_id: wamid }
}
