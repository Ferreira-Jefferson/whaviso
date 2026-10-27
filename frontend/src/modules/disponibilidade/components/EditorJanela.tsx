// Editor da janela do atendente do WhatsApp: em quais dias e em que faixa de horario o
// atendente pode responder. Fora dela o atendente fica em silencio. Um unico registro por loja:
// salvar substitui (PUT). Horas locais (America/Sao_Paulo); o backend decide, a tela so edita.
import { useEffect, useState } from 'react'
import { ApiError } from '@/shared/api_client'
import { Badge, Banner, Button, Field, cn, useToast } from '@/shared/ui'
import { useDefinirJanela, type Janela } from '../api'
import { DIAS_CURTOS, DIAS_SEMANA, ORDEM_DIAS } from '../estados'

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const PADRAO = { inicio: '08:00', fim: '22:00', dias: [1, 2, 3, 4, 5, 6] as number[], ativo: true }

export function EditorJanela({ janela }: { janela: Janela | null }) {
  const { mostrarToast } = useToast()
  const definir = useDefinirJanela()

  const inicial = janela
    ? { inicio: janela.inicio, fim: janela.fim, dias: [...janela.dias], ativo: janela.ativo }
    : PADRAO
  const [inicio, setInicio] = useState(inicial.inicio)
  const [fim, setFim] = useState(inicial.fim)
  const [dias, setDias] = useState<number[]>(inicial.dias)
  const [ativo, setAtivo] = useState(inicial.ativo)
  const [erro, setErro] = useState<string | null>(null)

  // Resseta o formulario quando o servidor devolve uma janela diferente (ex.: apos recarregar).
  useEffect(() => {
    if (!janela) return
    setInicio(janela.inicio)
    setFim(janela.fim)
    setDias([...janela.dias])
    setAtivo(janela.ativo)
  }, [janela])

  function alternarDia(dia: number) {
    setDias((ds) => (ds.includes(dia) ? ds.filter((d) => d !== dia) : [...ds, dia]))
  }

  function salvar() {
    setErro(null)
    if (!HHMM.test(inicio) || !HHMM.test(fim)) {
      setErro('Informe horários válidos (HH:mm).')
      return
    }
    if (inicio === fim) {
      setErro('Início e fim não podem ser iguais.')
      return
    }
    if (dias.length === 0) {
      setErro('Escolha pelo menos um dia.')
      return
    }
    definir.mutate(
      { inicio, fim, dias, ativo },
      {
        onSuccess: () => mostrarToast('Janela do atendente salva.', { tom: 'sucesso' }),
        onError: (e) =>
          setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar a janela do atendente.'),
      },
    )
  }

  return (
    <div className="flex flex-col gap-5 rounded-card border border-linha bg-cartao p-4 sm:p-5">
      <button
        type="button"
        role="switch"
        aria-checked={ativo}
        onClick={() => setAtivo((a) => !a)}
        className="flex min-h-11 items-center justify-between gap-3 rounded-input text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
      >
        <span>
          <span className="block font-medium text-tinta">Atendente ativo</span>
          <span className="block text-sm text-tinta-2">
            {ativo ? 'Responde dentro da janela abaixo.' : 'Não responde em nenhum horário.'}
          </span>
        </span>
        <span
          className={cn(
            'inline-flex h-6 w-11 flex-none items-center rounded-pill p-0.5 transition-colors',
            ativo ? 'bg-salvia' : 'bg-papel-2',
          )}
        >
          <span className={cn('size-5 rounded-full bg-cartao shadow-sm transition-transform', ativo && 'translate-x-5')} />
        </span>
      </button>

      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-medium text-tinta">Dias em que responde</legend>
        <div className="flex flex-wrap gap-1.5">
          {ORDEM_DIAS.map((dia) => {
            const marcado = dias.includes(dia)
            return (
              <button
                key={dia}
                type="button"
                role="switch"
                aria-checked={marcado}
                aria-label={DIAS_SEMANA[dia]}
                onClick={() => alternarDia(dia)}
                className={cn(
                  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-pill border px-3 text-sm font-medium transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia',
                  marcado ? 'border-salvia bg-salvia text-papel' : 'border-linha bg-cartao text-tinta-2 hover:bg-papel-2',
                )}
              >
                {DIAS_CURTOS[dia]}
              </button>
            )
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <Field label="Começa às">
          <input
            type="time"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
            className="min-h-11 w-full rounded-input border border-linha bg-cartao px-2.5 text-sm text-tinta focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
          />
        </Field>
        <Field label="Termina às">
          <input
            type="time"
            value={fim}
            onChange={(e) => setFim(e.target.value)}
            className="min-h-11 w-full rounded-input border border-linha bg-cartao px-2.5 text-sm text-tinta focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
          />
        </Field>
      </div>

      {fim <= inicio && HHMM.test(inicio) && HHMM.test(fim) && (
        <p className="-mt-2 text-xs text-tinta-2">A janela termina no dia seguinte.</p>
      )}

      {erro && <Banner tom="erro">{erro}</Banner>}

      <div className="flex items-center justify-between gap-3">
        {janela ? (
          <Badge tom={janela.ativo ? 'sucesso' : 'neutro'}>
            {janela.ativo ? 'Configurada' : 'Pausada'}
          </Badge>
        ) : (
          <span className="text-sm text-tinta-2">Ainda não configurada.</span>
        )}
        <Button type="button" loading={definir.isPending} onClick={salvar} className="shrink-0">
          Salvar janela
        </Button>
      </div>
    </div>
  )
}
