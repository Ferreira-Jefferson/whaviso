// Dialog para a loja CONCEDER um acesso assistido a equipe Whaviso. Deixa claro o que o acesso
// permite (a equipe ver as conversas por tempo limitado) e que da para revogar quando quiser.
// A janela vai por `duracao_horas` (contrato: 1..DURACAO_ACESSO_MAX_HORAS); o motivo e opcional.
import { useEffect, useState } from 'react'
import { Banner, Button, Dialog, Field, Input, Select, type SelectOption } from '@/shared/ui'
import { DURACAO_ACESSO_MAX_HORAS } from '@/shared/contracts/_generated/suporte'

const MOTIVO_MAX = 400

/** Durações oferecidas, todas dentro do limite do contrato (DURACAO_ACESSO_MAX_HORAS). */
const OPCOES_DURACAO: ReadonlyArray<SelectOption<string>> = [
  { value: '1', label: '1 hora' },
  { value: '4', label: '4 horas' },
  { value: '24', label: '1 dia (24 horas)' },
  { value: '72', label: '3 dias (72 horas)' },
  { value: String(DURACAO_ACESSO_MAX_HORAS), label: `7 dias (${DURACAO_ACESSO_MAX_HORAS} horas)` },
]

interface Props {
  aberto: boolean
  carregando: boolean
  erro: string | null
  onConfirmar: (dados: { duracao_horas: number; motivo?: string }) => void
  onFechar: () => void
}

export function ConcederAcessoDialog({ aberto, carregando, erro, onConfirmar, onFechar }: Props) {
  const [duracao, setDuracao] = useState('24')
  const [motivo, setMotivo] = useState('')

  useEffect(() => {
    if (aberto) {
      setDuracao('24')
      setMotivo('')
    }
  }, [aberto])

  const motivoLimpo = motivo.trim()

  function confirmar() {
    if (carregando) return
    onConfirmar({
      duracao_horas: Number(duracao),
      motivo: motivoLimpo.length > 0 ? motivoLimpo : undefined,
    })
  }

  return (
    <Dialog
      aberto={aberto}
      onFechar={onFechar}
      titulo="Conceder acesso à equipe"
      acoes={
        <>
          <Button variante="primary" loading={carregando} onClick={confirmar}>
            Conceder acesso
          </Button>
          <Button variante="secondary" disabled={carregando} onClick={onFechar}>
            Cancelar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Banner tom="info">
          Com este acesso, a equipe Whaviso pode ver as conversas da sua loja (somente leitura) pelo tempo que você
          escolher, para ajudar no suporte. Tudo que a equipe acessa fica registrado, e você pode revogar o acesso
          quando quiser.
        </Banner>

        {erro && <Banner tom="erro">{erro}</Banner>}

        <Field label="Por quanto tempo" dica="O acesso expira sozinho ao fim do período. Você também pode revogar antes.">
          <Select value={duracao} onChange={setDuracao} options={OPCOES_DURACAO} ariaLabel="Duração do acesso" />
        </Field>

        <Field label="Motivo (opcional)" dica="Ajuda a equipe a entender o contexto. Fica visível só para a Whaviso.">
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value.slice(0, MOTIVO_MAX))}
            placeholder="Ex.: estou com problema no atendimento"
            maxLength={MOTIVO_MAX}
            aria-label="Motivo do acesso"
          />
        </Field>
      </div>
    </Dialog>
  )
}
