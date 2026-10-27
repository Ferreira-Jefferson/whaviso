// Escolha de conta por busca de nome (>= 2 letras) para vincular o prospecto. So nome e situacao.
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Badge, Input, Skeleton } from '@/shared/ui'
import { useBuscaContas } from '../api'

const ROTULO_SITUACAO = {
  trial: 'Em teste',
  ativa: 'Ativa',
  suspensa: 'Suspensa',
  cancelada: 'Cancelada',
  sem_assinatura: 'Sem assinatura',
} as const

export interface ContaEscolhida {
  id: string
  nome: string
}

function useDebounce<T>(valor: T, ms: number): T {
  const [atual, setAtual] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setAtual(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return atual
}

export function SeletorConta({
  escolhida,
  onEscolher,
}: {
  escolhida: ContaEscolhida | null
  onEscolher: (c: ContaEscolhida | null) => void
}) {
  const [texto, setTexto] = useState('')
  const busca = useBuscaContas(useDebounce(texto, 300))
  const itens = busca.data?.itens ?? []

  if (escolhida) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-input border border-linha bg-cartao px-3 py-2.5 text-sm">
        <span className="min-w-0 truncate font-medium">{escolhida.nome}</span>
        <button
          type="button"
          onClick={() => onEscolher(null)}
          aria-label="Trocar conta"
          className="rounded-pill p-1 text-tinta-2 hover:bg-papel-2 focus-visible:outline-2 focus-visible:outline-salvia"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar conta pelo nome do restaurante"
        aria-label="Buscar conta"
        maxLength={80}
        autoComplete="off"
      />
      {busca.isFetching && <Skeleton className="h-10 w-full" />}
      {!busca.isFetching && texto.trim().length >= 2 && itens.length === 0 && (
        <p className="text-xs text-tinta-2">Nenhuma conta com esse nome.</p>
      )}
      {itens.length > 0 && (
        <ul className="flex flex-col divide-y divide-linha rounded-input border border-linha">
          {itens.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onEscolher({ id: c.id, nome: c.nome })}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-papel-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-salvia"
              >
                <span className="min-w-0 truncate">{c.nome}</span>
                <Badge tom={c.situacao === 'ativa' ? 'sucesso' : 'neutro'}>{ROTULO_SITUACAO[c.situacao]}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
