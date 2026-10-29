// GERADO POR scripts/gen_contracts a partir de backend/packages/shared/src/contracts/enums.ts.
// NAO EDITAR A MAO: rode `npm run gen:contracts` no backend. Ver historias/00-fundacao/kernel-contratos.md.

import { z } from 'zod'

// Enums de domínio do restaurante. Espelham 1:1 os enums do Postgres (baseline
// 0001-0012). A fonte da verdade é o banco; o teste de paridade compara estes valores
// contra `pg_enum` do whaviso_dev e falha se divergirem (ver enums.test.ts / F7).
// Convenção: um `z.enum` exportado por tipo + o tipo inferido. `ENUMS_POSTGRES` no fim
// reúne os que têm contrapartida no banco, para a paridade.

// --- Conta, loja, número ---
export const papelMembro = z.enum(['dono', 'gerente', 'atendente', 'convidado'])
export type PapelMembro = z.infer<typeof papelMembro>

export const statusNumero = z.enum(['conectado', 'pausado', 'removido'])
export type StatusNumero = z.infer<typeof statusNumero>

// --- Cardápio ---
export const tipoGrupo = z.enum(['tamanho', 'adicional', 'customizado'])
export type TipoGrupo = z.infer<typeof tipoGrupo>

// --- Pedido ---
// `rascunho` é montado pelo atendente (IA) e fica fora do kanban até ser confirmado.
export const statusPedido = z.enum([
  'rascunho',
  'novo',
  'em_preparo',
  'saiu_entrega',
  'entregue',
  'problema',
])
export type StatusPedido = z.infer<typeof statusPedido>

export const origemPedido = z.enum(['whatsapp', 'ifood', 'manual'])
export type OrigemPedido = z.infer<typeof origemPedido>

export const modalidadePedido = z.enum(['entrega', 'retirada'])
export type ModalidadePedido = z.infer<typeof modalidadePedido>

// --- Conversa e mensagem ---
// 'aguardando' = a automacao pediu ajuda humana e ninguem assumiu ainda (estado reivindicavel).
export const statusConversa = z.enum(['ia', 'aguardando', 'humano', 'encerrada'])
export type StatusConversa = z.infer<typeof statusConversa>

export const direcaoMensagem = z.enum(['entrada', 'saida'])
export type DirecaoMensagem = z.infer<typeof direcaoMensagem>

export const tipoMensagem = z.enum(['texto', 'audio', 'imagem', 'interativo', 'outro'])
export type TipoMensagem = z.infer<typeof tipoMensagem>

export const autorMensagem = z.enum(['cliente', 'ia', 'humano', 'sistema'])
export type AutorMensagem = z.infer<typeof autorMensagem>

// --- Entrega (zonas, motoboys, corridas) ---
export const tipoZona = z.enum(['bairro', 'poligono', 'raio'])
export type TipoZona = z.infer<typeof tipoZona>

export const tipoVeiculo = z.enum(['moto', 'bicicleta', 'carro', 'a_pe'])
export type TipoVeiculo = z.infer<typeof tipoVeiculo>

export const statusFechamento = z.enum(['aberto', 'pago'])
export type StatusFechamento = z.infer<typeof statusFechamento>

export const tipoLancamento = z.enum(['entrega', 'ajuste'])
export type TipoLancamento = z.infer<typeof tipoLancamento>

export const statusCorrida = z.enum(['montando', 'despachada', 'concluida'])
export type StatusCorrida = z.infer<typeof statusCorrida>

// --- Contas a pagar (Financeiro: dinheiro saindo) ---
// Regime de pagamento do motoboy (como a loja paga o entregador) + tipos do lancamento manual
// (pagavel de fornecedor ou pessoa nao-motoboy).
export const regimePagamento = z.enum(['por_entrega', 'fixo', 'fixo_mais_entrega'])
export type RegimePagamento = z.infer<typeof regimePagamento>

export const periodicidadeFixo = z.enum(['dia', 'mes'])
export type PeriodicidadeFixo = z.infer<typeof periodicidadeFixo>

export const credorTipo = z.enum(['fornecedor', 'pessoa'])
export type CredorTipo = z.infer<typeof credorTipo>

export const statusContaPagar = z.enum(['a_pagar', 'pago'])
export type StatusContaPagar = z.infer<typeof statusContaPagar>

// --- Pagamento (Pix na conversa) ---
export const statusPagamento = z.enum(['pendente', 'pago', 'expirado', 'cancelado'])
export type StatusPagamento = z.infer<typeof statusPagamento>

// --- Plataforma (operador) ---
export const papelOperador = z.enum(['operador', 'admin', 'convidado', 'suporte', 'financeiro'])
export type PapelOperador = z.infer<typeof papelOperador>

export const estagioProspecto = z.enum(['novo', 'contato', 'proposta', 'ativo', 'perdido'])
export type EstagioProspecto = z.infer<typeof estagioProspecto>

export const tipoAtividadeProspecto = z.enum([
  'nota',
  'ligacao',
  'mensagem',
  'reuniao',
  'follow_up',
])
export type TipoAtividadeProspecto = z.infer<typeof tipoAtividadeProspecto>

export const statusAssinatura = z.enum(['trial', 'ativa', 'suspensa', 'cancelada'])
export type StatusAssinatura = z.infer<typeof statusAssinatura>

export const statusFatura = z.enum(['aberta', 'paga', 'atrasada', 'cancelada'])
export type StatusFatura = z.infer<typeof statusFatura>

// --- Transporte (templates e outbox) ---
export const statusMetaTemplate = z.enum(['pendente', 'aprovado', 'rejeitado'])
export type StatusMetaTemplate = z.infer<typeof statusMetaTemplate>

export const statusEnvio = z.enum([
  'agendado',
  'processando',
  'enviado',
  'falhou',
  'cancelado',
])
export type StatusEnvio = z.infer<typeof statusEnvio>

// Status de entrega do recibo da Meta (webhook de status da mensagem).
export const entregaStatus = z.enum(['sent', 'delivered', 'read', 'failed'])
export type EntregaStatus = z.infer<typeof entregaStatus>

// --- Auditoria ---
export const atorEvento = z.enum(['loja', 'cliente', 'sistema', 'ia', 'operador'])
export type AtorEvento = z.infer<typeof atorEvento>

export const tipoEventoAuth = z.enum([
  'status_consultado',
  'otp_solicitado',
  'otp_entregue',
  'otp_falha_envio',
  'login_negado',
  'cadastro_negado',
  'login_ok',
  'cadastro_ok',
])
export type TipoEventoAuth = z.infer<typeof tipoEventoAuth>

// --- Credenciais de IA ---
export const provedorLlm = z.enum(['openrouter', 'anthropic', 'outro'])
export type ProvedorLlm = z.infer<typeof provedorLlm>

// --- Pix (não é enum do Postgres: inferência de UX, usada por pix.ts) ---
// Tipo de chave Pix inferido do formato. Auxílio de automação/exibição, não validação.
export const tipoChavePix = z.enum(['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'])
export type TipoChavePix = z.infer<typeof tipoChavePix>

// Enums com contrapartida em `pg_enum`: nome do tipo no Postgres -> valores aceitos.
// O teste de paridade garante que o Zod não diverge do banco. `tipoChavePix` fica de
// fora de propósito (não existe como tipo no Postgres).
export const ENUMS_POSTGRES = {
  papel_membro: papelMembro.options,
  status_numero: statusNumero.options,
  tipo_grupo: tipoGrupo.options,
  status_pedido: statusPedido.options,
  origem_pedido: origemPedido.options,
  modalidade_pedido: modalidadePedido.options,
  status_conversa: statusConversa.options,
  direcao_mensagem: direcaoMensagem.options,
  tipo_mensagem: tipoMensagem.options,
  autor_mensagem: autorMensagem.options,
  tipo_zona: tipoZona.options,
  tipo_veiculo: tipoVeiculo.options,
  status_fechamento: statusFechamento.options,
  tipo_lancamento: tipoLancamento.options,
  status_corrida: statusCorrida.options,
  regime_pagamento: regimePagamento.options,
  periodicidade_fixo: periodicidadeFixo.options,
  credor_tipo: credorTipo.options,
  status_conta_pagar: statusContaPagar.options,
  status_pagamento: statusPagamento.options,
  papel_operador: papelOperador.options,
  estagio_prospecto: estagioProspecto.options,
  tipo_atividade_prospecto: tipoAtividadeProspecto.options,
  status_assinatura: statusAssinatura.options,
  status_fatura: statusFatura.options,
  status_meta_template: statusMetaTemplate.options,
  status_envio: statusEnvio.options,
  entrega_status: entregaStatus.options,
  ator_evento: atorEvento.options,
  tipo_evento_auth: tipoEventoAuth.options,
  provedor_llm: provedorLlm.options,
} as const
