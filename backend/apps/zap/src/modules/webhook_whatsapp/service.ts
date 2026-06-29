import { z } from 'zod'
import type { Pool } from '@whaviso/shared/db'
import {
  extrairNumeroConvite,
  gerarNumeroConvite,
  sha256ConviteHex,
} from '@whaviso/shared/contracts'
import { formatarDataBr, formatarValorBr } from '@whaviso/shared/datas'
import type { ClienteWhats, EventoBotao, EventoStatus, EventoTexto } from '../../shared/whats'
import type { AdminSupabase } from '../../shared/supabase_admin'
import { carregarTemplateAtivo, renderMensagem } from '../../shared/templates'
import * as repo from './repo'
import { ehAcaoWizardPix, tratarBotaoWizard, tratarTextoWizard } from './wizard_pix'

// Logger estrutural mínimo: aceita tanto o pino quanto o log do Fastify.
interface Log {
  info(obj: unknown, msg?: string): void
  warn(obj: unknown, msg?: string): void
  error(obj: unknown, msg?: string): void
}

// E14: além das ações de convite/ciclo, o webhook reconhece `solicitar_pix` (pedido do
// devedor no lembrete) e as ações do wizard de chave (informar/pular/corrigir/confirmar).
const ACOES_BOTAO = [
  'ja_paguei', 'optout', 'ver_pix', 'ativar', 'aceite', 'recusa', 'dado_incorreto', 'confirmar', 'rejeitar',
  'solicitar_pix',
  'informar_pix', 'pix_pular', 'pix_corrigir', 'pix_confirma_tipo', 'pix_corrige_tipo', 'pix_confirmar',
] as const
type AcaoBotaoPayload = (typeof ACOES_BOTAO)[number]

const ETAPAS = ['d_menos_2', 'd_menos_1', 'd', 'd_mais_1'] as const
type EtapaPayload = (typeof ETAPAS)[number]

// D-BAILEYS: fallback por resposta NUMERADA quando os botões interativos não chegam.
// O convidado responde "1"/"2"/"3" e mapeamos para a ação do convite. A ordem segue a do
// resumo (1 Aceitar, 2 Algum dado incorreto, 3 Recusar). Compartilhado (uma vez aqui).
const FALLBACK_NUMERADO: Record<string, repo.AcaoBotao> = {
  '1': 'aceite',
  '2': 'dado_incorreto',
  '3': 'recusa',
}

/**
 * Lê o buttonId tapado no WhatsApp: "acao:avisoId" (convite / botão sem etapa) ou
 * "acao:avisoId:etapa" (botões do ciclo, H7.7: a etapa identifica de qual mensagem o
 * botão veio, para só o último aviso agir). Etapa ausente => undefined (regra de último
 * aviso não se aplica àquele toque). `aviso_id` inválido => null (ignorado sem vazar).
 */
export function parsearPayloadBotao(
  payload: string,
): { acao: AcaoBotaoPayload; avisoId: string; etapa?: EtapaPayload } | null {
  const [acao, avisoId, etapa] = payload.split(':')
  if (
    !ACOES_BOTAO.includes(acao as AcaoBotaoPayload) ||
    !avisoId ||
    !z.uuid().safeParse(avisoId).success
  ) {
    return null
  }
  const etapaValida = etapa && ETAPAS.includes(etapa as EtapaPayload) ? (etapa as EtapaPayload) : undefined
  return { acao: acao as AcaoBotaoPayload, avisoId, etapa: etapaValida }
}

export interface DepsInbound {
  pool: Pool
  logger: Log
  whats: ClienteWhats
  /** Admin API do Supabase p/ a conta-no-aceite (H5.3). null = recurso desligado. */
  admin?: AdminSupabase | null
}

/**
 * Recibo de entrega da Meta (sent/delivered/read/failed): atualiza envios.entrega_status
 * pelo wamid. O Baileys não dá esse sinal (onStatus no-op); com a Meta passa a dar.
 */
export async function processarStatus(deps: DepsInbound, evento: EventoStatus): Promise<void> {
  await repo.atualizarEntrega(deps.pool, evento.wamid, evento.status, evento.erro)
}

/**
 * Envia uma resposta ao convidado/devedor a partir de uma chave de template (texto vem do
 * banco, não do código). `contexto` escolhe a variante (invertido => 'revisao' no resumo).
 * `valores` preenche {{n}}. Best-effort (janela 24h); falha de envio não estoura.
 */
async function responder(
  deps: DepsInbound,
  para: string,
  chave: string,
  opcoes: { valores?: Record<string, string>; refId?: string; contexto?: 'padrao' | 'revisao' } = {},
): Promise<void> {
  const template = await carregarTemplateAtivo(deps.pool, chave, opcoes.contexto ?? 'padrao')
  if (!template) {
    deps.logger.warn({ chave }, 'template ausente; resposta não enviada')
    return
  }
  const mensagem = renderMensagem(template, para, { valores: opcoes.valores, refId: opcoes.refId })
  await deps.whats.enviarMensagem(mensagem).catch((e) => {
    deps.logger.warn({ err: e }, 'falha ao enviar resposta na janela 24h')
  })
}

/**
 * Processa um clique de botão vindo do socket do Baileys. Aplica a ação ao aviso
 * (idempotente por estado) e responde a confirmação na janela de 24h. Cliques
 * desconhecidos são ignorados sem efeito; em estado terminal/já-respondido o convite
 * recebe resposta informativa sem reprocessar (H5.6/H5.7).
 */
export async function processarBotao(deps: DepsInbound, evento: EventoBotao): Promise<void> {
  const info = parsearPayloadBotao(evento.buttonId)
  if (!info) return
  const telefone = normalizarTelefone(evento.telefone)
  // E14: os botões do WIZARD de chave vão para o tratador do wizard (não tocam a máquina
  // de estados do aviso). `solicitar_pix` (pedido do devedor) segue pela máquina (ação do
  // ciclo: valida telefone e regra do último aviso).
  if (ehAcaoWizardPix(info.acao)) {
    await tratarBotaoWizard(deps, telefone, info.acao, info.avisoId)
    return
  }
  await aplicarEResponder(deps, info.avisoId, info.acao as repo.AcaoBotao, {
    telefone,
    etapa: info.etapa,
  })
}

/**
 * Aplica a ação (botão ou fallback numerado) ao aviso e responde ao convidado/devedor
 * pelo template indicado pelo repo. Reusado pelo botão e pelo fallback numerado.
 */
async function aplicarEResponder(
  deps: DepsInbound,
  avisoId: string,
  acao: repo.AcaoBotao,
  opcoes: { telefone?: string | null; etapa?: repo.AcaoBotaoEtapa } = {},
): Promise<void> {
  const r = await repo.aplicarAcaoBotao(deps.pool, avisoId, acao, {
    telefoneRespondente: opcoes.telefone,
    etapaClicada: opcoes.etapa,
  })
  if (!r) return
  // H7.7 / E11 H11.2: combinado encerrado OU botão de aviso antigo (não é o último): responde
  // a cortesia "já encerrado" (universal, liberada para todos; é réplica, não consome crédito).
  if (r.encerrado) {
    if (r.telefone) {
      await responder(deps, r.telefone, 'resposta.encerrado')
    }
    return
  }
  // Idempotência (H5.6/H7.2): um botão tocado duas vezes (estado já mudou) NÃO reenvia
  // nada. Só responde quando a ação foi de fato APLICADA agora.
  if (!r.aplicado) return
  // H5.3: ao ACEITAR, garante a conta FREE do convidado (por telefone) e vincula o
  // profile.id ao aviso. Best-effort; falha aqui não desfaz o aceite (backfill no signup).
  if (acao === 'aceite' && r.conta) {
    await garantirContaNoAceite(deps, avisoId, r.conta)
  }
  // H7.3: "Chave de Pag." entrega DUAS mensagens (chave; depois titular+banco, até 3s) e
  // só marca a entrega como concluída se AMBAS saíram (G-C3). Caminho separado do resto.
  if (acao === 'ver_pix' && r.entregarPix && r.pixChave) {
    await entregarChaveDePagamento(deps, avisoId, r.pixChave, r.pixTitular ?? '', r.pixBanco ?? '')
    return
  }
  // E14: oferta de cadastro de chave ao COBRADOR (Gatilho A no aceite invertido sem chave,
  // Gatilho B quando o devedor toca solicitar_pix). Vai ao telefone do cobrador, com o
  // nome de quem vai pagar.
  if (r.ofertaPix) {
    await responder(deps, r.ofertaPix.para, 'resposta.pix_oferecer', {
      valores: { nome_devedor: r.ofertaPix.nomeDevedor },
      refId: avisoId,
    })
  }
  // Resposta principal ao respondente (quando houver). No aceite COM oferta, a resposta é
  // a própria oferta (acima) e chaveResposta vem indefinido.
  if (r.telefone && r.chaveResposta) {
    await responder(deps, r.telefone, r.chaveResposta, { valores: {}, refId: avisoId })
  }
}

/** Intervalo (ms) entre as duas mensagens do Pix (H7.3: até 3s). Configurável (0 nos testes). */
function intervaloPixMs(): number {
  const v = Number(process.env.WHATS_PIX_INTERVALO_MS)
  return Number.isFinite(v) && v >= 0 ? v : 1500
}

/**
 * H7.3/G-C3: entrega a chave em DUAS mensagens em sequência (1a: só a chave; 2a: titular
 * e banco, após até 3s). Marca `entrega_chave_status='entregue'` SOMENTE depois que as
 * DUAS saíram com sucesso. Se a 2a falhar (mesmo após os 3 retrys do transporte), NÃO
 * marca: fica reentregável no próximo toque. A chave/titular/banco nunca são logados.
 */
async function entregarChaveDePagamento(
  deps: DepsInbound,
  avisoId: string,
  chave: string,
  titular: string,
  banco: string,
): Promise<void> {
  const t1 = await carregarTemplateAtivo(deps.pool, 'resposta.ver_pix', 'padrao')
  const t2 = await carregarTemplateAtivo(deps.pool, 'resposta.ver_pix_titular', 'padrao')
  if (!t1) {
    deps.logger.warn({ chave: 'resposta.ver_pix' }, 'template ausente; chave não enviada')
    return
  }
  const para = await telefoneDoAviso(deps, avisoId)
  if (!para) return
  try {
    await deps.whats.enviarMensagem(renderMensagem(t1, para, { valores: { pix_chave: chave } }))
    // 2a mensagem só faz sentido com titular/banco e template; sem eles, entrega só a 1a.
    if (t2 && (titular || banco)) {
      await esperar(intervaloPixMs())
      await deps.whats.enviarMensagem(renderMensagem(t2, para, { valores: { titular, banco } }))
    }
    // Ambas (ou só a 1a, quando não há titular/banco) saíram: entrega concluída.
    await repo.marcarChaveEntregue(deps.pool, avisoId)
  } catch (e) {
    // Falha de envio após os retrys do transporte: NÃO marca entregue (reentregável).
    deps.logger.warn({ err: e, avisoId }, 'falha ao entregar a chave; segue reentregável')
  }
}

/** Telefone-alvo (devedor) de um aviso, sem logar. Usado pela entrega da chave. */
async function telefoneDoAviso(deps: DepsInbound, avisoId: string): Promise<string | null> {
  const { rows } = await deps.pool.query<{ telefone_devedor: string | null }>(
    `select telefone_devedor from public.avisos where id=$1`,
    [avisoId],
  )
  return rows[0]?.telefone_devedor ?? null
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * H5.3: garante a conta FREE do convidado por TELEFONE e vincula o profile.id ao aviso.
 * Idempotente (G2): o GoTrue serializa por telefone único (sem select-then-insert), e o
 * link do profile só grava se ainda estiver vazio. Sem Admin API configurada, é no-op
 * (vínculo só por telefone, degrada sem quebrar). Nunca loga telefone.
 */
async function garantirContaNoAceite(
  deps: DepsInbound,
  avisoId: string,
  conta: repo.ContaConvidado,
): Promise<void> {
  if (!deps.admin) return
  try {
    const r = await deps.admin.garantirContaPorTelefone(conta.telefone, conta.nome)
    if (r.uid) await repo.vincularProfileConvidado(deps.pool, avisoId, conta.papel, r.uid)
  } catch (e) {
    // Best-effort: a falha não desfaz o aceite (o backfill no signup, E1, cobre depois).
    deps.logger.warn({ err: e, avisoId }, 'conta-no-aceite falhou; aviso vinculado só por telefone')
  }
}

/**
 * H5.1: processa a 1ª mensagem de TEXTO do convidado (número de convite) e o fallback
 * numerado (1/2/3). Sem login no inbound (G3): o vínculo é sempre por telefone.
 *
 * Ramos:
 *  - texto = "1"/"2"/"3" e há convite pendente para o telefone → fallback de botão (H5.2).
 *  - sem número de 6 dígitos → pede o número (H5.1 fallback).
 *  - número não bate com NENHUM convite → conta tentativa (H5.1/H5.9).
 *  - número bate, status terminal/expirado → informativo, NÃO conta tentativa (G1/H5.7).
 *  - número bate, em aguardando_aceite, telefone bate → resumo + botões, zera contador (H5.2).
 *  - número bate, telefone NÃO bate → divergente, avisa as 2 pontas, NÃO conta (H5.8).
 * Nunca loga telefone/Pix/número (regra de ouro).
 */
export async function processarTexto(deps: DepsInbound, evento: EventoTexto): Promise<void> {
  const telefone = normalizarTelefone(evento.telefone)
  if (!telefone) return

  // Mini-chat de teste (sandbox): o número de teste do painel conversa SÓ com o chat
  // de teste do admin (capturado em testar_envio). Não entra na máquina de estados de
  // convite/devedor, então não recebe "pedir número de convite" nem menu automático.
  if (await ehNumeroDeTeste(deps.pool, telefone)) return

  // E14: se há um wizard de chave ATIVO para o telefone, o texto é dado da etapa atual
  // (titular/banco/chave ou resposta numerada do tipo). Precede a detecção de número de
  // convite/menu (H14.4): um número durante o wizard é dado da etapa, não convite.
  if (await tratarTextoWizard(deps, telefone, evento.texto)) return

  // Fallback numerado (D-BAILEYS): "1"/"2"/"3" só agem se houver convite pendente p/ o
  // telefone (senão é texto livre qualquer, ignorado pela regra de negócio).
  const acaoFallback = FALLBACK_NUMERADO[evento.texto.trim()]
  if (acaoFallback) {
    const pendente = await repo.localizarConvitePendentePorTelefone(deps.pool, telefone)
    if (pendente) await aplicarEResponder(deps, pendente.id, acaoFallback)
    return
  }

  const numero = extrairNumeroConvite(evento.texto)
  if (!numero) {
    // H7.1 / E11 H11.2: texto LIVRE de um DEVEDOR (sem chat/IA). Se o telefone tem
    // combinado(s) ATIVO(s) que ainda aceitam ação (programado) -> menu de opções (G-C1:
    // nunca lista informado_pago/desregistrado/terminais). O menu é UNIVERSAL (a resposta é
    // réplica, não lembrete: NÃO consome crédito). Só se NÃO houver combinado é que caímos
    // no fluxo de convite (pedir o número, E5).
    const combinados = await repo.listarCombinadosParaMenu(deps.pool, telefone)
    if (combinados.length > 0) {
      // É um DEVEDOR com combinado(s) acionável(is). Menu liberado para todos; botões
      // amarrados ao 1o acionável.
      await responder(deps, telefone, 'resposta.menu_opcoes', { refId: combinados[0]!.id })
      return
    }
    // Sem combinado acionável. Pede o número quando há convite PENDENTE para o telefone
    // (convidado que tirou o número do texto, H5.1) OU quando o telefone é DESCONHECIDO
    // (não é alvo de nenhum aviso). Se é um devedor CONHECIDO sem combinado acionável (ex.:
    // único em informado_pago/terminal/desregistrado), fica em SILÊNCIO (H7.1/G-C1: não
    // gasta envio nem vira conversa).
    const pendente = await repo.localizarConvitePendentePorTelefone(deps.pool, telefone)
    const conhecido = await repo.telefoneEhDevedorConhecido(deps.pool, telefone)
    if (pendente || !conhecido) await responder(deps, telefone, 'convite.pedir_numero')
    return
  }

  const aviso = await repo.localizarPorNumeroHash(deps.pool, sha256ConviteHex(numero))

  // Número não bate com nenhum convite → conta tentativa (H5.1/H5.9).
  if (!aviso) {
    await processarErroNumero(deps, telefone)
    return
  }

  // Número bate mas o convite NÃO está mais em aguardando_aceite (terminal/expirado/já
  // respondido): informativo, SEM contar tentativa (G1/H5.7).
  if (aviso.status !== 'aguardando_aceite') {
    await responder(deps, telefone, 'convite.ja_respondido')
    return
  }

  // Convite expirado por prazo de 7 dias (H5.7): informativo, sem reprocessar.
  if (aviso.convite_expira_em && aviso.convite_expira_em.getTime() < Date.now()) {
    await responder(deps, telefone, 'convite.expirado')
    return
  }

  // Telefone DIVERGENTE (número existe, telefone não bate): H5.8. NÃO conta tentativa.
  if (repo.telefoneAlvo(aviso) !== telefone) {
    await repo.notificarTelefoneDivergente(deps.pool, aviso)
    await responder(deps, telefone, 'convite.telefone_divergente')
    return
  }

  // Caminho feliz (H5.2): zera o contador e responde o resumo + botões.
  await repo.zerarTentativaTelefone(deps.pool, telefone)
  await responderResumo(deps, telefone, aviso)
}

/** Conta um erro de número e responde conforme o desfecho (H5.9). */
async function processarErroNumero(deps: DepsInbound, telefone: string): Promise<void> {
  const r = await repo.contarErroNumero(deps.pool, telefone, () => sha256ConviteHex(gerarNumeroConvite()))
  if (r.tipo === 'conta') {
    await responder(deps, telefone, 'convite.nao_encontrado')
    return
  }
  if (r.tipo === 'esgotado_cadastrado') {
    // Criador já foi notificado dentro da transação; orienta quem tentou a aguardar.
    await responder(deps, telefone, 'convite.tentativas_cadastrado')
    return
  }
  // Não cadastrado: bloqueado, mensagem diferente, sem notificar criador algum.
  await responder(deps, telefone, 'convite.bloqueado')
}

/**
 * H5.2: monta o resumo (quem cobra/paga, motivo, valor, data; no invertido a chave Pix)
 * e os 3 botões (rótulos do template, E12). No invertido usa a variante 'revisao' (inclui
 * a chave Pix para o cobrador conferir). Botão carrega `aviso_id` no payload.
 */
async function responderResumo(deps: DepsInbound, telefone: string, a: repo.AvisoConvite): Promise<void> {
  const invertido = a.criador_papel === 'devedor'
  // `cobrador` = "quem vai receber" (mesmo nome de variável do ciclo/billing e da paleta do
  // editor; a coluna do banco é nome_cobrador). Padronizado para o template ser editável em
  // /admin/mensagens/convite.resumo sem variável órfã (ver migration 0063).
  const valores: Record<string, string> = {
    cobrador: a.nome_cobrador ?? '',
    nome_devedor: a.nome_devedor,
    motivo: a.motivo,
    valor: formatarValorBr(a.valor_centavos),
    data: formatarDataBr(a.data_combinada),
  }
  if (invertido) valores.pix_chave = a.pix_chave ?? ''
  await responder(deps, telefone, 'convite.resumo', {
    valores,
    refId: a.id,
    contexto: invertido ? 'revisao' : 'padrao',
  })
}

/** Normaliza o telefone do inbound (só dígitos) para o formato E.164 (+DDI...). */
function normalizarTelefone(bruto: string): string | null {
  const so = bruto.replace(/\D/g, '')
  return so.length >= 8 ? `+${so}` : null
}

/**
 * True quando o telefone (E.164) é o número de teste configurado no painel. Usado para
 * que o sandbox do mini-chat de diagnóstico não dispare a regra de negócio do inbound.
 */
async function ehNumeroDeTeste(pool: Pool, telefone: string): Promise<boolean> {
  const { rows } = await pool.query<{ existe: boolean }>(
    `select exists(select 1 from public.whats_teste_config where id=1 and telefone=$1) as existe`,
    [telefone],
  )
  return rows[0]?.existe ?? false
}
