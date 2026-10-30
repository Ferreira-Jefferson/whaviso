// Instantanea estatica dos planos, embutida no build: evita a landing mostrar "carregando" ou
// erro quando o fetch ainda nao resolveu (primeira visita, conexao lenta) ou o banco esta fora do
// ar por um instante. Usada so como placeholder (ver planos.ts): o fetch real sempre sobrescreve
// assim que chega, sem piscar nada na tela.
//
// Espelha o catalogo de referencia da migration 0094_planos_referencia.sql. Se os planos de
// referencia mudarem numa nova migration, atualize aqui tambem; uma edicao de preco feita so pelo
// console /plataforma/planos (sem migration) NAO precisa refletir aqui, pois o fetch real resolve
// em segundos e so a janela ate la usa este valor.
import type { PlanoPublicoDTO } from './planos'

export const PLANOS_FALLBACK: PlanoPublicoDTO[] = [
  {
    id: 'fallback-essencial',
    nome: 'Essencial',
    valor_centavos: 8990,
    taxa_intermediacao_centavos: 50,
    inclui: [
      '1 loja',
      'Pedidos pelo WhatsApp',
      'Cardápio digital',
      'Painel de pedidos ao vivo',
      'Caixa e formas de pagamento',
      'Pix na sua conta, sem taxa por pedido',
      'R$ 0,50 por transação intermediada',
    ],
  },
  {
    id: 'fallback-profissional',
    nome: 'Profissional',
    valor_centavos: 17990,
    taxa_intermediacao_centavos: 40,
    inclui: [
      'Tudo do Essencial',
      'Até 3 lojas',
      'Atendente com IA no WhatsApp',
      'Salão, mesas e comandas',
      'Estoque e ficha técnica',
      'Campanhas, promoções e fidelidade',
      'Relatórios e dashboard',
      'R$ 0,40 por transação intermediada',
    ],
  },
  {
    id: 'fallback-rede',
    nome: 'Rede',
    valor_centavos: 34990,
    taxa_intermediacao_centavos: 30,
    inclui: [
      'Tudo do Profissional',
      'Lojas ilimitadas',
      'Equipe, cargos e escalas',
      'Pagamento intermediado (Pix e cartão)',
      'Emissão fiscal',
      'Suporte prioritário',
      'R$ 0,30 por transação intermediada',
    ],
  },
]
