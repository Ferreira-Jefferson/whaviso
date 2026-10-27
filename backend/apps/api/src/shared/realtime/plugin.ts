// Plugin SSE (F5, etapas 4 e 6): `GET /realtime/stream`. Infra da app, nao modulo de negocio.
// Auth: `Authorization: Bearer` (fetch com stream; EventSource nao envia header). Escopo de
// loja (F3): loja ativa = header x-loja-id validado; sem ele, todas as lojas do usuario.
// Uma unica conexao LISTEN por instancia alimenta o hub; o cliente so recebe o que seu escopo
// e papel permitem. Falha fechada: sem exp valido no token, 401.
import type { OutgoingHttpHeaders } from 'node:http'
import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { CANAL_EVENTOS, criarEscuta, type Escuta } from '@whaviso/shared/db'
import { HttpError, naoAutorizado } from '../http_errors'
import { HubRealtime, LimiteExcedido, type Handle, type MensagemHub, type OpcoesHub } from './hub'
import { ABERTURA, HEARTBEAT, formatarMensagem, lerExpDoBearer } from './sse'

export interface OpcoesRealtime extends OpcoesHub {
  /** Connection string DIRETA/session (LISTEN nao funciona no pooler em modo transacao). */
  connectionString: string
  heartbeatMs?: number
  backoffMinMs?: number
}

declare module 'fastify' {
  interface FastifyInstance {
    hubRealtime: HubRealtime
    /** Estado da conexao LISTEN (teste/diagnostico). */
    escutaRealtime: () => Escuta | null
  }
}

const MAX_TIMER = 2 ** 31 - 1
const MAX_BUFFER_ESCRITA = 1024 * 1024

const plugin: FastifyPluginAsync<OpcoesRealtime> = async (app, opcoes) => {
  const hub = new HubRealtime(opcoes)
  app.decorate('hubRealtime', hub)
  const heartbeatMs = opcoes.heartbeatMs ?? 25_000
  let escuta: Escuta | null = null
  app.decorate('escutaRealtime', () => escuta)

  // Lazy: a conexao LISTEN so abre no primeiro cliente (testes sem SSE nao tocam o banco).
  const garantirEscuta = () => {
    if (escuta) return
    escuta = criarEscuta({
      connectionString: opcoes.connectionString,
      canal: CANAL_EVENTOS,
      backoffMinMs: opcoes.backoffMinMs,
      aoMensagem: (bruto) => {
        hub.publicar(bruto)
      },
      aoReconectar: () => {
        app.log.warn('realtime: LISTEN reconectado, enviando resync')
        hub.ressincronizar()
      },
      aoFalha: (motivo) => app.log.warn({ motivo }, 'realtime: conexao LISTEN caiu'),
    })
    escuta.iniciar()
  }

  app.get(
    '/realtime/stream',
    { config: { acesso: 'conteudo_de_loja' }, preHandler: [app.autenticar, app.escopoLoja] },
    async (req, reply) => {
      const escopo = req.escopo
      const userId = req.usuario?.user_id
      if (!escopo || !userId) throw naoAutorizado()
      const exp = lerExpDoBearer(req.headers.authorization)
      if (exp === null || exp * 1000 <= Date.now()) throw naoAutorizado('Token invalido ou expirado')

      // So a loja ativa validada pelo F3 (ou o conjunto do usuario); nunca query/header cru.
      const lojas = escopo.loja_ativa ? [escopo.loja_ativa] : escopo.loja_ids
      const res = reply.raw
      let encerrada = false
      let handle: Handle | null = null
      const timers: NodeJS.Timeout[] = []

      const finalizar = () => {
        if (encerrada) return
        encerrada = true
        handle?.cancelar()
        for (const t of timers) {
          clearTimeout(t)
          clearInterval(t)
        }
        if (!res.writableEnded) res.end()
      }
      const escrever = (texto: string) => {
        if (encerrada) return
        res.write(texto)
        if (res.writableLength > MAX_BUFFER_ESCRITA) finalizar() // cliente lento: derruba
      }
      const entregar = (msg: MensagemHub) => {
        escrever(formatarMensagem(msg))
        if (msg.tipo === 'fim') finalizar()
      }

      try {
        handle = hub.assinar({
          user_id: userId,
          escopo: { tipo: 'loja', loja_ids: lojas, papel_por_loja: escopo.papel_por_loja },
          entregar,
        })
      } catch (erro) {
        if (erro instanceof LimiteExcedido) {
          void reply.header('retry-after', '5')
          throw new HttpError(429, 'limite_conexoes', 'Muitas conexoes de realtime abertas')
        }
        throw erro
      }

      garantirEscuta()
      reply.hijack()
      // Hijack pula o pipeline de resposta: levamos os headers ja definidos (helmet/cors).
      const headers = reply.getHeaders() as OutgoingHttpHeaders
      res.writeHead(200, {
        ...headers,
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        'x-accel-buffering': 'no',
        // Stream nao e reaproveitavel: fechar o socket ao terminar evita conexao ociosa pendurada.
        connection: 'close',
      })
      req.raw.socket.setTimeout(0)
      req.raw.socket.setNoDelay(true)
      req.raw.on('close', finalizar)
      res.on('close', finalizar)
      res.on('error', finalizar)

      escrever(ABERTURA)
      const ultimo = req.headers['last-event-id']
      handle.retomar(typeof ultimo === 'string' ? ultimo : null)

      const hb = setInterval(() => escrever(HEARTBEAT), heartbeatMs)
      hb.unref()
      timers.push(hb)
      // SEC-040: token que expira durante a conexao encerra o stream.
      const ate = Math.min(Math.max(exp * 1000 - Date.now(), 0), MAX_TIMER)
      const fim = setTimeout(() => entregar({ tipo: 'fim', motivo: 'token_expirado' }), ate)
      fim.unref()
      timers.push(fim)
    },
  )

  // Graceful shutdown: antes de fechar o servidor (que esperaria as conexoes SSE abertas).
  app.addHook('preClose', async () => {
    hub.encerrar()
  })
  app.addHook('onClose', async () => {
    await escuta?.parar()
  })
}

export const realtimePlugin = fp(plugin, {
  name: 'whaviso-realtime',
  dependencies: ['whaviso-autenticar', 'whaviso-escopo-loja'],
})
