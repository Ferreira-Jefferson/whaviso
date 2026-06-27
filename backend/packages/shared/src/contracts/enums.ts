import { z } from 'zod'

export const direcaoAviso = z.enum(['receber', 'pagar'])
export type DirecaoAviso = z.infer<typeof direcaoAviso>

// Papel RELACIONAL de quem criou o aviso (não confundir com roleUsuario, que é só
// owner/user). receber: criador é cobrador. pagar invertido: criador é devedor.
export const papelAviso = z.enum(['cobrador', 'devedor'])
export type PapelAviso = z.infer<typeof papelAviso>

export const statusAviso = z.enum([
  'sem_aviso',
  'aguardando_aceite',
  'programado',
  'aguardando_aprovacao_aviso_editado',
  'pausado',
  'informado_pago',
  'desregistrado',
  'pago',
  'cancelado',
  'recusado',
  'expirado',
])
export type StatusAviso = z.infer<typeof statusAviso>

export const etapaEnvio = z.enum(['d_menos_2', 'd_menos_1', 'd', 'd_mais_1'])
export type EtapaEnvio = z.infer<typeof etapaEnvio>

export const statusEnvio = z.enum([
  'agendado',
  'processando',
  'enviado',
  'falhou',
  'cancelado',
])
export type StatusEnvio = z.infer<typeof statusEnvio>

export const entregaStatus = z.enum(['sent', 'delivered', 'read', 'failed'])
export type EntregaStatus = z.infer<typeof entregaStatus>

export const roleUsuario = z.enum(['owner', 'user'])
export type RoleUsuario = z.infer<typeof roleUsuario>

export const tipoEvento = z.enum([
  'criado',
  'convite_gerado',
  'aceite',
  'ativado',
  'editado',
  'editado_aprovado',
  'editado_recusado',
  'pausado',
  'reativado',
  'desregistrado',
  'reregistrado',
  'ja_paguei_devedor',
  'confirmado_cobrador',
  'marcado_pago_cobrador',
  'rejeitado_cobrador',
  'desmarcado_cobrador',
  'reaberto_cobrador',
  'reengajamento_cobrador',
  'pago_manual',
  'optout',
  // 'cancelado_cobrador' é o valor legado; o cancelamento atual grava
  // 'cancelado_criador' (ator = papel de quem criou). Mantemos ambos no enum.
  'cancelado_cobrador',
  'cancelado_criador',
  'expirado',
  'solicitou_pix',
  'recusado',
])
export type TipoEvento = z.infer<typeof tipoEvento>

export const atorEvento = z.enum(['cobrador', 'devedor', 'sistema', 'admin'])
export type AtorEvento = z.infer<typeof atorEvento>

export const statusMetaTemplate = z.enum(['pendente', 'aprovado', 'rejeitado'])
export type StatusMetaTemplate = z.infer<typeof statusMetaTemplate>

// Contexto de um template: 'padrao' ou 'revisao' (variante para avisos em informado_pago).
export const contextoTemplate = z.enum(['padrao', 'revisao'])
export type ContextoTemplate = z.infer<typeof contextoTemplate>

// Ações de botão conhecidas pelo código (comportamento). O rótulo é editável no template.
// Este enum é o REGISTRO de ações do produto (E12 é dono do modelo de botões/ações) e
// espelha ACOES_BOTAO do webhook do zap (apps/zap/.../webhook_whatsapp/service.ts), a
// fonte da verdade de quais botões o transporte sabe tratar. Manter os dois em sincronia:
// uma ação semeada em template (via migration, que não passa pela validação da api) e
// ausente aqui faz GET /admin/mensagens falhar a validação Zod no front e a tela de
// templates não carregar.
//
// E5: 'dado_incorreto' é a terceira opção do aceite (aceitar / algum dado incorreto /
// recusar). Emitida hoje no template convite.resumo, enviado pelo zap via Baileys (número
// próprio, sem template aprovado na Meta); o webhook trata o toque (H5.4).
export const acaoBotaoTemplate = z.enum([
  'ja_paguei',
  'optout',
  'ver_pix',
  'ativar',
  'aceite',
  'recusa',
  'dado_incorreto',
  'confirmar',
  'rejeitar',
  'solicitar_pix',
  'informar_pix',
  'pix_pular',
  'pix_corrigir',
  'pix_confirma_tipo',
  'pix_corrige_tipo',
  'pix_confirmar',
])
export type AcaoBotaoTemplate = z.infer<typeof acaoBotaoTemplate>

// Tipos de mídia que o transporte entende.
export const tipoMidiaTemplate = z.enum(['imagem', 'video', 'audio', 'documento'])
export type TipoMidiaTemplate = z.infer<typeof tipoMidiaTemplate>

export const acaoDevedor = z.enum(['ja_paguei', 'optout'])
export type AcaoDevedor = z.infer<typeof acaoDevedor>

export const tipoChavePix = z.enum(['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'])
export type TipoChavePix = z.infer<typeof tipoChavePix>
