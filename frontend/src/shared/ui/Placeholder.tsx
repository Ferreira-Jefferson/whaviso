// Página placeholder genérica da Fase 0: "em construção".
// As telas de negócio chegam nas fases 1-7; aqui só comprovamos a navegação.
import { PageHeader } from './PageHeader'
import { Card } from './Card'

export function Placeholder({ titulo, nota }: { titulo: string; nota?: string }) {
  return (
    <div className="animate-rise">
      <PageHeader titulo={titulo} descricao="Em construção (Fase 0: fundação)." />
      <Card>
        <p className="text-sm text-tinta-2">
          {nota ??
            'Esta tela ainda não tem comportamento. A fundação está rodando e a navegação funciona.'}
        </p>
      </Card>
    </div>
  )
}
