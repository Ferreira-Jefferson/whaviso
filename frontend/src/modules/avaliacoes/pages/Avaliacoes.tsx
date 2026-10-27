// Avaliacoes dos clientes: resumo (media e distribuicao) e lista com filtro por nota.
// Somente leitura. Comentario e texto livre do consumidor (exibido, nunca logado). Rota /avaliacoes.
import { useMemo, useState } from 'react'
import { MessageSquareHeart } from 'lucide-react'
import { formatarDataHora } from '@/shared/format'
import { Button, Card, EmptyState, ErrorState, PageHeader, SegmentedControl, Skeleton } from '@/shared/ui'
import { useAvaliacoes, useResumoAvaliacoes } from '../api'
import { Estrelas } from '../components/Estrelas'
import { ResumoAvaliacoes } from '../components/ResumoAvaliacoes'

type Filtro = 'todas' | '5' | '4' | '3' | '2' | '1'

const OPCOES = [
  { value: 'todas', label: 'Todas' },
  { value: '5', label: '5 ★' },
  { value: '4', label: '4 ★' },
  { value: '3', label: '3 ★' },
  { value: '2', label: '2 ★' },
  { value: '1', label: '1 ★' },
] as const

export default function Avaliacoes() {
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const nota = filtro === 'todas' ? null : Number(filtro)

  const resumo = useResumoAvaliacoes()
  const lista = useAvaliacoes(nota)
  const itens = useMemo(() => lista.data?.pages.flatMap((p) => p.itens) ?? [], [lista.data])

  return (
    <div>
      <PageHeader titulo="Avaliações" descricao="O que os clientes acharam dos pedidos entregues." />

      <div className="flex flex-col gap-5">
        <ResumoAvaliacoes
          resumo={resumo.data}
          carregando={resumo.isPending}
          notaAtiva={nota}
          aoEscolher={(n) => setFiltro(n == null ? 'todas' : (String(n) as Filtro))}
        />
        {resumo.isError && <ErrorState aoTentarDeNovo={() => void resumo.refetch()} />}

        <SegmentedControl ariaLabel="Filtrar por nota" value={filtro} onChange={setFiltro} options={OPCOES} />

        {lista.isPending && (
          <div aria-busy="true" aria-label="Carregando avaliações" className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        )}
        {lista.isError && <ErrorState aoTentarDeNovo={() => void lista.refetch()} />}
        {lista.isSuccess && itens.length === 0 && (
          <EmptyState
            icone={<MessageSquareHeart className="size-7" aria-hidden />}
            titulo={nota ? 'Nenhuma avaliação com esta nota' : 'Ainda sem avaliações'}
            descricao={
              nota
                ? 'Tente outra nota ou veja todas.'
                : 'Quando um cliente avaliar um pedido entregue, a nota e o comentário aparecem aqui.'
            }
          />
        )}
        {lista.isSuccess && itens.length > 0 && (
          <>
            <ul className="flex flex-col gap-3" aria-label="Avaliações">
              {itens.map((a) => {
                const inicial = (a.cliente_nome?.trim()?.[0] ?? '?').toUpperCase()
                return (
                  <li key={a.id}>
                    <Card className="flex flex-col gap-3">
                      <div className="flex items-start gap-3">
                        <span
                          aria-hidden
                          className="flex size-9 flex-none items-center justify-center rounded-pill bg-salvia-claro text-sm font-semibold text-salvia"
                        >
                          {inicial}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                            <p className="text-sm text-tinta">
                              <span className="font-medium">{a.cliente_nome ?? 'Cliente sem nome'}</span>
                              <span className="text-tinta-2"> · pedido #{a.pedido_codigo}</span>
                            </p>
                            <span className="text-xs tabular-nums text-tinta-2">{formatarDataHora(a.criado_em)}</span>
                          </div>
                          <Estrelas nota={a.nota} className="mt-1" />
                        </div>
                      </div>
                      {a.comentario ? (
                        <p className="whitespace-pre-line break-words border-l-2 border-linha pl-3 text-sm text-tinta">
                          {a.comentario}
                        </p>
                      ) : (
                        <p className="text-sm italic text-tinta-2">Sem comentário.</p>
                      )}
                    </Card>
                  </li>
                )
              })}
            </ul>
            {lista.hasNextPage && (
              <div className="flex justify-center">
                <Button variante="secondary" loading={lista.isFetchingNextPage} onClick={() => void lista.fetchNextPage()}>
                  Ver mais
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
