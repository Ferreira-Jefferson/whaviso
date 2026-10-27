// Health check minimalista do worker (liveness), em node:http puro para nao arrastar um framework
// web num servico que nao serve API. Bind em loopback por padrao (o systemd/monitor local checa).
// NAO expoe nada sensivel: so { ok, servico }.
import { createServer, type Server } from 'node:http'

export function iniciarSaude(host: string, porta: number): Server {
  const servidor = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, servico: 'atendente' }))
      return
    }
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: false }))
  })
  servidor.listen(porta, host)
  return servidor
}
