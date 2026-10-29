// Registry de rotas do painel: 1 entrada por modulo (espelha routes.ts do backend).
// Cada FR-* troca `pagina` pelo seu slice: `pagina: lazy(() => import('@/modules/pedidos'))`.
// Enquanto o modulo nao existe, a rota mostra o slot vazio do shell. Nav (sidebar e bottom
// bar) e rotas saem DAQUI: adicionar um modulo = 1 linha.
import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import {
  BarChart3,
  Bike,
  Bot,
  Boxes,
  CalendarDays,
  ChefHat,
  ClipboardList,
  Contact,
  FileBarChart,
  FileText,
  Gift,
  HandCoins,
  LayoutGrid,
  Link2,
  Megaphone,
  MessageCircle,
  QrCode,
  Receipt,
  ReceiptText,
  Rocket,
  Star,
  Store,
  TicketPercent,
  UtensilsCrossed,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

export type GrupoNav = 'operacao' | 'cardapio' | 'clientes' | 'analise' | 'financeiro' | 'config'

export interface RotaModulo {
  /** Segmento unico da URL, minusculo (ex.: 'pedidos' -> /pedidos). */
  caminho: string
  rotulo: string
  descricao: string
  icone: LucideIcon
  grupo: GrupoNav
  /** Aparece na barra inferior do mobile (maximo 4; o resto vai em "Mais"). */
  fixoNoMobile?: boolean
  /** Fica fora do menu lateral e da barra mobile, mas segue roteavel (ex.: primeiros passos,
   *  que e um guia de setup, nao um destino permanente). */
  ocultoNoMenu?: boolean
  /** Permissao de loja (chave ':ver') que libera o item no menu. Ausente = sempre visivel. Isto so
   *  ADAPTA o menu ao papel; o servidor continua decidindo o acesso real (nega com 403). So mapeia
   *  rota com chave ':ver' dedicada e inequivoca; na duvida, deixa sem (seguro, apenas aparece). */
  permissao?: string
  /** Pagina do modulo (lazy). Ausente = slot do shell. */
  pagina?: LazyExoticComponent<ComponentType>
}

export const ROTAS: readonly RotaModulo[] = [
  // Operação (o dia a dia ao vivo)
  { caminho: 'pedidos', rotulo: 'Pedidos', descricao: 'Acompanhe os pedidos ao vivo.', icone: ClipboardList, grupo: 'operacao', fixoNoMobile: true, permissao: 'pedidos:ver', pagina: lazy(() => import('@/modules/pedidos')) },
  { caminho: 'conversas', rotulo: 'Conversas', descricao: 'Atendimento pelo WhatsApp.', icone: MessageCircle, grupo: 'operacao', fixoNoMobile: true, permissao: 'conversas:ver', pagina: lazy(() => import('@/modules/conversas')) },
  // Cozinha e despacho sao visoes dos pedidos; nao ha chave ':ver' propria, entao ficam sem gate.
  { caminho: 'cozinha', rotulo: 'Cozinha', descricao: 'Tela da cozinha: prepare e marque pronto.', icone: ChefHat, grupo: 'operacao', pagina: lazy(() => import('@/modules/kds')) },
  { caminho: 'despacho', rotulo: 'Despacho', descricao: 'Pedidos prontos para sair.', icone: Bike, grupo: 'operacao', pagina: lazy(() => import('@/modules/despacho')) },
  { caminho: 'salao', rotulo: 'Salão', descricao: 'Mesas e comandas do salão.', icone: LayoutGrid, grupo: 'operacao', permissao: 'salao:ver', pagina: lazy(() => import('@/modules/salao')) },
  { caminho: 'caixa', rotulo: 'Caixa', descricao: 'Abra, registre e feche o caixa do dia.', icone: Wallet, grupo: 'operacao', permissao: 'caixa:ver', pagina: lazy(() => import('@/modules/caixa')) },
  // Cardápio (o que você vende)
  { caminho: 'cardapio', rotulo: 'Cardápio', descricao: 'Categorias, itens e opções.', icone: UtensilsCrossed, grupo: 'cardapio', fixoNoMobile: true, permissao: 'cardapio:ver', pagina: lazy(() => import('@/modules/cardapio')) },
  // Estoque cobre insumos E itens (duas chaves ':ver'); sem gate para nao esconder por engano.
  { caminho: 'estoque', rotulo: 'Estoque', descricao: 'Insumos e fichas técnicas.', icone: Boxes, grupo: 'cardapio', pagina: lazy(() => import('@/modules/estoque')) },
  // Entrega não tem mais rota própria: o cadastro de entregadores vive em Pessoas, o acerto em
  // Contas a pagar, as zonas no editor da loja (aba Entrega) e o despacho absorve a roteirização.
  // Clientes (relacionamento e marketing)
  { caminho: 'clientes', rotulo: 'Clientes', descricao: 'Quem pede na sua loja.', icone: Users, grupo: 'clientes', fixoNoMobile: true, permissao: 'clientes:ver', pagina: lazy(() => import('@/modules/clientes')) },
  // Clientes absorve o CRM (segmentos, ticket, frequência): mesma entidade cliente.
  { caminho: 'campanhas', rotulo: 'Campanhas', descricao: 'Mensagens de WhatsApp para quem já pediu.', icone: Megaphone, grupo: 'clientes', permissao: 'campanhas:ver', pagina: lazy(() => import('@/modules/campanhas')) },
  { caminho: 'promocoes', rotulo: 'Promoções', descricao: 'Cupons e combos para vender mais.', icone: TicketPercent, grupo: 'clientes', permissao: 'promocoes:ver', pagina: lazy(() => import('@/modules/promocoes')) },
  { caminho: 'fidelidade', rotulo: 'Fidelidade', descricao: 'Pontos ou cashback para quem volta.', icone: Gift, grupo: 'clientes', permissao: 'fidelidade:ver', pagina: lazy(() => import('@/modules/fidelidade')) },
  // Avaliacoes nao tem chave ':ver' propria (guarda por pedidos); sem gate.
  { caminho: 'avaliacoes', rotulo: 'Avaliações', descricao: 'O que os clientes acharam dos pedidos.', icone: Star, grupo: 'clientes', pagina: lazy(() => import('@/modules/avaliacoes')) },
  // Análise (os números). Dashboard nao tem chave ':ver' inequivoca (guarda por pedidos); sem gate.
  { caminho: 'dashboard', rotulo: 'Dashboard', descricao: 'Números do dia e do período.', icone: BarChart3, grupo: 'analise', pagina: lazy(() => import('@/modules/dashboard')) },
  { caminho: 'relatorios', rotulo: 'Relatórios', descricao: 'Vendas, pagamentos, problemas e retenção.', icone: FileBarChart, grupo: 'analise', permissao: 'relatorios:ver', pagina: lazy(() => import('@/modules/relatorios')) },
  // Financeiro (o dinheiro)
  { caminho: 'pagamentos', rotulo: 'Pagamentos', descricao: 'Pix dos pedidos e chave Pix.', icone: QrCode, grupo: 'financeiro', permissao: 'pagamentos:ver', pagina: lazy(() => import('@/modules/pagamentos')) },
  { caminho: 'custos', rotulo: 'Custos', descricao: 'Quanto os serviços externos custaram.', icone: Receipt, grupo: 'financeiro', permissao: 'custos:ver', pagina: lazy(() => import('@/modules/custos')) },
  { caminho: 'contas-a-pagar', rotulo: 'Contas a pagar', descricao: 'O que você paga a fornecedores e pessoas.', icone: HandCoins, grupo: 'financeiro', permissao: 'contas_pagar:ver', pagina: lazy(() => import('@/modules/contas_pagar')) },
  { caminho: 'fiscal', rotulo: 'Fiscal', descricao: 'Notas fiscais e emissor.', icone: FileText, grupo: 'financeiro', permissao: 'fiscal:ver', pagina: lazy(() => import('@/modules/fiscal')) },
  // Minha fatura e a visao do dono sobre a propria assinatura Whaviso; sem gate (todo membro ve a sua).
  { caminho: 'fatura', rotulo: 'Minha fatura', descricao: 'Sua assinatura e faturas do Whaviso.', icone: ReceiptText, grupo: 'financeiro', pagina: lazy(() => import('@/modules/plataforma_cobranca').then((m) => ({ default: m.MinhaFaturaPage }))) },
  // Configuração (ajustes da loja e do atendente). Canais absorve os números de WhatsApp;
  // o Atendente reúne chave/consumo, conhecimento e fluxo (tudo que configura a IA).
  // Lojas e Agenda nao tem chave ':ver' propria (config da loja); sem gate.
  { caminho: 'lojas', rotulo: 'Lojas', descricao: 'Perfil, horários, agendamento e área da loja.', icone: Store, grupo: 'config', pagina: lazy(() => import('@/modules/lojas')) },
  { caminho: 'agendamento', rotulo: 'Agenda', descricao: 'Pedidos agendados.', icone: CalendarDays, grupo: 'config', pagina: lazy(() => import('@/modules/agendamento')) },
  { caminho: 'pessoas', rotulo: 'Pessoas', descricao: 'Equipe, cargos e escalas.', icone: Contact, grupo: 'config', permissao: 'pessoas:ver', pagina: lazy(() => import('@/modules/pessoas')) },
  { caminho: 'canais', rotulo: 'Canais', descricao: 'WhatsApp, iFood e outros canais de pedidos.', icone: Link2, grupo: 'config', permissao: 'canais:ver', pagina: lazy(() => import('@/modules/canais')) },
  { caminho: 'llm', rotulo: 'Atendente', descricao: 'A IA que atende: chave e consumo, conhecimento e fluxo da conversa.', icone: Bot, grupo: 'config', permissao: 'ia:ver', pagina: lazy(() => import('@/modules/llm')) },
  { caminho: 'onboarding', rotulo: 'Primeiros passos', descricao: 'Configure a loja para receber pedidos.', icone: Rocket, grupo: 'config', ocultoNoMenu: true, pagina: lazy(() => import('@/modules/onboarding')) },
]

/** Metadados de cada grupo da navegação, na ordem em que aparecem no menu. */
export interface GrupoInfo {
  id: GrupoNav
  rotulo: string
  /** Começa aberto no primeiro acesso (sem preferência salva). */
  abertoPadrao?: boolean
}

export const GRUPOS_NAV: readonly GrupoInfo[] = [
  { id: 'operacao', rotulo: 'Operação', abertoPadrao: true },
  { id: 'cardapio', rotulo: 'Cardápio e estoque' },
  { id: 'clientes', rotulo: 'Clientes e marketing' },
  { id: 'analise', rotulo: 'Análise' },
  { id: 'financeiro', rotulo: 'Financeiro' },
  { id: 'config', rotulo: 'Configuração' },
]

export const ROTULO_GRUPO: Record<GrupoNav, string> = Object.fromEntries(
  GRUPOS_NAV.map((g) => [g.id, g.rotulo]),
) as Record<GrupoNav, string>

/** Mostra a rota no menu quando ela nao tem gate de permissao, quando a grade do usuario ainda nao
 *  chegou (`granted === null`, para o menu nao piscar vazio), ou quando o usuario tem a permissao.
 *  O servidor segue decidindo o acesso real (nega com 403); isto so adapta o menu ao papel. */
export function podeVerRota(rota: RotaModulo, granted: Set<string> | null): boolean {
  return !rota.permissao || granted === null || granted.has(rota.permissao)
}

/** Rota inicial depois do login. */
export const ROTA_INICIAL = `/${ROTAS[0]?.caminho ?? 'pedidos'}`
