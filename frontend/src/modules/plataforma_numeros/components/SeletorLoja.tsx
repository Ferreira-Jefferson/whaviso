// Seletor de loja alvo (duas etapas): primeiro o operador busca/escolhe uma CONTA (restaurante),
// depois escolhe a LOJA daquela conta. Reusa os endpoints de contas do console por HTTP
// (apiClient, semLoja); modulo nunca importa modulo. Apos escolher, chama `aoSelecionar` com a loja.
import { useEffect, useMemo, useState } from 'react'
import { Search, Store } from 'lucide-react'
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  Input,
  Skeleton,
} from '@/shared/ui'
import { formatarData } from '@/shared/format'
import type {
  PlataformaContaResumo,
  PlataformaLojaResumo,
} from '@/shared/contracts/_generated/plataforma_usuarios'
import { useContas, useFichaConta } from '../api'
import { ROTULO_SITUACAO, TOM_SITUACAO } from '../rotulos'
import { AreaErro } from './AreaErro'

export interface LojaAlvo {
  contaId: string
  contaNome: string
  lojaId: string
  lojaNome: string
}

interface Props {
  aoSelecionar: (alvo: LojaAlvo) => void
}

/** Debounce simples do texto de busca para nao disparar uma requisicao por tecla. */
function useDebounce<T>(valor: T, ms: number): T {
  const [atual, setAtual] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setAtual(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return atual
}

export function SeletorLoja({ aoSelecionar }: Props) {
  const [conta, setConta] = useState<PlataformaContaResumo | null>(null)

  if (conta) {
    return (
      <EscolherLoja
        conta={conta}
        aoVoltar={() => setConta(null)}
        aoSelecionar={(loja) =>
          aoSelecionar({ contaId: conta.id, contaNome: conta.nome, lojaId: loja.id, lojaNome: loja.nome })
        }
      />
    )
  }
  return <EscolherConta aoEscolher={setConta} />
}

function EscolherConta({ aoEscolher }: { aoEscolher: (conta: PlataformaContaResumo) => void }) {
  const [texto, setTexto] = useState('')
  const termo = useDebounce(texto.trim(), 300)
  // O backend exige >= 2 caracteres; abaixo disso a lista fica sem filtro de busca.
  const busca = termo.length >= 2 ? termo : undefined
  const lista = useContas({ busca })

  const itens = useMemo(() => lista.data?.pages.flatMap((p) => p.itens) ?? [], [lista.data])
  const filtrando = busca !== undefined

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-medium text-tinta">1. Escolha a conta (restaurante)</p>
        <p className="mt-0.5 text-xs text-tinta-2">
          Busque pelo nome da conta ou da loja para abrir os números daquela loja.
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tinta-2" aria-hidden />
        <Input
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por nome da conta ou da loja"
          aria-label="Buscar contas"
          maxLength={80}
          className="pl-9"
        />
      </div>
      {texto.trim().length === 1 && <p className="-mt-2 text-xs text-tinta-2">Digite ao menos 2 letras para buscar.</p>}

      {lista.isPending && (
        <div aria-busy="true" aria-label="Carregando contas" className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}
      {lista.isError && <AreaErro erro={lista.error} aoTentarDeNovo={() => void lista.refetch()} />}

      {lista.isSuccess && itens.length === 0 && (
        <EmptyState
          icone={<Store className="size-7" aria-hidden />}
          titulo={filtrando ? 'Nenhuma conta encontrada' : 'Ainda não há contas'}
          descricao={filtrando ? 'Ajuste a busca pelo nome da conta ou da loja.' : 'Quando um restaurante se cadastrar, ele aparece aqui.'}
        />
      )}

      {lista.isSuccess && itens.length > 0 && (
        <>
          <ul className="flex flex-col gap-2">
            {itens.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => aoEscolher(c)}
                  className="flex w-full items-center gap-3 rounded-card border border-linha bg-cartao p-3 text-left transition hover:border-salvia focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia"
                >
                  <Avatar nome={c.nome} forma="quadrado" tamanho="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-tinta">{c.nome}</span>
                    <span className="mt-0.5 block text-xs text-tinta-2">
                      {c.qtd_lojas_ativas} de {c.qtd_lojas} {c.qtd_lojas === 1 ? 'loja ativa' : 'lojas ativas'} · conta desde{' '}
                      {formatarData(c.criado_em)}
                    </span>
                  </span>
                  <Badge tom={TOM_SITUACAO[c.situacao]}>{ROTULO_SITUACAO[c.situacao]}</Badge>
                </button>
              </li>
            ))}
          </ul>
          {lista.hasNextPage && (
            <div className="flex justify-center">
              <Button variante="secondary" loading={lista.isFetchingNextPage} onClick={() => void lista.fetchNextPage()}>
                Carregar mais
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function EscolherLoja({
  conta,
  aoVoltar,
  aoSelecionar,
}: {
  conta: PlataformaContaResumo
  aoVoltar: () => void
  aoSelecionar: (loja: PlataformaLojaResumo) => void
}) {
  const ficha = useFichaConta(conta.id)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-tinta">
            2. Escolha a loja de <span className="text-salvia">{conta.nome}</span>
          </p>
          <p className="mt-0.5 text-xs text-tinta-2">Os números são geridos por loja.</p>
        </div>
        <Button variante="secondary" onClick={aoVoltar}>
          Trocar de conta
        </Button>
      </div>

      {ficha.isPending && (
        <div aria-busy="true" aria-label="Carregando lojas" className="flex flex-col gap-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}
      {ficha.isError && <AreaErro erro={ficha.error} aoTentarDeNovo={() => void ficha.refetch()} />}

      {ficha.isSuccess && ficha.data.lojas.length === 0 && (
        <EmptyState
          icone={<Store className="size-7" aria-hidden />}
          titulo="Esta conta ainda não tem loja"
          descricao="Sem loja cadastrada, não há onde conectar um número."
        />
      )}

      {ficha.isSuccess && ficha.data.lojas.length > 0 && (
        <ul className="flex flex-col gap-2">
          {ficha.data.lojas.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => aoSelecionar(l)}
                className="flex w-full items-center gap-3 rounded-card border border-linha bg-cartao p-3 text-left transition hover:border-salvia focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia"
              >
                <Avatar nome={l.nome} forma="quadrado" tamanho="md" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-tinta">{l.nome}</span>
                    {!l.ativo && <Badge tom="neutro">Desativada pela loja</Badge>}
                  </span>
                  <span className="mt-0.5 block text-xs text-tinta-2">
                    {l.numero ? 'Tem número de WhatsApp' : 'Sem número de WhatsApp'} · código {l.codigo_publico}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
