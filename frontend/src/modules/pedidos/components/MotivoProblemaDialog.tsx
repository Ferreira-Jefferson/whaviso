import { useState } from 'react'
import { Button, Dialog } from '@/shared/ui'

interface Props {
  codigo: string | null
  carregando: boolean
  erro: string | null
  aoConfirmar: (motivo: string) => void
  aoCancelar: () => void
}

/** Motivo e obrigatorio para marcar problema (regra do servidor e do banco). */
export function MotivoProblemaDialog({ codigo, carregando, erro, aoConfirmar, aoCancelar }: Props) {
  // O conteudo e remontado a cada abertura (key = codigo), entao o texto sempre comeca vazio.
  return (
    <Dialog
      aberto={codigo !== null}
      onFechar={aoCancelar}
      titulo={`Marcar ${codigo ?? ''} como problema`}
    >
      {codigo !== null && (
        <Formulario key={codigo} carregando={carregando} erro={erro} aoConfirmar={aoConfirmar} aoCancelar={aoCancelar} />
      )}
    </Dialog>
  )
}

function Formulario({ carregando, erro, aoConfirmar, aoCancelar }: Omit<Props, 'codigo'>) {
  const [motivo, setMotivo] = useState('')
  const limpo = motivo.trim()
  return (
    <>
      <p>Conte o que aconteceu. O motivo fica visível para quem cuida do pedido.</p>
      <textarea
        aria-label="Motivo do problema"
        value={motivo}
        maxLength={300}
        onChange={(e) => setMotivo(e.target.value)}
        className="mt-3 min-h-21 w-full rounded-input border border-linha bg-papel p-2.5 text-tinta focus-visible:outline-2 focus-visible:outline-salvia"
      />
      {erro && (
        <p role="alert" className="mt-2 text-barro">
          {erro}
        </p>
      )}
      <div className="mt-6 flex flex-col gap-2">
        <Button variante="destructive" loading={carregando} disabled={limpo.length === 0} onClick={() => aoConfirmar(limpo)}>
          Marcar como problema
        </Button>
        <Button variante="secondary" disabled={carregando} onClick={aoCancelar}>
          Voltar
        </Button>
      </div>
    </>
  )
}
