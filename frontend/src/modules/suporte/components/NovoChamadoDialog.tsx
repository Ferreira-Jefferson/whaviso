// Dialog para a loja abrir um chamado de suporte: assunto + a primeira mensagem. Validacao espelha
// o contrato (NovoChamado): assunto 1..160, mensagem 1..4000. Erro inline do envelope {error}.
import { useEffect, useState } from 'react'
import { Button, Dialog, Field, Input, Banner } from '@/shared/ui'

const ASSUNTO_MAX = 160
const MENSAGEM_MAX = 4000

interface Props {
  aberto: boolean
  carregando: boolean
  erro: string | null
  onConfirmar: (dados: { assunto: string; mensagem: string }) => void
  onFechar: () => void
}

export function NovoChamadoDialog({ aberto, carregando, erro, onConfirmar, onFechar }: Props) {
  const [assunto, setAssunto] = useState('')
  const [mensagem, setMensagem] = useState('')

  // Limpa os campos ao abrir (dialog reaproveitado).
  useEffect(() => {
    if (aberto) {
      setAssunto('')
      setMensagem('')
    }
  }, [aberto])

  const assuntoLimpo = assunto.trim()
  const mensagemLimpa = mensagem.trim()
  const podeEnviar =
    assuntoLimpo.length > 0 &&
    assuntoLimpo.length <= ASSUNTO_MAX &&
    mensagemLimpa.length > 0 &&
    mensagemLimpa.length <= MENSAGEM_MAX &&
    !carregando

  function confirmar() {
    if (!podeEnviar) return
    onConfirmar({ assunto: assuntoLimpo, mensagem: mensagemLimpa })
  }

  return (
    <Dialog
      aberto={aberto}
      onFechar={onFechar}
      titulo="Abrir chamado"
      acoes={
        <>
          <Button variante="primary" loading={carregando} disabled={!podeEnviar} onClick={confirmar}>
            Abrir chamado
          </Button>
          <Button variante="secondary" disabled={carregando} onClick={onFechar}>
            Cancelar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p>Conte o que está acontecendo. A equipe Whaviso responde por aqui.</p>

        {erro && <Banner tom="erro">{erro}</Banner>}

        <Field label="Assunto">
          <Input
            value={assunto}
            onChange={(e) => setAssunto(e.target.value.slice(0, ASSUNTO_MAX))}
            placeholder="Ex.: Número de WhatsApp parou de enviar"
            maxLength={ASSUNTO_MAX}
            aria-label="Assunto do chamado"
          />
        </Field>

        <Field label="Mensagem">
          <textarea
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value.slice(0, MENSAGEM_MAX))}
            rows={5}
            maxLength={MENSAGEM_MAX}
            placeholder="Descreva o problema com detalhes."
            aria-label="Mensagem do chamado"
            className="min-h-28 w-full resize-y rounded-input border border-linha bg-cartao px-3 py-2.5 text-sm text-tinta placeholder:text-tinta-2/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
          />
        </Field>
      </div>
    </Dialog>
  )
}
