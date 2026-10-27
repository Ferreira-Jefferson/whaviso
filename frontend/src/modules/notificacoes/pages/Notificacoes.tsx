// /app/notificacoes (H10.10, item 6): página própria que reúne "precisa de você" (H9.2,
// pendências ABERTAS por combinado, movida da Visão geral do Painel) e o histórico
// cronológico completo da central (paginado). O sino do AppShell é só um atalho para cá.
// Marcar como lida é POR ITEM, ao clicar na notificação (que também navega ao contexto);
// abrir esta página nunca marca nada em massa.
import { Link, useNavigate, useSearchParams } from 'react-router'
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { Button, EmptyState, ErrorState, PageHeader, Skeleton, cn } from '@/shared/ui'
import { brl, dataHoraPtBR, dataPtBR } from '@/shared/format'
import type { Pendencia } from '@/shared/contracts'
import {
  useMarcarNotificacaoLida,
  useNotificacoesCentral,
  usePendencias,
  type NotificacaoCentral,
  type TipoNotificacaoCentral,
} from '../api'

// Apresentação de cada tipo da central: rótulo, ícone e tom do "chip" (nunca só cor:
// o rótulo sempre leva o significado). Os tons seguem a semântica do design system,
// pagamento informado = revisão (teal), dado incorreto = atenção (âmbar), recarga de
// créditos = acento dourado da marca.
const CONFIG_NOTIFICACAO: Record<
  TipoNotificacaoCentral,
  { rotulo: string; Icone: LucideIcon; chip: string }
> = {
  pagamento_informado: {
    rotulo: 'Informou que pagou um combinado',
    Icone: CheckCircle2,
    chip: 'bg-revisao-claro text-revisao',
  },
  combinado_dado_incorreto: {
    rotulo: 'Reportou um dado incorreto num combinado',
    Icone: AlertTriangle,
    chip: 'bg-ambar-claro text-ambar',
  },
  recarga: {
    rotulo: 'Solicitação de créditos enviada pelo WhatsApp',
    Icone: Wallet,
    chip: 'bg-papel-2 text-dourado',
  },
}

// Mesma decisão de rótulo da H9.2 (Painel), repetida aqui: fronteira do lint proíbe este
// módulo de importar o módulo `painel`. Chip em branco sobre o cartão teal do bloco.
const CONFIG_PENDENCIA: Record<Pendencia['tipo'], { rotulo: string; Icone: LucideIcon }> = {
  confirmar_pagamento: { rotulo: 'Aguardando sua confirmação', Icone: CheckCircle2 },
  aprovar_edicao: { rotulo: 'Edição aguardando aprovação', Icone: Pencil },
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
  const naoLidas = central.data?.nao_lidas ?? 0
  const totalPaginas = Math.max(1, Math.ceil(total / PER_PAGE))
  const totalPendencias = pendencias.data?.total ?? 0

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
      {!pendencias.isLoading && totalPendencias > 0 && (
        <section className="mb-8 rounded-card border border-revisao/30 bg-revisao-claro p-5">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg text-revisao">
              <Bell strokeWidth={1.75} className="size-5" aria-hidden />
              Precisa de você
            </h2>
            <span className="inline-flex min-w-6 items-center justify-center rounded-pill bg-cartao px-2 py-0.5 text-xs font-bold text-revisao">
              {totalPendencias}
            </span>
          </div>
          <ul className="flex flex-col divide-y divide-revisao/15">
            {pendencias.data!.itens.map((p) => {
              const cfg = CONFIG_PENDENCIA[p.tipo]
              return (
                <li key={`${p.tipo}:${p.aviso_id}`}>
                  <Link
                    to={`/app/avisos/${p.aviso_id}`}
                    className="group flex items-center gap-3 py-3"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-cartao text-revisao">
                      <cfg.Icone strokeWidth={1.75} className="size-[18px]" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-tinta transition-colors group-hover:text-revisao">
                        {p.nome_outra_ponta} · {p.motivo}
                      </p>
                      <p className="truncate text-xs text-tinta-2">
                        {cfg.rotulo} · data combinada {dataPtBR(p.data_combinada)}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums text-revisao">
                      {brl(p.valor_centavos)}
                    </span>
                    <ChevronRight
                      strokeWidth={1.75}
                      className="size-4 shrink-0 text-revisao/50 transition-transform group-hover:translate-x-0.5 group-hover:text-revisao"
                      aria-hidden
                    />
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Histórico completo (H10.10): feed cronológico paginado do que já aconteceu. */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl text-salvia">Histórico</h2>
          {naoLidas > 0 && (
            <span className="inline-flex items-center rounded-pill bg-salvia-claro px-2.5 py-0.5 text-xs font-bold text-salvia">
              {naoLidas} {naoLidas === 1 ? 'não lida' : 'não lidas'}
            </span>
          )}
        </div>

        {central.isError ? (
          <ErrorState
            className="mt-4"
            titulo="Não foi possível carregar as notificações"
            descricao="Verifique sua conexão e tente de novo."
            aoTentarDeNovo={() => void central.refetch()}
          />
        ) : central.isLoading ? (
          <div className="mt-4 overflow-hidden rounded-card border border-linha bg-cartao">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 border-b border-linha px-4 py-3.5 last:border-0"
              >
                <Skeleton className="size-9 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3 rounded-input" />
                  <Skeleton className="h-3 w-24 rounded-input" />
                </div>
              </div>
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
            <div className="mt-4 overflow-hidden rounded-card border border-linha bg-cartao">
              {itens.map((item) => {
                const cfg = CONFIG_NOTIFICACAO[item.tipo]
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => abrirItem(item)}
                    className={cn(
                      'group flex w-full items-center gap-3 border-b border-linha px-4 py-3.5 text-left transition-colors last:border-0 hover:bg-papel',
                      !item.lida && 'bg-salvia-claro/40',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-full',
                        cfg.chip,
                      )}
                    >
                      <cfg.Icone strokeWidth={1.75} className="size-[18px]" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        {!item.lida && (
                          <span
                            className="size-2 shrink-0 rounded-full bg-salvia"
                            aria-hidden
                          />
                        )}
                        <span
                          className={cn(
                            'truncate text-sm text-tinta',
                            item.lida ? 'font-normal' : 'font-semibold',
                          )}
                        >
                          {!item.lida && <span className="sr-only">Não lida. </span>}
                          {cfg.rotulo}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-tinta-2">
                        {dataHoraPtBR(item.criado_em)}
                      </span>
                    </span>
                    <ChevronRight
                      strokeWidth={1.75}
                      className="size-4 shrink-0 text-tinta-2 transition-transform group-hover:translate-x-0.5 group-hover:text-salvia"
                      aria-hidden
                    />
                  </button>
                )
              })}
            </div>

            {totalPaginas > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <Button variante="ghost" disabled={page <= 1} onClick={() => irPara(page - 1)}>
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
