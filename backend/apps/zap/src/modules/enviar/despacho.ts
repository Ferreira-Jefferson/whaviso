// Despacha uma MensagemProposta ja validada (contrato F1) pelo ClienteWhats, por tipo:
// texto, interativo (botoes) e template. Funcao fina: so traduz dados em chamada de
// transporte; nenhuma regra de fila e nenhum acesso a banco. O destino (`para`) e a
// credencial do numero chegam resolvidos; este modulo nunca decifra nem le o banco.
import type { MensagemProposta } from '@whaviso/shared/contracts'
import {
  Permanente,
  falha,
  type ClienteWhats,
  type EnvioWhats,
  type NumeroWhats,
  type ResultadoWhats,
} from '@whaviso/shared/clientes'

/** Template ja resolvido (nome aprovado na Meta, idioma e parametros em ordem). */
export interface TemplateResolvido {
  nomeMeta: string
  idioma: string
  parametros: string[]
}

export interface Despacho {
  numero: NumeroWhats
  para: string
  mensagem: MensagemProposta
  /** Obrigatorio quando `mensagem.tipo === 'template'`. */
  template?: TemplateResolvido
  /** Rotulo opaco (id do envio) repassado como biz_opaque_callback_data p/ reconciliacao. */
  rastreio?: string
}

export function despachar(whats: ClienteWhats, d: Despacho): ResultadoWhats<EnvioWhats> {
  const { numero, para, mensagem, rastreio } = d
  switch (mensagem.tipo) {
    case 'texto':
      return whats.enviarTexto({ numero, para, texto: mensagem.texto, rastreio })
    case 'interativo':
      return whats.enviarInterativo({
        numero,
        para,
        corpo: mensagem.texto,
        interacao: {
          tipo: 'botoes',
          botoes: mensagem.botoes.map((b) => ({ id: b.id, titulo: b.rotulo })),
        },
        rastreio,
      })
    case 'template': {
      if (!d.template) {
        return Promise.resolve(
          falha(new Permanente('template indisponivel', { codigo: 'template_indisponivel' })),
        )
      }
      return whats.enviarTemplate({
        numero,
        para,
        nome: d.template.nomeMeta,
        idioma: d.template.idioma,
        componentes: d.template.parametros.length
          ? [{ tipo: 'body', parametros: d.template.parametros }]
          : [],
        rastreio,
      })
    }
  }
}
