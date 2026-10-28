// Contratos de borda do modulo pedidos (fonte unica; o codegen reemite para o front).
// Preco NUNCA entra: so o servidor calcula. Dinheiro em centavos.
import { z } from 'zod'
import { Centavos, DataHoraIso, UuidSchema } from './primitivos'
import { modalidadePedido, origemPedido, statusPedido } from './enums'
// Mesma lista de formas do caixa (TEXT+CHECK no banco, nao pg_enum): fonte unica no produto.
import { formaPagamento } from './caixa'

const texto = (max: number) => z.string().trim().min(1).max(max)

export const PedidoItemEntrada = z.strictObject({
  item_id: UuidSchema,
  quantidade: z.number().int().min(1).max(99),
  opcoes_ids: z.array(UuidSchema).max(40).default([]),
  observacao: texto(300).nullable().optional(),
})

export const PedidoCriarManualEntrada = z.strictObject({
  cliente_id: UuidSchema,
  modalidade: modalidadePedido,
  endereco_id: UuidSchema.optional(),
  taxa_entrega_centavos: Centavos.default(0),
  observacao: texto(500).nullable().optional(),
  // Forma de pagamento e troco opcionais no cadastro manual (troco so com 'dinheiro', validado no
  // servidor e no banco). O carimbo sai na comanda e no despacho para o motoboy.
  forma_pagamento: formaPagamento.optional(),
  troco_para_centavos: Centavos.optional(),
  itens: z.array(PedidoItemEntrada).min(1).max(60),
})
export type PedidoCriarManualEntrada = z.infer<typeof PedidoCriarManualEntrada>

export const PedidoStatusEntrada = z.strictObject({
  para: statusPedido,
  motivo: texto(300).optional(),
})
export type PedidoStatusEntrada = z.infer<typeof PedidoStatusEntrada>

// G13 (repetir pedido inteiro): cria um pedido NOVO a partir de um pedido ANTERIOR do mesmo
// cliente/loja, reusando os itens (item_id + opcoes do snapshot), reresolvidos contra o cardapio
// de AGORA (preco/disponibilidade atuais; preco nunca vem do corpo). Os campos abaixo sobrescrevem
// o que vier do pedido anterior (todos opcionais); o restante (cliente, modalidade) herda do anterior.
export const PedidoRepetirEntrada = z.strictObject({
  endereco_id: UuidSchema.optional(),
  taxa_entrega_centavos: Centavos.optional(),
  observacao: texto(500).nullable().optional(),
  forma_pagamento: formaPagamento.nullable().optional(),
  troco_para_centavos: Centavos.nullable().optional(),
})
export type PedidoRepetirEntrada = z.infer<typeof PedidoRepetirEntrada>

// Transicao de status EM LOTE (coordenacao com o despacho: mover a corrida para `saiu_entrega`;
// tambem usavel pelo painel/atendente). Aplica a mesma maquina de estados do POST /:id/status,
// de forma atomica (tudo ou nada): transicao invalida em qualquer pedido rejeita o lote inteiro.
// Idempotente: pedido ja no status alvo e no-op (`mudou: false`), nao erro.
export const PedidoTransicaoLoteEntrada = z.strictObject({
  pedido_ids: z.array(UuidSchema).min(1).max(100),
  para: statusPedido,
  motivo: texto(300).optional(),
})
export type PedidoTransicaoLoteEntrada = z.infer<typeof PedidoTransicaoLoteEntrada>

export const PedidoTransicaoResultado = z.strictObject({
  pedido_id: UuidSchema,
  codigo: z.string(),
  de: statusPedido,
  para: statusPedido,
  mudou: z.boolean(),
})
export const PedidoTransicaoLoteSaida = z.strictObject({
  resultados: z.array(PedidoTransicaoResultado),
})
export type PedidoTransicaoLoteSaida = z.infer<typeof PedidoTransicaoLoteSaida>

export const colunaKanban = z.enum(['novo', 'em_preparo', 'saiu_entrega', 'entregue', 'problema'])
export type ColunaKanban = z.infer<typeof colunaKanban>

export const KanbanQuery = z.strictObject({
  modalidade: modalidadePedido.optional(),
  origem: origemPedido.optional(),
  /** Dia de negocio (America/Sao_Paulo) de criacao, AAAA-MM-DD. */
  data: z.iso.date().optional(),
  coluna: colunaKanban.optional(),
  cursor: z.string().min(1).max(512).optional(),
  limite: z.coerce.number().int().min(1).max(100).default(50),
})
export type KanbanQuery = z.infer<typeof KanbanQuery>

export const ImpressaoQuery = z.strictObject({
  formato: z.enum(['html', 'texto']).default('texto'),
  largura: z.coerce.number().int().refine((n) => n === 32 || n === 48, 'use 32 (58mm) ou 48 (80mm)').default(48),
})

const destinos = z.array(statusPedido)

export const PedidoCard = z.strictObject({
  id: UuidSchema,
  codigo: z.string(),
  status: statusPedido,
  origem: origemPedido,
  modalidade: modalidadePedido,
  total_centavos: Centavos,
  qtd_itens: z.number().int(),
  cliente_nome: z.string().nullable(),
  problema_motivo: z.string().nullable(),
  motoboy_nome: z.string().nullable(),
  corrida_id: UuidSchema.nullable(),
  ordem_parada: z.number().int().nullable(),
  zona_id: UuidSchema.nullable(),
  criado_em: DataHoraIso,
  destinos,
})
export type PedidoCard = z.infer<typeof PedidoCard>

export const KanbanColuna = z.strictObject({
  itens: z.array(PedidoCard),
  proximoCursor: z.string().nullable(),
})
export const PedidoKanbanSaida = z.strictObject({
  colunas: z.strictObject({
    novo: KanbanColuna.optional(),
    em_preparo: KanbanColuna.optional(),
    saiu_entrega: KanbanColuna.optional(),
    entregue: KanbanColuna.optional(),
    problema: KanbanColuna.optional(),
  }),
})
export type PedidoKanbanSaida = z.infer<typeof PedidoKanbanSaida>

export const OpcaoPedidoSaida = z.strictObject({
  id: UuidSchema,
  opcao_id: UuidSchema.nullable(),
  grupo_nome_snapshot: z.string(),
  nome_snapshot: z.string(),
  preco_centavos: Centavos,
})
export const ItemPedidoSaida = z.strictObject({
  id: UuidSchema,
  item_id: UuidSchema.nullable(),
  nome_snapshot: z.string(),
  preco_unitario_centavos: Centavos,
  quantidade: z.number().int(),
  total_centavos: Centavos,
  observacao: z.string().nullable(),
  cancelado: z.boolean(),
  opcoes: z.array(OpcaoPedidoSaida),
})
export const EnderecoPedidoSaida = z.strictObject({
  id: UuidSchema,
  logradouro: z.string(),
  numero: z.string().nullable(),
  complemento: z.string().nullable(),
  bairro: z.string().nullable(),
  cidade: z.string().nullable(),
  uf: z.string().nullable(),
  cep: z.string().nullable(),
  referencia: z.string().nullable(),
})
export const ClientePedidoSaida = z.strictObject({
  id: UuidSchema,
  nome: z.string().nullable(),
  /** Mascarado (`+55 ** *****-1234`); o telefone completo so por revelar (modulo clientes). */
  telefone_mascarado: z.string().nullable(),
})

export const PedidoDetalheSaida = z.strictObject({
  id: UuidSchema,
  codigo: z.string(),
  status: statusPedido,
  origem: origemPedido,
  modalidade: modalidadePedido,
  subtotal_centavos: Centavos,
  taxa_entrega_centavos: Centavos,
  total_centavos: Centavos,
  forma_pagamento: formaPagamento.nullable(),
  troco_para_centavos: Centavos.nullable(),
  observacao: z.string().nullable(),
  problema_motivo: z.string().nullable(),
  entregue_em: DataHoraIso.nullable(),
  criado_em: DataHoraIso,
  atualizado_em: DataHoraIso,
  conversa_id: UuidSchema.nullable(),
  zona_id: UuidSchema.nullable(),
  corrida_id: UuidSchema.nullable(),
  ordem_parada: z.number().int().nullable(),
  motoboy_id: UuidSchema.nullable(),
  motoboy_nome: z.string().nullable(),
  cliente: ClientePedidoSaida.nullable(),
  endereco: EnderecoPedidoSaida.nullable(),
  itens: z.array(ItemPedidoSaida),
  destinos,
})
export type PedidoDetalheSaida = z.infer<typeof PedidoDetalheSaida>

export const PedidoImpressaoSaida = z.strictObject({
  formato: z.enum(['html', 'texto']),
  conteudo: z.string(),
})
export type PedidoImpressaoSaida = z.infer<typeof PedidoImpressaoSaida>
