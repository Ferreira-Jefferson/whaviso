// E8 H8.7 / E6 H6.10: avanço/finalização da OCORRÊNCIA CORRENTE de um combinado
// recorrente. Vive em shared/ porque tanto a `api` (confirmação pelo painel,
// reabertura, marcar pago) quanto o `zap` (confirmação por botão no WhatsApp) precisam
// da MESMA semântica de "fechar a ocorrência k e gerar o mini-ciclo da k+1". Módulo
// nunca importa módulo; isto é kernel compartilhado, permitido.
//
// Geração LAZY por ocorrência: ao confirmar a ocorrência k<N, o ponteiro
// `ocorrencia_atual` avança para k+1, o aviso volta a `programado` (decisão do caller)
// e o mini-ciclo da k+1 é gerado com o MESMO horário reservado (não realoca, não vira
// null entre ocorrências, H6.9/H8.7). Só a confirmação da ÚLTIMA leva o aviso a `pago`
// terminal (o trigger 0038 libera o horário, `_seg=null`, só aí).

import type { PoolClient } from '../db'
import { calcularAgendamentos } from '../datas'
import type { EtapaEnvio } from '../contracts/enums'

export interface ResultadoConfirmacaoOcorrencia {
  /** true = não há mais ocorrência a vencer (simples, OU a última do recorrente). O caller
   *  põe o aviso em `pago` terminal (fluxo de sempre). false = avançou para a próxima
   *  ocorrência (o aviso volta/permanece em `programado`; NÃO vai a pago). */
  finalizou: boolean
}

interface LinhaAvisoRecorrencia {
  recorrencia_tipo: string | null
  ocorrencia_atual: number | null
  ocorrencias_total: number | null
  telefone_devedor: string | null
  horario_reservado_seg: number | null
  horario_reservado_orig: number | null
  cadencia_etapas: EtapaEnvio[] | null
}

/**
 * Fecha a OCORRÊNCIA CORRENTE de um combinado e decide se o aviso vira terminal `pago`
 * (finalizou=true) ou avança para a próxima ocorrência (finalizou=false). Deve rodar
 * DENTRO da transação do caller (com o `cli` já em transação), que tem o `uid` do ator
 * e aplica a transição de status do AVISO (este helper só mexe na tabela filha e nos
 * envios da ocorrência). É idempotente por construção: confirmar uma ocorrência já `pago`
 * é no-op (o update filtra `status <> 'pago'`).
 *
 *  - SIMPLES (recorrencia_tipo null): no-op aqui, retorna `finalizou: true` (o caller põe
 *    o aviso em `pago`, fluxo atual sem ocorrências).
 *  - RECORRENTE: marca aviso_ocorrencias[ocorrencia_atual] como `pago` (confirmado_em=now,
 *    confirmado_por=`confirmadoPor`), cancela os envios pendentes daquela ocorrência. Se a
 *    corrente era a última (ocorrencia_atual >= ocorrencias_total) -> `finalizou: true`.
 *    Senão avança `ocorrencia_atual` para k+1 e gera o mini-ciclo da k+1 com o MESMO
 *    horário reservado (cadência aplicada) -> `finalizou: false`.
 *
 * `confirmadoPor` é o uid do ator (cobrador), opcional: o zap (ação por telefone, sem
 * conta) passa null e o ator do PAGAMENTO fica registrado no evento de auditoria do caller.
 */
export async function confirmarOcorrenciaCorrente(
  cli: PoolClient,
  avisoId: string,
  confirmadoPor: string | null = null,
): Promise<ResultadoConfirmacaoOcorrencia> {
  const { rows } = await cli.query<LinhaAvisoRecorrencia>(
    `select recorrencia_tipo, ocorrencia_atual, ocorrencias_total, telefone_devedor,
            horario_reservado_seg, horario_reservado_orig,
            cadencia_etapas::text[] as cadencia_etapas
       from public.avisos where id = $1 for update`,
    [avisoId],
  )
  const aviso = rows[0]
  if (!aviso) return { finalizou: true }

  // Combinado SIMPLES: nada de ocorrências; o caller põe o aviso em pago (fluxo atual).
  if (aviso.recorrencia_tipo == null) return { finalizou: true }

  const k = aviso.ocorrencia_atual ?? 1
  const total = aviso.ocorrencias_total ?? k

  // Fecha a ocorrência corrente (idempotente: só age se ainda não estava paga). Cancela
  // os envios pendentes daquela ocorrência (não vai mais lembrar de algo já pago).
  const { rows: ocRows } = await cli.query<{ id: string }>(
    `update public.aviso_ocorrencias
        set status = 'pago', confirmado_em = now(), confirmado_por = $3
      where aviso_id = $1 and indice = $2 and status <> 'pago'
      returning id`,
    [avisoId, k, confirmadoPor],
  )
  const ocorrenciaId = ocRows[0]?.id
  if (ocorrenciaId) {
    await cli.query(
      `update public.envios set status = 'cancelado', erro = 'ocorrencia_paga'
        where ocorrencia_id = $1 and status in ('agendado', 'processando')`,
      [ocorrenciaId],
    )
  }

  // Era a última ocorrência? -> o caller leva o aviso a `pago` terminal (libera o horário).
  if (k >= total) return { finalizou: true }

  // Avança o ponteiro e gera o mini-ciclo da próxima ocorrência (lazy), reusando o MESMO
  // horário reservado (compartilhado entre ocorrências; nunca realoca, H6.9/H8.7).
  const proxima = k + 1
  await cli.query(`update public.avisos set ocorrencia_atual = $2 where id = $1`, [avisoId, proxima])

  const { rows: pRows } = await cli.query<{ id: string; data_combinada: string }>(
    `select id, to_char(data_combinada, 'YYYY-MM-DD') as data_combinada
       from public.aviso_ocorrencias where aviso_id = $1 and indice = $2`,
    [avisoId, proxima],
  )
  const prox = pRows[0]
  // O horário reservado é compartilhado: usa o `_seg` vigente; se já foi liberado por algum
  // motivo, cai no `_orig` (campo recuperável). Sem nenhum dos dois não há ciclo a gerar.
  const seg = aviso.horario_reservado_seg ?? aviso.horario_reservado_orig
  if (prox && seg != null) {
    const etapas = aviso.cadencia_etapas ?? undefined
    for (const a of calcularAgendamentos(prox.data_combinada, seg, new Date(), etapas)) {
      await cli.query(
        `insert into public.envios (aviso_id, ocorrencia_id, etapa, agendado_para, status)
           values ($1, $2, $3, $4, 'agendado')
         on conflict (ocorrencia_id, etapa) where ocorrencia_id is not null do nothing`,
        [avisoId, prox.id, a.etapa, a.agendado_para],
      )
    }
  }

  return { finalizou: false }
}

/**
 * E8 H8.7: (RE)PROGRAMA o mini-ciclo da OCORRÊNCIA CORRENTE de um combinado recorrente,
 * ancorado na data DAQUELA ocorrência (não na data_combinada do aviso, que é a âncora da
 * 1ª). Usado quando o aviso volta a `programado` por REJEIÇÃO (informado_pago ->
 * programado) ou REABERTURA da ocorrência corrente, em paralelo ao `reprogramarCiclo` do
 * combinado simples (que usa avisos.data_combinada). Reusa o MESMO horário reservado
 * (compartilhado) e a cadência. Re-arma os envios cancelados (volta a 'agendado') e cria
 * os que faltam; NUNCA re-arma um envio já 'enviado'. Deve rodar dentro de transação.
 *
 * No-op para combinado SIMPLES (o caller usa `reprogramarCiclo`); aqui só age no recorrente.
 */
export async function reprogramarOcorrenciaCorrente(cli: PoolClient, avisoId: string): Promise<void> {
  const { rows } = await cli.query<LinhaAvisoRecorrencia & { status: string }>(
    `select status, recorrencia_tipo, ocorrencia_atual, ocorrencias_total, telefone_devedor,
            horario_reservado_seg, horario_reservado_orig,
            cadencia_etapas::text[] as cadencia_etapas
       from public.avisos where id = $1 for update`,
    [avisoId],
  )
  const aviso = rows[0]
  if (!aviso || aviso.recorrencia_tipo == null || aviso.status !== 'programado') return

  const k = aviso.ocorrencia_atual ?? 1
  const seg = aviso.horario_reservado_seg ?? aviso.horario_reservado_orig
  if (seg == null) return

  const { rows: ocRows } = await cli.query<{ id: string; data_combinada: string }>(
    `select id, to_char(data_combinada, 'YYYY-MM-DD') as data_combinada
       from public.aviso_ocorrencias where aviso_id = $1 and indice = $2`,
    [avisoId, k],
  )
  const oc = ocRows[0]
  if (!oc) return

  const etapas = aviso.cadencia_etapas ?? undefined
  for (const a of calcularAgendamentos(oc.data_combinada, seg, new Date(), etapas)) {
    await cli.query(
      `insert into public.envios (aviso_id, ocorrencia_id, etapa, agendado_para, status)
         values ($1, $2, $3, $4, 'agendado')
       on conflict (ocorrencia_id, etapa) where ocorrencia_id is not null do update
         set status = 'agendado', agendado_para = excluded.agendado_para,
             erro = null, tentativas = 0, proxima_tentativa_em = null
       where envios.status = 'cancelado'`,
      [avisoId, oc.id, a.etapa, a.agendado_para],
    )
  }
}

/**
 * E8 H8.6/H8.7: REABRE a OCORRÊNCIA CORRENTE de um combinado recorrente (a confirmação
 * agiu por ocorrência; reabrir age na corrente). Volta o status da ocorrência a
 * 'programado' (limpa confirmado_em/por) e re-arma o seu mini-ciclo. O caller já pôs o
 * AVISO de volta em `programado`. No-op para combinado simples (o caller usa
 * `reprogramarCiclo`). Deve rodar dentro de transação.
 */
export async function reabrirOcorrenciaCorrente(cli: PoolClient, avisoId: string): Promise<void> {
  const { rows } = await cli.query<{ recorrencia_tipo: string | null; ocorrencia_atual: number | null }>(
    `select recorrencia_tipo, ocorrencia_atual from public.avisos where id = $1 for update`,
    [avisoId],
  )
  const aviso = rows[0]
  if (!aviso || aviso.recorrencia_tipo == null) return
  const k = aviso.ocorrencia_atual ?? 1
  await cli.query(
    `update public.aviso_ocorrencias
        set status = 'programado', confirmado_em = null, confirmado_por = null
      where aviso_id = $1 and indice = $2`,
    [avisoId, k],
  )
  await reprogramarOcorrenciaCorrente(cli, avisoId)
}
