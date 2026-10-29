// AT-harness: o laco agentico do atendente. Por turno de conversa:
//   pre-checks baratos (loja suspensa, texto, trava de escopo/insistencia) -> laco LIMITADO de tool-use
//   -> saida validada -> RespostaProposta (mensagens + EventoProposto) para o MOTOR efetivar.
//
// Fronteira sagrada (HARNESS-ATENDENTE secao 1, SEC-061): o harness ENTENDE e PROPOE; nunca efetiva.
// Eventos so entram vindos de resultados de tool do servidor (ou do handoff, que e um sinal proposto);
// o texto do modelo e DADO, nunca vira evento. O ctx e selado pelo servidor e nunca chega ao modelo.
// Guardrails do dono: human-in-the-loop (nunca inventa; na duvida, handoff), trava de escopo (so
// venda; recusa educada e silencio na insistencia), anti-injecao/sem vazamento, teto de passos e
// gasto (degrada para botoes, nunca laco ilimitado), respeita loja suspensa, observabilidade sem PII.
import { createHash } from 'node:crypto'
import type { ConversaCtx, EventoProposto, RespostaProposta } from '@whaviso/shared/contracts'
import { z } from 'zod'
import type { ErroProvedor, MensagemLlm } from '@whaviso/shared/clientes'
import { CODIGO } from '../llm_client'
import {
  LIMITES_PADRAO,
  ORIGEM_LLM,
  TEXTO_AVISO_FINAL,
  TEXTO_HANDOFF,
  TEXTO_REDIRECIONA,
  VERSAO_PROMPT,
} from './constantes'
import { contarRecusasConsecutivas, decidirEscopo, pareceTemaDaLoja } from './escopo'
import { MENSAGEM_REPARO, mensagemResultadoTool, montarMensagensIniciais, montarSystemPrompt, sanear } from './prompt'
import { interpretarSaida, vazaSegredoOuPrompt, type SaidaHarness } from './saida'
import type {
  DepsHarness,
  DesfechoResposta,
  EntendimentoResumo,
  EntradaHarness,
  LimitesHarness,
  MetricasTurno,
  MotivoParada,
  MotivoSemLlm,
  ResultadoHarness,
} from './tipos'
import { escopoLoja } from '../escopo'

/** Mesmo algoritmo de `chaveIdempotencia` de modules/tools para `escalar_humano` (conteudo `{}`): o handoff
 * proposto pelo harness e o proposto pela tool compartilham a chave e o motor efetiva uma vez (SEC-066). */
export function chaveHandoff(ctx: ConversaCtx): string {
  return createHash('sha256').update(`${ctx.conversa_id}|escalar_humano|{}`).digest('hex')
}

function eventoHandoff(ctx: ConversaCtx, motivo: string): EventoProposto {
  return { tipo: 'escalar_humano', dados: { motivo: sanear(motivo, 200) || 'nao_sei' }, chave_idempotencia: chaveHandoff(ctx) }
}

// Espelho local e estrito do contrato `EventoProposto` (kernel): so entra evento bem formado de tool.
const EventoPropostoSchema = z
  .object({
    tipo: z.string().min(1).max(64),
    dados: z.record(z.string(), z.unknown()),
    chave_idempotencia: z.string().min(16).max(128),
  })
  .strict()

const texto = (t: string): RespostaProposta['mensagens'][number] => ({ tipo: 'texto', texto: t })

function motivoSemLlm(erro: ErroProvedor): MotivoSemLlm {
  switch (erro.codigo) {
    case CODIGO.indisponivel:
      return 'indisponivel'
    case CODIGO.limiteExcedido:
    case CODIGO.limite:
      return 'limite_excedido'
    case CODIGO.chaveInvalida:
      return 'credencial_recusada'
    default:
      return 'erro_provedor'
  }
}

/** Corrida contra o prazo do turno. O timer e sempre limpo (nao segura o processo). */
async function comPrazo<T>(p: Promise<T>, restanteMs: number): Promise<T | 'timeout'> {
  if (restanteMs <= 0) return 'timeout'
  let t: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      p,
      new Promise<'timeout'>((res) => {
        t = setTimeout(() => res('timeout'), restanteMs)
      }),
    ])
  } finally {
    if (t) clearTimeout(t)
  }
}

/**
 * Entrada que o motor chama no node de entendimento (texto livre). Nunca lanca por falha de LLM: toda
 * falha vira `sem_llm` (o motor segue por botoes). O motor valida e efetiva o que vier em `resposta`.
 */
export async function rodarTurno(deps: DepsHarness, entrada: EntradaHarness): Promise<ResultadoHarness> {
  const lim: LimitesHarness = { ...LIMITES_PADRAO, ...deps.limites }
  const { ctx } = entrada
  const m: MetricasTurno = {
    passos: 0,
    ferramentas: [],
    tokensIn: 0,
    tokensOut: 0,
    custoCentavos: 0,
    paradaPor: 'pre_check',
    desfecho: 'sem_llm',
  }
  const fim = <R extends ResultadoHarness>(r: R): R => {
    deps.logger.info(
      {
        loja_id: ctx.loja_id,
        conversa_id: ctx.conversa_id,
        prompt: VERSAO_PROMPT,
        tipo: r.tipo,
        desfecho: r.metricas.desfecho,
        parada: r.metricas.paradaPor,
        passos: r.metricas.passos,
        ferramentas: r.metricas.ferramentas,
        tokens_in: r.metricas.tokensIn,
        tokens_out: r.metricas.tokensOut,
        custo_centavos: r.metricas.custoCentavos,
      },
      'harness turno',
    )
    return r
  }
  const semLlm = (motivo: MotivoSemLlm, parada?: MotivoParada): ResultadoHarness =>
    fim({ tipo: 'sem_llm', motivo, metricas: { ...m, desfecho: 'sem_llm', ...(parada ? { paradaPor: parada } : {}) } })
  const responder = (mensagens: string[], eventos: EventoProposto[], desfecho: DesfechoResposta, parada: MetricasTurno['paradaPor']): ResultadoHarness =>
    fim({
      tipo: 'resposta',
      resposta: { mensagens: mensagens.map(texto), eventos },
      desfecho,
      metricas: { ...m, desfecho, paradaPor: parada },
    })
  const handoff = (motivo: string, eventos: EventoProposto[], parada: MetricasTurno['paradaPor']): ResultadoHarness => {
    // No handoff so o sinal de humano segue: um rascunho de pedido nao e proposto a quem vai ser atendido por pessoa.
    const sinais = eventos.filter((e) => e.tipo === 'escalar_humano')
    return responder([TEXTO_HANDOFF], sinais.length ? sinais : [eventoHandoff(ctx, motivo)], 'handoff', parada)
  }

  const textoCliente = entrada.texto.trim()
  if (!textoCliente) return semLlm('sem_texto')

  // 1. Loja suspensa (controle da plataforma): nao roda LLM, o motor responde a indisponibilidade.
  const loja = await deps.repo.lerLoja(ctx.loja_id)
  if (!loja || loja.suspensa || !loja.ativo) return semLlm('loja_suspensa')

  // 2. Trava de escopo: contador derivado, antes de qualquer chamada cara.
  const saidas = await deps.repo.ultimasSaidasIa(ctx.loja_id, ctx.conversa_id, lim.limiarInsistencia + 2)
  const recusas = contarRecusasConsecutivas(saidas)
  if (recusas >= lim.limiarInsistencia && !pareceTemaDaLoja(textoCliente)) {
    // Ja em silencio e nada indica retorno ao tema: zero chamadas ao LLM, zero envio.
    return fim({ tipo: 'silencio', motivo: 'insistencia_fora_de_escopo', metricas: { ...m, desfecho: 'silencio' } })
  }

  let ent: EntendimentoResumo | undefined = entrada.entendimento
  if (!ent && deps.entender) ent = await deps.entender(textoCliente)
  if (ent?.estado === 'sem_llm') return semLlm(mapearMotivoEntender(ent.motivo))
  const foraDeEscopo = ent && (ent.estado === 'entendido' || ent.estado === 'baixa_confianca') ? ent.foraDeEscopo : false

  if (foraDeEscopo) {
    const acao = decidirEscopo(recusas, lim.limiarInsistencia)
    if (acao === 'silencio') return fim({ tipo: 'silencio', motivo: 'insistencia_fora_de_escopo', metricas: { ...m, desfecho: 'silencio' } })
    return acao === 'aviso_final'
      ? responder([TEXTO_AVISO_FINAL], [], 'aviso_final_escopo', 'pre_check')
      : responder([TEXTO_REDIRECIONA], [], 'recusa_escopo', 'pre_check')
  }

  // Pedido explicito e seguro de humano: handoff direto, sem gastar o laco.
  if (ent && (ent.estado === 'entendido' || ent.estado === 'baixa_confianca') && ent.intencao.tipo === 'falar_com_humano') {
    return handoff('pedido_do_cliente', [], 'pre_check')
  }

  // 3. Laco limitado de tool-use.
  const system = montarSystemPrompt({ lojaNome: entrada.lojaNome, persona: entrada.persona, cardapioNomes: entrada.cardapioNomes })
  const historico = await deps.repo.historicoRecente(ctx.loja_id, ctx.conversa_id, 8, entrada.mensagemId)
  const msgs: MensagemLlm[] = montarMensagensIniciais(system, textoCliente, historico)
  const ferramentas = deps.registro.specs()
  const eventos: EventoProposto[] = []
  const chaves = new Set<string>()
  const prazo = Date.now() + lim.timeoutTurnoMs
  let reparou = false
  let parada: MotivoParada = 'teto_passos'

  const teveHandoff = (): boolean => eventos.some((e) => e.tipo === 'escalar_humano')
  const degradar = (motivo: MotivoSemLlm, p: MotivoParada): ResultadoHarness =>
    // Se o modelo ja pediu humano antes do teto, o pedido nao se perde.
    teveHandoff() ? handoff('nao_sei', eventos, p) : semLlm(motivo, p)

  for (let passo = 0; passo < lim.maxPassos; passo++) {
    const restante = prazo - Date.now()
    const r = await comPrazo(
      deps.servico.completar({ exec: deps.exec, escopo: escopoLoja(ctx.loja_id), origem: ORIGEM_LLM, mensagens: msgs, ferramentas }),
      restante,
    )
    if (r === 'timeout') return degradar('timeout', 'timeout')
    m.passos++
    if (!r.ok) {
      deps.logger.warn({ loja_id: ctx.loja_id, conversa_id: ctx.conversa_id, codigo: r.erro.codigo }, 'harness: llm falhou')
      return degradar(motivoSemLlm(r.erro), 'erro_llm')
    }
    const resp = r.valor
    m.tokensIn += resp.uso.tokensIn
    m.tokensOut += resp.uso.tokensOut
    m.custoCentavos += resp.uso.custoEstimadoCentavos
    const estourou = m.custoCentavos > lim.tetoCustoTurnoCentavos || m.tokensIn + m.tokensOut > lim.tetoTokensTurno

    if (resp.chamadasFerramenta.length === 0) {
      // Saida final candidata.
      const saida = interpretarSaida(resp.texto)
      if (!saida) {
        if (!reparou && passo + 1 < lim.maxPassos && !estourou) {
          reparou = true
          msgs.push({ papel: 'assistant', conteudo: sanear(resp.texto, 600) || '(vazio)' }, MENSAGEM_REPARO)
          continue
        }
        // Baixa confianca estrutural: nao chuta, chama humano.
        return handoff('saida_invalida', eventos, 'saida_invalida')
      }
      return finalizar(saida, lim, eventos, handoff, responder)
    }

    if (estourou) return degradar('teto_gasto', 'teto_gasto')

    // Executa as tools pedidas (ctx selado injetado aqui; o modelo so manda nome + argumentos).
    msgs.push({ papel: 'assistant', conteudo: `[solicitou ferramentas: ${resp.chamadasFerramenta.map((c) => sanear(c.nome, 64)).join(', ')}]` })
    const executadas = resp.chamadasFerramenta.slice(0, lim.maxToolsPorPasso)
    for (const chamada of resp.chamadasFerramenta) {
      if (!executadas.includes(chamada)) {
        msgs.push(mensagemResultadoTool(chamada.nome, { erro: { codigo: 'limite_de_ferramentas', mensagem: 'Muitas ferramentas de uma vez; peça menos por passo.' } }))
        continue
      }
      let res
      try {
        res = await deps.registro.executar({ id: chamada.id, nome: chamada.nome, argumentos: chamada.argumentos }, ctx)
      } catch {
        res = { ok: false as const, erro: { codigo: 'erro_interno', mensagem: 'Falha ao executar a ferramenta.' } }
      }
      m.ferramentas.push(deps.registro.efeitoDe(chamada.nome) ? chamada.nome : 'desconhecida')
      if (res.ok) {
        const { visivel, evento } = separarEvento(res.dados)
        if (evento && !chaves.has(evento.chave_idempotencia)) {
          chaves.add(evento.chave_idempotencia)
          eventos.push(evento)
        }
        msgs.push(mensagemResultadoTool(chamada.nome, visivel))
      } else {
        msgs.push(mensagemResultadoTool(chamada.nome, { erro: res.erro }))
      }
    }
    parada = 'teto_passos'
  }

  // Estourou os passos ainda com tool pendente: degrada (ou entrega o handoff ja pedido).
  return degradar('teto_passos', parada)
}

/** Aplica os guardrails a saida final valida: confianca, humano, vazamento. */
function finalizar(
  saida: SaidaHarness,
  lim: LimitesHarness,
  eventos: EventoProposto[],
  handoff: (motivo: string, ev: EventoProposto[], p: MetricasTurno['paradaPor']) => ResultadoHarness,
  responder: (msgs: string[], ev: EventoProposto[], d: DesfechoResposta, p: MetricasTurno['paradaPor']) => ResultadoHarness,
): ResultadoHarness {
  // Vazamento de segredo/prompt: descarta a saida inteira (e eventos), volta a oferecer o pedido.
  if (vazaSegredoOuPrompt(saida.resposta) || (saida.motivo && vazaSegredoOuPrompt(saida.motivo))) {
    return responder([TEXTO_REDIRECIONA], [], 'vazamento_bloqueado', 'saida_final')
  }
  // Human-in-the-loop: pediu humano, chamou escalar_humano ou nao tem confianca => handoff, sem inventar.
  if (saida.precisa_humano || eventos.some((e) => e.tipo === 'escalar_humano') || saida.confianca < lim.limiarConfianca) {
    const motivo = saida.precisa_humano || eventos.some((e) => e.tipo === 'escalar_humano') ? (saida.motivo ?? 'nao_sei') : 'baixa_confianca'
    return handoff(motivo, eventos, 'saida_final')
  }
  return responder([saida.resposta], eventos, 'resposta', 'saida_final')
}

/** Tira o `evento` do resultado da tool: o modelo nao precisa ver a chave; o evento so valida aqui. */
function separarEvento(dados: unknown): { visivel: unknown; evento?: EventoProposto } {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados) || !('evento' in dados)) return { visivel: dados }
  const { evento, ...resto } = dados as Record<string, unknown>
  const parsed = EventoPropostoSchema.safeParse(evento)
  return parsed.success ? { visivel: resto, evento: parsed.data } : { visivel: resto }
}

function mapearMotivoEntender(motivo: string): MotivoSemLlm {
  if (motivo === 'limite_excedido') return 'limite_excedido'
  if (motivo === 'credencial_recusada') return 'credencial_recusada'
  if (motivo === 'indisponivel') return 'indisponivel'
  return 'erro_provedor'
}
