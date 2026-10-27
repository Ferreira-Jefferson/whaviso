// Monta os corpos (body JSON) de cada tipo de mensagem da Cloud API a partir das entradas
// ja validadas do contrato ClienteWhats. So transforma dados; nenhuma regra de negocio e
// nenhuma chamada de rede aqui.
import type {
  EnviarInterativoEntrada,
  EnviarMidiaEntrada,
  EnviarTemplateEntrada,
  EnviarTextoEntrada,
} from '@whaviso/shared/clientes'
import { EnviarTemplateEntrada as TemplateSchema } from '@whaviso/shared/clientes'

type Json = Record<string, unknown>

/** Meta aceita o destino so com digitos (E.164 sem o '+'). */
function digitos(para: string): string {
  return para.replace(/\D/g, '')
}

export function corpoTexto(e: EnviarTextoEntrada): Json {
  return {
    messaging_product: 'whatsapp',
    to: digitos(e.para),
    type: 'text',
    text: { body: e.texto, preview_url: e.previewUrl ?? false },
  }
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
  return {
    messaging_product: 'whatsapp',
    to: digitos(e.para),
    type: 'template',
    template: {
      name: nome,
      language: { code: idioma },
      ...(components.length ? { components } : {}),
    },
  }
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
  return { messaging_product: 'whatsapp', to: digitos(e.para), type: 'interactive', interactive }
}

export function corpoMidia(e: EnviarMidiaEntrada): Json {
  const midia: Json = e.mediaId !== undefined ? { id: e.mediaId } : { link: e.url }
  // A Cloud API nao aceita caption em audio; filename so faz sentido em documento.
  if (e.legenda !== undefined && e.tipo !== 'audio') midia.caption = e.legenda
  if (e.nomeArquivo !== undefined && e.tipo === 'document') midia.filename = e.nomeArquivo
  return { messaging_product: 'whatsapp', to: digitos(e.para), type: e.tipo, [e.tipo]: midia }
}

export function corpoMarcarLida(wamid: string): Json {
  return { messaging_product: 'whatsapp', status: 'read', message_id: wamid }
}
