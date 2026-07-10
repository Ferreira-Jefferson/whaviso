// Situação REAL de uma versão de template, do ponto de vista do owner. O backend
// guarda só o veredito da Meta em `status_meta` (pendente/aprovado/rejeitado); a
// distinção entre "ainda não enviei à Meta" e "já enviei, está em análise" vem de
// `meta_submetido_em` (null = nunca submetido). Esta função pura é a ÚNICA fonte
// dessa derivação, reusada pelo badge do detalhe, pela lista e pela trilha do
// ciclo, para que as três telas nunca discordem. Não fala com a Meta nem liga
// status_meta na mão (a Meta é quem decide o veredito).
import type { Template } from '@/shared/contracts'

export type SituacaoTemplate = 'rascunho' | 'em_analise' | 'aprovado' | 'rejeitado'

export function situacaoTemplate(
  t: Pick<Template, 'status_meta' | 'meta_submetido_em'>,
): SituacaoTemplate {
  if (t.status_meta === 'aprovado') return 'aprovado'
  if (t.status_meta === 'rejeitado') return 'rejeitado'
  // pendente: rascunho se nunca submetido; em análise se já foi à Meta.
  return t.meta_submetido_em ? 'em_analise' : 'rascunho'
}

// Rótulo pt-BR de cada situação (Regras de Ouro: linguagem calma, sem alarme).
// Fonte única dos textos; as telas escolhem só as cores conforme seu contexto.
export const ROTULO_SITUACAO: Record<SituacaoTemplate, string> = {
  rascunho: 'Não enviado à Meta',
  em_analise: 'Em análise na Meta',
  aprovado: 'Aprovado na Meta',
  rejeitado: 'Recusado pela Meta',
}
