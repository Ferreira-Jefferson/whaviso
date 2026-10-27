// Rotulos e tons do modulo conhecimento (so apresentacao).
import type { LucideIcon } from 'lucide-react'
import { BookText, HelpCircle, ScrollText, ShieldCheck } from 'lucide-react'
import type {
  DocumentoOrigem,
  DocumentoStatus,
  DocumentoTipo,
  RagFeedbackStatus,
  RagFeedbackTipo,
} from '@/shared/contracts/_generated/conhecimento'
import { ApiError } from '@/shared/api_client'

export const ROTULO_TIPO: Record<DocumentoTipo, string> = {
  descricao: 'Descrição',
  regra: 'Regra',
  faq: 'Pergunta frequente',
  politica: 'Política',
}

/** Icone por tipo de documento (so apresentacao, ajuda a varrer a lista). */
export const ICONE_TIPO: Record<DocumentoTipo, LucideIcon> = {
  descricao: BookText,
  regra: ScrollText,
  faq: HelpCircle,
  politica: ShieldCheck,
}

export const OPCOES_TIPO = (Object.keys(ROTULO_TIPO) as DocumentoTipo[]).map((value) => ({
  value,
  label: ROTULO_TIPO[value],
}))

export const ROTULO_STATUS: Record<DocumentoStatus, string> = {
  rascunho: 'Rascunho',
  aprovado: 'Aprovado',
  arquivado: 'Arquivado',
}

export const TOM_STATUS: Record<DocumentoStatus, 'atencao' | 'sucesso' | 'neutro'> = {
  rascunho: 'atencao',
  aprovado: 'sucesso',
  arquivado: 'neutro',
}

export const ROTULO_ORIGEM: Record<DocumentoOrigem, string> = {
  manual: 'Escrito por você',
  importado: 'Importado',
  realimentado: 'Veio de uma conversa',
}

export const ROTULO_FEEDBACK_TIPO: Record<RagFeedbackTipo, string> = {
  lacuna: 'Faltou resposta',
  recorrente: 'Pergunta repetida',
  correcao_humana: 'Correção da equipe',
}

export const ROTULO_FEEDBACK_STATUS: Record<RagFeedbackStatus, string> = {
  novo: 'Novo',
  triado: 'Em análise',
  promovido: 'Virou documento',
  descartado: 'Descartado',
}

export const TOM_FEEDBACK: Record<RagFeedbackStatus, 'atencao' | 'marca' | 'sucesso' | 'neutro'> = {
  novo: 'atencao',
  triado: 'marca',
  promovido: 'sucesso',
  descartado: 'neutro',
}

/** Traduz erros da api para uma frase util (a trava de conteudo estavel e a mais comum). */
export function mensagemErro(e: unknown, padrao: string): string {
  if (!(e instanceof ApiError)) return padrao
  if (e.code === 'conteudo_nao_estavel') {
    return 'Este texto parece ter preço, disponibilidade, telefone, Pix ou segredo. A base guarda só conteúdo estável: remova esses dados.'
  }
  if (e.code === 'versao_pendente') return 'Já existe uma nova versão em rascunho deste documento. Edite ou aprove essa.'
  if (e.code === 'documento_invalido') return 'Algum documento esperado não pertence à sua loja.'
  if (e.isForbidden) return 'Você não tem permissão para esta ação.'
  return e.message || padrao
}
