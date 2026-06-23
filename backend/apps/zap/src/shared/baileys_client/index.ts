// Fábrica do cliente WhatsApp (Baileys). Junta conexão + ritmo + humanização e
// expõe só o contrato ClienteWhats. Os módulos do zap dependem apenas dele.
import type { Logger } from '@whaviso/shared/logger'
import type { Pool } from '@whaviso/shared/db'
import {
  ErroEnvio,
  type ClienteWhats,
  type MensagemWhats,
  type OpcoesWhats,
} from './tipos'
import type { ConteudoEnvio } from './tipos_fork'
import { GerenciadorConexao } from './conexao'
import { Pacer } from './ritmo'
import { digitarEEnviar } from './humanizar'

export { ErroEnvio } from './tipos'
export type {
  ClienteWhats,
  BotaoZap,
  MensagemWhats,
  MidiaZap,
  TipoMidia,
  EventoBotao,
  EventoTexto,
  HandlerBotao,
  HandlerTexto,
  OpcoesWhats,
} from './tipos'

export interface DepsCliente {
  logger: Logger
  pool: Pool
}

export function criarClienteWhats(opcoes: OpcoesWhats, deps: DepsCliente): ClienteWhats {
  const gerente = new GerenciadorConexao(opcoes, deps)
  const pacer = new Pacer({
    gapMin: opcoes.gapMin,
    gapMax: opcoes.gapMax,
    batchSize: opcoes.batchSize,
    batchPauseMin: opcoes.batchPauseMin,
    batchPauseMax: opcoes.batchPauseMax,
    maxPorHora: opcoes.maxPorHora,
  })

  async function enviar(m: MensagemWhats): Promise<{ wamid: string }> {
    const sock = gerente.obterSocket()
    if (!gerente.estaConectado() || !sock) {
      // Transitório: o drainer reagenda; volta quando a sessão reconectar.
      throw new ErroEnvio(0, 'whatsapp desconectado', false)
    }
    const jid = `${m.para.replace(/\D/g, '')}@s.whatsapp.net`
    const conteudo: ConteudoEnvio = {}
    if (m.midia) {
      // Com mídia, o texto vira legenda (caption). Áudio não leva legenda no WhatsApp.
      const fonte = { url: m.midia.url }
      if (m.midia.tipo === 'imagem') conteudo.image = fonte
      else if (m.midia.tipo === 'video') conteudo.video = fonte
      else if (m.midia.tipo === 'audio') conteudo.audio = fonte
      else conteudo.document = fonte
      if (m.texto && m.midia.tipo !== 'audio') conteudo.caption = m.texto
    } else {
      conteudo.text = m.texto
    }
    if (m.botoes?.length) {
      conteudo.buttons = m.botoes.map((b) => ({
        buttonId: b.id,
        buttonText: { displayText: b.rotulo },
        type: 1,
      }))
      conteudo.headerType = 1
    }

    if (opcoes.dryRun) {
      // Simula a cadência (passa pelo pacer) mas não envia de verdade.
      await pacer.agendar(async () => undefined)
      return { wamid: `dry_${Date.now()}` }
    }

    const resultado = await pacer.agendar(() => digitarEEnviar(sock, jid, conteudo, opcoes.humanize))
    const wamid = resultado?.key?.id
    if (!wamid) throw new ErroEnvio(0, 'envio sem id de mensagem', false)
    return { wamid }
  }

  return {
    conectar: () => gerente.conectar(),
    parar: () => gerente.parar(),
    desconectar: () => gerente.desconectar(),
    onBotao: (cb) => gerente.onBotao(cb),
    onTexto: (cb) => gerente.onTexto(cb),
    status: () => ({ conectado: gerente.estaConectado(), numero: gerente.numeroAtual() }),
    enviarMensagem: (m) => enviar(m),
    enviarTexto: (para, texto) => enviar({ para, texto }),
  }
}
