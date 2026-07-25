// /app/notificacoes (H10.10, item 6): página própria que reúne "precisa de você" (H9.2,
// pendências ABERTAS por combinado, movida da Visão geral do Painel) e o histórico
// cronológico completo da central (paginado). O sino do AppShell é só um atalho para cá.
// Marcar como lida é POR ITEM, ao clicar na notificação (que também navega ao contexto);
// abrir esta página nunca marca nada em massa.
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Bell, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, Card, EmptyState, PageHeader, Skeleton, cn } from '@/shared/ui'
import { brl, dataHoraPtBR, dataPtBR } from '@/shared/format'
import type { Pendencia } from '@/shared/contracts'
import {
  useMarcarNotificacaoLida,
  useNotificacoesCentral,
  usePendencias,
  type NotificacaoCentral,
  type TipoNotificacaoCentral,
} from '../api'

const ROTULO_NOTIFICACAO_CENTRAL: Record<TipoNotificacaoCentral, string> = {
  pagamento_informado: 'Informou que pagou um combinado',
  combinado_dado_incorreto: 'Reportou um dado incorreto num combinado',
  recarga: 'Solicitação de créditos enviada pelo WhatsApp',
}

// Mesma decisão de rótulo da H9.2 (Painel), repetida aqui: fronteira do lint proíbe este
// módulo de importar o módulo `painel`.
const ROTULO_PENDENCIA: Record<Pendencia['tipo'], string> = {
  confirmar_pagamento: 'Aguardando sua confirmação',
  aprovar_edicao: 'Edição aguardando aprovação',
}

const PER_PAGE = 20

export default function NotificacoesPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1)

  const pendencias = usePendencias()
  const central = useNotificacoesCentral(page, PER_PAGE)
  const marcarLida = useMarcarNotificacaoLida()

  const itens = central.data?.itens ?? []
  const total = central.data?.total ?? 0
  const totalPaginas = Math.max(1, Math.ceil(total / PER_PAGE))

  function irPara(pagina: number) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (pagina > 1) next.set('page', String(pagina))
        else next.delete('page')
        return next
      },
      { replace: true },
    )
  }

  function abrirItem(item: NotificacaoCentral) {
    if (!item.lida) marcarLida.mutate(item.id)
    if (item.origem === 'cobrador' && item.aviso_id) {
      navigate(`/app/avisos/${item.aviso_id}`)
    } else {
      navigate('/app/creditos')
    }
  }

  return (
    <div className="animate-rise">
      <PageHeader
        titulo="Notificações"
        descricao="O que precisa da sua ação agora e o histórico do que já aconteceu."
      />

      {/* "Precisa de você" (H9.2): combinados que aguardam ação. Só aparece com itens. */}
      {!pendencias.isLoading && (pendencias.data?.total ?? 0) > 0 && (
        <Card className="mb-6 border-revisao/30 bg-revisao-claro">
          <h2 className="mb-3 flex items-center gap-2 text-lg text-revisao">
            <Bell strokeWidth={1.75} className="size-5" />
            Precisa de você
          </h2>
          <ul className="flex flex-col divide-y divide-revisao/15">
            {pendencias.data!.itens.map((p) => (
              <li key={`${p.tipo}:${p.aviso_id}`}>
                <Link
                  to={`/app/avisos/${p.aviso_id}`}
                  className="flex items-center justify-between gap-3 py-3 transition-colors hover:text-revisao"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-tinta">
                      {p.nome_outra_ponta} · {p.motivo}
                    </p>
                    <p className="text-xs text-tinta-2">
                      {ROTULO_PENDENCIA[p.tipo]} · data combinada {dataPtBR(p.data_combinada)}
                    </p>
                  </div>
                  <span className="shrink-0 font-medium tabular-nums text-revisao">
                    {brl(p.valor_centavos)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Histórico completo (H10.10): feed cronológico paginado do que já aconteceu. */}
      <section>
        <h2 className="text-xl text-salvia">Histórico</h2>

        {central.isError ? (
          <EmptyState
            className="mt-4"
            titulo="Não foi possível carregar as notificações"
            descricao="Verifique sua conexão e tente novamente."
          />
        ) : central.isLoading ? (
          <div className="mt-4 flex flex-col gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-card" />
            ))}
          </div>
        ) : itens.length === 0 ? (
          <EmptyState
            className="mt-4"
            icone={<Bell strokeWidth={1.5} className="size-10" />}
            titulo="Nenhuma notificação por aqui ainda"
            descricao="Pagamentos informados, dados incorretos reportados e recargas aparecem aqui."
          />
        ) : (
          <>
            <div className="mt-4 flex flex-col md:rounded-card md:border md:border-linha md:bg-cartao md:p-2">
              {itens.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => abrirItem(item)}
                  className={cn(
                    'flex w-full flex-col gap-0.5 border-b border-linha px-4 py-3 text-left text-sm last:border-0 transition-colors hover:bg-papel',
                    !item.lida && 'bg-salvia-claro/40',
                  )}
                >
                  <span className="text-tinta">{ROTULO_NOTIFICACAO_CENTRAL[item.tipo]}</span>
                  <span className="text-xs text-tinta-2">{dataHoraPtBR(item.criado_em)}</span>
                </button>
              ))}
            </div>

            {totalPaginas > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <Button
                  variante="ghost"
                  disabled={page <= 1}
                  onClick={() => irPara(page - 1)}
                >
                  <ChevronLeft strokeWidth={1.75} className="size-4" />
                  Anterior
                </Button>
                <span className="text-sm text-tinta-2">
                  Página {page} de {totalPaginas}
                </span>
                <Button
                  variante="ghost"
                  disabled={page >= totalPaginas}
                  onClick={() => irPara(page + 1)}
                >
                  Próxima
                  <ChevronRight strokeWidth={1.75} className="size-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
