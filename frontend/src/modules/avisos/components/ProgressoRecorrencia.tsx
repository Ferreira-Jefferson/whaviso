// Progresso de um combinado RECORRENTE (E6 H6.10 / E8 H8.7 / E9 H9.6): "k de N
// pagamentos" + status da ocorrência corrente + o mini-histórico de cada ocorrência
// (data e status de cada k), vindo de GET /v1/avisos/:id/ocorrencias. O front SÓ EXIBE
// o que a api manda (índice, data e status de cada ocorrência); NÃO recalcula nada.
// Combinado simples (sem ocorrências) não renderiza nada.
import { Repeat } from 'lucide-react'
import { Card, StatusBadge } from '@/shared/ui'
import { ROTULO_DIRECAO, dataPtBR } from '@/shared/format'
import type { Aviso, PapelAviso } from '@/shared/contracts'
import { useAvisoOcorrencias } from '../api'

// Rótulo da frequência (quando o aviso é por período). Datas avulsas não têm freq.
const ROTULO_FREQ: Record<NonNullable<Aviso['recorrencia_freq']>, string> = {
  mensal: 'por mês',
  semanal: 'por semana',
  diaria: 'por dia',
}

interface ProgressoRecorrenciaProps {
  aviso: Aviso
  meuPapel: PapelAviso | null
}

export function ProgressoRecorrencia({ aviso, meuPapel }: ProgressoRecorrenciaProps) {
  const total = aviso.ocorrencias_total
  const ehRecorrente = total != null && total > 1
  // Busca as ocorrências só quando é recorrente (o hook degrada gracioso se a rota faltar).
  const { data: colecao } = useAvisoOcorrencias(aviso.id, ehRecorrente)
  const ocorrencias = colecao?.itens ?? []

  // Sem total => combinado simples; nada a mostrar.
  if (!ehRecorrente || total == null) return null

  const atual = Math.min(Math.max(aviso.ocorrencia_atual ?? 1, 1), total)
  // Confirmadas: preferimos a contagem REAL de ocorrências pagas (dado do servidor);
  // sem a lista (rota antiga/ausente), caímos no ponteiro (atual - 1). Só exibição.
  const confirmadas =
    ocorrencias.length > 0
      ? ocorrencias.filter((o) => o.status === 'pago').length
      : atual - 1
  const pct = Math.round((confirmadas / total) * 100)
  const ehReceber = aviso.direcao === 'receber'
  const rotuloEvento = ehReceber ? 'recebimentos' : 'pagamentos'

  // Descrição curta da regra (sem recalcular nada; só rotula o que veio no aviso).
  let regra = 'Combinado que se repete'
  if (aviso.recorrencia_tipo === 'periodo' && aviso.recorrencia_freq) {
    const cada =
      aviso.recorrencia_intervalo && aviso.recorrencia_intervalo > 1
        ? ` (a cada ${aviso.recorrencia_intervalo})`
        : ''
    regra = `Repete ${ROTULO_FREQ[aviso.recorrencia_freq]}${cada}`
  } else if (aviso.recorrencia_tipo === 'avulsas') {
    regra = 'Repete em datas escolhidas'
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Repeat strokeWidth={1.75} className="size-5 text-salvia" />
          <div>
            <h2 className="text-lg text-salvia">Combinado recorrente</h2>
            <p className="text-sm text-tinta-2">
              {regra} · {ROTULO_DIRECAO[aviso.direcao]}
            </p>
          </div>
        </div>
        <StatusBadge status={aviso.status} papel={meuPapel} />
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-tinta-2">
            {confirmadas} de {total} {rotuloEvento}
          </span>
          <span className="text-xs tabular-nums text-tinta-2">{pct}%</span>
        </div>
        <div
          className="mt-1.5 h-2 w-full overflow-hidden rounded-pill bg-papel-2"
          role="progressbar"
          aria-valuenow={confirmadas}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label={`${confirmadas} de ${total} ${rotuloEvento}`}
        >
          <div
            className="h-full rounded-pill bg-salvia transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Mini-histórico por ocorrência (H9.6): data + status de cada k, com a corrente
          em destaque. Some quando a coleção não veio (combinado simples não chega aqui). */}
      {ocorrencias.length > 0 && (
        <ul className="flex max-h-72 flex-col divide-y divide-papel-2 overflow-y-auto rounded-card border border-papel-2">
          {ocorrencias.map((o) => {
            const ehAtual = o.indice === atual
            return (
              <li
                key={o.id}
                className={`flex items-center justify-between gap-3 px-3 py-2 ${
                  ehAtual ? 'bg-papel-2/40' : ''
                }`}
              >
                <span className="text-sm">
                  <span className={ehAtual ? 'font-medium text-tinta' : 'text-tinta-2'}>
                    Repetição {o.indice}
                  </span>
                  <span className="text-tinta-2"> · {dataPtBR(o.data_combinada)}</span>
                  {ehAtual && <span className="text-tinta-2"> · atual</span>}
                </span>
                <StatusBadge status={o.status} papel={meuPapel} />
              </li>
            )
          })}
        </ul>
      )}

      <p className="text-sm text-tinta-2">
        Agora na repetição <strong className="text-tinta">{atual}</strong> de {total}. Cada
        repetição tem seu próprio ciclo de lembretes na data dela; o combinado encerra quando a
        última for confirmada.
      </p>
    </Card>
  )
}
