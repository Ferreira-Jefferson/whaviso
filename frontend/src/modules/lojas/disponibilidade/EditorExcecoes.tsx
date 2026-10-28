// Calendario de excecoes / feriados: datas em que a loja fecha ou muda o horario de atendimento.
// Numa data marcada como fechada o sistema para de aceitar pedido ao vivo; marcada com horario
// especial, usa a faixa informada no lugar do horario normal do dia. Desativar desfaz a excecao
// (nada e apagado). Datas sao de negocio (YYYY-MM-DD, America/Sao_Paulo); o backend decide, a
// tela so edita o cadastro.
import { useState, type ReactNode } from 'react'
import { CalendarOff, CalendarClock, Plus, X } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Badge, Banner, Button, DateInput, EmptyState, Field, Input, cn, useToast } from '@/shared/ui'
import { dataPtBR, hojeIso } from '@/shared/format'
import { useCriarExcecao, useDesativarExcecao, type Excecao } from './api'
import { rotuloFaixa } from './estados'

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export function EditorExcecoes({ itens }: { itens: Excecao[] }) {
  const { mostrarToast } = useToast()
  const criar = useCriarExcecao()
  const desativar = useDesativarExcecao()

  const [abrindo, setAbrindo] = useState(false)
  const [data, setData] = useState('')
  const [fechado, setFechado] = useState(true)
  const [abre, setAbre] = useState('09:00')
  const [fecha, setFecha] = useState('18:00')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const ordenadas = [...itens].sort((a, b) => a.data.localeCompare(b.data))

  function limpar() {
    setAbrindo(false)
    setData('')
    setFechado(true)
    setAbre('09:00')
    setFecha('18:00')
    setMotivo('')
    setErro(null)
  }

  function salvar() {
    setErro(null)
    if (!data) {
      setErro('Escolha a data.')
      return
    }
    if (!fechado && (!HHMM.test(abre) || !HHMM.test(fecha) || abre === fecha)) {
      setErro('Para horário especial, informe abre e fecha diferentes.')
      return
    }
    const motivoLimpo = motivo.trim()
    const corpo = fechado
      ? { data, fechado: true, ...(motivoLimpo ? { motivo: motivoLimpo } : {}) }
      : { data, fechado: false, abre, fecha, ...(motivoLimpo ? { motivo: motivoLimpo } : {}) }
    criar.mutate(corpo, {
      onSuccess: () => {
        mostrarToast('Exceção adicionada.', { tom: 'sucesso' })
        limpar()
      },
      onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível adicionar a exceção.'),
    })
  }

  function remover(ex: Excecao) {
    desativar.mutate(
      { id: ex.id },
      { onError: (e) => mostrarToast(e instanceof ApiError ? e.message : 'Não foi possível desativar a exceção.', { tom: 'erro' }) },
    )
  }

  const idOcupado = desativar.isPending ? (desativar.variables?.id ?? null) : null

  return (
    <div className="flex flex-col gap-4">
      {!abrindo && (
        <Button type="button" variante="secondary" onClick={() => setAbrindo(true)} className="self-start">
          <Plus strokeWidth={1.75} className="size-4" />
          Nova exceção
        </Button>
      )}

      {abrindo && (
        <div className="flex flex-col gap-4 rounded-card border border-linha bg-cartao p-4 sm:p-5">
          <Field label="Data">
            <DateInput value={data} min={hojeIso()} onChange={(e) => setData(e.target.value)} aria-label="Data da exceção" />
          </Field>

          <div className="flex flex-col gap-2 sm:flex-row sm:gap-2.5">
            <SegBotao ativo={fechado} onClick={() => setFechado(true)} icone={<CalendarOff className="size-4" strokeWidth={1.75} aria-hidden />}>
              Fechado o dia todo
            </SegBotao>
            <SegBotao ativo={!fechado} onClick={() => setFechado(false)} icone={<CalendarClock className="size-4" strokeWidth={1.75} aria-hidden />}>
              Horário especial
            </SegBotao>
          </div>

          {!fechado && (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <Field label="Abre às">
                <Input
                  type="time"
                  value={abre}
                  onChange={(e) => setAbre(e.target.value)}
                  className="min-h-11 px-2.5 tabular-nums [color-scheme:light]"
                />
              </Field>
              <Field label="Fecha às">
                <Input
                  type="time"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="min-h-11 px-2.5 tabular-nums [color-scheme:light]"
                />
              </Field>
            </div>
          )}

          <Field label="Motivo " dica="Aparece só para a sua equipe, nunca para o cliente.">
            <Input
              value={motivo}
              maxLength={200}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: feriado, inventário, confraternização"
            />
          </Field>

          {erro && <Banner tom="erro">{erro}</Banner>}

          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button type="button" loading={criar.isPending} onClick={salvar} className="sm:w-auto">
              Adicionar exceção
            </Button>
            <Button type="button" variante="secondary" disabled={criar.isPending} onClick={limpar} className="sm:w-auto">
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {ordenadas.length === 0 ? (
        <EmptyState
          icone={<CalendarOff className="size-7" aria-hidden />}
          titulo="Nenhuma exceção marcada"
          descricao="Marque um feriado ou uma data com horário diferente e a loja respeita isso sozinha no dia."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-linha rounded-card border border-linha bg-cartao">
          {ordenadas.map((ex) => (
            <li key={ex.id} className={cn('flex items-center gap-3 p-3', !ex.ativo && 'opacity-60')}>
              <span className={cn('flex size-9 flex-none items-center justify-center rounded-full', ex.fechado ? 'bg-barro/10 text-barro' : 'bg-salvia-claro text-salvia')}>
                {ex.fechado ? <CalendarOff className="size-4" strokeWidth={1.75} aria-hidden /> : <CalendarClock className="size-4" strokeWidth={1.75} aria-hidden />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-tinta">{dataPtBR(ex.data)}</p>
                <p className="truncate text-sm text-tinta-2 tabular-nums">
                  {ex.fechado ? 'Fechado o dia todo' : `Aberto ${rotuloFaixa(ex.abre ?? '', ex.fecha ?? '')}`}
                  {ex.motivo ? ` · ${ex.motivo}` : ''}
                </p>
              </div>
              {!ex.ativo ? (
                <Badge tom="neutro">Desativada</Badge>
              ) : (
                <Button
                  type="button"
                  variante="ghost"
                  loading={idOcupado === ex.id}
                  aria-label={`Desativar exceção de ${dataPtBR(ex.data)}`}
                  onClick={() => remover(ex)}
                  className="min-h-11 flex-none px-2"
                >
                  <X strokeWidth={1.75} className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
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
        'inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-input border px-3 text-sm font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia',
        ativo ? 'border-salvia bg-salvia-claro text-salvia' : 'border-linha bg-cartao text-tinta-2 hover:bg-papel-2',
      )}
    >
      {icone}
      {children}
    </button>
  )
}
