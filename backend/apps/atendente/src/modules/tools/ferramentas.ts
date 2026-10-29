// Tools concretas do atendente. Cada uma: args estrito SEM loja_id/cliente_id (SEC-063), handler com o
// ConversaCtx selado, ids opacos revalidados na loja (SEC-064), so LE ou PROPOE (nunca efetiva) e
// propostas com chave de idempotencia deterministica (SEC-066). Dinheiro em centavos.
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { ConversaCtx, EventoProposto, ToolContract } from '@whaviso/shared/contracts'
import { UuidSchema, Centavos } from '@whaviso/shared/contracts'
import type { Executor } from '@whaviso/shared/db'
import { buscarConhecimento, montarContextoRag, type DepsRetriever } from '../../shared/rag'
import { ErroTool, referenciaInvalida } from './erros'
import * as repo from './repo'
import { escopoLoja } from '../../shared/escopo'

export interface DepsTools {
  exec: Executor
  /** Embeddings/reranker da PLATAFORMA; o escopo por loja vem do ctx. */
  rag: DepsRetriever
}

/** Chave idempotente: conversa + tipo + conteudo canonico (ordem das chaves irrelevante). */
export function chaveIdempotencia(ctx: ConversaCtx, tipo: string, conteudo: unknown): string {
  return createHash('sha256').update(`${ctx.conversa_id}|${tipo}|${canonico(conteudo)}`).digest('hex')
}
function canonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`
  if (v && typeof v === 'object') {
    return `{${Object.entries(v as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, x]) => `${JSON.stringify(k)}:${canonico(x)}`)
      .join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}

const Vazio = z.object({}).strict()
// Texto livre do modelo: tamanho limitado; vai SEMPRE como parametro/dado, nunca interpretado.
const Texto = (max: number) => z.string().trim().min(1).max(max)
const EventoSchema = z
  .object({ tipo: z.string(), dados: z.record(z.string(), z.unknown()), chave_idempotencia: z.string().min(16).max(128) })
  .strict()

// ---------------------------------------------------------------------------------------------
// cardapio_buscar (leitura)
const BuscarArgs = z
  .object({
    consulta: Texto(80).optional().describe('Nome ou trecho do prato/bebida a procurar.'),
    categoria: Texto(60).optional().describe('Nome (ou parte) da categoria, ex.: Lanches.'),
    limite: z.number().int().min(1).max(10).optional().describe('Maximo de itens (padrao 5).'),
  })
  .strict()
const BuscarResultado = z
  .object({
    itens: z.array(
      z
        .object({
          item_id: UuidSchema,
          nome: z.string(),
          categoria: z.string(),
          descricao: z.string().nullable(),
          preco_centavos: Centavos,
          disponivel: z.boolean(),
        })
        .strict(),
    ),
    aviso: z.string().optional(),
  })
  .strict()
export function cardapioBuscar(d: DepsTools): ToolContract<z.infer<typeof BuscarArgs>, z.infer<typeof BuscarResultado>> {
  return {
    name: 'cardapio_buscar',
    description:
      'Busca itens do cardapio da loja por nome ou categoria, com preco e disponibilidade AO VIVO. Devolve so os itens relevantes, nao o cardapio inteiro. Use o item_id retornado para montar o pedido.',
    efeito: 'leitura',
    args: BuscarArgs,
    result: BuscarResultado,
    async executar(ctx, a) {
      const linhas = await repo.buscarItens(d.exec, ctx.loja_id, {
        limite: a.limite ?? 5,
        ...(a.consulta ? { consulta: a.consulta } : {}),
        ...(a.categoria ? { categoria: a.categoria } : {}),
      })
      const itens = linhas.map((l) => ({
        item_id: l.id,
        nome: l.nome,
        categoria: l.categoria,
        descricao: l.descricao,
        preco_centavos: l.preco_centavos,
        disponivel: l.disponivel,
      }))
      return itens.length === 0
        ? { itens, aviso: 'Nenhum item encontrado com esse termo; peca ao cliente para especificar.' }
        : { itens }
    },
  }
}

// ---------------------------------------------------------------------------------------------
// montar_rascunho_pedido (proposta): NAO grava nada; devolve previa + EventoProposto para o motor.
const LinhaArgs = z
  .object({
    item_id: UuidSchema.describe('item_id retornado por cardapio_buscar.'),
    quantidade: z.number().int().min(1).max(50),
    opcoes_ids: z.array(UuidSchema).max(10).optional().describe('ids das opcoes escolhidas (tamanho, adicionais).'),
    observacao: Texto(200).optional(),
  })
  .strict()
const RascunhoArgs = z.object({ linhas: z.array(LinhaArgs).min(1).max(20) }).strict()
const RascunhoResultado = z
  .object({
    linhas: z.array(
      z
        .object({
          item_id: UuidSchema,
          nome: z.string(),
          quantidade: z.number().int(),
          opcoes: z.array(z.object({ opcao_id: UuidSchema, nome: z.string(), preco_centavos: Centavos }).strict()),
          total_centavos: Centavos,
        })
        .strict(),
    ),
    subtotal_previa_centavos: Centavos,
    evento: EventoSchema,
    aviso: z.string(),
  })
  .strict()
export function montarRascunhoPedido(d: DepsTools): ToolContract<z.infer<typeof RascunhoArgs>, z.infer<typeof RascunhoResultado>> {
  return {
    name: 'montar_rascunho_pedido',
    description:
      'Propoe o carrinho do cliente como rascunho de pedido. NAO confirma nem cobra: o sistema valida o cardapio e confirma com o cliente. Devolve uma previa de subtotal.',
    efeito: 'proposta',
    args: RascunhoArgs,
    result: RascunhoResultado,
    async executar(ctx, a) {
      const itemIds = [...new Set(a.linhas.map((l) => l.item_id))]
      const opIds = [...new Set(a.linhas.flatMap((l) => l.opcoes_ids ?? []))]
      // SEC-064: so voltam ids da loja do ctx, ativos e disponiveis. Qualquer id fora = recusa total.
      const itens = new Map((await repo.itensDaLoja(d.exec, ctx.loja_id, itemIds)).map((i) => [i.id, i]))
      const opcoes = new Map((opIds.length ? await repo.opcoesDaLoja(d.exec, ctx.loja_id, opIds) : []).map((o) => [o.id, o]))
      if (itens.size !== itemIds.length || opcoes.size !== opIds.length) throw referenciaInvalida()

      const linhas = a.linhas.map((l) => {
        const item = itens.get(l.item_id)!
        const ops = [...new Set(l.opcoes_ids ?? [])].map((id) => opcoes.get(id)!)
        const unit = item.preco_centavos + ops.reduce((s, o) => s + o.preco_centavos, 0)
        return {
          item_id: item.id,
          nome: item.nome,
          quantidade: l.quantidade,
          opcoes: ops.map((o) => ({ opcao_id: o.id, nome: o.nome, preco_centavos: o.preco_centavos })),
          total_centavos: unit * l.quantidade,
        }
      })
      // A proposta carrega SO ids/quantidades/observacao: preco e snapshot o motor recalcula (nunca do modelo).
      const dados = {
        linhas: a.linhas.map((l) => ({
          item_id: l.item_id,
          quantidade: l.quantidade,
          opcoes_ids: [...new Set(l.opcoes_ids ?? [])].sort(),
          ...(l.observacao ? { observacao: l.observacao } : {}),
        })),
      }
      const evento: EventoProposto = {
        tipo: 'rascunho_pedido',
        dados,
        chave_idempotencia: chaveIdempotencia(ctx, 'rascunho_pedido', dados),
      }
      return {
        linhas,
        subtotal_previa_centavos: linhas.reduce((s, l) => s + l.total_centavos, 0),
        evento,
        aviso: 'Previa sem taxa de entrega; o total final e calculado e confirmado pelo sistema.',
      }
    },
  }
}

// ---------------------------------------------------------------------------------------------
// cliente_reconhecer (leitura): so o cliente DA conversa (ctx), sem telefone.
const ReconhecerResultado = z
  .object({
    nome: z.string().nullable(),
    ultimo_endereco: z.object({ endereco_id: UuidSchema, resumo: z.string() }).strict().nullable(),
    pedidos_recentes: z.array(z.object({ codigo: z.string(), status: z.string(), total_centavos: Centavos }).strict()),
  })
  .strict()
export function clienteReconhecer(d: DepsTools): ToolContract<z.infer<typeof Vazio>, z.infer<typeof ReconhecerResultado>> {
  return {
    name: 'cliente_reconhecer',
    description: 'Traz o que ja esta cadastrado do cliente desta conversa: nome, ultimo endereco e pedidos recentes. Nao recebe argumentos.',
    efeito: 'leitura',
    args: Vazio,
    result: ReconhecerResultado,
    async executar(ctx) {
      const cli = await repo.lerClienteBasico(d.exec, ctx.loja_id, ctx.cliente_id)
      if (!cli) throw new ErroTool('cliente_nao_encontrado', 'Cliente nao encontrado nesta conversa.')
      const end = await repo.lerUltimoEnderecoAtivo(d.exec, ctx.loja_id, ctx.cliente_id)
      const peds = await repo.lerPedidosDoCliente(d.exec, ctx.loja_id, ctx.cliente_id, { limite: 3 })
      return {
        nome: cli.nome,
        ultimo_endereco: end
          ? { endereco_id: end.id, resumo: [end.logradouro, end.numero, end.bairro].filter(Boolean).join(', ') }
          : null,
        pedidos_recentes: peds.map((p) => ({ codigo: p.codigo, status: p.status, total_centavos: p.total_centavos })),
      }
    },
  }
}

// ---------------------------------------------------------------------------------------------
// status_pedido (leitura)
const StatusArgs = z.object({ codigo: Texto(20).optional().describe('Codigo curto do pedido; sem ele, o mais recente.') }).strict()
const StatusResultado = z
  .object({
    pedidos: z.array(z.object({ codigo: z.string(), status: z.string(), total_centavos: Centavos }).strict()),
    aviso: z.string().optional(),
  })
  .strict()
export function statusPedido(d: DepsTools): ToolContract<z.infer<typeof StatusArgs>, z.infer<typeof StatusResultado>> {
  return {
    name: 'status_pedido',
    description: 'Status real e ao vivo do pedido do cliente desta conversa (por codigo, ou o mais recente).',
    efeito: 'leitura',
    args: StatusArgs,
    result: StatusResultado,
    async executar(ctx, a) {
      const peds = await repo.lerPedidosDoCliente(d.exec, ctx.loja_id, ctx.cliente_id, {
        limite: 1,
        ...(a.codigo ? { codigo: a.codigo } : {}),
      })
      const pedidos = peds.map((p) => ({ codigo: p.codigo, status: p.status, total_centavos: p.total_centavos }))
      return pedidos.length ? { pedidos } : { pedidos, aviso: 'Nenhum pedido encontrado para este cliente.' }
    },
  }
}

// ---------------------------------------------------------------------------------------------
// escalar_humano (sinal): PROPOE o handoff; o motor muda conversas.status.
const EscalarArgs = z.object({ motivo: Texto(200).describe('Motivo curto do pedido de atendimento humano.') }).strict()
const EscalarResultado = z.object({ evento: EventoSchema, aviso: z.string() }).strict()
export function escalarHumano(): ToolContract<z.infer<typeof EscalarArgs>, z.infer<typeof EscalarResultado>> {
  return {
    name: 'escalar_humano',
    description: 'Sinaliza que um atendente humano deve assumir a conversa (duvida fora do escopo, reclamacao, insistencia).',
    efeito: 'sinal',
    args: EscalarArgs,
    result: EscalarResultado,
    async executar(ctx, a) {
      // Chave sem o motivo: repetir o pedido de handoff na mesma conversa nao duplica o efeito.
      return {
        evento: {
          tipo: 'escalar_humano',
          dados: { motivo: a.motivo },
          chave_idempotencia: chaveIdempotencia(ctx, 'escalar_humano', {}),
        },
        aviso: 'Pedido de atendimento humano registrado como proposta.',
      }
    },
  }
}

// ---------------------------------------------------------------------------------------------
// buscar_conhecimento (leitura): envolve o retriever do rag, escopado pela loja do ctx.
const ConhecimentoArgs = z
  .object({ consulta: Texto(300).describe('Pergunta sobre a loja (regras, politicas, descricoes, FAQ).') })
  .strict()
const ConhecimentoResultado = z.object({ contexto: z.string(), trechos: z.number().int().min(0) }).strict()
export function buscarConhecimentoTool(
  d: DepsTools,
): ToolContract<z.infer<typeof ConhecimentoArgs>, z.infer<typeof ConhecimentoResultado>> {
  return {
    name: 'buscar_conhecimento',
    description:
      'Busca na base de conhecimento da loja (regras, politicas, descricoes, FAQ). So dado estavel: preco, disponibilidade e status vem das ferramentas estruturadas, que mandam sobre qualquer numero no texto.',
    efeito: 'leitura',
    args: ConhecimentoArgs,
    result: ConhecimentoResultado,
    async executar(ctx, a) {
      const trechos = await buscarConhecimento(d.rag, { escopo: escopoLoja(ctx.loja_id), consulta: a.consulta })
      // Trecho e DADO delimitado, nunca comando (SEC-060/061).
      return { contexto: montarContextoRag(trechos), trechos: trechos.length }
    },
  }
}

// ---------------------------------------------------------------------------------------------
// cliente_cadastrar (proposta): NAO grava em clientes/enderecos. PROPOE, como EventoProposto, o cadastro
// de dado novo que o cliente INFORMOU (nome e/ou endereco) para o cliente DA conversa (ctx.cliente_id);
// o motor valida e efetiva uma vez. Nome e endereco sao ENTRADA NAO CONFIAVEL: Zod estrito, tamanho
// limitado, e seguem apenas como DADO da proposta (nunca comando, SEC-061). Sem loja_id/cliente_id (SEC-063).
const EnderecoArgs = z
  .object({
    logradouro: Texto(120).describe('Rua/avenida, como o cliente informou.'),
    numero: Texto(20).optional(),
    complemento: Texto(60).optional().describe('Apartamento, bloco, etc.'),
    bairro: Texto(80).optional(),
    cidade: Texto(80).optional(),
    uf: z.string().trim().length(2).optional().describe('Sigla do estado, 2 letras (ex.: SP).'),
    cep: Texto(9).optional(),
    referencia: Texto(160).optional().describe('Ponto de referencia para achar o endereco.'),
    apelido: Texto(40).optional().describe('Como o cliente chama este endereco (ex.: casa, trabalho).'),
  })
  .strict()
const CadastrarArgs = z
  .object({
    nome: Texto(80).optional().describe('Nome do cliente, como ele informou.'),
    endereco: EnderecoArgs.optional().describe('Endereco de entrega novo que o cliente informou.'),
  })
  .strict()
  .refine((a) => a.nome !== undefined || a.endereco !== undefined, { message: 'informe nome e/ou endereco' })
const CadastrarResultado = z.object({ evento: EventoSchema, aviso: z.string() }).strict()
export function clienteCadastrar(): ToolContract<z.infer<typeof CadastrarArgs>, z.infer<typeof CadastrarResultado>> {
  return {
    name: 'cliente_cadastrar',
    description:
      'Propoe cadastrar dado novo que o cliente INFORMOU (nome e/ou endereco de entrega) para o cliente desta conversa. NAO confirma nem grava: o sistema valida e confirma antes de salvar. Use quando for um cliente novo, ou quando ele der um endereco que ainda nao esta cadastrado, para que o atendimento nao fique sem saida.',
    efeito: 'proposta',
    args: CadastrarArgs,
    result: CadastrarResultado,
    async executar(ctx, a) {
      // So os campos informados viram DADO da proposta; a ordem canonica garante a idempotencia (SEC-066).
      const dados: Record<string, unknown> = {}
      if (a.nome) dados.nome = a.nome
      if (a.endereco) {
        const e = a.endereco
        dados.endereco = {
          logradouro: e.logradouro,
          ...(e.numero ? { numero: e.numero } : {}),
          ...(e.complemento ? { complemento: e.complemento } : {}),
          ...(e.bairro ? { bairro: e.bairro } : {}),
          ...(e.cidade ? { cidade: e.cidade } : {}),
          ...(e.uf ? { uf: e.uf.toUpperCase() } : {}),
          ...(e.cep ? { cep: e.cep } : {}),
          ...(e.referencia ? { referencia: e.referencia } : {}),
          ...(e.apelido ? { apelido: e.apelido } : {}),
        }
      }
      const evento: EventoProposto = {
        tipo: 'cadastro_cliente',
        dados,
        chave_idempotencia: chaveIdempotencia(ctx, 'cadastro_cliente', dados),
      }
      return { evento, aviso: 'Dados do cliente registrados como proposta; o sistema confirma antes de salvar.' }
    },
  }
}

// ---------------------------------------------------------------------------------------------
// tempo_de_entrega (leitura): estimativa AO VIVO a partir da fila da cozinha da loja do ctx. NAO promete
// horario: devolve uma FAIXA em minutos (duracao, nao relogio, portanto sem fuso) e um aviso. Nao escreve.
const PREPARO_BASE_MIN = 20 // preparo tipico de uma loja sem fila
const ENTREGA_BASE_MIN = 15 // trajeto tipico ate o cliente
const POR_PEDIDO_FILA_MIN = 5 // cada pedido na frente pesa na cozinha
const BANDA_MIN = 15 // largura da faixa (o motor nao garante o minuto exato)
const TempoResultado = z
  .object({
    minutos_min: z.number().int().min(0),
    minutos_max: z.number().int().min(0),
    pedidos_na_frente: z.number().int().min(0),
    aviso: z.string(),
  })
  .strict()
export function tempoDeEntrega(d: DepsTools): ToolContract<z.infer<typeof Vazio>, z.infer<typeof TempoResultado>> {
  return {
    name: 'tempo_de_entrega',
    description:
      'Estima o tempo de entrega AO VIVO da loja desta conversa, considerando a fila atual de pedidos. Devolve uma FAIXA em minutos (minimo e maximo), nunca uma promessa de horario. Nao recebe argumentos.',
    efeito: 'leitura',
    args: Vazio,
    result: TempoResultado,
    async executar(ctx) {
      const fila = await repo.contarFilaAtiva(d.exec, ctx.loja_id) // sempre escopado por ctx.loja_id (SEC-063)
      const base = PREPARO_BASE_MIN + ENTREGA_BASE_MIN + fila * POR_PEDIDO_FILA_MIN
      return {
        minutos_min: base,
        minutos_max: base + BANDA_MIN,
        pedidos_na_frente: fila,
        aviso: 'Estimativa, nao um horario garantido; a loja confirma o prazo ao aceitar o pedido.',
      }
    },
  }
}

/** Conjunto padrao do atendente. */
export function ferramentasPadrao(d: DepsTools): ToolContract<never, unknown>[] {
  return [
    cardapioBuscar(d),
    montarRascunhoPedido(d),
    clienteReconhecer(d),
    clienteCadastrar(),
    tempoDeEntrega(d),
    statusPedido(d),
    escalarHumano(),
    buscarConhecimentoTool(d),
  ] as unknown as ToolContract<never, unknown>[]
}
