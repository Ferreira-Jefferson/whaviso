// Selo de status do numero de WhatsApp. Primitivo LOCAL do modulo: o StatusBadge de
// @/shared/ui ainda e tipado para StatusAviso (legado da cobranca) e nao cobre StatusNumero.
// Candidato a promover para @/shared/ui quando o StatusBadge for migrado para o dominio novo.
// O significado nunca depende so da cor: sempre leva texto (base no primitivo Badge).
import { Badge } from '@/shared/ui'
import type { StatusNumero } from '@/shared/contracts/_generated/enums'

type Tom = 'neutro' | 'sucesso' | 'atencao'

const CONFIG: Record<StatusNumero, { tom: Tom; rotulo: string }> = {
  conectado: { tom: 'sucesso', rotulo: 'Conectado' },
  pausado: { tom: 'atencao', rotulo: 'Pausado' },
  removido: { tom: 'neutro', rotulo: 'Removido' },
}

export function StatusNumeroBadge({ status }: { status: StatusNumero }) {
  const { tom, rotulo } = CONFIG[status]
  return <Badge tom={tom}>{rotulo}</Badge>
}
