import type { Pool, PoolClient } from '@whaviso/shared/db'
import { comTransacao } from '@whaviso/shared/db'
import { reprogramarCiclo } from '@whaviso/shared/datas/horario'
import {
  confirmarOcorrenciaCorrente,
  reabrirOcorrenciaCorrente,
  reprogramarOcorrenciaCorrente,
} from '@whaviso/shared/ocorrencias'
import { conflito, naoEncontrado, proibido, regraNegocio } from '../../shared/http_errors'
import {
  enfileirarNotificacao,
  enfileirarNotificacaoDevedor,
  grupoEncerramento,
  cancelarEncerramentoPendente,
} from '../../shared/notificacoes'
import { alavancasDoPlano, travarConta } from '../../shared/planos'

type Papel = 'cobrador' | 'devedor'

/** Janela de reversão de ~1min (H8.1/H8.6): a mensagem de encerramento ao devedor só sai
 *  ~60s depois da confirmação, para o cobrador reverter (reabrir) sem o devedor ver nada. */
const ENCERRAMENTO_ADIAMENTO_SEG = 60

interface Linha {
  id: string
  status: string
  criador_papel: Papel
  cobrador_id: string | null
  devedor_profile_id: string | null
  telefone_cobrador: string | null
  telefone_devedor: string | null
  // Recorrência (E8 H8.7): null = combinado simples. ocorrencia_atual/total alimentam a
  // decisão de mensagem (intermediária = variante recorrente; última = encerramento).
  recorrencia_tipo: string | null
  ocorrencia_atual: number | null
  ocorrencias_total: number | null
}

async function carregar(cli: PoolClient, id: string): Promise<Linha> {
  const { rows } = await cli.query<Linha>(
    `select id, status, criador_papel, cobrador_id, devedor_profile_id,
            telefone_cobrador, telefone_devedor,
            recorrencia_tipo, ocorrencia_atual, ocorrencias_total
     from public.avisos where id = $1 for update`,
    [id],
  )
  if (!rows[0]) throw naoEncontrado('Aviso não encontrado')
  return rows[0]
}

/** Combinado recorrente? (tem ocorrências; o status reflete a ocorrência corrente, H8.7). */
function ehRecorrente(aviso: Linha): boolean {
  return aviso.recorrencia_tipo != null
}

function exigirPapel(aviso: Linha, uid: string, papel: Papel): void {
  const ok = papel === 'cobrador' ? aviso.cobrador_id === uid : aviso.devedor_profile_id === uid
  if (!ok) throw proibido('Sem permissão para esta ação neste aviso')
}

/**
 * B2/H8.9: grava o evento de pagamento com o ATOR CONCRETO em `detalhes` (sem PII), para
 * o painel (E9) distinguir QUEM agiu. Para o cobrador COM conta guarda o id do profile
 * (`cobrador_id`); SEM conta (ação por telefone no webhook) guarda só a flag `via:'telefone'`
 * (o telefone em si NUNCA é gravado/logado). `ator` continua sendo o PAPEL ('cobrador').
 */
async function gravarEventoPagamento(
  cli: PoolClient,
  avisoId: string,
  tipo: string,
  uid: string,
): Promise<void> {
  await cli.query(
    `insert into public.eventos_aviso (aviso_id, tipo, ator, detalhes)
     values ($1, $2::tipo_evento, 'cobrador', jsonb_build_object('cobrador_id', $3::text))`,
    [avisoId, tipo, uid],
  )
}

/**
 * H8.1/H8.4: cobrador confirma o pagamento (informado_pago → pago) OU marca pago DIRETO
 * (programado → pago, sem o devedor ter informado). O ATOR/origem é distinguido pelo
 * evento (E9, B2): `confirmado_cobrador` (vinha de informado_pago) vs `marcado_pago_cobrador`
 * (marcou direto de programado). Idempotente se já estiver em 'pago'.
 *
 * Ao virar `pago` (combinado SIMPLES, MVP): o trigger cancela IMEDIATAMENTE os envios de
 * ciclo e libera o horário (`_seg=null`, preserva `_orig`, E6/0038). A MENSAGEM de
 * encerramento ao devedor é ADIADA ~1min (janela de reversão, H8.1): se o cobrador reabrir
 * dentro do minuto, a reabertura cancela essa mensagem (devedor não recebe nada, C1).
 * M6: a assimetria é proposital (envios param já; só a mensagem ao devedor atrasa).
 *
 * H8.7 RECORRENTE: confirma a OCORRÊNCIA corrente via `confirmarOcorrenciaCorrente`. Se
 * finalizou (última ocorrência) -> mesmo fluxo do simples (aviso -> pago terminal). Se NÃO
 * finalizou (k < N) -> o helper já avançou o ponteiro e gerou o mini-ciclo da k+1; aqui o
 * aviso VOLTA a `programado` (não vai a pago) e a mensagem ao devedor é a variante
 * recorrente (`encerramento_recorrente`, template devedor.encerramento contexto 'revisao').
 */
export async function confirmarRecebimento(pool: Pool, uid: string, id: string): Promise<{ status: string }> {
  return comTransacao(pool, async (cli) => {
    const aviso = await carregar(cli, id)
    exigirPapel(aviso, uid, 'cobrador')
    if (aviso.status === 'pago') return { status: 'pago' } // idempotente
    if (aviso.status !== 'programado' && aviso.status !== 'informado_pago') {
      throw conflito('estado_invalido', `Aviso em "${aviso.status}" não pode ser confirmado.`)
    }
    // H8.1 (de informado_pago) vs H8.4 (marcar direto de programado): evento distinto.
    const tipoEvento = aviso.status === 'informado_pago' ? 'confirmado_cobrador' : 'marcado_pago_cobrador'

    // H8.7: fecha a ocorrência corrente (no-op no simples). finalizou = última (ou simples).
    const { finalizou } = await confirmarOcorrenciaCorrente(cli, id, uid)
    await gravarEventoPagamento(cli, id, tipoEvento, uid)

    if (!finalizou) {
      // Recorrente, ocorrência intermediária: o aviso volta a `programado` (aguarda a
      // próxima ocorrência, cujo mini-ciclo o helper já gerou). NÃO vira pago.
      await cli.query(`update public.avisos set status = 'programado' where id = $1`, [id])
      // Mensagem ao devedor: variante recorrente ("pagamento deste mês confirmado..."). Não
      // usa a janela de reversão do `encerramento` (o aviso não está pago).
      await enfileirarNotificacaoDevedor(cli, aviso, 'encerramento_recorrente')
      return { status: 'programado' }
    }

    // Simples, OU última ocorrência do recorrente: aviso -> pago terminal (libera horário).
    await cli.query(`update public.avisos set status = 'pago' where id = $1`, [id])
    // H8.1: mensagem de encerramento ao devedor ADIADA ~1min, no grupo de coalescing do
    // par confirmação/reabertura. Reabrir dentro do minuto anula esta linha (C1). O
    // drainer ainda reconfere `aviso.status='pago'` antes de enviar (C1, corrida do claim).
    await enfileirarNotificacaoDevedor(cli, aviso, 'encerramento', {
      agendarAposSeg: ENCERRAMENTO_ADIAMENTO_SEG,
      coalesceGrupo: grupoEncerramento(id),
    })
    return { status: 'pago' }
  })
}

/**
 * H8.2: cobrador rejeita a informação de pagamento (informado_pago → programado): "ainda
 * não localizei". O aviso volta ao ciclo por catch-up; o horário NÃO muda (nunca foi
 * liberado em informado_pago). Notifica o devedor de forma neutra (sem acusação).
 * Idempotente se já estiver em 'programado'.
 */
export async function rejeitarPagamento(pool: Pool, uid: string, id: string): Promise<{ status: string }> {
  return comTransacao(pool, async (cli) => {
    const aviso = await carregar(cli, id)
    exigirPapel(aviso, uid, 'cobrador')
    if (aviso.status === 'programado') return { status: 'programado' } // idempotente
    if (aviso.status !== 'informado_pago') {
      throw conflito('estado_invalido', `Aviso em "${aviso.status}" não pode ser rejeitado.`)
    }
    await cli.query(`update public.avisos set status = 'programado' where id = $1`, [id])
    await gravarEventoPagamento(cli, id, 'rejeitado_cobrador', uid)
    // H6.5/H6.7: o ciclo retoma a partir da etapa aplicável (re-arma as etapas canceladas
    // ao informar pagamento, reusando o horário reservado, que não foi liberado). No
    // RECORRENTE a rejeição age na OCORRÊNCIA CORRENTE (ancorada na data dela), não na
    // âncora do aviso (H8.7); no simples, no ciclo do próprio aviso.
    if (ehRecorrente(aviso)) {
      await reprogramarOcorrenciaCorrente(cli, id)
    } else {
      await reprogramarCiclo(cli, { avisoId: id, telefoneDevedor: aviso.telefone_devedor })
    }
    // H8.2: notifica o devedor (neutro, sem acusação). C2: idempotente/coalescível por
    // (aviso_id, tipo, ocorrência) enquanto não enviada (toque-duplo -> 1 notificação).
    await enfileirarNotificacaoDevedor(cli, aviso, 'rejeicao')
    return { status: 'programado' }
  })
}

/**
 * H8.6: cobrador REABRE um combinado pago por engano (pago → programado). Única saída de
 * `pago`, só pelo cobrador. Reusa EXATAMENTE o `horario_reservado_orig` (E6/0038), fora da
 * regra de escolha de timestamp, mesmo que o segundo esteja ocupado (via garantirHorario
 * dentro de reprogramarCiclo). Volta ao ciclo por catch-up. Idempotente se já 'programado'.
 *
 * Janela de 1min (C1): se a mensagem de encerramento ainda não saiu, cancela (devedor não
 * recebe nada). Se já saiu, enfileira `status_alterado` (2a mensagem ao devedor, H8.6).
 * M3: `_orig` NUNCA é setado para null (a liberação no terminal só preenche `_orig`), então
 * múltiplas reaberturas/reconfirmações preservam o mesmo horário original.
 */
export async function desmarcarRecebimento(pool: Pool, uid: string, id: string): Promise<{ status: string }> {
  return comTransacao(pool, async (cli) => {
    const aviso = await carregar(cli, id)
    exigirPapel(aviso, uid, 'cobrador')
    if (aviso.status === 'programado') return { status: 'programado' } // idempotente
    if (aviso.status !== 'pago') {
      throw conflito('estado_invalido', `Aviso em "${aviso.status}" não pode ser reaberto.`)
    }
    await cli.query(`update public.avisos set status = 'programado' where id = $1`, [id])
    await gravarEventoPagamento(cli, id, 'reaberto_cobrador', uid)
    // Reabertura (E8 H8.6): retoma o ciclo reusando o MESMO horário reservado (via `_orig`,
    // mesmo que o segundo tenha sido tomado por outro aviso enquanto liberado). RECORRENTE:
    // reabre a OCORRÊNCIA CORRENTE (a que foi confirmada por último) e re-arma o ciclo dela
    // ancorado na data daquela ocorrência (H8.7); simples: o ciclo do próprio aviso.
    if (ehRecorrente(aviso)) {
      await reabrirOcorrenciaCorrente(cli, id)
    } else {
      await reprogramarCiclo(cli, { avisoId: id, telefoneDevedor: aviso.telefone_devedor })
    }
    // Janela de 1min (C1): tenta ANULAR a mensagem de encerramento ainda não enviada. Se
    // anulou (>=1), confirmação+reabertura se anulam e o devedor não recebe nada. Se NÃO
    // havia pendente (já saiu), enfileira a 2a mensagem "status alterado" (H8.6).
    const anuladas = await cancelarEncerramentoPendente(cli, id)
    if (anuladas === 0) {
      await enfileirarNotificacaoDevedor(cli, aviso, 'status_alterado')
    }
    return { status: 'programado' }
  })
}

/**
 * H8.3: reengajamento manual pós-ciclo. Disponível quando o ciclo padrão JÁ TERMINOU
 * (hoje passou de D+1) e o combinado segue `programado` sem pagamento confirmado. Dispara
 * UMA mensagem ao devedor com os 3 botões padrão e NÃO muda de estado.
 *
 * M2 (vira o ÚLTIMO aviso): grava o evento `reengajamento_cobrador`; o webhook (E7 H7.7)
 * passa a tratar os botões do CICLO (que carregam etapa) como inertes quando há um
 * reengajamento POSTERIOR ao último envio, e só os botões do reengajamento (sem etapa) agem.
 *
 * C5/E11 (limite sem corrida): trava a conta do criador (FOR UPDATE) e conta os eventos
 * `reengajamento_cobrador` DENTRO da mesma transação. Teto = `reengajamento_max` do plano,
 * NUNCA 2 no mesmo dia (America/Sao_Paulo). O envio respeita o horário reservado + janela
 * 8-18 + limite de envios (a outbox/drainer cuida da entrega; aqui só enfileira).
 */
export async function reengajar(pool: Pool, uid: string, id: string): Promise<{ status: string }> {
  return comTransacao(pool, async (cli) => {
    const aviso = await carregar(cli, id)
    exigirPapel(aviso, uid, 'cobrador')
    if (aviso.status !== 'programado') {
      throw conflito('estado_invalido', `Aviso em "${aviso.status}" não permite reengajamento.`)
    }
    // O ciclo padrão terminou? (hoje > D+1, em America/Sao_Paulo). Comparação de DATA de
    // negócio no banco, fuso SP, nunca no cliente.
    const { rows: cic } = await cli.query<{ pos_ciclo: boolean }>(
      `select (current_date at time zone 'America/Sao_Paulo')::date
              > (a.data_combinada + interval '1 day')::date as pos_ciclo
         from public.avisos a where a.id = $1`,
      [id],
    )
    if (!cic[0]?.pos_ciclo) {
      throw conflito('ciclo_em_andamento', 'O reengajamento só fica disponível depois que o ciclo de avisos terminou.')
    }
    // C5/E11: limite por combinado SEM corrida (lock da conta + contagem na mesma tx).
    await travarConta(cli, uid)
    const alavancas = await alavancasDoPlano(cli, uid)
    if (alavancas.reengajamento_max <= 0) {
      throw regraNegocio('reengajamento_indisponivel', 'Seu plano não inclui reengajamento manual.')
    }
    const { rows: lim } = await cli.query<{ total: number; hoje: number }>(
      `select count(*)::int as total,
              count(*) filter (
                where (criado_em at time zone 'America/Sao_Paulo')::date
                      = (now() at time zone 'America/Sao_Paulo')::date
              )::int as hoje
         from public.eventos_aviso
        where aviso_id = $1 and tipo = 'reengajamento_cobrador'`,
      [id],
    )
    if ((lim[0]?.total ?? 0) >= alavancas.reengajamento_max) {
      throw regraNegocio('reengajamento_limite', `Você já usou os ${alavancas.reengajamento_max} reengajamentos deste combinado.`)
    }
    if ((lim[0]?.hoje ?? 0) >= 1) {
      throw regraNegocio('reengajamento_hoje', 'Você já reengajou este combinado hoje. Tente novamente amanhã.')
    }
    await gravarEventoPagamento(cli, id, 'reengajamento_cobrador', uid)
    // Enfileira a mensagem com os 3 botões ao devedor (não muda estado). O drainer entrega
    // respeitando o espaçamento/limite; a janela 8-18 é do agendamento do ciclo (a mensagem
    // avulsa sai na próxima janela de drain, dentro do horário comercial do transporte).
    await enfileirarNotificacaoDevedor(cli, aviso, 'reengajamento')
    return { status: aviso.status }
  })
}

/**
 * Devedor LOGADO encerra os lembretes (opt-out). Mesmo efeito do opt-out público
 * (`acoes_devedor`): programado → cancelado; o trigger de encerramento cancela os
 * envios futuros; registra evento `optout` (ator `devedor`). Idempotente: se já
 * estiver em estado terminal, devolve o estado atual sem reescrever histórico.
 */
export async function encerrarLembretes(pool: Pool, uid: string, id: string): Promise<{ status: string }> {
  return comTransacao(pool, async (cli) => {
    const aviso = await carregar(cli, id)
    exigirPapel(aviso, uid, 'devedor')
    // Só age sobre aviso ativo (programado); terminal → idempotente, sem reescrever histórico.
    // (O devedor logado só fica vinculado após o aceite, que já move o aviso para 'programado'.)
    if (aviso.status !== 'programado') {
      return { status: aviso.status }
    }
    await cli.query(`update public.avisos set status = 'cancelado' where id = $1`, [id])
    await cli.query(
      `insert into public.eventos_aviso (aviso_id, tipo, ator) values ($1, 'optout', 'devedor')`,
      [id],
    )
    return { status: 'cancelado' }
  })
}

/**
 * Devedor logado informa que pagou (programado → informado_pago). Não vai direto para
 * 'pago': fica em revisão até o cobrador confirmar. Idempotente: se já está em revisão
 * ou já confirmado, devolve o estado atual sem reescrever histórico.
 */
export async function marcarPagoDevedor(pool: Pool, uid: string, id: string): Promise<{ status: string }> {
  return comTransacao(pool, async (cli) => {
    const aviso = await carregar(cli, id)
    exigirPapel(aviso, uid, 'devedor')
    if (aviso.status === 'informado_pago' || aviso.status === 'pago') return { status: aviso.status }
    if (aviso.status !== 'programado') {
      throw conflito('estado_invalido', `Aviso em "${aviso.status}" não pode ser informado como pago.`)
    }
    await cli.query(`update public.avisos set status = 'informado_pago' where id = $1`, [id])
    // RECORRENTE (H8.7): a ocorrência corrente também passa a `informado_pago` (o status do
    // aviso reflete a ocorrência corrente). No-op no simples (sem aviso_ocorrencias).
    if (ehRecorrente(aviso)) {
      await cli.query(
        `update public.aviso_ocorrencias set status = 'informado_pago'
          where aviso_id = $1 and indice = $2 and status = 'programado'`,
        [id, aviso.ocorrencia_atual ?? 1],
      )
    }
    await cli.query(
      `insert into public.eventos_aviso (aviso_id, tipo, ator) values ($1, 'ja_paguei_devedor', 'devedor')`,
      [id],
    )
    // Enfileira ao CRIADOR (cobrador, ou devedor-criador no invertido), com conta ou
    // por telefone (outbox generalizada; o zap envia). Idempotente por dedupe_key.
    await enfileirarNotificacao(cli, aviso, 'pagamento_informado')
    return { status: 'informado_pago' }
  })
}
