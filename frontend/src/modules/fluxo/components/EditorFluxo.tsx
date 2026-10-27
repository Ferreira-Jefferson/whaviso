// Editor estruturado do grafo: lista de etapas com configuracao e destino de cada saida, mais
// salvar rascunho, validar, publicar, ativar e historico de versoes. (Sem canvas: o grafo e dado
// serializavel e o editor em lista cobre todas as operacoes.) A regra de validade e do servidor.
import { useState } from 'react'
import { ArrowLeft, History, Plus } from 'lucide-react'
import {
  Badge,
  Banner,
  Button,
  ConfirmDialog,
  ErrorState,
  PageHeader,
  SegmentedControl,
  Select,
  Skeleton,
  useToast,
} from '@/shared/ui'
import { FLUXO_LIMITES, FLUXO_PADRAO, type FluxoGrafo, type FluxoValidacao } from '@/shared/contracts/_generated/fluxo'
import {
  useAtivarFluxo,
  useFluxo,
  usePublicarFluxo,
  useRestaurarVersao,
  useSalvarRascunho,
  useValidarRascunho,
  type Fluxo,
  type ItemCatalogo,
  type ResumoVersao,
} from '../api'
import { ApiError } from '@/shared/api_client'
import {
  adicionarNode,
  definirConfig,
  definirTransicao,
  grafosIguais,
  removerNode,
  trocarTipo,
} from '../grafo'
import { mensagemErro, rotuloNode } from '../estados'
import { CartaoNode } from './CartaoNode'
import { ConfigNode } from './ConfigNode'
import { DialogVersoes } from './DialogVersoes'
import { PainelValidacao } from './PainelValidacao'
import { FluxoCanvas } from '../canvas/FluxoCanvas'

interface Props {
  fluxoId: string
  catalogo: ItemCatalogo[]
  onVoltar: () => void
}

/** Carrega o fluxo e monta o editor (remonta quando o grafo do servidor muda por restauracao). */
export function EditorFluxo({ fluxoId, catalogo, onVoltar }: Props) {
  const consulta = useFluxo(fluxoId)
  const [recarga, setRecarga] = useState(0)
  if (consulta.isPending) return <Skeleton className="h-48 w-full" />
  if (consulta.isError) return <ErrorState aoTentarDeNovo={() => void consulta.refetch()} />
  return (
    <Corpo
      key={`${fluxoId}:${recarga}`}
      fluxo={consulta.data}
      catalogo={catalogo}
      onVoltar={onVoltar}
      onRecarregar={async () => {
        await consulta.refetch()
        setRecarga((r) => r + 1)
      }}
    />
  )
}

function Corpo({
  fluxo,
  catalogo,
  onVoltar,
  onRecarregar,
}: {
  fluxo: Fluxo
  catalogo: ItemCatalogo[]
  onVoltar: () => void
  onRecarregar: () => Promise<void>
}) {
  const { mostrarToast } = useToast()
  const salvarMut = useSalvarRascunho()
  const validarMut = useValidarRascunho()
  const publicarMut = usePublicarFluxo()
  const ativarMut = useAtivarFluxo()
  const restaurarMut = useRestaurarVersao()

  const origem: FluxoGrafo = fluxo.rascunho?.grafo ?? fluxo.publicada?.grafo ?? FLUXO_PADRAO
  const [grafo, setGrafo] = useState<FluxoGrafo>(origem)
  const [salvo, setSalvo] = useState<FluxoGrafo>(origem)
  const [temRascunho, setTemRascunho] = useState(fluxo.rascunho !== null)
  const [base, setBase] = useState<string | undefined>(fluxo.rascunho?.atualizado_em)
  const [validacao, setValidacao] = useState<FluxoValidacao | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmarPublicar, setConfirmarPublicar] = useState(false)
  const [versoesAberto, setVersoesAberto] = useState(false)
  const [restaurar, setRestaurar] = useState<ResumoVersao | null>(null)
  const [novoTipo, setNovoTipo] = useState(catalogo[0]?.tipo ?? 'saudacao')
  const [vista, setVista] = useState<'mapa' | 'lista'>('mapa')
  const [selecionado, setSelecionado] = useState<string | null>(null)

  const dirty = !grafosIguais(grafo, salvo)
  const ocupado =
    salvarMut.isPending || validarMut.isPending || publicarMut.isPending || ativarMut.isPending || restaurarMut.isPending
  const noLimite = grafo.nodes.length >= FLUXO_LIMITES.nodes

  function editar(fn: (g: FluxoGrafo) => FluxoGrafo) {
    setGrafo(fn)
    setValidacao(null)
    setErro(null)
  }

  /** Salva o grafo local como rascunho (se houver mudanca ou ainda nao existir rascunho). */
  async function persistir(): Promise<boolean> {
    if (!dirty && temRascunho) return true
    try {
      const r = await salvarMut.mutateAsync({ id: fluxo.id, grafo, atualizado_em_base: base })
      setSalvo(grafo)
      setTemRascunho(true)
      setBase(r.rascunho?.atualizado_em)
      return true
    } catch (e) {
      setErro(mensagemErro(e, 'Não foi possível salvar o rascunho.'))
      return false
    }
  }

  async function aoSalvar() {
    setErro(null)
    if (await persistir()) mostrarToast('Rascunho salvo.', { tom: 'sucesso' })
  }

  async function checar(): Promise<FluxoValidacao | null> {
    try {
      const r = await validarMut.mutateAsync({ id: fluxo.id })
      setValidacao(r)
      return r
    } catch (e) {
      setErro(mensagemErro(e, 'Não foi possível validar o fluxo.'))
      return null
    }
  }

  async function aoValidar() {
    setErro(null)
    if (!(await persistir())) return
    await checar()
  }

  async function aoPublicar() {
    setConfirmarPublicar(false)
    setErro(null)
    if (!(await persistir())) return
    try {
      await publicarMut.mutateAsync({ id: fluxo.id })
      setTemRascunho(false)
      setBase(undefined)
      setValidacao(null)
      mostrarToast('Fluxo publicado.', { tom: 'sucesso' })
    } catch (e) {
      setErro(mensagemErro(e, 'Não foi possível publicar o fluxo.'))
      if (e instanceof ApiError && e.code === 'grafo_invalido') await checar()
    }
  }

  async function aoAtivar(ativo: boolean) {
    setErro(null)
    try {
      await ativarMut.mutateAsync({ id: fluxo.id, ativo })
      mostrarToast(ativo ? 'Fluxo ativado: o atendente passa a seguir este fluxo.' : 'Fluxo desativado.', { tom: 'sucesso' })
    } catch (e) {
      setErro(
        e instanceof ApiError && e.status === 409
          ? 'Publique uma versão antes de ativar.'
          : mensagemErro(e, 'Não foi possível alterar o estado do fluxo.'),
      )
    }
  }

  async function aoRestaurar() {
    if (!restaurar) return
    try {
      await restaurarMut.mutateAsync({ id: fluxo.id, versao: restaurar.versao })
      setRestaurar(null)
      setVersoesAberto(false)
      mostrarToast(`Versão ${restaurar.versao} restaurada como rascunho.`, { tom: 'sucesso' })
      await onRecarregar()
    } catch (e) {
      setRestaurar(null)
      setErro(mensagemErro(e, 'Não foi possível restaurar a versão.'))
    }
  }

  const tipos = catalogo.map((c) => ({ value: c.tipo, label: rotuloNode(c.tipo, c.rotulo) }))
  const ativo = fluxo.ativo
  const podePublicar = temRascunho || dirty
  // Erros e avisos num array so (a UI marca a etapa; a validade e do servidor).
  const problemas = (validacao?.erros ?? []).concat(validacao?.avisos ?? [])
  const nodeSel = selecionado ? (grafo.nodes.find((n) => n.id === selecionado) ?? null) : null

  /** Reposiciona um node (arrasto no canvas): vira rascunho, como qualquer alteracao. */
  function moverNode(id: string, x: number, y: number) {
    editar((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, posicao: { x, y } } : n)) }))
  }

  return (
    <div>
      <button
        type="button"
        onClick={onVoltar}
        className="mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-input text-sm font-medium text-salvia hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden /> Todos os fluxos
      </button>
      <PageHeader
        titulo={fluxo.nome}
        descricao={
          fluxo.publicada
            ? `Versão ${fluxo.publicada.versao} publicada${temRascunho || dirty ? ', com alterações em rascunho.' : '.'}`
            : 'Ainda não publicado.'
        }
        acoes={
          <>
            {ativo && <Badge tom="sucesso">Ativo</Badge>}
            {(temRascunho || dirty) && <Badge tom="atencao">{dirty ? 'Alterações não salvas' : 'Rascunho'}</Badge>}
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Button variante="secondary" loading={salvarMut.isPending} disabled={ocupado || !dirty} onClick={() => void aoSalvar()}>
            Salvar rascunho
          </Button>
          <Button variante="secondary" loading={validarMut.isPending} disabled={ocupado} onClick={() => void aoValidar()}>
            Validar
          </Button>
          <Button loading={publicarMut.isPending} disabled={ocupado || !podePublicar} onClick={() => setConfirmarPublicar(true)}>
            Publicar
          </Button>
          {fluxo.publicada && (
            <Button
              variante={ativo ? 'ghost' : 'secondary'}
              loading={ativarMut.isPending}
              disabled={ocupado}
              onClick={() => void aoAtivar(!ativo)}
            >
              {ativo ? 'Desativar' : 'Ativar'}
            </Button>
          )}
          <Button variante="ghost" className="sm:ml-auto" onClick={() => setVersoesAberto(true)}>
            <History className="size-4" aria-hidden /> Versões
          </Button>
        </div>

        {erro && <Banner tom="erro">{erro}</Banner>}
        {validacao && <PainelValidacao resultado={validacao} aoSelecionar={setSelecionado} />}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            value={vista}
            onChange={setVista}
            options={[
              { value: 'mapa', label: 'Mapa do fluxo' },
              { value: 'lista', label: 'Lista de etapas' },
            ]}
            ariaLabel="Como ver o fluxo"
          />
          <span className="text-xs text-tinta-2">
            {grafo.nodes.length === 1 ? '1 etapa' : `${grafo.nodes.length} etapas`}
          </span>
        </div>

        <div className="flex flex-col gap-1.5 rounded-card border border-linha bg-cartao p-4">
          <span className="text-sm font-medium text-tinta">Etapa inicial</span>
          <p className="text-xs text-tinta-2">Por onde a conversa começa quando chega uma mensagem nova.</p>
          <Select
            value={grafo.inicial}
            onChange={(v) => editar((g) => ({ ...g, inicial: v }))}
            options={grafo.nodes.map((n) => ({
              value: n.id,
              label: `${rotuloNode(n.tipo, catalogo.find((c) => c.tipo === n.tipo)?.rotulo)} (${n.id})`,
            }))}
            ariaLabel="Etapa inicial"
            className="mt-1 sm:max-w-sm"
          />
        </div>

        {vista === 'mapa' ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
            <FluxoCanvas
              grafo={grafo}
              catalogo={catalogo}
              problemas={problemas}
              selecionado={selecionado}
              onSelecionar={setSelecionado}
              onMover={moverNode}
              podeEditar
            />
            <div className="rounded-card border border-linha bg-cartao p-4">
              {nodeSel ? (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col">
                    <span className="font-display text-base font-semibold text-tinta">
                      {rotuloNode(nodeSel.tipo, catalogo.find((c) => c.tipo === nodeSel.tipo)?.rotulo)}
                    </span>
                    <span className="font-mono text-xs text-tinta-2">{nodeSel.id}</span>
                  </div>
                  <ConfigNode
                    node={nodeSel}
                    grafo={grafo}
                    catalogo={catalogo}
                    problemas={problemas.filter((p) => p.node_id === nodeSel.id)}
                    podeEditar
                    onTrocarTipo={(tipo) =>
                      editar((g) =>
                        trocarTipo(g, nodeSel.id, tipo, catalogo.find((c) => c.tipo === tipo)?.handles.map((h) => h.id) ?? []),
                      )
                    }
                    onConfig={(c, v) => editar((g) => definirConfig(g, nodeSel.id, c, v))}
                    onTransicao={(h, para) => editar((g) => definirTransicao(g, nodeSel.id, h, para))}
                    onInicial={() => editar((g) => ({ ...g, inicial: nodeSel.id }))}
                    onRemover={() => {
                      editar((g) => removerNode(g, nodeSel.id))
                      setSelecionado(null)
                    }}
                  />
                </div>
              ) : (
                <p className="text-sm text-tinta-2">
                  Toque numa etapa do mapa para configurar o tipo, as mensagens e para onde cada saída leva. Arraste as
                  etapas para reorganizar o desenho.
                </p>
              )}
            </div>
          </div>
        ) : (
          <ol className="flex flex-col gap-2">
            {grafo.nodes.map((n, i) => (
              <CartaoNode
                key={n.id}
                node={n}
                grafo={grafo}
                catalogo={catalogo}
                problemas={problemas.filter((p) => p.node_id === n.id)}
                indice={i + 1}
                podeEditar
                onTrocarTipo={(tipo) =>
                  editar((g) =>
                    trocarTipo(g, n.id, tipo, catalogo.find((c) => c.tipo === tipo)?.handles.map((h) => h.id) ?? []),
                  )
                }
                onConfig={(c, v) => editar((g) => definirConfig(g, n.id, c, v))}
                onTransicao={(h, para) => editar((g) => definirTransicao(g, n.id, h, para))}
                onInicial={() => editar((g) => ({ ...g, inicial: n.id }))}
                onRemover={() => editar((g) => removerNode(g, n.id))}
              />
            ))}
          </ol>
        )}

        <div className="flex flex-col gap-2 rounded-card border border-dashed border-linha bg-cartao p-4 sm:flex-row sm:items-center">
          <Select value={novoTipo} onChange={setNovoTipo} options={tipos} ariaLabel="Tipo da nova etapa" className="sm:w-64" />
          <Button variante="secondary" disabled={noLimite} onClick={() => editar((g) => adicionarNode(g, novoTipo).grafo)}>
            <Plus className="size-4" aria-hidden /> Adicionar etapa
          </Button>
          {noLimite && <span className="text-xs text-tinta-2">Limite de {FLUXO_LIMITES.nodes} etapas atingido.</span>}
        </div>
      </div>

      <ConfirmDialog
        aberto={confirmarPublicar}
        titulo="Publicar este fluxo?"
        textoConfirmar="Publicar"
        carregando={publicarMut.isPending}
        onConfirmar={() => void aoPublicar()}
        onCancelar={() => setConfirmarPublicar(false)}
      >
        O servidor confere o fluxo antes de publicar. A versão publicada anterior fica no histórico. Para o atendente usar,
        o fluxo precisa estar ativo.
      </ConfirmDialog>

      <DialogVersoes
        fluxoId={versoesAberto ? fluxo.id : null}
        restaurando={restaurarMut.isPending}
        onRestaurar={setRestaurar}
        onFechar={() => setVersoesAberto(false)}
      />
      <ConfirmDialog
        aberto={restaurar !== null}
        titulo={`Restaurar a versão ${restaurar?.versao ?? ''}?`}
        textoConfirmar="Restaurar"
        carregando={restaurarMut.isPending}
        onConfirmar={() => void aoRestaurar()}
        onCancelar={() => setRestaurar(null)}
      >
        Ela vira o seu rascunho e substitui o rascunho atual e qualquer alteração não salva. A versão publicada não muda.
      </ConfirmDialog>
    </div>
  )
}
