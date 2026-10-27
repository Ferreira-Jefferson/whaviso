// Apresentacao das zonas de entrega: rotulos dos tipos e resumo da area. Nada de regra de
// negocio aqui: qual zona atende um endereco e quanto custa e decidido pelo servidor.
import type { ZonaDto } from '@/shared/contracts/_generated/zonas_entrega'

export type TipoZona = ZonaDto['tipo']

export const ROTULO_TIPO: Record<TipoZona, string> = {
  bairro: 'Bairro',
  poligono: 'Polígono',
  raio: 'Raio',
}

export const DESCRICAO_TIPO: Record<TipoZona, string> = {
  bairro: 'Atende pelo nome do bairro do endereço.',
  poligono: 'Atende o que cai dentro de uma área desenhada por pontos.',
  raio: 'Atende o que fica até uma distância de um ponto central.',
}

function formatarDistancia(metros: number): string {
  return metros >= 1000
    ? `${(metros / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`
    : `${metros} m`
}

/** Texto curto da area da zona para a lista. */
export function resumoDaArea(z: ZonaDto): string {
  if (z.tipo === 'bairro') return z.bairro ?? 'Bairro não informado'
  if (z.area && 'metros' in z.area) return `Até ${formatarDistancia(z.area.metros)} do ponto central`
  if (z.area && 'coordinates' in z.area) {
    const pontos = Math.max(0, (z.area.coordinates[0]?.length ?? 1) - 1)
    return `Área com ${pontos} pontos`
  }
  return 'Área não informada'
}

/** Aceita "-23,55" ou "-23.55"; devolve null se nao for numero finito. */
export function lerDecimal(texto: string): number | null {
  const limpo = texto.trim().replace(',', '.')
  if (limpo === '') return null
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

/**
 * Le pontos de um poligono, um por linha, no formato "latitude, longitude".
 * Devolve o anel GeoJSON FECHADO ([lng, lat], primeiro = ultimo) ou uma mensagem de erro.
 */
export function lerPoligono(texto: string): { anel: [number, number][] } | { erro: string } {
  const linhas = texto
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  const pontos: [number, number][] = []
  for (const [i, linha] of linhas.entries()) {
    // Separadores aceitos entre as duas coordenadas: virgula, ponto e virgula ou espaco.
    // Decimais com ponto (ex.: -23.5505, -46.6333).
    const duplas = linha.split(/[;,\s]+/).filter(Boolean)
    if (duplas.length !== 2) return { erro: `Linha ${i + 1}: use "latitude, longitude".` }
    const lat = lerDecimal(duplas[0]!)
    const lng = lerDecimal(duplas[1]!)
    if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return { erro: `Linha ${i + 1}: coordenada inválida.` }
    }
    pontos.push([lng, lat])
  }
  const primeiro = pontos[0]
  const ultimo = pontos[pontos.length - 1]
  const jaFechado = pontos.length > 1 && primeiro![0] === ultimo![0] && primeiro![1] === ultimo![1]
  const distintos = jaFechado ? pontos.length - 1 : pontos.length
  if (distintos < 3) return { erro: 'Informe ao menos 3 pontos.' }
  if (distintos > 199) return { erro: 'No máximo 199 pontos.' }
  return { anel: jaFechado ? pontos : [...pontos, primeiro!] }
}

/** Anel GeoJSON -> texto "lat, lng" por linha, sem o ponto de fechamento. */
export function poligonoParaTexto(anel: ReadonlyArray<readonly [number, number]>): string {
  return anel
    .slice(0, -1)
    .map(([lng, lat]) => `${lat}, ${lng}`)
    .join('\n')
}
