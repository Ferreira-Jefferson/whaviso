// E18 H18.4 / E15 H15.8: modal de detalhe do cliente (resolve a queixa da tela "Pessoa" ser
// burocrática por levar a outra página). Mostra o nome editável, os quatro totais e os
// combinados agrupados por nome; abrir um combinado navega para o detalhe. Via ModalPortal
// (robusto contra o containing block). Editar o nome propaga por telefone (servidor).
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowDownLeft, ArrowUpRight, Check, Clock, Pencil, Wallet, X } from 'lucide-react'
import {
  Banner,
  Button,
  EmptyState,
  Input,
  ModalPortal,
  MoneyText,
  Skeleton,
  StatCard,
  StatusBadge,
} from '@/shared/ui'
import { ApiError } from '@/shared/api_client'
import { dataPtBR } from '@/shared/format'
import type { Cliente } from '@/shared/contracts'
import { usePessoaCombinados, usePessoaResumo, useRenomearCliente } from '../api'

export function ClienteModal({ cliente, onFechar }: { cliente: Cliente; onFechar: () => void }) {
  const navigate = useNavigate()
  const resumo = usePessoaResumo(cliente.ref_aviso_id)
  const combinados = usePessoaCombinados(cliente.ref_aviso_id)
  const renomear = useRenomearCliente()

  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(cliente.nome)
  const [erro, setErro] = useState<string | null>(null)

  const nomeAtual = resumo.data ? resumo.data.nome_entrada : cliente.nome

  async function salvarNome() {
    const n = nome.trim()
    if (!n || n === nomeAtual) {
      setEditando(false)
      return
    }
    setErro(null)
    try {
      await renomear.mutateAsync({ refAvisoId: cliente.ref_aviso_id, telefone: cliente.telefone, nome: n })
      setEditando(false)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível renomear.')
    }
  }

  function abrirCombinado(id: string) {
    onFechar()
    navigate(`/app/avisos/${id}`)
  }

  return (
    <ModalPortal ariaLabel="Detalhe do cliente" onFechar={onFechar}>
      {/* Cabeçalho: nome (editável inline) + fechar. */}
      <div className="flex items-start justify-between gap-3">
        {editando ? (
          <div className="flex flex-1 items-center gap-2">
            <Input
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={120}
              autoComplete="off"
              aria-label="Nome do cliente"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void salvarNome()
                } else if (e.key === 'Escape') {
                  setEditando(false)
                }
              }}
            />
            <Button variante="ghost" aria-label="Salvar nome" loading={renomear.isPending} onClick={salvarNome}>
              <Check strokeWidth={1.75} className="size-4" />
            </Button>
            <Button variante="ghost" aria-label="Cancelar" onClick={() => setEditando(false)}>
              <X strokeWidth={1.75} className="size-4" />
            </Button>
          </div>
        ) : (
          <h2 className="flex items-center gap-2 text-lg text-salvia">
            {nomeAtual}
            <button
              type="button"
              aria-label="Renomear cliente"
              onClick={() => {
                setNome(nomeAtual)
                setEditando(true)
              }}
              className="rounded-lg p-1 text-tinta-2 transition-colors hover:bg-areia hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
            >
              <Pencil strokeWidth={1.75} className="size-4" />
            </button>
          </h2>
        )}
        <button
          type="button"
          aria-label="Fechar"
          onClick={onFechar}
          className="rounded-lg p-1 text-tinta-2 transition-colors hover:bg-areia hover:text-tinta"
        >
          <X strokeWidth={1.75} className="size-5" />
        </button>
      </div>

      {erro && <Banner tom="erro">{erro}</Banner>}

      {/* Quatro totais (H15.2). */}
      {resumo.isLoading || !resumo.data ? (
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-card" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            rotulo="A receber"
            centavos={resumo.data.a_receber_centavos}
            tom="ambar"
            icone={<Clock strokeWidth={1.75} className="size-4" />}
          />
          <StatCard
            rotulo="Recebido"
            centavos={resumo.data.recebido_centavos}
            tom="folha"
            icone={<ArrowDownLeft strokeWidth={1.75} className="size-4" />}
          />
          <StatCard
            rotulo="A pagar"
            centavos={resumo.data.a_pagar_centavos}
            tom="salvia"
            icone={<Wallet strokeWidth={1.75} className="size-4" />}
          />
          <StatCard
            rotulo="Pago"
            centavos={resumo.data.pago_centavos}
            tom="neutro"
            icone={<ArrowUpRight strokeWidth={1.75} className="size-4" />}
          />
        </div>
      )}

      {/* Combinados, agrupados por nome (H15.3). */}
      <div>
        <h3 className="mb-2 text-sm font-medium text-tinta">Combinados</h3>
        {combinados.isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-card" />
            ))}
          </div>
        ) : (combinados.data?.total ?? 0) === 0 ? (
          <EmptyState titulo="Nenhum combinado" descricao="Este cliente ainda não tem combinados." />
        ) : (
          <div className="flex flex-col gap-4">
            {combinados.data!.grupos.map((grupo) => (
              <div key={grupo.nome} className="flex flex-col gap-1">
                {combinados.data!.grupos.length > 1 && (
                  <p className="text-xs uppercase tracking-wide text-tinta-2">{grupo.nome}</p>
                )}
                <ul className="flex flex-col divide-y divide-linha rounded-card border border-linha">
                  {grupo.itens.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => abrirCombinado(a.id)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-salvia-claro focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-salvia"
                      >
                        <span className="min-w-0 flex-1 truncate text-tinta">{a.motivo}</span>
                        <MoneyText centavos={a.valor_centavos} className="shrink-0 tabular text-tinta-2" />
                        <span className="hidden shrink-0 text-xs text-tinta-2 sm:inline">
                          {dataPtBR(a.data_combinada)}
                        </span>
                        <StatusBadge status={a.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalPortal>
  )
}
