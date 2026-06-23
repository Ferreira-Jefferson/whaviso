// Nota de transparência / opt-out visível (Regra de Ouro: opt-out em toda
// interação). Texto curto e calmo, dentro das Regras de Ouro de linguagem.
import { ShieldCheck } from 'lucide-react'

export function Transparencia() {
  return (
    <p className="flex items-start gap-2 text-xs text-tinta-2">
      <ShieldCheck strokeWidth={1.75} className="mt-0.5 size-4 shrink-0 text-salvia" />
      <span>
        Você receberá avisos automáticos por WhatsApp sobre este combinado. Você pode
        encerrar os avisos a qualquer momento, sem complicação.
      </span>
    </p>
  )
}
