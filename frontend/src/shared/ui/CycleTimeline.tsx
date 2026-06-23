// CycleTimeline: componente-assinatura (plano seção 1).
// Renderiza as etapas do ciclo de lembretes (D-2 → D-1 → D → D+1) a partir dos
// ENVIOS REAIS do backend. A etapa NUNCA é calculada no cliente (risco nº 4): a
// ordem e o estado de cada ponto vêm de `envios.agendado_para` / `envios.status`.
// O ponto da etapa ativa pulsa suavemente (respeita prefers-reduced-motion, via
// .animate-pulso-etapa em index.css).
//
// `processando` (claim do scheduler) é exibido como "agendado": mesma cor e
// rótulo (risco; ver ROTULO_STATUS_ENVIO).
import type { Envio } from '../contracts'
import {
  ROTULO_ETAPA,
  ROTULO_SITUACAO_ENVIO,
  type SituacaoEnvio,
  dataHoraPtBR,
  diaCurtoPtBR,
  situacaoEnvio,
} from '../format'
import { cn } from './cn'

// Família visual por SITUAÇÃO do ponto (H9.7). em_retry partilha a cor de agendado
// (ainda no ar); falhou = persistente (3 retries esgotados).
type Aparencia = 'agendado' | 'enviado' | 'falhou' | 'cancelado'

const APARENCIA: Record<SituacaoEnvio, Aparencia> = {
  agendado: 'agendado',
  em_retry: 'agendado',
  enviado: 'enviado',
  falhou: 'falhou',
  cancelado: 'cancelado',
}

const COR_PONTO: Record<Aparencia, string> = {
  agendado: 'bg-ambar-claro border-ambar text-ambar',
  enviado: 'bg-salvia-claro border-folha text-folha',
  falhou: 'bg-papel-2 border-barro text-barro',
  cancelado: 'bg-papel-2 border-linha text-cinza-expirado',
}

const COR_LINHA: Record<Aparencia, string> = {
  agendado: 'bg-ambar/40',
  enviado: 'bg-folha/50',
  falhou: 'bg-barro/40',
  cancelado: 'bg-linha',
}

/**
 * Índice da etapa ativa (a que pulsa), derivado dos envios, não do relógio do
 * cliente: é o primeiro envio ainda no ar (agendado/processando) por ordem de
 * agendamento; se nenhum estiver pendente, é o último que foi enviado.
 */
function indiceAtivo(envios: Envio[]): number {
  const proximoPendente = envios.findIndex(
    (e) => e.status === 'agendado' || e.status === 'processando',
  )
  if (proximoPendente !== -1) return proximoPendente
  let ultimoEnviado = -1
  envios.forEach((e, i) => {
    if (e.status === 'enviado') ultimoEnviado = i
  })
  return ultimoEnviado
}

interface CycleTimelineProps {
  /** Envios reais do aviso. Ordenados por agendado_para (ascendente). */
  envios: Envio[]
  className?: string
}

export function CycleTimeline({ envios, className }: CycleTimelineProps) {
  // Ordena por data agendada: fonte autoritativa da sequência (nunca o cliente).
  const ordenados = [...envios].sort(
    (a, b) => a.agendado_para.getTime() - b.agendado_para.getTime(),
  )
  const ativo = indiceAtivo(ordenados)

  return (
    <ol
      className={cn('flex flex-col gap-0 sm:flex-row sm:gap-0', className)}
      aria-label="Ciclo de lembretes"
    >
      {ordenados.map((envio, i) => {
        const situacao = situacaoEnvio(envio)
        const aparencia = APARENCIA[situacao]
        const ehAtivo = i === ativo
        const ehUltimo = i === ordenados.length - 1
        const quando = envio.enviado_em ?? envio.agendado_para
        return (
          <li
            key={envio.id}
            className="relative flex flex-1 gap-3 pb-6 sm:flex-col sm:gap-2 sm:pb-0"
          >
            {/* Conector */}
            {!ehUltimo && (
              <span
                aria-hidden
                className={cn(
                  'absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5 sm:left-auto sm:top-[15px] sm:h-0.5 sm:w-[calc(100%-2rem)] sm:translate-x-8',
                  COR_LINHA[aparencia],
                )}
              />
            )}
            <span
              className={cn(
                'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold',
                COR_PONTO[aparencia],
                ehAtivo && 'animate-pulso-etapa',
              )}
            >
              {i + 1}
            </span>
            <div className="min-w-0 sm:pr-3">
              <p className="text-sm font-medium text-tinta">{ROTULO_ETAPA[envio.etapa]}</p>
              <p className="text-xs text-tinta-2">
                {ROTULO_SITUACAO_ENVIO[situacao]}
                {' · '}
                {envio.enviado_em ? dataHoraPtBR(quando) : diaCurtoPtBR(quando)}
              </p>
              {envio.status === 'enviado' && envio.entrega_status && (
                <p className="text-xs text-tinta-2">Entrega: {envio.entrega_status}</p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
