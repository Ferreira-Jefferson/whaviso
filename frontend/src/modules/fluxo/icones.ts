// Icone por tipo de etapa do fluxo: ancora visual para reconhecer a etapa de relance (lista e canvas
// usam o mesmo mapa). Tipo desconhecido cai num ponto generico.
import {
  CheckCircle2,
  CircleDot,
  CreditCard,
  ListChecks,
  MapPin,
  MessageCircle,
  PackageSearch,
  ShoppingCart,
  type LucideIcon,
} from 'lucide-react'

const ICONE_TIPO: Record<string, LucideIcon> = {
  saudacao: MessageCircle,
  pedir_categoria: ListChecks,
  montar_pedido: ShoppingCart,
  confirmar: CheckCircle2,
  endereco: MapPin,
  pagamento: CreditCard,
  acompanhar: PackageSearch,
}

export function iconeDoTipo(tipo: string): LucideIcon {
  return ICONE_TIPO[tipo] ?? CircleDot
}
