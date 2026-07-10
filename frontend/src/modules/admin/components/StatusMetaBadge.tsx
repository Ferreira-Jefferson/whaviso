// Badge do status REAL de um template, do ponto de vista do owner: não enviado à
// Meta / em análise / aprovado / recusado. Deriva de status_meta + meta_submetido_em
// via situacaoTemplate (fonte única). Próprio do admin (StatusBadge do shared é só
// para status de aviso). Cores da paleta editorial. Linguagem das Regras de Ouro.
import type { Template } from '@/shared/contracts'
import { cn } from '@/shared/ui'
import { ROTULO_SITUACAO, situacaoTemplate, type SituacaoTemplate } from '../situacao_template'

const ESTILO: Record<SituacaoTemplate, string> = {
  rascunho: 'bg-papel-2 text-tinta-2',
  em_analise: 'bg-ambar-claro text-ambar',
  aprovado: 'bg-salvia-claro text-folha',
  rejeitado: 'bg-papel-2 text-barro',
}

export function StatusMetaBadge({
  template,
}: {
  template: Pick<Template, 'status_meta' | 'meta_submetido_em'>
}) {
  const situacao = situacaoTemplate(template)
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill px-3 py-1 text-xs font-medium',
        ESTILO[situacao],
      )}
    >
      {ROTULO_SITUACAO[situacao]}
    </span>
  )
}
