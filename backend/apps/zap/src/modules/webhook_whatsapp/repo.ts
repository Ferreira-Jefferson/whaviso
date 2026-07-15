import type { Pool, PoolClient } from '@whaviso/shared/db'
import { comTransacao } from '@whaviso/shared/db'
import { calcularAgendamentos } from '@whaviso/shared/datas'
import type { EtapaEnvio, TipoChavePix } from '@whaviso/shared/contracts'
import { reservarHorario, reprogramarCiclo } from '@whaviso/shared/datas/horario'
import {
  confirmarOcorrenciaCorrente,
  reprogramarOcorrenciaCorrente,
} from '@whaviso/shared/ocorrencias'
import {
  enfileirarNotificacao,
  enfileirarNotificacaoDevedor,
  grupoOptoutReativa,
  grupoEncerramento,
  cancelarOptoutPendente,
} from '../../shared/notificacoes'
import { devolverReservaNaoAceito, reativarHold } from '../../shared/creditos'
import { criarSessaoOferta } from './wizard_pix'

/** Janela de 1min do opt-out (H10.5): a notificação ao cobrador só sai após esse adiamento. */
const OPTOUT_ADIAMENTO_SEG = 60
/** Janela de reversão de ~1min da confirmação por botão (H8.1): encerramento atrasa 60s. */
const ENCERRAMENTO_ADIAMENTO_SEG = 60

export type AcaoBotao =
  | 'ja_paguei'
  | 'optout'
  | 'ver_pix'
  | 'ativar'
  | 'aceite'
  | 'recusa'
  | 'dado_incorreto'
  // E8 H8.5: ações do COBRADOR por botão no WhatsApp (notificação "já paguei").
  | 'confirmar'
  | 'rejeitar'
  // E14 H14.3: pedido do devedor (botão no lembrete invertido sem chave) que dispara a
  // oferta de cadastro de chave ao cobrador (Gatilho B).
  | 'solicitar_pix'

/** Etapa do ciclo carregada no botão (H7.7); re-exportada para o service tipar o parse. */
export type AcaoBotaoEtapa = EtapaEnvio

/** Ações do CICLO (devedor já ativo): validam o telefone contra `telefone_devedor` (H7.6,
 *  G-M1) e respeitam "só o último aviso age" (H7.7). As de convite (aceite/recusa/
 *  dado_incorreto) validam contra o convidado (que no invertido é o cobrador) e não usam
 *  o marcador de último aviso. */
const ACOES_CICLO = ['ja_paguei', 'ver_pix', 'optout', 'ativar', 'solicitar_pix'] as const
function ehAcaoCiclo(acao: AcaoBotao): boolean {
  return (ACOES_CICLO as readonly string[]).includes(acao)
}

/** Dados do convidado para a conta-no-aceite (H5.3), só preenchido no aceite aplicado. */
export interface ContaConvidado {
  telefone: string
  nome: string
  /** Papel do convidado: receber→devedor, invertido→cobrador. Define a coluna a vincular. */
  papel: 'cobrador' | 'devedor'
}

export interface ResultadoBotao {
  aplicado: boolean
  novoStatus: string
  telefone: string | null
  pixChave: string | null
  /** H7.3: titular e banco da chave (2a mensagem do Pix). Nunca logados. */
  pixTitular?: string | null
  pixBanco?: string | null
  /** E7/H7.3: tipo da chave (snapshot no aviso), p/ a 1a msg do Pix informar CPF/telefone/etc. */
  pixTipo?: TipoChavePix | null
  /** Para escolher o template de resposta ao convidado (resposta.* / combinado.ja_respondido). */
  chaveResposta?: string
  /** H5.3: presente só no ACEITE aplicado e quando o convidado ainda não tem profile. */
  conta?: ContaConvidado
  /**
   * H7.3/H7.7: o service pede a entrega da chave em DUAS mensagens (chave; titular+banco)
   * e só depois marca a entrega. true = a chave ainda não foi entregue (entregar agora);
   * false = já entregue (não reenviar). Só vem preenchido no `ver_pix` aplicado.
   */
  entregarPix?: boolean
  /**
   * H7.7: combinado em estado terminal/desregistrado OU botão de aviso ANTIGO (não é o
   * último enviado). O service responde a cortesia "encerrado" (universal, E11 H11.2: a
   * resposta é réplica e não consome crédito). Não dispara ação de estado.
   */
  encerrado?: boolean
  /**
   * E14: o service deve enviar a oferta de cadastro de chave (resposta.pix_oferecer) ao
   * COBRADOR (`para`), com o nome de quem vai pagar. Gatilho A (aceite invertido sem chave)
   * e Gatilho B (solicitar_pix pelo devedor).
   */
  ofertaPix?: { para: string; nomeDevedor: string }
}

// Estados em que os botões do DEVEDOR ainda fazem sentido (porta de entrada das ações do
// ciclo). `programado`/`informado_pago` aceitam ja_paguei/ver_pix/optout; `desregistrado`
// aceita só `ativar` (reativar). Fora desses estados é terminal/encerrado (H7.7).
const ESTADOS_ATIVOS = ['programado', 'informado_pago', 'desregistrado'] as const

/**
 * H7.7: etapa do ÚLTIMO aviso ENVIADO de um combinado (o `enviado_em` mais recente entre
 * os envios já entregues). Só os botões dessa etapa agem; botões de mensagens anteriores
 * ficam inertes. Retorna null quando nenhum envio foi enviado ainda (cobre o caso de
 * fixtures/aceite sem envio: aí qualquer etapa clicada é aceita, pois não há "anterior").
 */
async function etapaUltimoAvisoEnviado(cli: PoolClient, avisoId: string): Promise<EtapaEnvio | null> {
  const { rows } = await cli.query<{ etapa: EtapaEnvio }>(
    `select etapa from public.envios
      where aviso_id = $1 and status = 'enviado' and enviado_em is not null
      order by enviado_em desc limit 1`,
    [avisoId],
  )
  return rows[0]?.etapa ?? null
}

/**
 * E8 M2: há um `reengajamento_cobrador` POSTERIOR ao último envio entregue? Se sim, o
 * reengajamento (H8.3) passou a ser o aviso corrente e os botões do CICLO (que carregam
 * etapa) ficam inertes; só os botões do reengajamento (sem etapa) agem. Se não há nenhum
 * envio entregue ainda (fixtures/aceite sem envio), basta haver um reengajamento.
 */
async function reengajamentoSuperaUltimoEnvio(cli: PoolClient, avisoId: string): Promise<boolean> {
  const { rows } = await cli.query<{ supera: boolean }>(
    `select exists (
       select 1 from public.eventos_aviso ev
       where ev.aviso_id = $1 and ev.tipo = 'reengajamento_cobrador'
         and ev.criado_em > coalesce(
           (select max(e.enviado_em) from public.envios e
             where e.aviso_id = $1 and e.status = 'enviado' and e.enviado_em is not null),
           'epoch'::timestamptz)
     ) as supera`,
    [avisoId],
  )
  return rows[0]?.supera ?? false
}


/** Linha de aviso usada na localização pelo número e nos ramos do aceite. */
export interface AvisoConvite {
  id: string
  status: string
  direcao: 'receber' | 'pagar'
  criador_papel: 'cobrador' | 'devedor'
  telefone_devedor: string | null
  telefone_cobrador: string | null
  nome_devedor: string
  nome_cobrador: string | null
  motivo: string
  valor_centavos: number
  data_combinada: string
  pix_chave: string | null
  cobrador_id: string | null
  devedor_profile_id: string | null
  convite_expira_em: Date | null
}

const SEL_CONVITE = `
  a.id, a.status, a.direcao, a.criador_papel, a.telefone_devedor, a.telefone_cobrador,
  a.nome_devedor, coalesce(p.nome, a.nome_cobrador) as nome_cobrador,
  a.motivo, a.valor_centavos::bigint as valor_centavos,
  to_char(a.data_combinada,'YYYY-MM-DD') as data_combinada, a.pix_chave,
  a.cobrador_id, a.devedor_profile_id, a.convite_expira_em
`

function mapearConvite(l: Record<string, unknown>): AvisoConvite {
  return { ...(l as unknown as AvisoConvite), valor_centavos: Number(l.valor_centavos) }
}

/**
 * Combinado PENDENTE (aguardando_aceite) cujo alvo é este telefone, SEM lock (leitura).
 * Usado pelo fallback numerado (1/2/3): só age se houver um combinado pendente de aceite
 * para o telefone.
 */
export async function localizarConvitePendentePorTelefone(
  ex: Pool | PoolClient,
  telefone: string,
): Promise<AvisoConvite | null> {
  const { rows } = await ex.query(
    `select ${SEL_CONVITE} from public.avisos a
       left join public.profiles p on p.id = a.cobrador_id
     where a.status='aguardando_aceite'
       and ((a.criador_papel='cobrador' and a.telefone_devedor=$1)
            or (a.criador_papel='devedor' and a.telefone_cobrador=$1))
     order by a.criado_em desc
     limit 1`,
    [telefone],
  )
  return rows[0] ? mapearConvite(rows[0]) : null
}

/**
 * Aplica a ação de um botão ao aviso, idempotente por estado.
 *  - aceite/recusa/dado_incorreto: válidos só em aguardando_aceite (convite).
 *      aceite → programado + cria envios + evento + notifica criador. O convidado tapou
 *        no WhatsApp (sem sessão no inbound): fica vinculado SÓ pelo telefone (já gravado
 *        no aviso); o vínculo de profile vem do backfill no signup (E1/G3).
 *      recusa → recusado (terminal próprio, D-RECUSADO) + evento + notifica criador.
 *      dado_incorreto → NÃO muda status (segue aguardando_aceite) + evento + notifica criador.
 *  - ja_paguei/optout/ver_pix: válidos nos estados ATIVOS (programado/informado_pago).
 * Em estado terminal/já-respondido, devolve aplicado:false + chaveResposta informativa
 * (H5.6/H5.7); o service responde sem reprocessar. Retorna o telefone do convidado p/ a
 * confirmação na janela 24h.
 */
export interface OpcoesAcao {
  /** H7.6/G-M1: telefone (normalizado) de quem tapou o botão. Validado contra
   *  `telefone_devedor` SÓ nas ações do ciclo; null pula a validação (compat). */
  telefoneRespondente?: string | null
  /** H7.7: etapa que o botão clicado carregava (do payload `acao:<id>:<etapa>`). Compara
   *  com o último aviso enviado; só a etapa do último age. undefined = sem etapa no
   *  payload (botão de convite ou legado): a regra de último-aviso não se aplica. */
  etapaClicada?: EtapaEnvio
}

export async function aplicarAcaoBotao(
  pool: Pool,
  avisoId: string,
  acao: AcaoBotao,
  opcoes: OpcoesAcao = {},
): Promise<ResultadoBotao | null> {
  return comTransacao(pool, async (cli) => {
    const { rows } = await cli.query<{
      status: string
      direcao: 'receber' | 'pagar'
      criador_papel: 'cobrador' | 'devedor'
      telefone_devedor: string | null
      telefone_cobrador: string | null
      nome_devedor: string
      nome_cobrador: string | null
      pix_chave: string | null
      pix_titular: string | null
      pix_banco: string | null
      pix_tipo: TipoChavePix | null
      entrega_chave_status: string | null
      cobrador_id: string | null
      devedor_profile_id: string | null
      data_combinada: string
      // E6 H6.10 / E8 H8.7: recorrência. null = combinado simples; ocorrencia_atual aponta
      // a ocorrência corrente cujo mini-ciclo o aceite gera; cadencia_etapas filtra etapas.
      recorrencia_tipo: string | null
      ocorrencia_atual: number | null
      cadencia_etapas: EtapaEnvio[] | null
      // E8 H8.5/C4: telefone verificado do profile do COBRADOR (quando tem conta), para
      // rotear a ação de cobrador por botão. NULL = sem conta OU conta sem telefone.
      cobrador_profile_telefone: string | null
    }>(
      `select a.status, a.direcao, a.criador_papel, a.telefone_devedor, a.telefone_cobrador,
              a.nome_devedor, a.nome_cobrador, a.pix_chave, a.pix_titular, a.pix_banco,
              a.pix_tipo, a.entrega_chave_status, a.cobrador_id, a.devedor_profile_id,
              to_char(a.data_combinada,'YYYY-MM-DD') as data_combinada,
              a.recorrencia_tipo, a.ocorrencia_atual,
              a.cadencia_etapas::text[] as cadencia_etapas,
              pc.telefone as cobrador_profile_telefone
       from public.avisos a
       left join public.profiles pc on pc.id = a.cobrador_id
       where a.id=$1 for update of a`,
      [avisoId],
    )
    const aviso = rows[0]
    if (!aviso) return null

    // Telefone do convidado que tapa o botão de convite: receber→devedor, invertido→cobrador.
    const telConvidado = aviso.criador_papel === 'cobrador' ? aviso.telefone_devedor : aviso.telefone_cobrador
    const papelConv = aviso.criador_papel === 'cobrador' ? 'devedor' : 'cobrador'

    // H7.6/G-M1: SÓ as ações do ciclo validam o telefone contra `telefone_devedor` (o
    // alvo dos lembretes nos dois fluxos). Aceite/recusa/dado_incorreto validam contra o
    // CONVIDADO (cobrador no invertido), então NÃO entram aqui (não barrar o aceite). Um
    // telefone divergente é ignorado sem efeito e sem logar nada sensível.
    if (
      ehAcaoCiclo(acao) &&
      opcoes.telefoneRespondente != null &&
      aviso.telefone_devedor != null &&
      opcoes.telefoneRespondente !== aviso.telefone_devedor
    ) {
      return null
    }
    const alvoNotif = {
      id: avisoId,
      criador_papel: aviso.criador_papel,
      cobrador_id: aviso.cobrador_id,
      devedor_profile_id: aviso.devedor_profile_id,
      telefone_cobrador: aviso.telefone_cobrador,
      telefone_devedor: aviso.telefone_devedor,
    }

    // ----- Ações do COBRADOR por botão (E8 H8.5): confirmar / rejeitar (Ainda não recebi). -----
    // Roteamento e anti-vazamento por telefone (H8.5/C4/M4/H8.9): a ação só vale se o
    // telefone que respondeu corresponde ao ALVO da notificação ao cobrador daquele
    // combinado. Cobrador COM conta -> telefone verificado do profile (C4: profile sem
    // telefone = NÃO roteável -> ignora, cai só no painel). SEM conta -> telefone_cobrador.
    // O DEVEDOR (telefone_devedor) NUNCA confirma o próprio pagamento (M4): se o telefone
    // bate só com o devedor, não vira alvo de cobrador. Tudo ignorado sem vazar (return null).
    if (acao === 'confirmar' || acao === 'rejeitar') {
      const alvoCobrador = aviso.cobrador_id ? aviso.cobrador_profile_telefone : aviso.telefone_cobrador
      // C4: cobrador-com-conta-sem-telefone -> alvoCobrador null -> não roteável.
      if (!alvoCobrador) return null
      // H8.9/M4: o remetente PRECISA bater com o alvo cobrador. Telefone ausente, divergente
      // ou igual ao do devedor (e diferente do cobrador) -> ignora sem vazar.
      if (opcoes.telefoneRespondente == null || opcoes.telefoneRespondente !== alvoCobrador) {
        return null
      }

      if (acao === 'confirmar') {
        // H8.1: só de `informado_pago`. Idempotente/silencioso em qualquer outro estado
        // (toque duplo, já pago, etc.): não vaza, não reaplica.
        if (aviso.status !== 'informado_pago') {
          return { aplicado: false, novoStatus: aviso.status, telefone: alvoCobrador, pixChave: null }
        }
        // H8.7: fecha a ocorrência corrente (no-op no simples). finalizou = última (ou simples).
        // Ator por TELEFONE (cobrador sem conta): confirmadoPor null; o ator do pagamento
        // fica no evento de auditoria abaixo (via:telefone).
        const { finalizou } = await confirmarOcorrenciaCorrente(cli, avisoId, null)
        await cli.query(
          `insert into public.eventos_aviso (aviso_id, tipo, ator, detalhes)
           values ($1,'confirmado_cobrador','cobrador', jsonb_build_object('via','telefone'))`,
          [avisoId],
        )
        if (!finalizou) {
          // Recorrente, ocorrência intermediária: o aviso volta a `programado` (o helper já
          // gerou o mini-ciclo da próxima). Mensagem ao devedor: variante recorrente.
          await cli.query(`update public.avisos set status='programado' where id=$1`, [avisoId])
          await enfileirarNotificacaoDevedor(cli, alvoNotif, 'encerramento_recorrente')
          return { aplicado: true, novoStatus: 'programado', telefone: alvoCobrador, pixChave: null, chaveResposta: 'resposta.confirmado' }
        }
        // Simples ou última ocorrência: aviso -> pago terminal (libera o horário, trigger 0038).
        await cli.query(`update public.avisos set status='pago' where id=$1`, [avisoId])
        // H8.1: encerramento ao devedor ADIADO ~1min (reversível pela reabertura), no grupo
        // de coalescing do par confirmação/reabertura.
        await enfileirarNotificacaoDevedor(cli, alvoNotif, 'encerramento', {
          agendarAposSeg: ENCERRAMENTO_ADIAMENTO_SEG,
          coalesceGrupo: grupoEncerramento(avisoId),
        })
        return { aplicado: true, novoStatus: 'pago', telefone: alvoCobrador, pixChave: null, chaveResposta: 'resposta.confirmado' }
      }

      // rejeitar (Ainda não recebi): H8.2, só de `informado_pago`. Idempotente/silencioso.
      if (aviso.status !== 'informado_pago') {
        return { aplicado: false, novoStatus: aviso.status, telefone: alvoCobrador, pixChave: null }
      }
      await cli.query(`update public.avisos set status='programado' where id=$1`, [avisoId])
      await cli.query(
        `insert into public.eventos_aviso (aviso_id, tipo, ator, detalhes)
         values ($1,'rejeitado_cobrador','cobrador', jsonb_build_object('via','telefone'))`,
        [avisoId],
      )
      // H6.5/H6.7: retoma o ciclo a partir da etapa aplicável, reusando o horário reservado.
      // RECORRENTE: age na OCORRÊNCIA CORRENTE (ancorada na data dela, H8.7); simples: no
      // ciclo do próprio aviso.
      if (aviso.recorrencia_tipo != null) {
        await reprogramarOcorrenciaCorrente(cli, avisoId)
      } else {
        await reprogramarCiclo(cli, { avisoId, telefoneDevedor: aviso.telefone_devedor })
      }
      // H8.2/C2: notifica o devedor (neutro), idempotente/coalescível por (aviso_id, tipo).
      await enfileirarNotificacaoDevedor(cli, alvoNotif, 'rejeicao')
      return { aplicado: true, novoStatus: 'programado', telefone: alvoCobrador, pixChave: null, chaveResposta: 'resposta.rejeitado' }
    }

    // ----- Botões do CONVITE (aceite/recusa/dado_incorreto): só em aguardando_aceite. -----
    if (acao === 'aceite' || acao === 'recusa' || acao === 'dado_incorreto') {
      if (aviso.status !== 'aguardando_aceite') {
        // Terminal/já-respondido: responde informativo (H5.6/H5.7), sem efeito.
        return {
          aplicado: false,
          novoStatus: aviso.status,
          telefone: telConvidado,
          pixChave: null,
          chaveResposta: 'combinado.ja_respondido',
        }
      }

      if (acao === 'recusa') {
        // D-RECUSADO: recusa do convidado vai para o terminal PRÓPRIO `recusado`.
        await cli.query(`update public.avisos set status='recusado' where id=$1`, [avisoId])
        await cli.query(
          `insert into public.eventos_aviso (aviso_id, tipo, ator) values ($1,'recusado',$2)`,
          [avisoId, papelConv],
        )
        // E11 H11.5: convite recusado DEVOLVE a reserva (nada disparou; só o aceito é cobrado).
        await devolverReservaNaoAceito(cli, avisoId)
        await enfileirarNotificacao(cli, alvoNotif, 'combinado_recusado')
        return { aplicado: true, novoStatus: 'recusado', telefone: telConvidado, pixChave: null, chaveResposta: 'resposta.recusa' }
      }

      if (acao === 'dado_incorreto') {
        // H5.4: não aceita nem recusa (segue aguardando_aceite); evento + notifica criador.
        // Evento `pix_incorreto` (mesmo sinal usado no invertido); EVENTO_FONTE de
        // 'combinado_dado_incorreto' na outbox mapeia para ele.
        await cli.query(
          `insert into public.eventos_aviso (aviso_id, tipo, ator) values ($1,'pix_incorreto',$2)`,
          [avisoId, papelConv],
        )
        await enfileirarNotificacao(cli, alvoNotif, 'combinado_dado_incorreto')
        return { aplicado: true, novoStatus: aviso.status, telefone: telConvidado, pixChave: null, chaveResposta: 'resposta.dado_incorreto' }
      }

      // aceite → programado + cria os envios do ciclo. No invertido, aceitar confirma a
      // chave Pix mostrada (já é o valor em avisos.pix_chave; nada a alterar).
      await cli.query(
        `update public.avisos set status='programado', aceito_em=now() where id=$1`,
        [avisoId],
      )
      // H6.9: aloca o segundo reservado (janela 08-18, único global, 10min/devedor) NESTA
      // transação (lock dos ativos serializa aceites concorrentes). Todas as etapas saem
      // nesse mesmo segundo, cada uma na sua data. A cadência (E6 H6.10) filtra as etapas
      // (null = ciclo completo); vale para simples e recorrente.
      const { seg } = await reservarHorario(cli, { avisoId, telefoneDevedor: aviso.telefone_devedor })
      const cadencia = aviso.cadencia_etapas ?? undefined
      if (aviso.recorrencia_tipo != null) {
        // RECORRENTE (E8 H8.7): gera o mini-ciclo da OCORRÊNCIA CORRENTE (a 1ª no aceite),
        // ancorado na data DELA, com ocorrencia_id. Geração lazy: as próximas ocorrências
        // só ganham ciclo ao serem confirmadas (confirmarOcorrenciaCorrente).
        const k = aviso.ocorrencia_atual ?? 1
        const { rows: ocRows } = await cli.query<{ id: string; data_combinada: string }>(
          `select id, to_char(data_combinada,'YYYY-MM-DD') as data_combinada
             from public.aviso_ocorrencias where aviso_id=$1 and indice=$2`,
          [avisoId, k],
        )
        const oc = ocRows[0]
        if (oc) {
          for (const a of calcularAgendamentos(oc.data_combinada, seg, new Date(), cadencia)) {
            await cli.query(
              `insert into public.envios (aviso_id, ocorrencia_id, etapa, agendado_para) values ($1,$2,$3,$4)
               on conflict (ocorrencia_id, etapa) where ocorrencia_id is not null do nothing`,
              [avisoId, oc.id, a.etapa, a.agendado_para],
            )
          }
        }
      } else {
        // SIMPLES: ciclo do próprio aviso (ocorrencia_id null), ancorado na data combinada.
        for (const a of calcularAgendamentos(aviso.data_combinada, seg, new Date(), cadencia)) {
          await cli.query(
            `insert into public.envios (aviso_id, etapa, agendado_para) values ($1,$2,$3)
             on conflict (aviso_id, etapa) where ocorrencia_id is null do nothing`,
            [avisoId, a.etapa, a.agendado_para],
          )
        }
      }
      await cli.query(
        `insert into public.eventos_aviso (aviso_id, tipo, ator) values ($1,'aceite',$2)`,
        [avisoId, papelConv],
      )
      // E14 Gatilho A: invertido SEM chave -> oferece ao cobrador cadastrar a própria chave
      // ANTES de notificar o devedor do aceite. Cria a sessão de oferta; se criada, a
      // notificação de aceite fica SEGURADA (sai quando o cobrador pular ou a sessão
      // expirar) e a resposta ao cobrador é a oferta (ofertaPix). Se já existe uma sessão
      // ativa para o cobrador, cai no fluxo normal (notifica o aceite agora).
      const invertidoSemChave =
        aviso.criador_papel === 'devedor' && aviso.direcao === 'pagar' && !aviso.pix_chave
      let ofertaPix: { para: string; nomeDevedor: string } | undefined
      if (invertidoSemChave && telConvidado) {
        const criada = await criarSessaoOferta(cli, { telefone: telConvidado, avisoId, origem: 'aceite' })
        if (criada) ofertaPix = { para: telConvidado, nomeDevedor: aviso.nome_devedor }
      }
      if (!ofertaPix) {
        await enfileirarNotificacao(cli, alvoNotif, 'combinado_aceito')
      }
      // H5.3: a conta-no-aceite (criar conta FREE + vincular profile) roda FORA desta
      // transação (chamada de rede ao GoTrue), só quando o convidado ainda não tem
      // profile vinculado e há telefone. O service cuida disso (best-effort, idempotente).
      const jaVinculado = papelConv === 'devedor' ? aviso.devedor_profile_id : aviso.cobrador_id
      const nomeConvidado = papelConv === 'devedor' ? aviso.nome_devedor : (aviso.nome_cobrador ?? aviso.nome_devedor)
      const conta: ContaConvidado | undefined =
        !jaVinculado && telConvidado ? { telefone: telConvidado, nome: nomeConvidado, papel: papelConv } : undefined
      return {
        aplicado: true,
        novoStatus: 'programado',
        telefone: telConvidado,
        pixChave: null,
        // Com oferta, a resposta ao cobrador é a própria oferta (ofertaPix); sem oferta, a
        // confirmação de aceite de sempre.
        chaveResposta: ofertaPix ? undefined : 'resposta.aceite',
        conta,
        ofertaPix,
      }
    }

    // ----- Ações do DEVEDOR (ciclo): ja_paguei / ver_pix / optout / ativar. -----
    // Estado terminal/encerrado (ou qualquer estado fora de ESTADOS_ATIVOS): o toque NÃO
    // reabre nem dispara ação (H7.7). Devolve `encerrado` para o service responder a
    // cortesia conforme o plano (free=silêncio, pago=mensagem). Cobre os 4 terminais
    // (pago/cancelado/recusado/expirado), G-C2.
    const ativo = (ESTADOS_ATIVOS as readonly string[]).includes(aviso.status)
    if (!ativo) {
      return {
        aplicado: false,
        novoStatus: aviso.status,
        telefone: aviso.telefone_devedor,
        pixChave: null,
        encerrado: true,
      }
    }

    // H7.7: só o ÚLTIMO aviso enviado age. Se o botão carrega uma etapa e não é a do
    // último envio do combinado, fica inerte (responde cortesia "encerrado", sem ação).
    // `ativar` (sai de `desregistrado`, onde os envios foram suspensos) não passa por
    // essa regra: o botão vem da própria mensagem de confirmação do opt-out, não do ciclo.
    // E8 M2 (reengajamento vira o último aviso): a mensagem de reengajamento (H8.3) leva os
    // 3 botões SEM etapa (refId = só aviso_id), então passa direto por este check e AGE. Já
    // os botões do CICLO (com etapa) ficam INERTES quando há um `reengajamento_cobrador`
    // posterior ao último envio: o reengajamento superou o ciclo como aviso corrente.
    if (opcoes.etapaClicada !== undefined && acao !== 'ativar') {
      const ultima = await etapaUltimoAvisoEnviado(cli, avisoId)
      const reengajouDepois = await reengajamentoSuperaUltimoEnvio(cli, avisoId)
      if (reengajouDepois || (ultima !== null && opcoes.etapaClicada !== ultima)) {
        return {
          aplicado: false,
          novoStatus: aviso.status,
          telefone: aviso.telefone_devedor,
          pixChave: null,
          encerrado: true,
        }
      }
    }

    if (acao === 'solicitar_pix') {
      // E14 Gatilho B (H14.3): o devedor pede a chave no lembrete. Só vale no invertido
      // SEM chave. Cria a oferta ao cobrador (sessão de oferta) e responde ao devedor.
      // Idempotente: 1 sessão ativa por telefone do cobrador (índice único parcial); se já
      // há um pedido em aberto, fica silencioso (não reabre nem duplica evento).
      const invertidoSemChave = aviso.criador_papel === 'devedor' && !aviso.pix_chave
      if (!invertidoSemChave || !aviso.telefone_cobrador) {
        return { aplicado: false, novoStatus: aviso.status, telefone: aviso.telefone_devedor, pixChave: null }
      }
      const criada = await criarSessaoOferta(cli, {
        telefone: aviso.telefone_cobrador,
        avisoId,
        origem: 'pedido_devedor',
      })
      if (!criada) {
        return { aplicado: false, novoStatus: aviso.status, telefone: aviso.telefone_devedor, pixChave: null }
      }
      await cli.query(
        `insert into public.eventos_aviso (aviso_id, tipo, ator) values ($1,'pix_solicitada','devedor')`,
        [avisoId],
      )
      return {
        aplicado: true,
        novoStatus: aviso.status,
        telefone: aviso.telefone_devedor,
        pixChave: null,
        chaveResposta: 'resposta.pix_solicitado_devedor',
        ofertaPix: { para: aviso.telefone_cobrador, nomeDevedor: aviso.nome_devedor },
      }
    }

    if (acao === 'ja_paguei') {
      // Só a partir de 'programado'; se já está em revisão, é idempotente e SILENCIOSO
      // (H7.2): não reenvia nada, não cria evento/notificação. `desregistrado` também não
      // age (não é 'programado'): silencioso.
      if (aviso.status !== 'programado') {
        return { aplicado: false, novoStatus: aviso.status, telefone: aviso.telefone_devedor, pixChave: null }
      }
      // Não vai direto para 'pago': fica em revisão até o cobrador confirmar.
      await cli.query(`update public.avisos set status='informado_pago' where id=$1`, [avisoId])
      // RECORRENTE (H8.7): a ocorrência corrente também passa a `informado_pago` (o status
      // do aviso reflete a ocorrência corrente). No-op no simples (sem aviso_ocorrencias).
      if (aviso.recorrencia_tipo != null) {
        await cli.query(
          `update public.aviso_ocorrencias set status='informado_pago'
            where aviso_id=$1 and indice=$2 and status='programado'`,
          [avisoId, aviso.ocorrencia_atual ?? 1],
        )
      }
      // H6.5: o ciclo normal PARA. Cancela as etapas restantes EXCETO d_mais_1 (marcador
      // 'informado_pago' p/ distinguir no painel, G5). A única mensagem possível depois é o
      // empurrãozinho de D+1 (etapa d_mais_1, template variante revisao), se ainda houver
      // d_mais_1 agendado e o cobrador não confirmar. Nada é re-agendado aqui: o d_mais_1
      // que sobrou do ciclo já dispara como empurrãozinho (o drainer escolhe o template).
      // No recorrente, só a ocorrência corrente tem envios ativos (geração lazy), então
      // filtrar por aviso_id já atinge apenas a corrente.
      await cli.query(
        `update public.envios set status='cancelado', erro='informado_pago'
          where aviso_id=$1 and status in ('agendado','processando') and etapa <> 'd_mais_1'`,
        [avisoId],
      )
      await cli.query(
        `insert into public.eventos_aviso (aviso_id, tipo, ator) values ($1,'ja_paguei_devedor','devedor')`,
        [avisoId],
      )
      // G-M3: a notificação é idempotente pelo dedupe_key (aviso:tipo:ocorrencia) + índice
      // único parcial; dois "Já paguei" simultâneos serializam no FOR UPDATE do aviso, e só
      // a 1a transição grava 1 evento -> 1 notificação.
      await enfileirarNotificacao(cli, alvoNotif, 'pagamento_informado')
      return { aplicado: true, novoStatus: 'informado_pago', telefone: aviso.telefone_devedor, pixChave: null, chaveResposta: 'resposta.ja_paguei' }
    }

    if (acao === 'ver_pix') {
      // H7.3: não altera status. Entrega a chave UMA VEZ por combinado: se já entregue,
      // não reenvia (entregarPix=false) e NÃO registra `solicitou_pix` de novo (só no 1o
      // toque). Sem chave cadastrada: responde resposta.sem_pix.
      if (!aviso.pix_chave) {
        return {
          aplicado: true,
          novoStatus: aviso.status,
          telefone: aviso.telefone_devedor,
          pixChave: null,
          chaveResposta: 'resposta.sem_pix',
        }
      }
      const jaEntregue = aviso.entrega_chave_status === 'entregue'
      if (!jaEntregue) {
        // 1o toque (ou reentrega após falha): registra `solicitou_pix` só na 1a vez.
        const { rows: ev } = await cli.query<{ n: number }>(
          `select count(*)::int as n from public.eventos_aviso
            where aviso_id=$1 and tipo='solicitou_pix'`,
          [avisoId],
        )
        if ((ev[0]?.n ?? 0) === 0) {
          await cli.query(
            `insert into public.eventos_aviso (aviso_id, tipo, ator) values ($1,'solicitou_pix','devedor')`,
            [avisoId],
          )
        }
      }
      // Já entregue: idempotente e SILENCIOSO (a pessoa já tem a chave; não reenvia,
      // H7.3). Sem chaveResposta -> o service não responde nada.
      if (jaEntregue) {
        return { aplicado: true, novoStatus: aviso.status, telefone: aviso.telefone_devedor, pixChave: null }
      }
      return {
        aplicado: true,
        novoStatus: aviso.status,
        telefone: aviso.telefone_devedor,
        pixChave: aviso.pix_chave,
        pixTitular: aviso.pix_titular,
        pixBanco: aviso.pix_banco,
        pixTipo: aviso.pix_tipo,
        chaveResposta: 'resposta.ver_pix',
        entregarPix: true,
      }
    }

    if (acao === 'ativar') {
      // H7.5: reativar só faz sentido em `desregistrado`. Em qualquer outro estado é
      // idempotente/silencioso (toque duplo no botão Ativar; já está programado).
      if (aviso.status !== 'desregistrado') {
        return { aplicado: false, novoStatus: aviso.status, telefone: aviso.telefone_devedor, pixChave: null }
      }
      // desregistrado → programado. O horário foi ZERADO no opt-out (liberou o segundo);
      // a reprogramação pega um NOVO horário (reusa o `_orig` se ainda livre na lógica de
      // alocação) e re-arma as etapas AINDA aplicáveis (catch-up). Combinado VENCIDO
      // (catch-up vazio, G-M2): fica em `programado` sem nenhum envio (não dispara nada;
      // o sweep do ciclo o expira pela regra normal). Não envia lembrete imediato.
      await cli.query(`update public.avisos set status='programado' where id=$1`, [avisoId])
      await reprogramarCiclo(cli, { avisoId, telefoneDevedor: aviso.telefone_devedor })
      // E11 H11.6: reativar dentro das 24h CANCELA o hold e devolve os créditos a reservado
      // (em_hold -> reservado), em vez de devolvê-los ao saldo. No-op se não havia hold.
      await reativarHold(cli, avisoId)
      await cli.query(
        `insert into public.eventos_aviso (aviso_id, tipo, ator) values ($1,'reregistrado','devedor')`,
        [avisoId],
      )
      // H10.5 par opt-out/reativação: tenta ANULAR a notificação de opt-out ainda não
      // enviada (dentro da janela de 1min). Se anulou alguma, o par se neutraliza e o
      // cobrador NÃO recebe nada (não enfileira reativação). Se NÃO havia opt-out pendente
      // (já saiu), enfileira a 2a notificação "voltou ao combinado".
      const anuladas = await cancelarOptoutPendente(cli, avisoId)
      if (anuladas === 0) {
        await enfileirarNotificacao(cli, alvoNotif, 'reativacao')
      }
      return { aplicado: true, novoStatus: 'programado', telefone: aviso.telefone_devedor, pixChave: null, chaveResposta: 'resposta.reativacao' }
    }

    // optout (H7.4): SÓ a partir de `programado` → desregistrado (reversível, NÃO terminal;
    // a máquina de estados só permite `programado → desregistrado`). Em `informado_pago`
    // (já informou; o ciclo já parou) ou já `desregistrado` é idempotente/silencioso.
    if (aviso.status !== 'programado') {
      return { aplicado: false, novoStatus: aviso.status, telefone: aviso.telefone_devedor, pixChave: null }
    }
    // O trigger encerrar_envios suspende os envios pendentes; aqui ZERAMOS o segundo
    // reservado (libera para outros combinados, H7.4), PRESERVANDO `_orig` para a
    // reativação reusar/realocar. A notificação ao cobrador é adiada em 1min (E10b);
    // aqui só enfileiramos o sinal `optout` na outbox.
    await cli.query(
      `update public.avisos
          set status='desregistrado',
              horario_reservado_orig = coalesce(horario_reservado_orig, horario_reservado_seg),
              horario_reservado_seg = null
        where id=$1`,
      [avisoId],
    )
    await cli.query(
      `insert into public.eventos_aviso (aviso_id, tipo, ator) values ($1,'optout','devedor')`,
      [avisoId],
    )
    // H10.5: notificação ao cobrador agendada +1min, no grupo de coalescing do par. Se o
    // devedor reativar dentro da janela, a reativação anula esta linha (nada chega).
    await enfileirarNotificacao(cli, alvoNotif, 'optout', {
      agendarAposSeg: OPTOUT_ADIAMENTO_SEG,
      coalesceGrupo: grupoOptoutReativa(avisoId),
    })
    return { aplicado: true, novoStatus: 'desregistrado', telefone: aviso.telefone_devedor, pixChave: null, chaveResposta: 'resposta.optout' }
  })
}

/**
 * H7.3/G-C3: marca a entrega da chave como concluída SOMENTE depois que as DUAS mensagens
 * (chave; titular+banco) saíram com sucesso. Se a 2a falhar, o service NÃO chama isto e o
 * `entrega_chave_status` fica NULL (reentregável no próximo toque). Idempotente. Nunca
 * loga a chave/titular/banco.
 */
export async function marcarChaveEntregue(pool: Pool, avisoId: string): Promise<void> {
  await pool.query(
    `update public.avisos set entrega_chave_status='entregue' where id=$1`,
    [avisoId],
  )
}

/**
 * H5.3: vincula o profile do convidado ao aviso após a conta-no-aceite. Atualiza só a
 * coluna do papel (devedor→devedor_profile_id, cobrador→cobrador_id) e SOMENTE quando
 * ainda está NULL (idempotente; toque duplo ou backfill concorrente não sobrescreve um
 * vínculo já feito). Telefone/uid nunca logados.
 */
export async function vincularProfileConvidado(
  pool: Pool,
  avisoId: string,
  papel: 'cobrador' | 'devedor',
  uid: string,
): Promise<void> {
  const coluna = papel === 'devedor' ? 'devedor_profile_id' : 'cobrador_id'
  await pool.query(
    `update public.avisos set ${coluna}=$2 where id=$1 and ${coluna} is null`,
    [avisoId, uid],
  )
}

export interface CombinadoMenu {
  /** Combinado ACIONÁVEL cujo alvo é o telefone (estado `programado`). */
  id: string
}

/**
 * H7.1/G-C1 / E11 H11.2: combinados que ainda ACEITAM ação ("programado") cujo alvo dos
 * lembretes é este telefone. "Aceita ação" exclui `informado_pago` (já informou -> silêncio),
 * `desregistrado` (sem lembretes) e os terminais. O menu de texto livre é UNIVERSAL (não há
 * mais gating por plano): havendo algum combinado acionável, o menu aparece. Se a lista vier
 * vazia, o telefone NÃO é um devedor com combinado ativo (cai no fluxo de convite). Não loga
 * telefone.
 */
export async function listarCombinadosParaMenu(
  pool: Pool,
  telefone: string,
): Promise<CombinadoMenu[]> {
  const { rows } = await pool.query<{ id: string }>(
    `select a.id
       from public.avisos a
      where a.telefone_devedor = $1
        and a.status = 'programado'
      order by a.criado_em desc`,
    [telefone],
  )
  return rows.map((r) => ({ id: r.id }))
}

/** Atualiza o status de entrega de um envio pelo wamid. Ignora wamid desconhecido. */
export async function atualizarEntrega(
  pool: Pool,
  wamid: string,
  status: 'sent' | 'delivered' | 'read' | 'failed',
  erro?: string,
): Promise<void> {
  await pool.query(
    `update public.envios set entrega_status=$2, erro=coalesce($3, erro) where wamid=$1`,
    [wamid, status, erro ?? null],
  )
}
