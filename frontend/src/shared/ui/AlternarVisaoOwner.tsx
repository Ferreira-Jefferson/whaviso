// Toggle exclusivo do owner para alternar a dashboard entre a "Visão geral"
// (métricas do sistema, /admin) e "Meus combinados" (o painel pessoal dele,
// /app, igual ao que um user comum vê). O owner usa a própria conta, não
// impersona ninguém: o toggle é só navegação entre as duas rotas. Para quem
// não é owner, o componente não renderiza nada.
import { useNavigate } from 'react-router'
import { useRole } from '@/shared/auth'
import { SegmentedControl } from './SegmentedControl'

type Visao = 'geral' | 'meus'

const OPCOES = [
  { value: 'geral' as const, label: 'Visão geral' },
  { value: 'meus' as const, label: 'Meus combinados' },
]

export function AlternarVisaoOwner({ atual }: { atual: Visao }) {
  const role = useRole()
  const navigate = useNavigate()

  if (role !== 'owner') return null

  return (
    <div className="mb-6">
      <SegmentedControl<Visao>
        ariaLabel="Alternar entre a visão geral e os seus combinados"
        value={atual}
        onChange={(v) => navigate(v === 'geral' ? '/admin' : '/app')}
        options={OPCOES}
      />
    </div>
  )
}
