// Ponte do motor com o harness (AT-harness) para o TEXTO LIVRE. O motor continua sendo quem EFETIVA:
// aqui so se decide SE o turno vai ao harness e se monta a entrada dele; a aplicacao do resultado
// (mensagens, handoff, rascunho validado) fica no service. Botao, resposta numerica de menu,
// sub-passo de texto aguardado (endereco), confirmacao e acompanhamento NUNCA passam por aqui:
// seguem direto no node deterministico (SEC-061). Falha fechada: qualquer erro ou `sem_llm` devolve
// o turno ao fluxo por botoes.
import type { ConversaCtx, NodeContract } from '@whaviso/shared/contracts'
import type { Executor } from '@whaviso/shared/db'
import { rodarTurno, type DepsHarness, type EntendimentoResumo, type ResultadoHarness } from '../../shared/harness'
import { escopoLoja, type Escopo } from '../../shared/escopo'
import { montarLinha } from './cardapio'
import { escolherDaLista } from './entrada'
import { LinhaCarrinho, type CardapioCtx, type EntradaTurno } from './tipos'

/** Entendedor de intencao, como o motor o enxerga (forma estrutural; cabe em `Entendedor` de entender_mensagem). */
export interface EntendedorMotor {
  entender(e: {
    exec: Executor
    escopo: Escopo
    mensagem: { tipo: 'texto'; texto: string }
    cardapio: { itens: readonly { id: string; nome: string }[] }
  }): Promise<EntendimentoResumo>
}

/** Dependencias do caminho LLM do motor, montadas uma vez no app-root. Ausente = so botoes. */
export interface LlmMotor {
  /** Deps estaticas do harness; o `entender` (que depende do cardapio do turno) o motor amarra por turno. */
  harness: Omit<DepsHarness, 'entender'>
  entendedor?: EntendedorMotor
  /** Sela o ctx a partir de ids ja resolvidos pelo claim (selarConversaCtx de modules/tools). */
  selar(v: { loja_id: string; cliente_id: string; conversa_id: string }): ConversaCtx
}

/**
 * O turno pode ir ao harness? So no texto livre que o node NAO consumiria de forma deterministica:
 * node que declara `usaLlm` (pedir_categoria, montar_pedido), sem sub-passo de texto aguardado, sem
 * item em coleta de opcoes e que nao e uma escolha valida de menu (numero/id apresentado).
 */
export function elegivelParaHarness(node: NodeContract, entrada: EntradaTurno): boolean {
  const { evento, estado } = entrada
  if (!node.usaLlm) return false
  if (evento.tipo !== 'texto' || !evento.texto) return false
  if (estado.aguardando !== null || estado.item_id !== null) return false
  return escolherDaLista(evento, estado.apresentados) === null
}

/** Roda o harness no texto livre do turno. Devolve null se falhar (o motor segue por botoes). */
export async function consultarHarness(
  llm: LlmMotor,
  v: { lojaId: string; clienteId: string; conversaId: string; mensagemId: string },
  entrada: EntradaTurno,
): Promise<ResultadoHarness | null> {
  const texto = entrada.evento.texto
  if (!texto) return null
  const ctx = llm.selar({ loja_id: v.lojaId, cliente_id: v.clienteId, conversa_id: v.conversaId })
  const itens = [...entrada.cardapio.itensPorId.values()].map((i) => ({ id: i.id, nome: i.nome }))
  const { entendedor } = llm
  const deps: DepsHarness = {
    ...llm.harness,
    ...(entendedor
      ? {
          entender: (t: string) =>
            entendedor.entender({ exec: llm.harness.exec, escopo: escopoLoja(v.lojaId), mensagem: { tipo: 'texto', texto: t }, cardapio: { itens } }),
        }
      : {}),
  }
  return rodarTurno(deps, {
    ctx,
    texto,
    mensagemId: v.mensagemId,
    lojaNome: entrada.loja.nome,
    cardapioNomes: itens.map((i) => i.nome),
  })
}

/**
 * Valida o `rascunho_pedido` PROPOSTO contra o cardapio vivo (ids da loja, quantidade, opcoes e grupos
 * obrigatorios pela mesma regra do node). Devolve as linhas do carrinho ou null se QUALQUER linha for
 * invalida. Nada do modelo vale como preco: o carrinho guarda so ids e quantidades. Observacao livre
 * nao tem campo no carrinho: rascunho com observacao nao e aplicado (o cliente segue por botoes).
 */
export function validarRascunho(cardapio: CardapioCtx, dados: Record<string, unknown>): LinhaCarrinho[] | null {
  const brutas = dados['linhas']
  if (!Array.isArray(brutas) || brutas.length === 0) return null
  const linhas: LinhaCarrinho[] = []
  for (const bruta of brutas) {
    if (!bruta || typeof bruta !== 'object') return null
    const { observacao, ...resto } = bruta as Record<string, unknown>
    if (observacao !== undefined) return null
    const parsed = LinhaCarrinho.safeParse(resto)
    if (!parsed.success) return null
    const item = cardapio.itensPorId.get(parsed.data.item_id)
    const grupos = cardapio.gruposPorItem.get(parsed.data.item_id)
    if (!item || !grupos) return null
    try {
      montarLinha(item, grupos, parsed.data)
    } catch {
      // Qualquer falha de montagem invalida o rascunho: nunca aborta o turno.
      return null
    }
    linhas.push(parsed.data)
  }
  return linhas
}
