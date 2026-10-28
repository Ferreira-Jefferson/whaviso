// Apresentacao da roteirizacao: formatacao de duracao/distancia e rotulos dos motivos de um
// pedido ficar sem localizacao. A sugestao em si (agrupamento e ordem) e calculada no servidor.
import type { MotivoSemLocalizacao } from '@/shared/contracts/_generated/roteirizacao'

export const ROTULO_MOTIVO: Record<MotivoSemLocalizacao, string> = {
  sem_endereco: 'Sem endereço cadastrado',
  geocode_falhou: 'Endereço não encontrado no mapa',
  fora_da_area: 'Fora da área de entrega da loja',
  pendente: 'Localização ainda não calculada',
}

/** 75 -> "1 h 15 min"; 40 -> "40 min". */
export function formatarMinutos(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** 850 -> "850 m"; 3200 -> "3,2 km". */
export function formatarDistancia(metros: number): string {
  if (metros < 1000) return `${metros} m`
  return `${(metros / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`
}
