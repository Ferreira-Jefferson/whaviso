// Registry de rotas do painel: 1 entrada por modulo (espelha routes.ts do backend).
// Cada FR-* troca `pagina` pelo seu slice: `pagina: lazy(() => import('@/modules/pedidos'))`.
// Enquanto o modulo nao existe, a rota mostra o slot vazio do shell. Nav (sidebar e bottom
// bar) e rotas saem DAQUI: adicionar um modulo = 1 linha.
import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import {
  BarChart3,
  Bike,
  CalendarCheck,
  ClipboardList,
  MapPinned,
  MessageCircle,
  Smartphone,
  Store,
  UtensilsCrossed,
  Users,
  type LucideIcon,
} from 'lucide-react'

export type GrupoNav = 'painel' | 'entrega' | 'config'

export interface RotaModulo {
  /** Segmento unico da URL, minusculo (ex.: 'pedidos' -> /pedidos). */
  caminho: string
  rotulo: string
  descricao: string
  icone: LucideIcon
  grupo: GrupoNav
  /** Aparece na barra inferior do mobile (maximo 4; o resto vai em "Mais"). */
  fixoNoMobile?: boolean
  /** Pagina do modulo (lazy). Ausente = slot do shell. */
  pagina?: LazyExoticComponent<ComponentType>
}

export const ROTAS: readonly RotaModulo[] = [
  { caminho: 'pedidos', rotulo: 'Pedidos', descricao: 'Acompanhe os pedidos ao vivo.', icone: ClipboardList, grupo: 'painel', fixoNoMobile: true, pagina: lazy(() => import('@/modules/pedidos')) },
  { caminho: 'conversas', rotulo: 'Conversas', descricao: 'Atendimento pelo WhatsApp.', icone: MessageCircle, grupo: 'painel', fixoNoMobile: true },
  { caminho: 'cardapio', rotulo: 'Cardápio', descricao: 'Categorias, itens e opções.', icone: UtensilsCrossed, grupo: 'painel', fixoNoMobile: true },
  { caminho: 'clientes', rotulo: 'Clientes', descricao: 'Quem pede na sua loja.', icone: Users, grupo: 'painel', fixoNoMobile: true },
  { caminho: 'dashboard', rotulo: 'Dashboard', descricao: 'Números do dia e do período.', icone: BarChart3, grupo: 'painel' },
  { caminho: 'despacho', rotulo: 'Despacho', descricao: 'Pedidos prontos para sair.', icone: Bike, grupo: 'entrega' },
  { caminho: 'motoboys', rotulo: 'Motoboys', descricao: 'Cadastro de entregadores.', icone: Users, grupo: 'entrega' },
  { caminho: 'zonas', rotulo: 'Zonas', descricao: 'Áreas e taxas de entrega.', icone: MapPinned, grupo: 'entrega' },
  { caminho: 'fechamento', rotulo: 'Fechamento', descricao: 'Resumo do dia por entregador.', icone: CalendarCheck, grupo: 'entrega' },
  { caminho: 'lojas', rotulo: 'Lojas', descricao: 'Perfil, horários e área da loja.', icone: Store, grupo: 'config' },
  { caminho: 'numeros', rotulo: 'Números', descricao: 'Números de WhatsApp conectados.', icone: Smartphone, grupo: 'config' },
]

export const ROTULO_GRUPO: Record<GrupoNav, string> = {
  painel: 'Painel',
  entrega: 'Entrega',
  config: 'Configuração',
}

/** Rota inicial depois do login. */
export const ROTA_INICIAL = `/${ROTAS[0]?.caminho ?? 'pedidos'}`
