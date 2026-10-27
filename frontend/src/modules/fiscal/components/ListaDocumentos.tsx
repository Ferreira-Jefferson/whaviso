// Documentos fiscais da loja: status, chave de acesso, link do documento e nova tentativa para os
// que deram erro. O erro mostrado e a mensagem curta que o servidor ja saneou ("emissor: <codigo>").
import { useState } from 'react'
import { ExternalLink, FileText, RotateCcw } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  MoneyText,
  SegmentedControl,
  Skeleton,
  TableResponsive,
  useToast,
  type ColunaTabela,
} from '@/shared/ui'
import { formatarDataHora } from '@/shared/format'
import type { DocumentoFiscalDto, StatusDocumentoFiscal } from '@/shared/contracts/_generated/fiscal'
import { useDocumentosFiscais, useEmitirDocumento } from '../api'
import { ROTULO_STATUS, ROTULO_TIPO, TOM_STATUS, linkSeguro } from '../estados'

type Filtro = StatusDocumentoFiscal | 'todos'

const OPCOES = [
  { value: 'todos', label: 'Todos' },
  { value: 'emitido', label: ROTULO_STATUS.emitido },
  { value: 'pendente', label: ROTULO_STATUS.pendente },
  { value: 'erro', label: ROTULO_STATUS.erro },
] as const

export function ListaDocumentos() {
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const consulta = useDocumentosFiscais(filtro === 'todos' ? null : filtro)
  const emitir = useEmitirDocumento()
  const { mostrarToast } = useToast()
  const lista = consulta.data ?? []

  async function tentarDeNovo(d: DocumentoFiscalDto) {
    try {
      await emitir.mutateAsync({ pedido_id: d.pedido_id, tipo: d.tipo })
      mostrarToast('Nova tentativa de emissão enviada.', { tom: 'sucesso' })
    } catch (e) {
      mostrarToast(e instanceof ApiError ? e.message : 'Não foi possível tentar de novo.', { tom: 'erro' })
    }
  }

  const colunas: ColunaTabela<DocumentoFiscalDto>[] = [
    {
      chave: 'pedido',
      titulo: 'Pedido',
      principal: true,
      render: (d) => (
        <span className="font-medium text-tinta">
          {d.pedido_codigo} · {ROTULO_TIPO[d.tipo]}
        </span>
      ),
    },
    {
      chave: 'status',
      titulo: 'Status',
      ocultarRotuloMobile: true,
      render: (d) => <Badge tom={TOM_STATUS[d.status]}>{ROTULO_STATUS[d.status]}</Badge>,
    },
    { chave: 'valor', titulo: 'Valor', alinhar: 'direita', render: (d) => <MoneyText centavos={d.valor_total_centavos} /> },
    {
      chave: 'chave',
      titulo: 'Chave de acesso',
      render: (d) =>
        d.chave ? <span className="tabular break-all text-xs">{d.chave}</span> : <span className="text-tinta-2">-</span>,
    },
    {
      chave: 'quando',
      titulo: 'Data',
      render: (d) => formatarDataHora(d.emitido_em ?? d.criado_em),
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      ocultarRotuloMobile: true,
      alinhar: 'direita',
      render: (d) => {
        const link = linkSeguro(d.link)
        return (
          <div className="flex flex-col items-end gap-2">
            {d.status === 'erro' && d.erro && <span className="text-xs text-barro">{d.erro}</span>}
            <div className="flex flex-wrap justify-end gap-2">
              {link && (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-pill border border-linha bg-cartao px-4 text-sm font-medium text-tinta hover:bg-papel-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia"
                >
                  <ExternalLink strokeWidth={1.75} className="size-4" aria-hidden />
                  Abrir documento
                </a>
              )}
              {d.status === 'erro' && (
                <Button variante="secondary" loading={emitir.isPending} onClick={() => void tentarDeNovo(d)}>
                  <RotateCcw strokeWidth={1.75} className="size-4" aria-hidden />
                  Tentar de novo
                </Button>
              )}
            </div>
          </div>
        )
      },
    },
  ]

  return (
    <div className="animate-rise">
      <div className="mb-4">
        <SegmentedControl ariaLabel="Status do documento" value={filtro} onChange={setFiltro} options={OPCOES} />
      </div>
      {consulta.isPending && (
        <div aria-busy="true" aria-label="Carregando documentos" className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {consulta.isError && <ErrorState aoTentarDeNovo={() => void consulta.refetch()} />}
      {consulta.isSuccess && lista.length === 0 && (
        <EmptyState
          icone={<FileText className="size-7" aria-hidden />}
          titulo="Nenhum documento fiscal"
          descricao="As notas pedidas para os pedidos aparecem aqui, com status, chave e link."
        />
      )}
      {consulta.isSuccess && lista.length > 0 && (
        <TableResponsive legenda="Documentos fiscais" colunas={colunas} linhas={lista} chaveLinha={(d) => d.id} />
      )}
    </div>
  )
}
