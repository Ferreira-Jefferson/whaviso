// Slot de rota: o que cada area mostra ate o FR-* correspondente registrar sua pagina.
import { EmptyState, PageHeader } from '@/shared/ui'
import type { RotaModulo } from '../rotas'

export function PaginaSlot({ rota }: { rota: RotaModulo }) {
  const Icone = rota.icone
  return (
    <>
      <PageHeader titulo={rota.rotulo} descricao={rota.descricao} />
      <EmptyState
        icone={
          <span className="flex size-14 items-center justify-center rounded-2xl bg-salvia-claro">
            <Icone className="size-7" strokeWidth={1.75} aria-hidden />
          </span>
        }
        titulo="Esta área será preenchida por um módulo"
        descricao={`O shell entrega layout, sessão, loja ativa e atualizações ao vivo. O conteúdo desta rota vem do módulo ${rota.caminho}.`}
      />
    </>
  )
}
