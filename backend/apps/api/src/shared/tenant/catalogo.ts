// Catalogo de permissoes (motor de autorizacao editavel). Fonte dos PADROES semeados na
// migration 0072 e fallback quando o banco ainda nao respondeu. Em runtime a verdade e a
// grade em `papel_permissoes` (ver grade.ts); este arquivo so define chaves, rotulos e os
// padroes que reproduzem o comportamento anterior ao motor (nao regredir).
//
// Papeis sao FIXOS (nao customizaveis). `admin` (console) e `dono` (loja) sao sempre tudo
// e nao sao editaveis (trava anti-lockout).
import type { PapelMembro, PapelOperador } from '@whaviso/shared/contracts'

export type EscopoAcesso = 'console' | 'loja'

/** Ordem de privilegio crescente (so para exibicao na grade). */
export const PAPEIS_CONSOLE = ['convidado', 'suporte', 'financeiro', 'operador', 'admin'] as const satisfies readonly PapelOperador[]
export const PAPEIS_LOJA = ['convidado', 'atendente', 'gerente', 'dono'] as const satisfies readonly PapelMembro[]

/** Papel que e sempre tudo em cada escopo e nao pode ser editado. */
export const PAPEL_FIXO: Record<EscopoAcesso, string> = { console: 'admin', loja: 'dono' }

/** Permissoes que so o papel fixo pode ter (nunca delegaveis pela grade). */
export const SO_PAPEL_FIXO: readonly string[] = ['acessos:gerir']

interface Def<P extends string> {
  chave: string
  rotulo: string
  /** Papeis (alem do fixo) que a tem por padrao. */
  padrao: readonly P[]
}

const CONSOLE = [
  { chave: 'clientes_plataforma:ver', rotulo: 'Ver clientes (contas e fichas)', padrao: ['convidado', 'suporte', 'financeiro', 'operador'] },
  { chave: 'clientes_plataforma:criar', rotulo: 'Cadastrar cliente (provisionar conta)', padrao: [] },
  { chave: 'cobranca:ver', rotulo: 'Ver assinaturas e faturas', padrao: ['convidado', 'suporte', 'financeiro', 'operador'] },
  { chave: 'cobranca:gerir', rotulo: 'Gerir assinaturas, dar baixa e gerar faturas', padrao: ['financeiro', 'operador'] },
  { chave: 'planos:gerir', rotulo: 'Gerir catalogo de planos', padrao: ['financeiro'] },
  { chave: 'funil:ver', rotulo: 'Ver funil e prospectos', padrao: ['operador'] },
  { chave: 'funil:gerir', rotulo: 'Gerir funil e prospectos', padrao: ['operador'] },
  { chave: 'painel:ver', rotulo: 'Ver o painel de metricas (nao afeta a entrada no console)', padrao: ['convidado', 'suporte', 'financeiro', 'operador'] },
  { chave: 'custos_plataforma:ver', rotulo: 'Ver custos da plataforma', padrao: ['financeiro', 'operador'] },
  { chave: 'equipe:gerir', rotulo: 'Gerir equipe da plataforma', padrao: [] },
  { chave: 'chaves_api:gerir', rotulo: 'Gerir chaves de API das contas', padrao: [] },
  { chave: 'acessos:gerir', rotulo: 'Gerir acessos (esta grade)', padrao: [] },
] as const satisfies readonly Def<PapelOperador>[]

const LOJA = [
  { chave: 'conta:gerir', rotulo: 'Conta, membros e assinatura', padrao: [] },
  { chave: 'loja:gerir', rotulo: 'Configuracao geral da loja (onboarding)', padrao: ['gerente'] },
  { chave: 'lojas:gerir', rotulo: 'Editar dados, branding, pausa e capacidade da loja', padrao: ['gerente'] },
  { chave: 'pedidos:ver', rotulo: 'Ver pedidos', padrao: ['convidado', 'atendente', 'gerente'] },
  { chave: 'pedidos:gerir', rotulo: 'Gerir pedidos', padrao: ['atendente', 'gerente'] },
  { chave: 'conversas:atender', rotulo: 'Atender conversas', padrao: ['atendente', 'gerente'] },
  { chave: 'relatorios:ver', rotulo: 'Ver relatorios e metricas', padrao: ['convidado', 'gerente'] },
  { chave: 'clientes:ver', rotulo: 'Ver clientes', padrao: ['convidado', 'atendente', 'gerente'] },
  { chave: 'clientes:gerir', rotulo: 'Gerir clientes e enderecos', padrao: ['atendente', 'gerente'] },
  { chave: 'dados_sensiveis:revelar', rotulo: 'Revelar telefone e Pix em claro', padrao: ['gerente'] },
  { chave: 'pessoas:ver', rotulo: 'Ver equipe da loja (pessoas)', padrao: ['gerente'] },
  { chave: 'pessoas:gerir', rotulo: 'Gerir equipe da loja (pessoas)', padrao: ['gerente'] },
  { chave: 'fiscal:ver', rotulo: 'Ver notas fiscais', padrao: ['gerente'] },
  { chave: 'fiscal:gerir', rotulo: 'Emitir e cancelar notas fiscais', padrao: ['gerente'] },
  { chave: 'fiscal:configurar', rotulo: 'Configurar credencial do emissor fiscal', padrao: [] },
  { chave: 'custos:ver', rotulo: 'Ver custos da loja', padrao: ['gerente'] },
  { chave: 'contas_pagar:ver', rotulo: 'Ver contas a pagar', padrao: ['gerente'] },
  { chave: 'contas_pagar:gerir', rotulo: 'Gerir contas a pagar e fornecedores', padrao: ['gerente'] },
  { chave: 'promocoes:ver', rotulo: 'Ver promocoes', padrao: ['gerente'] },
  { chave: 'promocoes:gerir', rotulo: 'Gerir promocoes', padrao: ['gerente'] },
  // Granularidade por modulo (0073): substitui o guard grosso `loja:gerir` / `pedidos:gerir`.
  // Cada padrao reproduz EXATAMENTE quem passava no guard antigo; `convidado` so ganha `:ver`.
  { chave: 'cardapio:ver', rotulo: 'Ver cardapio', padrao: ['convidado', 'atendente', 'gerente'] },
  { chave: 'cardapio:gerir', rotulo: 'Gerir cardapio (estrutura, grupos, ficha tecnica, importacao)', padrao: ['gerente'] },
  { chave: 'cardapio:disponibilidade', rotulo: 'Ligar e desligar itens e opcoes do cardapio', padrao: ['atendente', 'gerente'] },
  { chave: 'fluxo:ver', rotulo: 'Ver fluxos do atendente', padrao: ['atendente', 'gerente'] },
  { chave: 'fluxo:gerir', rotulo: 'Editar, publicar e ativar fluxos', padrao: ['gerente'] },
  { chave: 'conhecimento:ver', rotulo: 'Ver base de conhecimento, avaliacao e feedback', padrao: ['gerente'] },
  { chave: 'conhecimento:gerir', rotulo: 'Curar base de conhecimento, avaliacao e feedback', padrao: ['gerente'] },
  { chave: 'ia:ver', rotulo: 'Ver estado e consumo da IA', padrao: ['gerente'] },
  { chave: 'ia:configurar', rotulo: 'Configurar credencial da IA (chave do provedor)', padrao: [] },
  { chave: 'canais:ver', rotulo: 'Ver canais de venda e pedidos importados', padrao: ['gerente'] },
  { chave: 'canais:gerir', rotulo: 'Ajustar e sincronizar canais de venda', padrao: ['gerente'] },
  { chave: 'canais:configurar', rotulo: 'Conectar canal de venda (credenciais)', padrao: [] },
  { chave: 'conversas:ver', rotulo: 'Ver conversas', padrao: ['atendente', 'gerente'] },
  { chave: 'salao:ver', rotulo: 'Ver mesas e comandas', padrao: ['atendente', 'gerente'] },
  { chave: 'salao:operar', rotulo: 'Operar comandas (abrir, lancar, fechar)', padrao: ['atendente', 'gerente'] },
  { chave: 'salao:gerir', rotulo: 'Gerir mesas do salao', padrao: ['gerente'] },
  { chave: 'caixa:ver', rotulo: 'Ver caixa e relatorio de fechamento', padrao: ['atendente', 'gerente'] },
  { chave: 'caixa:gerir', rotulo: 'Operar caixa (abrir, movimentar, fechar)', padrao: ['atendente', 'gerente'] },
  { chave: 'estoque_insumos:ver', rotulo: 'Ver estoque de insumos', padrao: ['convidado', 'gerente'] },
  { chave: 'estoque_insumos:gerir', rotulo: 'Gerir estoque de insumos e movimentos', padrao: ['gerente'] },
  { chave: 'estoque_itens:ver', rotulo: 'Ver estoque por item', padrao: ['convidado', 'atendente', 'gerente'] },
  { chave: 'estoque_itens:gerir', rotulo: 'Gerir estoque por item (controle e movimentos)', padrao: ['gerente'] },
  { chave: 'campanhas:ver', rotulo: 'Ver campanhas', padrao: ['gerente'] },
  { chave: 'campanhas:gerir', rotulo: 'Criar, disparar e cancelar campanhas', padrao: ['gerente'] },
  { chave: 'fidelidade:ver', rotulo: 'Ver programa e saldos de fidelidade', padrao: ['atendente', 'gerente'] },
  { chave: 'fidelidade:operar', rotulo: 'Acumular e resgatar pontos de fidelidade', padrao: ['atendente', 'gerente'] },
  { chave: 'fidelidade:gerir', rotulo: 'Configurar o programa de fidelidade', padrao: ['gerente'] },
  { chave: 'disponibilidade:ver', rotulo: 'Ver horarios, agendamento e excecoes', padrao: ['convidado', 'atendente', 'gerente'] },
  { chave: 'disponibilidade:gerir', rotulo: 'Gerir horarios, agendamento e excecoes', padrao: ['gerente'] },
  { chave: 'zonas_entrega:ver', rotulo: 'Ver zonas de entrega', padrao: ['convidado', 'atendente', 'gerente'] },
  { chave: 'zonas_entrega:gerir', rotulo: 'Gerir zonas de entrega', padrao: ['gerente'] },
  { chave: 'numeros_whatsapp:ver', rotulo: 'Ver numeros de WhatsApp', padrao: ['gerente'] },
  { chave: 'numeros_whatsapp:gerir', rotulo: 'Conectar, pausar e reconectar numeros de WhatsApp', padrao: ['gerente'] },
  { chave: 'pagamentos:ver', rotulo: 'Ver chave Pix e cobrancas', padrao: ['gerente'] },
  { chave: 'pagamentos:gerir', rotulo: 'Gerir chave Pix e cobrancas (criar, conciliar, cancelar)', padrao: ['gerente'] },
  { chave: 'roteirizacao:ver', rotulo: 'Ver configuracao de despacho', padrao: ['atendente', 'gerente'] },
  { chave: 'roteirizacao:operar', rotulo: 'Operar roteirizacao (sugerir, aceitar, reordenar)', padrao: ['atendente', 'gerente'] },
  { chave: 'roteirizacao:gerir', rotulo: 'Configurar despacho e geocodificar enderecos', padrao: ['gerente'] },
] as const satisfies readonly Def<PapelMembro>[]

export type PermissaoConsole = (typeof CONSOLE)[number]['chave']
export type PermissaoLoja = (typeof LOJA)[number]['chave']
export type Permissao = PermissaoConsole | PermissaoLoja

export interface DefinicaoPermissao {
  chave: Permissao
  escopo: EscopoAcesso
  rotulo: string
  ordem: number
  /** Papeis (alem do fixo) com a permissao por padrao. */
  padrao: readonly string[]
}

function montar(escopo: EscopoAcesso, defs: readonly Def<string>[]): DefinicaoPermissao[] {
  return defs.map((d, i) => ({
    chave: d.chave as Permissao,
    escopo,
    rotulo: d.rotulo,
    ordem: (i + 1) * 10,
    padrao: d.padrao,
  }))
}

/** Catalogo completo (console + loja). */
export const CATALOGO: readonly DefinicaoPermissao[] = [...montar('console', CONSOLE), ...montar('loja', LOJA)]

const POR_CHAVE = new Map<string, DefinicaoPermissao>(CATALOGO.map((d) => [d.chave, d]))

export function definicaoDe(chave: string): DefinicaoPermissao | undefined {
  return POR_CHAVE.get(chave)
}

/** Padrao semeado: o papel tem a permissao? (o papel fixo sempre tem). */
export function padraoPermite(escopo: EscopoAcesso, papel: string, chave: string): boolean {
  const d = POR_CHAVE.get(chave)
  if (!d || d.escopo !== escopo) return false
  if (papel === PAPEL_FIXO[escopo]) return true
  return d.padrao.includes(papel)
}
