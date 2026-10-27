// Rotulos, destinos e formatacao do checklist de onboarding. As etapas e a ordem vem do servidor.
import type { EtapaOnboarding } from '@/shared/contracts/_generated/onboarding'

export interface InfoEtapa {
  titulo: string
  descricao: string
  /** Rota do painel onde a etapa se cumpre. */
  destino: string
  acao: string
}

export const INFO_ETAPA: Record<EtapaOnboarding, InfoEtapa> = {
  perfil: {
    titulo: 'Perfil da loja',
    descricao: 'Informe o endereço e os dias e horários em que a loja abre.',
    destino: '/lojas',
    acao: 'Completar perfil',
  },
  numero: {
    titulo: 'Número de WhatsApp',
    descricao: 'Conecte o número que vai atender os pedidos dos seus clientes.',
    destino: '/numeros',
    acao: 'Conectar número',
  },
  cardapio: {
    titulo: 'Cardápio',
    descricao: 'Cadastre ao menos um item ativo, à mão ou importando uma foto do cardápio.',
    destino: '/cardapio',
    acao: 'Montar cardápio',
  },
  primeiro_pedido: {
    titulo: 'Primeiro pedido',
    descricao: 'Receba o primeiro pedido real. É o sinal de que tudo está funcionando.',
    destino: '/pedidos',
    acao: 'Ver pedidos',
  },
}

/** Minutos em texto curto: "35 min", "2 h 10 min", "3 dias 4 h". */
export function formatarDuracao(min: number): string {
  if (min < 1) return 'menos de 1 min'
  if (min < 60) return `${min} min`
  const horas = Math.floor(min / 60)
  const resto = min % 60
  if (horas < 24) return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`
  const dias = Math.floor(horas / 24)
  const hrs = horas % 24
  const d = dias === 1 ? '1 dia' : `${dias} dias`
  return hrs === 0 ? d : `${d} ${hrs} h`
}
