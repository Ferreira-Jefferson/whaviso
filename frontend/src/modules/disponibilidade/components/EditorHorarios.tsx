// Editor dos horarios de funcionamento, uma lista por dia da semana. Cada faixa e uma linha
// persistida no servidor (tem id): editar abre/fecha e PATCH; "Remover" desativa (nada e apagado);
// faixa inativa pode ser reativada. Faixa que cruza a meia-noite tem fecha <= abre (ex.: 18:00 as 02:00).
// Horas sao locais (America/Sao_Paulo); o backend decide, a tela so edita o cadastro.
import { useState } from 'react'
import { Plus, RotateCcw, X } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Badge, Button, Input, cn, useToast } from '@/shared/ui'
import { useAtualizarHorario, useCriarHorario, useDesativarHorario, type Horario } from '../api'
import { DIAS_SEMANA, ORDEM_DIAS, rotuloFaixa } from '../estados'

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

function msgErro(e: unknown, padrao: string): string {
  return e instanceof ApiError ? e.message : padrao
}

export function EditorHorarios({ itens }: { itens: Horario[] }) {
  const { mostrarToast } = useToast()
  const criar = useCriarHorario()
  const atualizar = useAtualizarHorario()
  const desativar = useDesativarHorario()

  // Rascunho de hora em edicao por faixa (id -> {abre, fecha}); fora dele mostramos o valor do servidor.
  const [rascunho, setRascunho] = useState<Record<string, { abre: string; fecha: string }>>({})

  const porDia = (dia: number) =>
    itens
      .filter((h) => h.dia_semana === dia)
      .sort((a, b) => a.abre.localeCompare(b.abre) || a.criado_em.localeCompare(b.criado_em))

  const valorFaixa = (h: Horario) => rascunho[h.id] ?? { abre: h.abre, fecha: h.fecha }

  function editarCampo(h: Horario, campo: 'abre' | 'fecha', v: string) {
    setRascunho((r) => ({ ...r, [h.id]: { ...valorFaixa(h), [campo]: v } }))
  }

  function salvarFaixa(h: Horario) {
    const atual = rascunho[h.id]
    if (!atual) return
    const limpar = () =>
      setRascunho((r) => {
        const resto = { ...r }
        delete resto[h.id]
        return resto
      })
    if (atual.abre === h.abre && atual.fecha === h.fecha) return limpar()
    if (!HHMM.test(atual.abre) || !HHMM.test(atual.fecha)) {
      mostrarToast('Informe um horário válido (HH:mm).', { tom: 'erro' })
      return limpar()
    }
    if (atual.abre === atual.fecha) {
      mostrarToast('Abre e fecha não podem ser iguais.', { tom: 'erro' })
      return limpar()
    }
    atualizar.mutate(
      { id: h.id, body: { abre: atual.abre, fecha: atual.fecha } },
      {
        onError: (e) => mostrarToast(msgErro(e, 'Não foi possível salvar o horário.'), { tom: 'erro' }),
        onSettled: limpar,
      },
    )
  }

  function adicionar(dia: number) {
    criar.mutate(
      { dia_semana: dia, abre: '09:00', fecha: '18:00' },
      { onError: (e) => mostrarToast(msgErro(e, 'Não foi possível adicionar o período.'), { tom: 'erro' }) },
    )
  }

  function remover(h: Horario) {
    desativar.mutate(
      { id: h.id },
      { onError: (e) => mostrarToast(msgErro(e, 'Não foi possível remover o período.'), { tom: 'erro' }) },
    )
  }

  function reativar(h: Horario) {
    atualizar.mutate(
      { id: h.id, body: { ativo: true } },
      { onError: (e) => mostrarToast(msgErro(e, 'Não foi possível reativar o período.'), { tom: 'erro' }) },
    )
  }

  const idOcupado =
    (atualizar.isPending ? atualizar.variables?.id : undefined) ??
    (desativar.isPending ? desativar.variables?.id : undefined) ??
    null

  return (
    <ul className="flex flex-col divide-y divide-linha rounded-card border border-linha bg-cartao">
      {ORDEM_DIAS.map((dia) => {
        const faixas = porDia(dia)
        const ativas = faixas.filter((h) => h.ativo)
        const inativas = faixas.filter((h) => !h.ativo)
        const rotulo = DIAS_SEMANA[dia]
        return (
          <li key={dia} className="flex flex-col gap-2.5 p-3 sm:flex-row sm:items-start sm:gap-4">
            <div className="flex items-center justify-between gap-2 pt-1.5 sm:w-40 sm:shrink-0">
              <span className="font-medium text-tinta">{rotulo}</span>
              {ativas.length === 0 && <Badge tom="neutro">Fechado</Badge>}
            </div>

            <div className="min-w-0 flex-1">
              {ativas.length === 0 && inativas.length === 0 ? (
                <p className="py-2 text-sm text-tinta-2">Sem horário cadastrado.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {ativas.map((h) => {
                    const v = valorFaixa(h)
                    const ocupada = idOcupado === h.id
                    const cruzaMeiaNoite = v.fecha <= v.abre
                    return (
                      <div key={h.id} className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <Input
                            type="time"
                            value={v.abre}
                            disabled={ocupada}
                            onChange={(e) => editarCampo(h, 'abre', e.target.value)}
                            onBlur={() => salvarFaixa(h)}
                            aria-label={`${rotulo}: abre`}
                            className="min-h-11 min-w-0 flex-1 px-2.5 tabular-nums [color-scheme:light] sm:w-32 sm:flex-none"
                          />
                          <span className="shrink-0 text-sm text-tinta-2" aria-hidden>
                            às
                          </span>
                          <Input
                            type="time"
                            value={v.fecha}
                            disabled={ocupada}
                            onChange={(e) => editarCampo(h, 'fecha', e.target.value)}
                            onBlur={() => salvarFaixa(h)}
                            aria-label={`${rotulo}: fecha`}
                            className="min-h-11 min-w-0 flex-1 px-2.5 tabular-nums [color-scheme:light] sm:w-32 sm:flex-none"
                          />
                          <Button
                            type="button"
                            variante="ghost"
                            loading={ocupada && desativar.isPending}
                            aria-label={`Remover período ${rotuloFaixa(h.abre, h.fecha)} de ${rotulo}`}
                            onClick={() => remover(h)}
                            className="min-h-11 shrink-0 px-2"
                          >
                            <X strokeWidth={1.75} className="size-4" />
                          </Button>
                        </div>
                        {cruzaMeiaNoite && (
                          <p className="text-xs text-tinta-2">Termina no dia seguinte.</p>
                        )}
                      </div>
                    )
                  })}

                  {inativas.map((h) => (
                    <div key={h.id} className="flex items-center gap-2 text-sm text-tinta-2">
                      <span className="line-through tabular-nums">{rotuloFaixa(h.abre, h.fecha)}</span>
                      <Button
                        type="button"
                        variante="ghost"
                        loading={idOcupado === h.id && atualizar.isPending}
                        onClick={() => reativar(h)}
                        className="min-h-9 px-2 text-sm"
                      >
                        <RotateCcw strokeWidth={1.75} className="size-4" />
                        Reativar
                      </Button>
                    </div>
                  ))}

                  <Button
                    type="button"
                    variante="ghost"
                    loading={criar.isPending && criar.variables?.dia_semana === dia}
                    onClick={() => adicionar(dia)}
                    className={cn('min-h-9 self-start px-2 text-sm', ativas.length === 0 && inativas.length === 0 && 'mt-0')}
                  >
                    <Plus strokeWidth={1.75} className="size-4" />
                    {ativas.length === 0 ? 'Abrir neste dia' : 'Mais um período'}
                  </Button>
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
