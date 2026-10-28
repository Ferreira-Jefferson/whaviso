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
