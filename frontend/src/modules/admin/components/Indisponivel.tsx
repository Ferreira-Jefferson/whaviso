// Estado "recurso indisponível": degradação graciosa quando um endpoint admin
// ainda NÃO existe no backend (404). Mostra um aviso informativo, não um erro.
// Reusado pelas páginas de usuários, auditoria de envios e avisos globais.
import { Construction } from 'lucide-react'
import { EmptyState } from '@/shared/ui'

export function Indisponivel({
  titulo = 'Recurso ainda não disponível',
  descricao,
}: {
  titulo?: string
  descricao: string
}) {
  return (
    <EmptyState
      titulo={titulo}
      descricao={descricao}
      icone={<Construction strokeWidth={1.75} className="size-7" />}
    />
  )
}
