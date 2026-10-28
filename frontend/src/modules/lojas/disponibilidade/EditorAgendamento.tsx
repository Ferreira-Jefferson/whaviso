// Editor da janela de agendamento da loja: quando a loja aceita pedido ANTECIPADO, alem do
// horario de atendimento. Tres modos (fonte unica na loja; o atendente nao tem horario proprio):
//  - desligado: so pedido ao vivo, nenhum agendamento;
//  - faixa: aceita agendamento numa faixa propria de dias + horario;
//  - 24h: aceita agendamento a qualquer hora.
// Um unico registro por loja: salvar substitui (PUT). Horas locais (America/Sao_Paulo); o backend
// decide, a tela so edita o cadastro.
import { useEffect, useState, type ReactNode } from 'react'
import { CalendarClock, CalendarOff, Clock } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Badge, Banner, Button, Field, Input, cn, useToast } from '@/shared/ui'
import type { AgendamentoEntrada } from '@/shared/contracts/_generated/disponibilidade'
import { useDefinirAgendamento, type Agendamento } from './api'
import { DIAS_CURTOS, DIAS_SEMANA, ORDEM_DIAS } from './estados'

type Modo = Agendamento['modo']

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const FAIXA_PADRAO = { inicio: '08:00', fim: '22:00', dias: [1, 2, 3, 4, 5, 6] as number[] }

const ROTULO_MODO: Record<Modo, { titulo: string; descricao: string; Icone: typeof Clock }> = {
  desligado: { titulo: 'Desligado', descricao: 'Só pedido ao vivo, sem agendamento.', Icone: CalendarOff },
  faixa: { titulo: 'Faixa própria', descricao: 'Agendamento em dias e horário escolhidos.', Icone: Clock },
  '24h': { titulo: '24 horas', descricao: 'Aceita agendamento a qualquer hora.', Icone: CalendarClock },
}
const ORDEM_MODOS: Modo[] = ['desligado', 'faixa', '24h']

export function EditorAgendamento({ agendamento }: { agendamento: Agendamento }) {
  const { mostrarToast } = useToast()
  const definir = useDefinirAgendamento()

  const [modo, setModo] = useState<Modo>(agendamento.modo)
  const [inicio, setInicio] = useState(agendamento.inicio ?? FAIXA_PADRAO.inicio)
  const [fim, setFim] = useState(agendamento.fim ?? FAIXA_PADRAO.fim)
  const [dias, setDias] = useState<number[]>(agendamento.dias.length ? [...agendamento.dias] : FAIXA_PADRAO.dias)
  const [erro, setErro] = useState<string | null>(null)

  // Resseta o formulario quando o servidor devolve um agendamento diferente (ex.: apos recarregar).
  useEffect(() => {
    setModo(agendamento.modo)
    setInicio(agendamento.inicio ?? FAIXA_PADRAO.inicio)
    setFim(agendamento.fim ?? FAIXA_PADRAO.fim)
    setDias(agendamento.dias.length ? [...agendamento.dias] : FAIXA_PADRAO.dias)
    setErro(null)
  }, [agendamento])

  function alternarDia(dia: number) {
    setDias((ds) => (ds.includes(dia) ? ds.filter((d) => d !== dia) : [...ds, dia]))
  }

  function salvar() {
    setErro(null)
    let corpo: AgendamentoEntrada
    if (modo === 'faixa') {
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
      corpo = { modo: 'faixa', inicio, fim, dias }
    } else {
      corpo = { modo }
    }
    definir.mutate(corpo, {
      onSuccess: () => mostrarToast('Agendamento salvo.', { tom: 'sucesso' }),
      onError: (e) =>
        setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar o agendamento.'),
    })
  }

  return (
    <div className="flex flex-col gap-5 rounded-card border border-linha bg-cartao p-4 sm:p-5">
      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-medium text-tinta">Como a loja aceita agendamento</legend>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-2.5">
          {ORDEM_MODOS.map((m) => {
            const info = ROTULO_MODO[m]
            return (
              <SegBotao key={m} ativo={modo === m} onClick={() => setModo(m)} icone={<info.Icone className="size-4" strokeWidth={1.75} aria-hidden />}>
                <span className="block font-medium">{info.titulo}</span>
                <span className="block text-xs font-normal opacity-80">{info.descricao}</span>
              </SegBotao>
            )
          })}
        </div>
      </fieldset>

      {modo === 'faixa' && (
        <>
          <fieldset className="min-w-0">
            <legend className="mb-2 text-sm font-medium text-tinta">Dias que aceita agendamento</legend>
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
              <Input
                type="time"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
                className="min-h-11 px-2.5 tabular-nums [color-scheme:light]"
              />
            </Field>
            <Field label="Termina às">
              <Input
                type="time"
                value={fim}
                onChange={(e) => setFim(e.target.value)}
                className="min-h-11 px-2.5 tabular-nums [color-scheme:light]"
              />
            </Field>
          </div>

          {fim <= inicio && HHMM.test(inicio) && HHMM.test(fim) && (
            <p className="-mt-2 text-xs text-tinta-2">A janela termina no dia seguinte.</p>
          )}
        </>
      )}

      {erro && <Banner tom="erro">{erro}</Banner>}

      <div className="flex items-center justify-between gap-3">
        <Badge tom={agendamento.modo === 'desligado' ? 'neutro' : 'sucesso'}>
          {ROTULO_MODO[agendamento.modo].titulo}
        </Badge>
        <Button type="button" loading={definir.isPending} onClick={salvar} className="shrink-0">
          Salvar agendamento
        </Button>
      </div>
    </div>
  )
}

function SegBotao({
  ativo,
  onClick,
  icone,
  children,
}: {
  ativo: boolean
  onClick: () => void
  icone: ReactNode
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={cn(
        'flex min-h-11 flex-1 items-center gap-2 rounded-input border px-3 py-2 text-left text-sm transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia',
        ativo ? 'border-salvia bg-salvia-claro text-salvia' : 'border-linha bg-cartao text-tinta-2 hover:bg-papel-2',
      )}
    >
      <span className="flex-none">{icone}</span>
      <span className="min-w-0">{children}</span>
    </button>
  )
}
