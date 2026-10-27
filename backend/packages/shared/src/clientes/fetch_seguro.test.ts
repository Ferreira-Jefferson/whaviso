import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ErroSsrf } from './erros'
import { fetchSeguro, ipNaoPublico } from './fetch_seguro'

const HOST = 'api.provedor.test'
const publico = async () => ['93.184.216.34']

describe('ipNaoPublico', () => {
  it.each(['127.0.0.1', '10.1.2.3', '169.254.169.254', '172.16.0.1', '172.31.255.1', '192.168.0.1', '0.0.0.0', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1'])(
    'bloqueia %s',
    (ip) => expect(ipNaoPublico(ip)).toBe(true),
  )
  it.each(['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700::1111'])('libera %s', (ip) =>
    expect(ipNaoPublico(ip)).toBe(false),
  )
})

describe('fetchSeguro: validacao basica (SEC-070)', () => {
  const base = { hostsPermitidos: [HOST], resolverDns: publico }
  const naoChama: typeof fetch = () => {
    throw new Error('nao deveria chamar a rede')
  }
  it('rejeita host fora da allowlist', async () => {
    await expect(fetchSeguro('https://evil.test/x', { ...base, fetchImpl: naoChama })).rejects.toBeInstanceOf(ErroSsrf)
  })
  it('rejeita HTTP simples', async () => {
    await expect(fetchSeguro(`http://${HOST}/x`, { ...base, fetchImpl: naoChama })).rejects.toThrow(/HTTPS/)
  })
  it('rejeita IP literal e localhost', async () => {
    for (const u of ['https://127.0.0.1/', 'https://[::1]/', 'https://169.254.169.254/', 'https://localhost/']) {
      await expect(fetchSeguro(u, { ...base, fetchImpl: naoChama })).rejects.toBeInstanceOf(ErroSsrf)
    }
  })
  it('rejeita host da allowlist que resolve para rede privada', async () => {
    await expect(
      fetchSeguro(`https://${HOST}/`, { ...base, resolverDns: async () => ['10.0.0.5'], fetchImpl: naoChama }),
    ).rejects.toThrow(/nao publica/)
  })
  it('rejeita credenciais na URL', async () => {
    await expect(fetchSeguro(`https://u:p@${HOST}/`, { ...base, fetchImpl: naoChama })).rejects.toBeInstanceOf(ErroSsrf)
  })
})

describe('fetchSeguro: redirects contra servidor local', () => {
  let srv: Server
  let porta: number
  const visitados: string[] = []

  beforeAll(async () => {
    srv = createServer((req, res) => {
      visitados.push(req.url ?? '')
      const destinos: Record<string, string> = {
        '/loopback': 'http://127.0.0.1:1/segredo',
        '/localhost': 'https://localhost/x',
        '/metadata': 'https://169.254.169.254/latest/meta-data',
        '/privado': 'https://10.0.0.1/x',
        '/ipv6': 'https://[::1]/x',
        '/fora': 'https://evil.test/x',
        '/http': `http://${HOST}/ok`,
        '/loop': '/loop',
        '/bom': '/final',
      }
      const loc = destinos[req.url ?? '']
      if (loc) {
        res.writeHead(302, { location: loc }).end()
        return
      }
      res.writeHead(200).end('ok')
    })
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r))
    porta = (srv.address() as AddressInfo).port
  })
  afterAll(() => new Promise<void>((r) => srv.close(() => r())))

  // Simula DNS/TLS: o salto para o host da allowlist cai no servidor local; qualquer outro
  // destino que chegasse a fetchImpl seria registrado (e o teste falharia).
  const chamadasFetch: string[] = []
  const fetchImpl: typeof fetch = (input, init) => {
    const u = new URL(input instanceof URL ? input.href : String(input))
    chamadasFetch.push(u.href)
    if (u.hostname !== HOST) throw new Error(`fetch para destino inesperado: ${u.href}`)
    return fetch(`http://127.0.0.1:${porta}${u.pathname}`, init)
  }
  const opts = { hostsPermitidos: [HOST], resolverDns: publico, fetchImpl }

  it.each(['/loopback', '/localhost', '/metadata', '/privado', '/ipv6', '/fora', '/http'])(
    'bloqueia redirect %s sem sequer conectar no destino',
    async (caminho) => {
      chamadasFetch.length = 0
      await expect(fetchSeguro(`https://${HOST}${caminho}`, opts)).rejects.toBeInstanceOf(ErroSsrf)
      expect(chamadasFetch).toEqual([`https://${HOST}${caminho}`])
    },
  )

  it('segue redirect para o mesmo host permitido', async () => {
    const r = await fetchSeguro(`https://${HOST}/bom`, opts)
    expect(r.status).toBe(200)
    expect(visitados).toContain('/final')
  })

  it('limita o numero de redirects', async () => {
    await expect(fetchSeguro(`https://${HOST}/loop`, { ...opts, maxRedirects: 2 })).rejects.toThrow(/redirects/)
  })
})
