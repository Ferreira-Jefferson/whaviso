import { z } from 'zod'
import {
  falha,
  ok,
  ErroProvedor,
  Permanente,
  RateLimit,
  Transitorio,
  type HostPermitido,
  type Resultado,
} from './erros'
import { fetchSeguro, type ResolverDns } from './fetch_seguro'
import { comTimeout, Disjuntor, LimitadorTaxa, type Agendar, type Dormir, type Relogio } from './resiliencia'
import type { ClienteMapas, Geocodificado, MatrizResposta, Ponto, PrecisaoGeo, RotaResposta } from './mapas'

// Implementacao real de ClienteMapas sobre OpenStreetMap: geocodificacao por Nominatim e
// distancia/rota por OSRM. Toda saida HTTP passa por `fetchSeguro` (SSRF/allowlist, so HTTPS),
// nunca `fetch` cru. Resiliencia: limitador de taxa no Nominatim (politica ~1 req/s), teto de
// tempo por chamada e um disjuntor por provedor. Degradacao continua a cargo do chamador:
// qualquer `falha` faz o modulo roteirizacao cair em haversine / deixar o endereco pendente.
//
// PRIVACIDADE: o endereco so transita dentro da chamada ao provedor (campos de endereco, sem
// nome/telefone, montados pelo modulo). Nada aqui e logado.

export interface ConfigMapasOsm {
  /** Base HTTPS do Nominatim (ex.: https://nominatim.openstreetmap.org). */
  nominatimBaseUrl: string
  /** Base HTTPS do OSRM (ex.: https://router.project-osrm.org). */
  osrmBaseUrl: string
  /** User-Agent completo, identificando o app e um contato (exigencia da politica do Nominatim). */
  userAgent: string
  timeoutMs?: number
  /** Intervalo minimo entre chamadas ao Nominatim (politica publica: >= 1000ms). */
  intervaloNominatimMs?: number
  disjuntorLimiar?: number
  disjuntorReabrirMs?: number
  /** Injecoes para teste (nunca rede real na suite). */
  fetchImpl?: typeof fetch
  resolverDns?: ResolverDns
  relogio?: Relogio
  dormir?: Dormir
  agendar?: Agendar
}

const PADRAO = {
  timeoutMs: 8_000,
  intervaloNominatimMs: 1_000,
  disjuntorLimiar: 4,
  disjuntorReabrirMs: 30_000,
} as const

const semBarra = (u: string) => u.replace(/\/+$/, '')
const hostDe = (u: string) => new URL(u).hostname

const NUM = /^-?\d+(\.\d+)?$/
const paraNumero = (s: string): number | null => (NUM.test(s.trim()) ? Number(s.trim()) : null)

const ItemNominatim = z.object({
  lat: z.string(),
  lon: z.string(),
  addresstype: z.string().optional(),
  type: z.string().optional(),
  class: z.string().optional(),
})
const RespostaNominatim = z.array(ItemNominatim)

const RespostaTabela = z.object({
  code: z.string(),
  distances: z.array(z.array(z.number().nullable())).optional(),
  durations: z.array(z.array(z.number().nullable())).optional(),
})

const RespostaTrip = z.object({
  code: z.string(),
  trips: z.array(z.object({ distance: z.number(), duration: z.number() })).optional(),
  waypoints: z.array(z.object({ waypoint_index: z.number() })).optional(),
})

/** addresstype/type do Nominatim -> precisao do contrato. Desconhecido vira 'aproximada'. */
const PRECISAO_POR_TIPO: Record<string, PrecisaoGeo> = {
  house: 'exata', building: 'exata', house_number: 'exata', address: 'exata', amenity: 'exata', shop: 'exata',
  road: 'rua', residential: 'rua', street: 'rua', pedestrian: 'rua', footway: 'rua',
  suburb: 'bairro', neighbourhood: 'bairro', quarter: 'bairro', city_district: 'bairro', borough: 'bairro',
  city: 'cidade', town: 'cidade', village: 'cidade', municipality: 'cidade', hamlet: 'cidade',
}

function precisaoDe(item: z.infer<typeof ItemNominatim>): PrecisaoGeo {
  const chaves = [item.addresstype, item.type].filter((x): x is string => typeof x === 'string')
  for (const k of chaves) {
    const p = PRECISAO_POR_TIPO[k.toLowerCase()]
    if (p) return p
  }
  return 'aproximada'
}

/** Mapeia status HTTP != 2xx para erro tipado (retentavel decide retry/disjuntor). */
function erroHttp(status: number): ErroProvedor {
  if (status === 429) return new RateLimit('limite de taxa do provedor', undefined, { codigo: 'http_429' })
  if (status >= 500) return new Transitorio('provedor indisponivel', { codigo: `http_${status}` })
  return new Permanente('provedor rejeitou a requisicao', { codigo: `http_${status}` })
}

/** Normaliza excecao de transporte (fetchSeguro, abort, rede) em erro tipado. */
function erroTransporte(e: unknown): ErroProvedor {
  if (e instanceof ErroProvedor) return e
  if (e instanceof Error && e.name === 'AbortError') return new Transitorio('tempo esgotado', { codigo: 'timeout' })
  return new Transitorio('falha de rede com o provedor', { codigo: 'rede' })
}

class ClienteMapasOsm implements ClienteMapas {
  readonly #cfg: Required<Omit<ConfigMapasOsm, 'fetchImpl' | 'resolverDns' | 'relogio' | 'dormir' | 'agendar'>> &
    Pick<ConfigMapasOsm, 'fetchImpl' | 'resolverDns' | 'agendar'>
  readonly #hosts: readonly HostPermitido[]
  readonly #limitadorNominatim: LimitadorTaxa
  readonly #disjuntorNominatim: Disjuntor
  readonly #disjuntorOsrm: Disjuntor

  constructor(cfg: ConfigMapasOsm) {
    if (!cfg.userAgent.trim()) throw new Error('mapas_osm: userAgent obrigatorio (politica do Nominatim)')
    this.#cfg = {
      nominatimBaseUrl: semBarra(cfg.nominatimBaseUrl),
      osrmBaseUrl: semBarra(cfg.osrmBaseUrl),
      userAgent: cfg.userAgent.trim(),
      timeoutMs: cfg.timeoutMs ?? PADRAO.timeoutMs,
      intervaloNominatimMs: cfg.intervaloNominatimMs ?? PADRAO.intervaloNominatimMs,
      disjuntorLimiar: cfg.disjuntorLimiar ?? PADRAO.disjuntorLimiar,
      disjuntorReabrirMs: cfg.disjuntorReabrirMs ?? PADRAO.disjuntorReabrirMs,
      fetchImpl: cfg.fetchImpl,
      resolverDns: cfg.resolverDns,
      agendar: cfg.agendar,
    }
    // new URL lanca cedo se a base for invalida (erro de configuracao, nao de runtime).
    this.#hosts = [...new Set([hostDe(this.#cfg.nominatimBaseUrl), hostDe(this.#cfg.osrmBaseUrl)])]
    const relogio = cfg.relogio
    this.#limitadorNominatim = new LimitadorTaxa(this.#cfg.intervaloNominatimMs, { relogio, dormir: cfg.dormir })
    const op = { limiar: this.#cfg.disjuntorLimiar, reabrirAposMs: this.#cfg.disjuntorReabrirMs, relogio }
    this.#disjuntorNominatim = new Disjuntor(op)
    this.#disjuntorOsrm = new Disjuntor(op)
  }

  async #pedirJson(disjuntor: Disjuntor, url: string): Promise<Resultado<unknown, ErroProvedor>> {
    return disjuntor.executar(() =>
      comTimeout(
        async (sinal) => {
          let resp: Response
          try {
            resp = await fetchSeguro(url, {
              hostsPermitidos: this.#hosts,
              init: { method: 'GET', headers: { 'user-agent': this.#cfg.userAgent, accept: 'application/json' }, signal: sinal },
              fetchImpl: this.#cfg.fetchImpl,
              resolverDns: this.#cfg.resolverDns,
            })
          } catch (e) {
            return falha(erroTransporte(e))
          }
          if (!resp.ok) return falha(erroHttp(resp.status))
          try {
            return ok(await resp.json())
          } catch {
            return falha(new Transitorio('resposta nao e JSON valido', { codigo: 'json_invalido' }))
          }
        },
        this.#cfg.timeoutMs,
        this.#cfg.agendar,
      ),
    )
  }

  async geocodificar(endereco: string): Promise<Resultado<Geocodificado, ErroProvedor>> {
    await this.#limitadorNominatim.aguardar()
    const q = new URLSearchParams({ q: endereco, format: 'jsonv2', limit: '1', addressdetails: '1', countrycodes: 'br' })
    const url = `${this.#cfg.nominatimBaseUrl}/search?${q.toString()}`
    const r = await this.#pedirJson(this.#disjuntorNominatim, url)
    if (!r.ok) return r
    const parsed = RespostaNominatim.safeParse(r.valor)
    if (!parsed.success) return falha(new Transitorio('resposta do geocoder em formato inesperado', { codigo: 'formato' }))
    const item = parsed.data[0]
    if (!item) return falha(new Permanente('endereco nao encontrado', { codigo: 'endereco_nao_encontrado' }))
    const lat = paraNumero(item.lat)
    const lng = paraNumero(item.lon)
    if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return falha(new Transitorio('coordenada invalida do geocoder', { codigo: 'coordenada' }))
    }
    return ok<Geocodificado>({ lat, lng, precisao: precisaoDe(item) })
  }

  async matriz(origens: Ponto[], destinos: Ponto[]): Promise<Resultado<MatrizResposta, ErroProvedor>> {
    const coords = [...origens, ...destinos]
    const caminho = coords.map((p) => `${p.lng},${p.lat}`).join(';')
    const sources = origens.map((_, i) => i).join(';')
    const destinations = destinos.map((_, i) => origens.length + i).join(';')
    const q = new URLSearchParams({ sources, destinations, annotations: 'distance,duration' })
    const url = `${this.#cfg.osrmBaseUrl}/table/v1/driving/${caminho}?${q.toString()}`
    const r = await this.#pedirJson(this.#disjuntorOsrm, url)
    if (!r.ok) return r
    const parsed = RespostaTabela.safeParse(r.valor)
    if (!parsed.success || parsed.data.code !== 'Ok' || !parsed.data.distances || !parsed.data.durations) {
      return falha(new Transitorio('matriz indisponivel no provedor', { codigo: 'matriz' }))
    }
    const distanciasM = semNulo(parsed.data.distances)
    const duracoesS = semNulo(parsed.data.durations)
    if (!distanciasM || !duracoesS) return falha(new Transitorio('matriz com trecho inalcancavel', { codigo: 'matriz_incompleta' }))
    return ok<MatrizResposta>({
      distanciasM: distanciasM.map((l) => l.map((m) => Math.round(m))),
      duracoesS: duracoesS.map((l) => l.map((s) => Math.round(s))),
    })
  }

  async rota(paradas: Ponto[]): Promise<Resultado<RotaResposta, ErroProvedor>> {
    const caminho = paradas.map((p) => `${p.lng},${p.lat}`).join(';')
    const q = new URLSearchParams({ source: 'first', roundtrip: 'false', annotations: 'false' })
    const url = `${this.#cfg.osrmBaseUrl}/trip/v1/driving/${caminho}?${q.toString()}`
    const r = await this.#pedirJson(this.#disjuntorOsrm, url)
    if (!r.ok) return r
    const parsed = RespostaTrip.safeParse(r.valor)
    const trip = parsed.success ? parsed.data.trips?.[0] : undefined
    const waypoints = parsed.success ? parsed.data.waypoints : undefined
    if (!parsed.success || parsed.data.code !== 'Ok' || !trip || !waypoints || waypoints.length !== paradas.length) {
      return falha(new Transitorio('rota indisponivel no provedor', { codigo: 'rota' }))
    }
    const ordem = new Array<number>(paradas.length)
    for (let i = 0; i < waypoints.length; i++) {
      const pos = waypoints[i]!.waypoint_index
      if (pos < 0 || pos >= paradas.length) return falha(new Transitorio('indice de parada invalido', { codigo: 'rota' }))
      ordem[pos] = i
    }
    if (ordem.some((v) => v === undefined)) return falha(new Transitorio('ordem de parada incompleta', { codigo: 'rota' }))
    return ok<RotaResposta>({ ordem, distanciaM: Math.round(trip.distance), duracaoS: Math.round(trip.duration) })
  }
}

/** true -> matriz densa (sem null); null -> havia trecho inalcancavel. */
function semNulo(m: (number | null)[][]): number[][] | null {
  const out: number[][] = []
  for (const linha of m) {
    const l: number[] = []
    for (const v of linha) {
      if (v === null || !Number.isFinite(v) || v < 0) return null
      l.push(v)
    }
    out.push(l)
  }
  return out
}

export function criarMapasOsm(cfg: ConfigMapasOsm): ClienteMapas {
  return new ClienteMapasOsm(cfg)
}

/**
 * Monta o ClienteMapas real a partir do ambiente (convencao API_*). Sem as vars essenciais
 * (base do Nominatim, base do OSRM e contato), devolve `null` para o chamador cair no caminho
 * offline (mapas_indisponivel -> haversine). Vars:
 *   API_MAPAS_NOMINATIM_URL  base HTTPS do Nominatim
 *   API_MAPAS_OSRM_URL       base HTTPS do OSRM
 *   API_MAPAS_CONTATO        contato (e-mail/URL) exigido pela politica do Nominatim
 *   API_MAPAS_USER_AGENT     opcional: User-Agent completo (default: "whaviso/1.0 (+<contato>)")
 *   API_MAPAS_TIMEOUT_MS     opcional: teto por chamada (default 8000)
 *   API_MAPAS_INTERVALO_MS   opcional: intervalo minimo do Nominatim (default 1000)
 */
export function criarMapasOsmDoAmbiente(env: Record<string, string | undefined> = process.env): ClienteMapas | null {
  const nominatim = env.API_MAPAS_NOMINATIM_URL?.trim()
  const osrm = env.API_MAPAS_OSRM_URL?.trim()
  const contato = env.API_MAPAS_CONTATO?.trim()
  if (!nominatim || !osrm || !contato) return null
  const userAgent = env.API_MAPAS_USER_AGENT?.trim() || `whaviso/1.0 (+${contato})`
  const inteiro = (v: string | undefined) => {
    const n = v?.trim() ? Number(v.trim()) : NaN
    return Number.isInteger(n) && n > 0 ? n : undefined
  }
  return criarMapasOsm({
    nominatimBaseUrl: nominatim,
    osrmBaseUrl: osrm,
    userAgent,
    timeoutMs: inteiro(env.API_MAPAS_TIMEOUT_MS),
    intervaloNominatimMs: inteiro(env.API_MAPAS_INTERVALO_MS),
  })
}
