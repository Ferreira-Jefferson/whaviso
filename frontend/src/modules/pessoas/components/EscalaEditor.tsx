// Editor da escala de uma pessoa: dias da semana + horarios (hora de parede da loja,
// America/Sao_Paulo). Cada linha e um dia com entrada/saida; da para editar os horarios,
// remover uma linha e adicionar novas. As escalas vem do detalhe da pessoa (ja carregado
// pelo dialog). Datas/horarios de negocio nunca sao calculados no cliente: so exibidos.
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Button, Field, Input, Select, useToast, type SelectOption } from '@/shared/ui'
import {
  useAtualizarEscala,
  useCriarEscala,
  useDesativarEscala,
  type Escala,
} from '../api'

/** 0 = domingo ... 6 = sabado (convencao do backend, mesmo getDay do JS). */
const DIAS: ReadonlyArray<{ valor: number; nome: string; curto: string }> = [
  { valor: 0, nome: 'Domingo', curto: 'Dom' },
  { valor: 1, nome: 'Segunda-feira', curto: 'Seg' },
  { valor: 2, nome: 'Terça-feira', curto: 'Ter' },
  { valor: 3, nome: 'Quarta-feira', curto: 'Qua' },
  { valor: 4, nome: 'Quinta-feira', curto: 'Qui' },
  { valor: 5, nome: 'Sexta-feira', curto: 'Sex' },
  { valor: 6, nome: 'Sábado', curto: 'Sáb' },
]

const OPCOES_DIA: ReadonlyArray<SelectOption<string>> = DIAS.map((d) => ({
  value: String(d.valor),
  label: d.nome,
}))

function nomeDia(valor: number): string {
  return DIAS.find((d) => d.valor === valor)?.nome ?? '?'
}

function mensagem(e: unknown, padrao: string): string {
  return e instanceof ApiError ? e.message : padrao
}

export function EscalaEditor({ pessoaId, escalas }: { pessoaId: string; escalas: ReadonlyArray<Escala> }) {
  const ativas = [...escalas]
    .filter((e) => e.ativo)
    .sort((a, b) => a.dia_semana - b.dia_semana || a.entrada.localeCompare(b.entrada))

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-medium text-tinta">Escala</h3>
        <p className="text-xs text-tinta-2">Dias e horários de trabalho (horário da loja).</p>
      </div>

      {ativas.length === 0 ? (
        <p className="rounded-input border border-dashed border-linha bg-papel-2 px-3 py-4 text-center text-sm text-tinta-2">
          Sem escala definida. Adicione os dias e horários abaixo.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {ativas.map((e) => (
            <LinhaEscala key={e.id} escala={e} />
          ))}
        </ul>
      )}

      <AdicionarLinha pessoaId={pessoaId} />
    </section>
  )
}

/** Uma linha de escala existente: dia (fixo) + horarios editaveis + remover. */
function LinhaEscala({ escala }: { escala: Escala }) {
  const [entrada, setEntrada] = useState(escala.entrada)
  const [saida, setSaida] = useState(escala.saida)
  const [erro, setErro] = useState<string | null>(null)
  const atualizar = useAtualizarEscala()
  const remover = useDesativarEscala()
  const { mostrarToast } = useToast()

  const sujo = entrada !== escala.entrada || saida !== escala.saida

  const salvar = () => {
    if (!entrada || !saida) {
      setErro('Informe entrada e saída.')
      return
    }
    if (entrada === saida) {
      setErro('Entrada e saída não podem ser iguais.')
      return
    }
    setErro(null)
    atualizar.mutate(
      { id: escala.id, patch: { entrada, saida } },
      {
        onSuccess: () => mostrarToast('Horário atualizado.', { tom: 'sucesso' }),
        onError: (e) => setErro(mensagem(e, 'Não foi possível salvar.')),
      },
    )
  }

  const dia = nomeDia(escala.dia_semana)

  return (
    <li className="flex flex-col gap-2 rounded-input border border-linha bg-papel-2 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-tinta">{dia}</span>
        <div className="flex items-center gap-1">
          {sujo && (
            <Button variante="ghost" className="min-h-11 px-3" loading={atualizar.isPending} onClick={salvar}>
              Salvar
            </Button>
          )}
          <button
            type="button"
            aria-label={`Remover ${dia}`}
            disabled={remover.isPending}
            onClick={() => remover.mutate({ id: escala.id }, { onError: (e) => setErro(mensagem(e, 'Não foi possível remover.')) })}
            className="inline-flex size-11 flex-none items-center justify-center rounded-input text-tinta-2 hover:bg-barro/10 hover:text-barro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia disabled:opacity-60"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="time"
          aria-label={`Entrada de ${dia}`}
          value={entrada}
          onChange={(ev) => setEntrada(ev.target.value)}
          className="w-32 tabular-nums"
        />
        <span className="text-tinta-2" aria-hidden>
          até
        </span>
        <Input
          type="time"
          aria-label={`Saída de ${dia}`}
          value={saida}
          onChange={(ev) => setSaida(ev.target.value)}
          className="w-32 tabular-nums"
        />
      </div>
      {erro && (
        <p className="text-xs text-barro" role="alert">
          {erro}
        </p>
      )}
    </li>
  )
}

/** Formulario de adicionar um dia a escala. */
function AdicionarLinha({ pessoaId }: { pessoaId: string }) {
  const [dia, setDia] = useState('1')
  const [entrada, setEntrada] = useState('08:00')
  const [saida, setSaida] = useState('18:00')
  const [erro, setErro] = useState<string | null>(null)
  const criar = useCriarEscala()
  const { mostrarToast } = useToast()

  const adicionar = () => {
    if (!entrada || !saida) {
      setErro('Informe entrada e saída.')
      return
    }
    if (entrada === saida) {
      setErro('Entrada e saída não podem ser iguais.')
      return
    }
    setErro(null)
    criar.mutate(
      { pessoaId, body: { dia_semana: Number(dia), entrada, saida } },
      {
        onSuccess: () => mostrarToast('Dia adicionado à escala.', { tom: 'sucesso' }),
        onError: (e) => setErro(mensagem(e, 'Não foi possível adicionar.')),
      },
    )
  }

  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault()
        adicionar()
      }}
      className="flex flex-col gap-3 rounded-input border border-dashed border-linha p-3"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
        <Field label="Dia">
          <Select ariaLabel="Dia da semana" value={dia} onChange={setDia} options={OPCOES_DIA} />
        </Field>
        <Field label="Entrada">
          <Input type="time" value={entrada} onChange={(ev) => setEntrada(ev.target.value)} className="tabular-nums" />
        </Field>
        <Field label="Saída">
          <Input type="time" value={saida} onChange={(ev) => setSaida(ev.target.value)} className="tabular-nums" />
        </Field>
      </div>
      {erro && (
        <p className="text-xs text-barro" role="alert">
          {erro}
        </p>
      )}
      <Button type="submit" variante="secondary" loading={criar.isPending} className="self-start">
        <Plus className="size-4" aria-hidden />
        Adicionar dia
      </Button>
    </form>
  )
}
