// Editor dos horarios de funcionamento. Estado controlado pelo formulario; a montagem no
// formato do contrato (Horarios, fuso America/Sao_Paulo) e a validacao de sobreposicao ficam
// no FormularioLoja. Faixa que cruza a meia-noite: fecha < abre (ex.: 18:00 a 02:00).
import { Plus, X } from 'lucide-react'
import { Button, cn } from '@/shared/ui'
import type { DiaForm, FaixaForm, HorariosForm } from '../campos'

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const

export function EditorHorarios({
  valor,
  onChange,
}: {
  valor: HorariosForm
  onChange: (proximo: HorariosForm) => void
}) {
  const atualizarDia = (dia: number, parcial: Partial<DiaForm>) =>
    onChange(valor.map((d, i) => (i === dia ? { ...d, ...parcial } : d)))

  const alternarFechado = (dia: number) => {
    const d = valor[dia]!
    if (d.fechado) {
      atualizarDia(dia, { fechado: false, faixas: d.faixas.length ? d.faixas : [{ abre: '09:00', fecha: '18:00' }] })
    } else {
      atualizarDia(dia, { fechado: true })
    }
  }

  const setFaixa = (dia: number, idx: number, campo: keyof FaixaForm, v: string) =>
    atualizarDia(dia, { faixas: valor[dia]!.faixas.map((f, i) => (i === idx ? { ...f, [campo]: v } : f)) })

  const addFaixa = (dia: number) =>
    atualizarDia(dia, { faixas: [...valor[dia]!.faixas, { abre: '18:00', fecha: '22:00' }] })

  const removerFaixa = (dia: number, idx: number) => {
    const faixas = valor[dia]!.faixas.filter((_, i) => i !== idx)
    atualizarDia(dia, { faixas, fechado: faixas.length === 0 })
  }

  return (
    <ul className="flex flex-col divide-y divide-linha rounded-card border border-linha bg-cartao">
      {DIAS.map((rotulo, dia) => {
        const d = valor[dia]!
        return (
          <li key={rotulo} className="flex flex-col gap-2.5 p-3 sm:flex-row sm:items-start sm:gap-4">
            <button
              type="button"
              role="switch"
              aria-checked={!d.fechado}
              aria-label={`${rotulo}: ${d.fechado ? 'fechado' : 'aberto'}`}
              onClick={() => alternarFechado(dia)}
              className="flex min-h-11 w-full items-center justify-between gap-2 rounded-input px-2 text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia sm:w-40 sm:shrink-0"
            >
              <span className="font-medium text-tinta">{rotulo}</span>
              <span
                className={cn(
                  'inline-flex h-6 w-11 flex-none items-center rounded-pill p-0.5 transition-colors',
                  d.fechado ? 'bg-papel-2' : 'bg-salvia',
                )}
              >
                <span className={cn('size-5 rounded-full bg-cartao shadow-sm transition-transform', !d.fechado && 'translate-x-5')} />
              </span>
            </button>

            <div className="min-w-0 flex-1">
              {d.fechado ? (
                <p className="py-2 text-sm text-tinta-2">Fechado</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {d.faixas.map((f, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="time"
                        value={f.abre}
                        onChange={(e) => setFaixa(dia, idx, 'abre', e.target.value)}
                        aria-label={`${rotulo}: abre (faixa ${idx + 1})`}
                        className="min-h-11 rounded-input border border-linha bg-cartao px-2.5 text-sm text-tinta focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
                      />
                      <span className="text-sm text-tinta-2" aria-hidden>
                        às
                      </span>
                      <input
                        type="time"
                        value={f.fecha}
                        onChange={(e) => setFaixa(dia, idx, 'fecha', e.target.value)}
                        aria-label={`${rotulo}: fecha (faixa ${idx + 1})`}
                        className="min-h-11 rounded-input border border-linha bg-cartao px-2.5 text-sm text-tinta focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
                      />
                      <Button
                        type="button"
                        variante="ghost"
                        aria-label={`Remover faixa ${idx + 1} de ${rotulo}`}
                        onClick={() => removerFaixa(dia, idx)}
                        className="min-h-11 px-2"
                      >
                        <X strokeWidth={1.75} className="size-4" />
                      </Button>
                    </div>
                  ))}
                  {d.faixas.length < 6 && (
                    <Button
                      type="button"
                      variante="ghost"
                      onClick={() => addFaixa(dia)}
                      className="min-h-9 self-start px-2 text-sm"
                    >
                      <Plus strokeWidth={1.75} className="size-4" />
                      Mais um período
                    </Button>
                  )}
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
