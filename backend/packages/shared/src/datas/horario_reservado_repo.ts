// E6/H6.9: Lado de BANCO da alocação do horário reservado. Lê os segundos ocupados
// (global + do mesmo devedor) e grava o segundo escolhido no aviso, dentro da transação
// do chamador (api: reativação/reabertura; zap: aceite). O núcleo PURO (busca de segundo
// livre, wrap, fallback, 10min) está em `horario_reservado.ts`.
//
// CORRIDA (D-HORARIO): a unicidade global de segundo é da LÓGICA, não de índice único.
// Para dois aceites concorrentes não escolherem o mesmo segundo (nem violarem os 10min do
// mesmo devedor), travamos as linhas ATIVAS com horário reservado (`FOR UPDATE`) antes de
// ler os ocupados: o 2º aceite espera o 1º comitar e relê o conjunto já com o novo segundo.
// No volume do produto (<100 clientes) o lock do conjunto ativo é barato e correto.

import type { PoolClient } from '../db'
import { calcularAgendamentos } from './index'
import { alocarSegundo, segundoDePartida, type ResultadoAlocacao } from './horario_reservado'

export interface OpcoesReserva {
  avisoId: string
  telefoneDevedor: string | null
  agora?: Date
  /** Sorteio determinístico nos testes (repassado ao núcleo puro). */
  aleatorio?: () => number
}

/** Lê os segundos ocupados (global + do mesmo devedor), com lock para serializar aceites. */
async function lerOcupados(
  cli: PoolClient,
  avisoId: string,
  telefoneDevedor: string | null,
): Promise<{ globais: Set<number>; doDevedor: number[] }> {
  // Trava todas as linhas ativas com segundo reservado: serializa a alocação concorrente.
  // Exclui o próprio aviso (idempotência: re-reserva não conta o próprio segundo antigo).
  const { rows } = await cli.query<{ horario_reservado_seg: number; telefone_devedor: string | null }>(
    `select horario_reservado_seg, telefone_devedor
       from public.avisos
      where horario_reservado_seg is not null and id <> $1
      for update`,
    [avisoId],
  )
  const globais = new Set<number>()
  const doDevedor: number[] = []
  for (const r of rows) {
    globais.add(r.horario_reservado_seg)
    if (telefoneDevedor && r.telefone_devedor === telefoneDevedor) doDevedor.push(r.horario_reservado_seg)
  }
  return { globais, doDevedor }
}

/**
 * Aloca e GRAVA o horário reservado de um aviso (segundo único na janela 08-18). Deve rodar
 * dentro de uma transação (o chamador passa o `cli`). Grava `horario_reservado_seg`,
 * `horario_reservado_orig` (= o mesmo segundo) e `horario_espacamento_ideal` (false no
 * fallback dos 10min, G8). Retorna o resultado da alocação.
 */
export async function reservarHorario(cli: PoolClient, opts: OpcoesReserva): Promise<ResultadoAlocacao> {
  const agora = opts.agora ?? new Date()
  const { globais, doDevedor } = await lerOcupados(cli, opts.avisoId, opts.telefoneDevedor)
  const r = alocarSegundo({
    partida: segundoDePartida(agora),
    ocupadosGlobais: globais,
    ocupadosDevedor: doDevedor,
    aleatorio: opts.aleatorio,
  })
  await cli.query(
    `update public.avisos
        set horario_reservado_seg = $2,
            horario_reservado_orig = $2,
            horario_espacamento_ideal = $3
      where id = $1`,
    [opts.avisoId, r.seg, r.espacamentoIdeal],
  )
  return r
}

/**
 * Garante um horário reservado para a (RE)PROGRAMAÇÃO do ciclo. Se o aviso já tem
 * `horario_reservado_seg` (retomada de pausa: a suspensão preserva o segundo), reusa.
 * Se está NULL mas há `_orig` (reabertura `pago->programado`, E8 H8.6), reusa o `_orig`
 * MESMO ocupado (exceção à unicidade, H6.9), regravando `_seg`. Caso contrário (1º
 * aceite), aloca um novo. Retorna o segundo vigente.
 */
export async function garantirHorarioReservado(cli: PoolClient, opts: OpcoesReserva): Promise<number> {
  const { rows } = await cli.query<{ seg: number | null; orig: number | null }>(
    `select horario_reservado_seg as seg, horario_reservado_orig as orig
       from public.avisos where id = $1 for update`,
    [opts.avisoId],
  )
  const linha = rows[0]
  if (linha?.seg != null) return linha.seg
  if (linha?.orig != null) {
    // Reabertura: reusa o mesmo segundo, fora da busca, mesmo que esteja ocupado.
    await cli.query(`update public.avisos set horario_reservado_seg = $2 where id = $1`, [opts.avisoId, linha.orig])
    return linha.orig
  }
  const r = await reservarHorario(cli, opts)
  return r.seg
}

/**
 * (RE)PROGRAMA o ciclo de um aviso que (re)entrou em `programado`. Usado ao ACEITAR não
 * (o aceite no zap já programa direto), mas ao RETOMAR de pausa/edição (api) e ao REJEITAR
 * o pagamento (informado_pago->programado): H6.5/H6.7 "ciclo retoma a partir da etapa
 * aplicável à data". Idempotente e seguro:
 *  - garante o horário reservado (reusa o suspenso/`_orig`, ou aloca no 1º aceite);
 *  - para cada etapa AINDA APLICÁVEL (catch-up via `calcularAgendamentos`), RE-ARMA o
 *    envio cancelado por suspensão (volta a 'agendado'), ou cria se não existir;
 *  - NUNCA re-arma um envio já 'enviado' (não reenvia) nem toca etapas vencidas.
 * Deve rodar dentro de uma transação. Não muda o status (o chamador já fez isso).
 */
export async function reprogramarCiclo(cli: PoolClient, opts: OpcoesReserva): Promise<void> {
  const agora = opts.agora ?? new Date()
  const { rows } = await cli.query<{ data_combinada: string; status: string }>(
    `select to_char(data_combinada,'YYYY-MM-DD') as data_combinada, status
       from public.avisos where id = $1 for update`,
    [opts.avisoId],
  )
  const aviso = rows[0]
  if (!aviso || aviso.status !== 'programado') return

  const seg = await garantirHorarioReservado(cli, opts)
  for (const a of calcularAgendamentos(aviso.data_combinada, seg, agora)) {
    // E6 H6.10: o unique (aviso_id, etapa) virou dois índices PARCIAIS (0052). Esta função
    // (re)programa o ciclo do combinado SIMPLES (ocorrencia_id null), então o ON CONFLICT
    // mira o índice parcial `where ocorrencia_id is null`. O ciclo POR OCORRÊNCIA do
    // recorrente é reprogramado por `reprogramarOcorrenciaCorrente` (shared/ocorrencias).
    await cli.query(
      `insert into public.envios (aviso_id, etapa, agendado_para, status)
         values ($1, $2, $3, 'agendado')
       on conflict (aviso_id, etapa) where ocorrencia_id is null do update
         set status = 'agendado', agendado_para = excluded.agendado_para,
             erro = null, tentativas = 0, proxima_tentativa_em = null
       where envios.status = 'cancelado'`,
      [opts.avisoId, a.etapa, a.agendado_para],
    )
  }
}
