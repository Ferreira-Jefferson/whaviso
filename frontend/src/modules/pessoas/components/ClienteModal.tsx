// E18 H18.4 / E15 H15.8: modal de detalhe do cliente (resolve a queixa da tela "Pessoa" ser
// burocrática por levar a outra página). Topo: SÓ o número (a identidade é o telefone; o nome
// não é único, varia por combinado, H15.1). Quatro totais e combinados agrupados por nome;
// abrir um combinado navega para o detalhe. Via ModalPortal (robusto contra o containing
// block). O renomear vive em CADA GRUPO de nome (H15.8), escopado aos combinados daquele nome
// onde sou cobrador (servidor resolve o telefone; nunca em rota/log).
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
import { usePerfil } from '@/shared/auth'
import { dataPtBR, telefone as fmtTelefone } from '@/shared/format'
import type { Cliente } from '@/shared/contracts'
import { usePessoaCombinados, usePessoaResumo, useRenomearCliente } from '../api'

export function ClienteModal({ cliente, onFechar }: { cliente: Cliente; onFechar: () => void }) {
  const navigate = useNavigate()
  const perfil = usePerfil()
  const meuId = perfil?.id
  const resumo = usePessoaResumo(cliente.ref_aviso_id)
  const combinados = usePessoaCombinados(cliente.ref_aviso_id)
  const renomear = useRenomearCliente()

  // Edição por GRUPO de nome (H15.8): guarda o nome ATUAL do grupo em edição + o valor digitado.
  const [editGrupo, setEditGrupo] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  async function salvarGrupo(nomeDoGrupo: string) {
    const n = editNome.trim()
    if (!n || n === nomeDoGrupo) {
      setEditGrupo(null)
      return
    }
    setErro(null)
    try {
      await renomear.mutateAsync({
        refAvisoId: cliente.ref_aviso_id,
        telefone: cliente.telefone,
        nome: n,
        nomeAtual: nomeDoGrupo,
      })
      setEditGrupo(null)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível renomear.')
    }
  }

  function abrirCombinado(id: string) {
    onFechar()
    navigate(`/app/avisos/${id}`)
  }

  return (
    <ModalPortal ariaLabel="Detalhe do cliente" onFechar={onFechar} largura="max-w-3xl">
      {/* Cabeçalho: só o número (identidade estável, H15.1) + fechar. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg text-salvia">{fmtTelefone(cliente.telefone)}</h2>
        </div>
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-card" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
            {combinados.data!.grupos.map((grupo) => {
              // Só renomeia grupos em que sou cobrador (H15.8): o renomear reescreve nome_devedor.
              const podeEditar = Boolean(meuId) && grupo.itens.some((a) => a.cobrador_id === meuId)
              const emEdicao = editGrupo === grupo.nome
              return (
              <div key={grupo.nome} className="flex flex-col gap-1.5">
                {emEdicao ? (
                  <div className="flex items-center gap-2">
                    <Input
                      autoFocus
                      value={editNome}
                      onChange={(e) => setEditNome(e.target.value)}
                      maxLength={120}
                      autoComplete="off"
                      aria-label="Nome do grupo"
                      className="flex-1"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void salvarGrupo(grupo.nome)
                        } else if (e.key === 'Escape') {
                          setEditGrupo(null)
                        }
                      }}
                    />
                    <Button
                      variante="ghost"
                      aria-label="Salvar nome"
                      loading={renomear.isPending}
                      onClick={() => void salvarGrupo(grupo.nome)}
                    >
                      <Check strokeWidth={1.75} className="size-4" />
                    </Button>
                    <Button variante="ghost" aria-label="Cancelar" onClick={() => setEditGrupo(null)}>
                      <X strokeWidth={1.75} className="size-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold uppercase tracking-wide text-tinta-2">
                      {grupo.nome}
                    </p>
                    {podeEditar && (
                      <button
                        type="button"
                        aria-label={`Renomear ${grupo.nome}`}
                        onClick={() => {
                          setEditNome(grupo.nome)
                          setEditGrupo(grupo.nome)
                        }}
                        className="rounded-lg p-1 text-tinta-2 transition-colors hover:bg-areia hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
                      >
                        <Pencil strokeWidth={1.75} className="size-3.5" />
                      </button>
                    )}
                  </div>
                )}
                <ul className="flex flex-col divide-y divide-linha rounded-card border border-linha">
                  {grupo.itens.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => abrirCombinado(a.id)}
                        className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-salvia-claro focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-salvia sm:grid-cols-[minmax(0,1fr)_6.5rem_10.5rem_7rem]"
                      >
                        <span className="min-w-0 truncate text-tinta">{a.motivo}</span>
                        <MoneyText centavos={a.valor_centavos} className="tabular text-right text-tinta-2" />
                        <span className="hidden text-center text-xs text-tinta-2 sm:block">
                          {dataPtBR(a.data_combinada)}
                        </span>
                        <span className="justify-self-start">
                          <StatusBadge status={a.status} curto />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              )
            })}
          </div>
        )}
      </div>
    </ModalPortal>
  )
}
