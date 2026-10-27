import { ok, falha, Permanente, type ErroProvedor } from '../erros'
import type { ClienteMapas, Geocodificado, MatrizResposta, Ponto, RotaResposta } from '../mapas'

const M_POR_GRAU = 111_000
const VELOCIDADE_MS = 30 / 3.6 // 30 km/h

/** Distancia euclidiana sobre lat/lng (graus -> metros). Deterministica; nao e geodesica. */
export function distanciaEuclidianaM(a: Ponto, b: Ponto): number {
  return Math.round(Math.hypot(a.lat - b.lat, a.lng - b.lng) * M_POR_GRAU)
}

export function matrizEuclidiana(origens: Ponto[], destinos: Ponto[]): MatrizResposta {
  const distanciasM = origens.map((o) => destinos.map((d) => distanciaEuclidianaM(o, d)))
  return { distanciasM, duracoesS: distanciasM.map((l) => l.map((m) => Math.round(m / VELOCIDADE_MS))) }
}

/** Vizinho mais proximo a partir da parada 0. */
export function rotaEuclidiana(paradas: Ponto[]): RotaResposta {
  const ordem = [0]
  const restantes = new Set(paradas.map((_, i) => i).slice(1))
  let distanciaM = 0
  while (restantes.size > 0) {
    const atual = paradas[ordem[ordem.length - 1]!]!
    let melhor = -1
    let melhorD = Infinity
    for (const i of restantes) {
      const d = distanciaEuclidianaM(atual, paradas[i]!)
      if (d < melhorD) {
        melhorD = d
        melhor = i
      }
    }
    restantes.delete(melhor)
    ordem.push(melhor)
    distanciaM += melhorD
  }
  return { ordem, distanciaM, duracaoS: Math.round(distanciaM / VELOCIDADE_MS) }
}

export interface OpcoesFakeMapas {
  /** Enderecos conhecidos (chave: texto exato, minusculo e sem espacos nas pontas). */
  enderecos?: Record<string, Ponto>
  /** Ponto devolvido para enderecos desconhecidos; sem ele, desconhecido = erro Permanente. */
  padrao?: Ponto
}

const chaveEndereco = (e: string) => e.trim().toLowerCase()

export class FakeClienteMapas implements ClienteMapas {
  readonly chamadas: { operacao: 'geocodificar' | 'matriz' | 'rota'; entrada: unknown }[] = []
  readonly #enderecos: Map<string, Ponto>
  readonly #padrao: Ponto | undefined
  #erro: ErroProvedor | undefined

  constructor(op: OpcoesFakeMapas = {}) {
    this.#enderecos = new Map(Object.entries(op.enderecos ?? {}).map(([k, v]) => [chaveEndereco(k), v]))
    this.#padrao = op.padrao
  }

  falharSempre(erro: ErroProvedor | undefined): this {
    this.#erro = erro
    return this
  }

  async geocodificar(endereco: string) {
    this.chamadas.push({ operacao: 'geocodificar', entrada: endereco })
    if (this.#erro) return falha(this.#erro)
    const p = this.#enderecos.get(chaveEndereco(endereco))
    if (p) return ok<Geocodificado>({ ...p, precisao: 'exata' })
    if (this.#padrao) return ok<Geocodificado>({ ...this.#padrao, precisao: 'aproximada' })
    return falha(new Permanente('endereco nao encontrado', { codigo: 'endereco_nao_encontrado' }))
  }

  async matriz(origens: Ponto[], destinos: Ponto[]) {
    this.chamadas.push({ operacao: 'matriz', entrada: { origens, destinos } })
    return this.#erro ? falha(this.#erro) : ok(matrizEuclidiana(origens, destinos))
  }

  async rota(paradas: Ponto[]) {
    this.chamadas.push({ operacao: 'rota', entrada: paradas })
    return this.#erro ? falha(this.#erro) : ok(rotaEuclidiana(paradas))
  }
}
