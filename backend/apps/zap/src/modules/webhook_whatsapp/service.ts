import { z } from 'zod'
import type { Pool } from '@whaviso/shared/db'
import {
  detectarTipoChavePix,
  gerarPayloadPixCopiaCola,
  ROTULO_TIPO_CHAVE,
  type TipoChavePix,
} from '@whaviso/shared/contracts'
import { formatarValorBr } from '@whaviso/shared/datas'
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
// Item 7 (wave 2, migration 0100): aprovar_correcao/recusar_correcao decidem um reporte
// de dado incorreto PÓS-aceite (não confundir com `dado_incorreto`, sinal simples do
// CONVITE, H5.4). Hoje chegam pelo fallback de texto "aprovar"/"recusar" (mais abaixo);
// entram em ACOES_BOTAO já agora para, se um botão de verdade existir num template
// aprovado na Meta no futuro, funcionar sem mudança nenhuma aqui.
const ACOES_BOTAO = [
  'ja_paguei', 'optout', 'ver_pix', 'ativar', 'aceite', 'recusa', 'dado_incorreto', 'confirmar', 'rejeitar',
  'solicitar_pix',
  'informar_pix', 'pix_pular', 'pix_corrigir', 'pix_confirma_tipo', 'pix_corrige_tipo', 'pix_confirmar',
  'aprovar_correcao', 'recusar_correcao',
] as const
type AcaoBotaoPayload = (typeof ACOES_BOTAO)[number]

const ETAPAS = ['d_menos_2', 'd_menos_1', 'd', 'd_mais_1'] as const
type EtapaPayload = (typeof ETAPAS)[number]

// D-FALLBACK: fallback por resposta NUMERADA quando os botões interativos não chegam.
// O convidado responde "1"/"2"/"3" e mapeamos para a ação do combinado. A ordem segue a do
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
 * Idempotência de reentrega (M-DEDUP): a Meta REENTREGA o mesmo evento se não vê o 200 a
 * tempo (o POST responde 200 e processa em background), inclusive em paralelo. Reivindica o
 * wamid ANTES de processar (claim-first): INSERT ... ON CONFLICT DO NOTHING; retorna true na
 * primeira vez e false se o wamid já foi visto. Torna o processamento de botão/texto
 * at-most-once por evento e fecha a corrida read-then-write da entrega da chave Pix (dois
 * envios simultâneos da mesma mensagem). Trade-off aceito: um crash exatamente entre o claim
 * e o processamento perde AQUELE evento (raro; um novo toque do devedor, com novo wamid,
 * recupera). Marcar só após o sucesso reabriria justamente a corrida de duplo envio.
 *
 * NÃO se aplica aos recibos de status (processarStatus): esses já são idempotentes por wamid
 * (atualizarEntrega) e a reentrega de um status ainda deve reatualizar o estado de entrega.
 */
async function reivindicarEvento(pool: Pool, wamid: string): Promise<boolean> {
  const { rows } = await pool.query<{ wamid: string }>(
    `insert into public.webhook_eventos_processados (wamid) values ($1)
       on conflict (wamid) do nothing returning wamid`,
    [wamid],
  )
  return rows.length > 0
}

/**
 * Recibo de entrega da Meta (sent/delivered/read/failed): atualiza envios.entrega_status
 * pelo wamid, sinal que vem dos recibos de status da Meta (statuses[] no webhook).
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
 * Processa um clique de botão vindo do webhook da Meta. Aplica a ação ao aviso
 * (idempotente por estado) e responde a confirmação na janela de 24h. Cliques
 * desconhecidos são ignorados sem efeito; em estado terminal/já-respondido o convite
 * recebe resposta informativa sem reprocessar (H5.6/H5.7).
 */
export async function processarBotao(deps: DepsInbound, evento: EventoBotao): Promise<void> {
  // M-DEDUP: ignora a reentrega do mesmo evento (claim-first pelo wamid).
  if (!(await reivindicarEvento(deps.pool, evento.wamid))) return
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
  // H7.3: "Chave Pix" entrega DUAS mensagens (chave; depois titular+banco, até 3s) e
  // só marca a entrega como concluída se AMBAS saíram (G-C3). Caminho separado do resto.
  if (acao === 'ver_pix' && r.entregarPix && r.pixChave) {
    await entregarChaveDePagamento(deps, avisoId, r.pixChave, r.pixTitular ?? '', r.pixBanco ?? '', r.pixTipo ?? null)
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
 *
 * Item 22 (2026-07-22): a 1a mensagem também popula `motivo`/`valor` (combinado/valor
 * do aviso), para o texto do template poder usá-los; hoje o template ainda não usa
 * essas variáveis (mudança coordenada à parte, grupo 1G), mas populá-las agora é
 * seguro (render ignora variável que o texto não referencia).
 *
 * Item 23 (2026-07-22): a 1a mensagem também leva o Pix Copia e Cola (BR Code) como
 * texto adicional, gerado por função pura (sem gateway/integração paga), reutilizando
 * a chave/titular/valor já carregados aqui. Se a geração falhar por algum motivo
 * inesperado, a chave/titular/banco (o essencial) ainda saem normalmente.
 */
async function entregarChaveDePagamento(
  deps: DepsInbound,
  avisoId: string,
  chave: string,
  titular: string,
  banco: string,
  tipo: TipoChavePix | null,
): Promise<void> {
  const t1 = await carregarTemplateAtivo(deps.pool, 'resposta.ver_pix', 'padrao')
  const t2 = await carregarTemplateAtivo(deps.pool, 'resposta.ver_pix_titular', 'padrao')
  if (!t1) {
    deps.logger.warn({ chave: 'resposta.ver_pix' }, 'template ausente; chave não enviada')
    return
  }
  const dados = await dadosEntregaChave(deps, avisoId)
  if (!dados?.telefoneDevedor) return
  const para = dados.telefoneDevedor
  // Tipo p/ o corpo (ex.: "Chave Pix (CPF):"): prefere o snapshot do aviso; senão infere do
  // formato (o zap não acessa chaves_pix). Ambíguo (11 díg. CPF x celular) -> '' (o corpo
  // é texto livre, então vazio só renderiza sem o rótulo, sem quebrar o envio).
  const tipoResolvido = tipo ?? detectarTipoChavePix(chave)
  const pixTipoRotulo = tipoResolvido ? ROTULO_TIPO_CHAVE[tipoResolvido] : ''
  try {
    const mensagem1 = renderMensagem(t1, para, {
      valores: {
        pix_tipo: pixTipoRotulo,
        pix_chave: chave,
        motivo: dados.motivo,
        valor: formatarValorBr(dados.valorCentavos),
      },
    })
    mensagem1.texto = anexarCopiaCola(mensagem1.texto, chave, titular, dados.valorCentavos)
    await deps.whats.enviarMensagem(mensagem1)
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

/**
 * Item 23: acrescenta o Pix Copia e Cola (BR Code) ao final do texto da 1a mensagem.
 * Função pura por baixo (`gerarPayloadPixCopiaCola`); qualquer erro na geração (chave
 * num formato inesperado, etc.) não pode derrubar a entrega da chave em texto, então
 * cai em silêncio e devolve o texto original sem o BR Code.
 */
function anexarCopiaCola(texto: string, chave: string, titular: string, valorCentavos: number): string {
  try {
    const payload = gerarPayloadPixCopiaCola({
      chave,
      nomeTitular: titular,
      valorCentavos,
    })
    return `${texto}\n\n${payload}`
  } catch {
    return texto
  }
}

/** Dados do aviso usados na entrega da chave (telefone do devedor, motivo, valor do
 *  combinado). Nunca loga (a query não é logada em nenhum ponto de chamada). */
async function dadosEntregaChave(
  deps: DepsInbound,
  avisoId: string,
): Promise<{ telefoneDevedor: string | null; motivo: string; valorCentavos: number } | null> {
  const { rows } = await deps.pool.query<{
    telefone_devedor: string | null
    motivo: string
    valor_centavos: string
  }>(
    `select telefone_devedor, motivo, valor_centavos::bigint as valor_centavos
       from public.avisos where id=$1`,
    [avisoId],
  )
  const linha = rows[0]
  if (!linha) return null
  return {
    telefoneDevedor: linha.telefone_devedor,
    motivo: linha.motivo,
    valorCentavos: Number(linha.valor_centavos),
  }
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

// Item 7 (wave 2): o COBRADOR resolve, por texto, um reporte de dado incorreto pendente
// (aprovar/recusar). Palavra em vez de número: evita colidir com o "1"/"2"/"3" do
// fallback do CONVITE (acima) e com a resposta numerada do wizard de Pix, e não exige
// que o devedor/cobrador conheçam um `aviso_id` (a localização é pelo TELEFONE, H8.5).
const DECISAO_CORRECAO_POR_TEXTO: Record<string, 'aprovar_correcao' | 'recusar_correcao'> = {
  aprovar: 'aprovar_correcao',
  recusar: 'recusar_correcao',
}

// Item 7 (wave 2): opção numerada de qual campo está incorreto, no MESMO texto que já
// traz a informação correta (formato "<opção> <valor>", ex.: "2 250,00"). Sem sessão
// multi-etapa (decisão de UX): um wizard de 2 mensagens exigiria uma tabela de sessão
// nova (fora do escopo desta rodada, que só toca service/repo/index do módulo); uma
// única mensagem cobre o mesmo resultado com bem menos risco. Pix NÃO entra (sinal
// próprio `pix_incorreto`, 0035). Nome e motivo são campos DIFERENTES (nome de quem
// paga não é o mesmo dado que o motivo do combinado), cada um sua própria opção
// (migration 0102, antes agrupados em 'nome_motivo').
const CAMPO_REPORTE_POR_NUMERO: Record<string, repo.CampoReporte> = {
  '1': 'nome',
  '2': 'valor',
  '3': 'data',
  '4': 'motivo',
}

interface RelatoDadoIncorreto {
  campo: repo.CampoReporte
  bruto: string
}

/** Reconhece "<1|2|3|4> <texto>" (a opção do campo + a informação correta). Não colide
 *  com o fallback "1"/"2"/"3" isolados (aceite/dado_incorreto/recusa do convite): esse
 *  exige match EXATO do dígito, sem nada depois. */
function parsearRelatoDadoIncorreto(textoBruto: string): RelatoDadoIncorreto | null {
  const m = textoBruto.trim().match(/^([1234])\s+([\s\S]+)$/)
  if (!m) return null
  const campo = CAMPO_REPORTE_POR_NUMERO[m[1]!]
  if (!campo) return null
  return { campo, bruto: m[2]!.trim() }
}

/**
 * Converte um valor em reais escrito à mão ("250,00", "250.00", "1.250,00", "R$ 250",
 * "250") para centavos. Vírgula com 1-2 dígitos depois é separador decimal (formato BR;
 * pontos antes dela são milhar, removidos). Sem vírgula nesse padrão, um PONTO com
 * exatamente 2 dígitos depois também é tratado como decimal (ex.: "250.00"); qualquer
 * outro ponto/vírgula é milhar (removido). Formato inválido ou valor <= 0 -> null.
 */
function parseValorBr(texto: string): number | null {
  const limpo = texto.replace(/r\$/i, '').trim()
  if (!limpo) return null
  let normalizado: string
  if (/,\d{1,2}$/.test(limpo)) {
    normalizado = limpo.replace(/\./g, '').replace(',', '.')
  } else if (/\.\d{2}$/.test(limpo) && !limpo.includes(',')) {
    normalizado = limpo
  } else {
    normalizado = limpo.replace(/[.,]/g, '')
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) return null
  const numero = Number(normalizado)
  if (!Number.isFinite(numero) || numero <= 0) return null
  return Math.round(numero * 100)
}

/** Converte "dd/mm/aaaa" para 'YYYY-MM-DD', validando o calendário (não só o formato). */
function parseDataBr(texto: string): string | null {
  const m = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const dia = Number(m[1])
  const mes = Number(m[2])
  const ano = Number(m[3])
  const data = new Date(Date.UTC(ano, mes - 1, dia))
  const valido = data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia
  if (!valido) return null
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}


/** Monta `dados_corretos` (formato de `avisos_reportes`, migration 0093) a partir do
 *  texto livre informado para o campo escolhido. null = formato não reconhecido. */
function montarDadosCorretos(campo: repo.CampoReporte, bruto: string): repo.DadosReporte | null {
  if (campo === 'valor') {
    const centavos = parseValorBr(bruto)
    return centavos != null ? { valor_centavos: centavos } : null
  }
  if (campo === 'data') {
    const iso = parseDataBr(bruto)
    return iso ? { data_combinada: iso } : null
  }
  if (campo === 'nome') {
    const nome = bruto.trim()
    return nome ? { nome_devedor: nome } : null
  }
  const motivo = bruto.trim()
  return motivo ? { motivo } : null
}

/**
 * Item 7 (wave 2): grava o reporte do devedor (dado incorreto pós-aceite) e responde a
 * confirmação, ou pede para tentar de novo quando o formato não é reconhecido (sem
 * criar reporte nem mudar o estado do combinado).
 */
async function tratarReporteDadoIncorreto(
  deps: DepsInbound,
  telefone: string,
  avisoId: string,
  relato: RelatoDadoIncorreto,
): Promise<void> {
  const dados = montarDadosCorretos(relato.campo, relato.bruto)
  if (!dados) {
    await responder(deps, telefone, 'resposta.dado_incorreto_formato_invalido', { refId: avisoId })
    return
  }
  const registrado = await repo.registrarReporteDadoIncorreto(deps.pool, avisoId, telefone, relato.campo, dados)
  if (!registrado) return // idempotente/silencioso (H7.2): toque duplo ou estado já mudou.
  await responder(deps, telefone, 'resposta.dado_incorreto_registrado', { refId: avisoId })
}

/**
 * Item 7 (wave 2): o COBRADOR digitou "aprovar"/"recusar". Localiza pelo TELEFONE o
 * combinado com reporte pendente e reusa `aplicarEResponder` (mesmo pipeline dos botões
 * de confirmar/rejeitar pagamento): valida de novo o telefone contra o alvo cobrador
 * (M4/H8.9) dentro da mesma transação da decisão. Retorna false quando não há reporte
 * pendente para este telefone (o texto cai no fluxo normal, sem responder nada aqui).
 */
async function tratarResolucaoCorrecao(
  deps: DepsInbound,
  telefone: string,
  acao: 'aprovar_correcao' | 'recusar_correcao',
): Promise<boolean> {
  const pendente = await repo.localizarReportePendentePorTelefoneCobrador(deps.pool, telefone)
  if (!pendente) return false
  await aplicarEResponder(deps, pendente.avisoId, acao, { telefone })
  return true
}

/**
 * Processa uma mensagem de TEXTO do devedor/convidado. Sem login no inbound (G3): o
 * vínculo é sempre por telefone. Como o Whaviso INICIA a conversa mandando o combinado
 * com botões (E5), não há mais caminho de "número de convite": o texto só cobre o
 * fallback numerado dos botões e o menu do devedor já ativo.
 *
 * Ramos:
 *  - número de teste / wizard de Pix ativo → tratados antes (não entram aqui).
 *  - texto = "1"/"2"/"3" e há combinado pendente de aceite p/ o telefone → age como botão.
 *  - texto = "aprovar"/"recusar" e o telefone é o COBRADOR de um reporte pendente (item 7,
 *    wave 2) → aprova/recusa o dado reportado como incorreto.
 *  - texto = "<1|2|3> <informação correta>" e o telefone tem combinado ATIVO (item 7,
 *    wave 2) → registra o reporte de dado incorreto pós-aceite.
 *  - qualquer outro texto: se o telefone tem combinado acionável → menu de opções; senão
 *    fica em SILÊNCIO (não vira conversa nem gasta envio).
 * Nunca loga telefone/Pix (regra de ouro).
 */
export async function processarTexto(deps: DepsInbound, evento: EventoTexto): Promise<void> {
  // M-DEDUP: ignora a reentrega do mesmo evento (claim-first pelo wamid).
  if (!(await reivindicarEvento(deps.pool, evento.wamid))) return
  const telefone = normalizarTelefone(evento.telefone)
  if (!telefone) return

  // Mini-chat de teste (sandbox): o número de teste do painel conversa SÓ com o chat
  // de teste do admin (capturado em testar_envio). Não entra na máquina de estados.
  if (await ehNumeroDeTeste(deps.pool, telefone)) return

  // E14: se há um wizard de chave ATIVO para o telefone, o texto é dado da etapa atual
  // (titular/banco/chave ou resposta numerada do tipo).
  if (await tratarTextoWizard(deps, telefone, evento.texto)) return

  // Fallback numerado (D-FALLBACK): "1"/"2"/"3" agem como os botões do combinado, mas só
  // se houver um combinado pendente de aceite p/ o telefone (senão é texto livre qualquer).
  const acaoFallback = FALLBACK_NUMERADO[evento.texto.trim()]
  if (acaoFallback) {
    const pendente = await repo.localizarConvitePendentePorTelefone(deps.pool, telefone)
    if (pendente) await aplicarEResponder(deps, pendente.id, acaoFallback)
    return
  }

  // Item 7 (wave 2): o COBRADOR resolve um reporte pendente digitando "aprovar"/"recusar".
  const decisaoTexto = DECISAO_CORRECAO_POR_TEXTO[evento.texto.trim().toLowerCase()]
  if (decisaoTexto && (await tratarResolucaoCorrecao(deps, telefone, decisaoTexto))) return

  // H7.1 / E11 H11.2: texto LIVRE de um DEVEDOR (sem chat/IA). Se o telefone tem
  // combinado(s) ATIVO(s) que ainda aceitam ação (programado) -> menu de opções (G-C1:
  // nunca lista informado_pago/desregistrado/terminais). O menu é UNIVERSAL (réplica, não
  // consome crédito). Sem combinado acionável, fica em SILÊNCIO: o Whaviso já inicia a
  // conversa mandando o combinado com botões (E5), então não há mais "pedir número".
  const combinados = await repo.listarCombinadosParaMenu(deps.pool, telefone)
  if (combinados.length > 0) {
    // Item 7 (wave 2): "<1|2|3> <informação correta>" reporta um dado incorreto do
    // combinado ATIVO em vez de abrir o menu (mesma mensagem cobre escolha + valor).
    const relato = parsearRelatoDadoIncorreto(evento.texto)
    if (relato) {
      await tratarReporteDadoIncorreto(deps, telefone, combinados[0]!.id, relato)
      return
    }
    await responder(deps, telefone, 'resposta.menu_opcoes', { refId: combinados[0]!.id })
  }
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
