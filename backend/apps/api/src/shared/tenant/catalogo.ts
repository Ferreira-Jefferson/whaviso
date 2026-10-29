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
  { chave: 'painel:ver', rotulo: 'Ver painel (necessario para entrar no console)', padrao: ['convidado', 'suporte', 'financeiro', 'operador'] },
  { chave: 'custos_plataforma:ver', rotulo: 'Ver custos da plataforma', padrao: ['financeiro', 'operador'] },
  { chave: 'equipe:gerir', rotulo: 'Gerir equipe da plataforma', padrao: [] },
  { chave: 'chaves_api:gerir', rotulo: 'Gerir chaves de API das contas', padrao: [] },
  { chave: 'acessos:gerir', rotulo: 'Gerir acessos (esta grade)', padrao: [] },
] as const satisfies readonly Def<PapelOperador>[]

const LOJA = [
  { chave: 'conta:gerir', rotulo: 'Conta, membros e assinatura', padrao: [] },
  { chave: 'loja:gerir', rotulo: 'Configuracao da loja (cardapio, zonas, numeros, IA)', padrao: ['gerente'] },
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
