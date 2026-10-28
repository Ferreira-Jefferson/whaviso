// Detalhe de uma importacao (o pai remonta por `key={id}`, entao o estado local e sempre do job aberto): acompanha a leitura, deixa revisar/editar o rascunho, aprova (o
// servidor devolve o LOTE) e aplica o lote no cardapio. Se a aplicacao falhar no meio, o lote e o
// progresso ficam em memoria e "Tentar de novo" continua de onde parou, sem duplicar o que ja entrou.
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Banner, Button, Card, ConfirmDialog, ErrorState, Skeleton, Badge, useToast } from '@/shared/ui'
import { formatarDataHora } from '@/shared/format'
import {
  RascunhoCardapio,
  type CardapioLote,
} from '@/shared/contracts/_generated/cardapio_importacao'
import { useAprovar, useDescartar, useEditarRascunho, useImportacao } from '../api'
import { aplicarLote, novoProgresso, totalDeItens, type Progresso } from '../aplicarLote'
import { ROTULO_STATUS, TOM_STATUS } from '../estados'
import { RascunhoEditor } from './RascunhoEditor'

type Fase =
  | { tipo: 'editando' }
  | { tipo: 'aplicando'; feitos: number; total: number }
  | { tipo: 'falhou'; feitos: number; total: number; mensagem: string }
  | { tipo: 'concluido'; total: number }

interface Props {
  id: string
  aoDescartar: () => void
}

export function RevisaoImportacao({ id, aoDescartar }: Props) {
  const consulta = useImportacao(id)
  const editar = useEditarRascunho()
  const aprovar = useAprovar()
  const descartar = useDescartar()
  const qc = useQueryClient()
  const { mostrarToast } = useToast()

  const [rascunho, setRascunho] = useState<RascunhoCardapio | null>(null)
  const [sujo, setSujo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [fase, setFase] = useState<Fase>({ tipo: 'editando' })
  const [confirmarDescarte, setConfirmarDescarte] = useState(false)
  const lote = useRef<CardapioLote | null>(null)
  const progresso = useRef<Progresso>(novoProgresso())

  const dados = consulta.data
  const status = dados?.status

  // Carrega o rascunho do servidor quando o job muda ou o rascunho fica pronto (nao sobrescreve edicao).
  useEffect(() => {
    if (status === 'rascunho_pronto' && dados?.rascunho && !sujo) setRascunho(dados.rascunho)
  }, [status, dados?.rascunho, sujo])

  function validar(): RascunhoCardapio | null {
    const r = RascunhoCardapio.safeParse(rascunho)
    if (!r.success) {
      setErro('Há nomes vazios ou longos demais. Cada nome precisa ter de 1 a 80 caracteres.')
      return null
    }
    if (r.data.categorias.every((c) => c.itens.length === 0)) {
      setErro('O rascunho está sem itens. Descarte-o ou envie outro arquivo.')
      return null
    }
    setErro(null)
    return r.data
  }

  async function salvar() {
    const r = validar()
    if (!r) return
    try {
      await editar.mutateAsync({ id, rascunho: r })
      setSujo(false)
      mostrarToast('Edições salvas.', { tom: 'sucesso' })
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar as edições.')
    }
  }

  async function executarLote(l: CardapioLote) {
    const total = totalDeItens(l)
    setFase({ tipo: 'aplicando', feitos: 0, total })
    try {
      await aplicarLote(l, progresso.current, (feitos) => setFase({ tipo: 'aplicando', feitos, total }))
      void qc.invalidateQueries({ queryKey: ['cardapio'] })
      setFase({ tipo: 'concluido', total })
      mostrarToast('Cardápio criado a partir da importação.', { tom: 'sucesso' })
    } catch (e) {
      void qc.invalidateQueries({ queryKey: ['cardapio'] })
      const feitos = [...progresso.current.itens.values()].filter((p) => p.vinculado).length
      setFase({
        tipo: 'falhou',
        feitos,
        total,
        mensagem: e instanceof ApiError ? e.message : 'Não foi possível criar todos os itens.',
      })
    }
  }

  async function aprovarEAplicar() {
    const r = validar()
    if (!r) return
    try {
      if (sujo) {
        await editar.mutateAsync({ id, rascunho: r })
        setSujo(false)
      }
      const aprovada = await aprovar.mutateAsync(id)
      lote.current = aprovada.lote
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível aprovar a importação.')
      return
    }
    await executarLote(lote.current!)
  }

  async function confirmarDescartar() {
    try {
      await descartar.mutateAsync(id)
      mostrarToast('Importação descartada.', { tom: 'sucesso' })
      aoDescartar()
    } catch (e) {
      mostrarToast(e instanceof ApiError ? e.message : 'Não foi possível descartar.', { tom: 'erro' })
    } finally {
      setConfirmarDescarte(false)
    }
  }

  if (consulta.isPending) return <Skeleton className="h-48 w-full" />
  if (consulta.isError || !dados) return <ErrorState aoTentarDeNovo={() => void consulta.refetch()} />

  const ocupado = editar.isPending || aprovar.isPending || fase.tipo === 'aplicando'
  const podeDescartar = status === 'fila' || status === 'rascunho_pronto' || status === 'erro'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg text-salvia">Importação de {formatarDataHora(dados.criado_em)}</h2>
        <Badge tom={TOM_STATUS[dados.status]}>{ROTULO_STATUS[dados.status]}</Badge>
      </div>

      {(status === 'fila' || status === 'processando') && (
        <Card className="flex items-center gap-3 text-sm text-tinta-2" aria-live="polite">
          <Loader2 strokeWidth={1.75} className="size-5 animate-spin text-salvia" aria-hidden />
          {status === 'fila'
            ? 'Seu arquivo está na fila. A leitura começa em instantes.'
            : 'Lendo o cardápio. Isso costuma levar alguns instantes, pode deixar esta tela aberta.'}
        </Card>
      )}

      {status === 'erro' && (
        <Banner tom="erro">
          {dados.erro ?? 'Não foi possível ler este arquivo.'} Descarte e envie outra foto, de preferência bem iluminada
          e sem cortes.
        </Banner>
      )}

      {status === 'descartada' && <p className="text-sm text-tinta-2">Esta importação foi descartada.</p>}
      {status === 'aprovada' && fase.tipo === 'editando' && (
        <p className="text-sm text-tinta-2">
          Esta importação já foi aprovada. Os itens estão no cardápio, onde podem ser ajustados.
        </p>
      )}

      {fase.tipo === 'aplicando' && (
        <Card aria-live="polite">
          <p className="text-sm text-tinta">
            Criando o cardápio: {fase.feitos} de {fase.total} itens. Não feche esta página.
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-pill bg-papel-2">
            <div
              className="h-full rounded-pill bg-salvia transition-[width]"
              style={{ width: `${fase.total === 0 ? 0 : Math.round((fase.feitos / fase.total) * 100)}%` }}
            />
          </div>
        </Card>
      )}
      {fase.tipo === 'falhou' && (
        <Banner tom="erro">
          <p>
            {fase.mensagem} Foram criados {fase.feitos} de {fase.total} itens. Tentar de novo continua de onde parou, sem
            repetir o que já entrou.
          </p>
          <Button className="mt-3" onClick={() => lote.current && void executarLote(lote.current)}>
            Tentar de novo
          </Button>
        </Banner>
      )}
      {fase.tipo === 'concluido' && (
        <Banner tom="sucesso">
          <p className="flex items-center gap-2">
            <CheckCircle2 strokeWidth={1.75} className="size-4" aria-hidden />
            {fase.total === 1 ? '1 item criado' : `${fase.total} itens criados`} no cardápio.
          </p>
        </Banner>
      )}

      {status === 'rascunho_pronto' && rascunho && fase.tipo === 'editando' && (
        <>
          <p className="text-sm text-tinta-2">
            Confira o que foi lido. Campos com o selo Revisar tiveram leitura incerta. Nada entra no cardápio até você
            aprovar.
          </p>
          {erro && <Banner tom="erro">{erro}</Banner>}
          <RascunhoEditor
            rascunho={rascunho}
            desabilitado={ocupado}
            onChange={(r) => {
              setRascunho(r)
              setSujo(true)
            }}
          />
        </>
      )}

      {(fase.tipo === 'editando' || fase.tipo === 'falhou') && (status === 'rascunho_pronto' || podeDescartar) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {podeDescartar && fase.tipo === 'editando' && (
            <Button variante="ghost" disabled={ocupado} onClick={() => setConfirmarDescarte(true)}>
              Descartar
            </Button>
          )}
          {status === 'rascunho_pronto' && rascunho && fase.tipo === 'editando' && (
            <>
              <Button variante="secondary" disabled={!sujo || ocupado} loading={editar.isPending && !aprovar.isPending} onClick={() => void salvar()}>
                Salvar edições
              </Button>
              <Button loading={aprovar.isPending} disabled={ocupado} onClick={() => void aprovarEAplicar()}>
                Aprovar e criar no cardápio
              </Button>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        aberto={confirmarDescarte}
        titulo="Descartar esta importação?"
        textoConfirmar="Descartar"
        variante="destructive"
        carregando={descartar.isPending}
        onConfirmar={() => void confirmarDescartar()}
        onCancelar={() => setConfirmarDescarte(false)}
      >
        O arquivo e o rascunho deixam de existir. Nada será criado no cardápio.
      </ConfirmDialog>
    </div>
  )
}
