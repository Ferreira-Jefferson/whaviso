// Drena a outbox GENERALIZADA notificacoes_cobrador e avisa o ALVO no WhatsApp:
// o cobrador (fluxo receber) OU o devedor-criador (fluxo pagar invertido), com conta
// (telefone do profile) ou sem conta (telefone_alvo). O conteúdo vem da tabela
// unificada `templates` pela chave 'cobrador.<tipo>' (E12), renderizado pelo
// transporte genérico (sem string de negócio aqui).
//
// GATED por template: sem versão ativa na chave do tipo, NÃO envia, mas TORNA
// VISÍVEL ao owner (marca as linhas daquele tipo com erro 'sem_template_ativo';
// status segue 'agendado', sem PII). Ao ativar, as linhas voltam a drenar (H12.8).
//
// E10b (este módulo): espaçamento de 10min por destinatário e reconferência de
// coalescing (par opt-out/reativação, estado terminal) no CLAIM/drain; limite de plano
// (H10.8) bloqueia o envio mas mantém o registro visível/auditado. A janela de 1min e o
// cancelamento do par são produzidos pelo enfileirador (api/zap shared/notificacoes).
import type { Pool } from '@whaviso/shared/db'
import type { Logger } from '@whaviso/shared/logger'
import { ErroEnvio, type ClienteWhats } from '../../shared/baileys_client'
import { carregarTemplateAtivo, renderMensagem, type ContextoTemplate } from '../../shared/templates'
import * as repo from './repo'
import type { DadosNotificacao, NotificacaoClaim } from './repo'
import { anexarCta, valoresNotificacao } from './render'

// Motivo recuperável e SEM PII gravado na linha quando falta a versão ativa do
// template: visível ao owner em /admin/notificacoes. A linha continua 'agendado' e
// volta a drenar sozinha quando o template for ativado.
const MOTIVO_SEM_TEMPLATE = 'sem_template_ativo'

export interface DepsNotificarCobrador {
  pool: Pool
  logger: Logger
  whats: ClienteWhats
  // Origem do SPA, para montar o link de cadastro da CTA ao cobrador sem conta (H10.7).
  appUrl: string
}

/**
 * Configuração por tipo de notificação. `chave` é a chave do template (E12);
 * `contexto` escolhe a variante (a do invertido usa 'revisao' p.ex. no aceite com
 * Pix confirmado, M3); `aindaValida` é a RECONFERÊNCIA de estado no drain (descarta
 * a notificação que ficou obsoleta antes do envio). Tipos sem reconferência (eventos
 * de convite/optout) só conferem que o aviso existe.
 */
interface ConfigTipo {
  chave: string
  contexto: (d: DadosNotificacao) => ContextoTemplate
  aindaValida?: (d: DadosNotificacao) => boolean
}

const PADRAO = (): ContextoTemplate => 'padrao'

const CONFIG: Record<string, ConfigTipo> = {
  // "Já paguei": só vale enquanto o aviso segue em revisão (cobrador ainda não agiu).
  pagamento_informado: {
    chave: 'cobrador.pagamento_informado',
    contexto: PADRAO,
    aindaValida: (d) => d.aviso_status === 'informado_pago',
  },
  // Aceite: no invertido (criador = devedor) o alvo é o devedor-criador e a mensagem
  // diz que a chave Pix foi confirmada (variante 'revisao', M3).
  convite_aceito: {
    chave: 'cobrador.convite_aceito',
    contexto: (d) => (d.criador_papel === 'devedor' ? 'revisao' : 'padrao'),
  },
  convite_dado_incorreto: { chave: 'cobrador.convite_dado_incorreto', contexto: PADRAO },
  convite_recusado: { chave: 'cobrador.convite_recusado', contexto: PADRAO },
  convite_telefone_divergente: { chave: 'cobrador.convite_telefone_divergente', contexto: PADRAO },
  convite_tentativas_esgotadas: { chave: 'cobrador.convite_tentativas_esgotadas', contexto: PADRAO },
  // H10.5 opt-out: reconferência conservadora do PAR (C2). A linha é agendada +1min; se
  // o devedor REATIVA antes de a linha sair, o aviso volta a 'programado' (ou
  // 'informado_pago') e o opt-out vira OBSOLETO. Mesmo na corrida em que o drainer já
  // reivindicou a linha ('processando') no instante da reativação, este recheck no drain
  // (logo antes de enviar) impede o envio e a marca como coalescida (auditada).
  optout: {
    chave: 'cobrador.optout',
    contexto: PADRAO,
    aindaValida: (d) => d.aviso_status === 'desregistrado',
  },
  // H10.5 reativação: só vale se o aviso voltou ao ciclo (programado/informado_pago). Se
  // saiu para terminal entretanto, supera.
  reativacao: {
    chave: 'cobrador.reativacao',
    contexto: PADRAO,
    aindaValida: (d) => d.aviso_status === 'programado' || d.aviso_status === 'informado_pago',
  },

  // E2: estado do combinado, ao DEVEDOR. A reconferência descarta a notificação que
  // ficou obsoleta entre o enfileiramento e o envio (ex.: pausa desfeita, edição já
  // aprovada): só envia se o estado ainda corresponder ao evento.
  aviso_pausado: {
    chave: 'devedor.aviso_pausado',
    contexto: PADRAO,
    aindaValida: (d) => d.aviso_status === 'pausado',
  },
  aviso_reativado: {
    chave: 'devedor.aviso_reativado',
    contexto: PADRAO,
    // Reativar volta a programado; se já saiu de programado (pago/cancelado), supera.
    aindaValida: (d) => d.aviso_status === 'programado' || d.aviso_status === 'informado_pago',
  },
  aviso_cancelado: {
    chave: 'devedor.aviso_cancelado',
    contexto: PADRAO,
    aindaValida: (d) => d.aviso_status === 'cancelado',
  },
  aviso_edicao_a_aprovar: {
    chave: 'devedor.aviso_edicao_a_aprovar',
    contexto: PADRAO,
    // Só vale enquanto a edição segue aguardando aprovação (não desfeita/decidida).
    aindaValida: (d) => d.aviso_status === 'aguardando_aprovacao_aviso_editado',
  },
  // E2: edição recusada pelo devedor, ao COBRADOR (criador). Sem reconferência de
  // estado: a recusa é um fato passado (o cobrador é avisado mesmo se já reativou).
  edicao_recusada: { chave: 'cobrador.edicao_recusada', contexto: PADRAO },

  // E8: mensagens ao DEVEDOR ligadas à confirmação de pagamento (família devedor.*).
  // C1 (corrida claim-vs-reabertura): o `encerramento` é agendado +1min e SÓ pode sair se
  // o aviso AINDA está `pago` no instante do disparo. Se o cobrador reabriu dentro do
  // minuto (aviso volta a `programado`), mesmo que o drainer já tenha reivindicado a linha
  // ('processando'), este recheck no drain impede o envio e a marca como coalescida.
  encerramento: {
    chave: 'devedor.encerramento',
    contexto: PADRAO,
    aindaValida: (d) => d.aviso_status === 'pago',
  },
  // E8 H8.7 (recorrente): confirmação de uma ocorrência intermediária (k < N). Usa a
  // variante 'revisao' do template ("pagamento deste mês confirmado, o próximo lembrete
  // chega perto da próxima data"). O aviso volta a `programado` (não vira pago), então a
  // reconferência aceita os estados ativos do ciclo (programado/informado_pago).
  encerramento_recorrente: {
    chave: 'devedor.encerramento',
    contexto: (): ContextoTemplate => 'revisao',
    aindaValida: (d) => d.aviso_status === 'programado' || d.aviso_status === 'informado_pago',
  },
  // H8.6 status alterado: a reabertura tardia (encerramento já saiu) volta a `programado`.
  // Só vale enquanto o aviso segue ativo; se virou terminal de novo, supera.
  status_alterado: {
    chave: 'devedor.status_alterado',
    contexto: PADRAO,
    aindaValida: (d) => d.aviso_status === 'programado' || d.aviso_status === 'informado_pago',
  },
  // H8.2 rejeição ao devedor: o cobrador rejeitou e o aviso voltou ao ciclo (`programado`).
  // Se entretanto o devedor reinformou (informado_pago) ou o cobrador confirmou, supera.
  rejeicao: {
    chave: 'devedor.rejeicao',
    contexto: PADRAO,
    aindaValida: (d) => d.aviso_status === 'programado',
  },
  // H8.3 reengajamento: mensagem manual com os 3 botões. Vale enquanto `programado` (o
  // estado não muda no reengajamento). refId leva o aviso_id (botões sem etapa, M2).
  reengajamento: {
    chave: 'devedor.reengajamento',
    contexto: PADRAO,
    aindaValida: (d) => d.aviso_status === 'programado',
  },
  // E14: chave de pagamento cadastrada pelo cobrador (invertido), ao DEVEDOR. Sem
  // reconferência de estado: a chave é um fato (o devedor precisa dela em qualquer
  // estado vivo). Texto inclui a chave/titular/banco (valoresNotificacao).
  pix_chave_recebida: { chave: 'devedor.pix_chave_recebida', contexto: PADRAO },
}

/** Processa um lote de notificações ao alvo. Retorna quantas foram enviadas. */
export async function processarNotificacoesCobrador(deps: DepsNotificarCobrador): Promise<number> {
  const { pool, logger } = deps

  await repo.ressuscitarTravados(pool)
  const lote = await repo.reivindicar(pool)
  let enviadas = 0

  for (const notif of lote) {
    try {
      const resultado = await processarUma(deps, notif)
      if (resultado === 'enviada') enviadas++
    } catch (erro) {
      if (erro instanceof ErroEnvio && erro.permanente) {
        await repo.marcarFalhou(pool, notif.id, `envio_${erro.codigo}: ${erro.message}`)
        logger.warn({ notifId: notif.id, tipo: notif.tipo, codigo: erro.codigo }, 'erro permanente no envio')
      } else {
        const msg = erro instanceof Error ? erro.message : String(erro)
        const r = await repo.reagendarOuFalhar(pool, notif.id, notif.tentativas, msg)
        logger.warn({ notifId: notif.id, tipo: notif.tipo, resultado: r }, 'falha transitória na notificação')
      }
    }
  }

  return enviadas
}

type ResultadoUma = 'enviada' | 'cancelada' | 'sem_template'

async function processarUma(deps: DepsNotificarCobrador, notif: NotificacaoClaim): Promise<ResultadoUma> {
  const { pool, logger } = deps

  const config = CONFIG[notif.tipo]
  if (!config) {
    // Tipo desconhecido (produtor de outro épico ainda não registrado): cancela com
    // motivo auditável, sem PII. Não trava a fila.
    await repo.marcarCancelado(pool, notif.id, 'tipo_desconhecido')
    logger.warn({ notifId: notif.id, tipo: notif.tipo }, 'tipo de notificação desconhecido')
    return 'cancelada'
  }

  const dados = await repo.carregarDados(pool, notif.id)
  if (!dados) {
    await repo.marcarCancelado(pool, notif.id, 'aviso_inexistente')
    return 'cancelada'
  }
  // Reconferência de estado por tipo (H10.9 coalescing conservador, C2): descarta a
  // notificação que ficou obsoleta antes do envio (par opt-out/reativação resolvido, ou
  // estado terminal superveniente). RECHECK feito DENTRO do claim, logo antes do envio.
  // Cancelamento auditado em eventos_aviso (M5), sem PII.
  if (config.aindaValida && !config.aindaValida(dados)) {
    await repo.marcarCanceladoAuditado(pool, notif.id, notif.aviso_id, notif.tipo, 'evento_superado')
    return 'cancelada'
  }
  if (!dados.telefone_alvo) {
    await repo.marcarCancelado(pool, notif.id, 'alvo_sem_telefone')
    return 'cancelada'
  }
  // E11 H11.2: notificar o CRIADOR (cobrador) é UNIVERSAL (não é lembrete ao devedor, não
  // consome crédito). `podeEnviarPeloPlano` agora é sempre true (a função SQL foi reescrita
  // na migration 0057); o caminho de bloqueio por plano deixa de existir.

  const contexto = config.contexto(dados)
  const template = await carregarTemplateAtivo(pool, config.chave, contexto)
  if (!template) {
    // GATED: sem template ativo, não envia quebrado. Devolve a linha (reivindicada
    // como 'processando') a 'agendado' com motivo VISÍVEL ao owner; volta a drenar
    // ao ativar o template. Não conta como falha (não toca tentativas).
    await repo.devolverSemTemplate(pool, notif.id, MOTIVO_SEM_TEMPLATE)
    logger.error(
      { chave: config.chave, tipo: notif.tipo, notifId: notif.id },
      'sem template ativo: notificação aguardando ativação',
    )
    return 'sem_template'
  }

  const mensagem = renderMensagem(template, dados.telefone_alvo, {
    valores: valoresNotificacao(dados),
    refId: notif.aviso_id, // botões (E8) levam o aviso_id no payload (HMAC no webhook).
  })
  // H10.7/H8.5: cobrador SEM conta (cobrador_id nulo, alvo é o cobrador) recebe uma CTA
  // discreta de criar conta ao fim da mensagem, injetada em RUNTIME (não no template).
  // Quem TEM conta (cobrador_id presente) NÃO recebe a linha; alvo devedor também não.
  if (notif.cobrador_id === null && notif.alvo_papel === 'cobrador') {
    mensagem.texto = anexarCta(mensagem.texto, deps.appUrl)
  }
  const { wamid } = await deps.whats.enviarMensagem(mensagem)
  await repo.marcarEnviado(pool, notif.id, wamid)
  return 'enviada'
}
