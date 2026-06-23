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
  'cancelado_cobrador',
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
//
// FRONTEIRA E5 (H12.3 / M3): o aceite tem TRÊS opções de botão (aceitar / algum dado
// incorreto / recusar). 'aceite' e 'recusa' já existem; 'dado_incorreto' é a terceira,
// reservada AQUI (E12 é dono do modelo de botões/ações) para o enum já comportar as
// três quando o convite por template Meta (família convite.*) destravar no E5. O
// FLUXO de 'dado_incorreto' (o que o botão dispara) é GATED: ainda não há chave
// convite.* nem handler no webhook; nada o emite hoje. Quando E5 ligar o convite,
// basta semear a chave e tratar a ação, sem migração nem alteração de enum.
export const acaoBotaoTemplate = z.enum([
  'ja_paguei',
  'ver_pix',
  'optout',
  'aceite',
  'recusa',
  'dado_incorreto',
])
export type AcaoBotaoTemplate = z.infer<typeof acaoBotaoTemplate>

// Tipos de mídia que o transporte entende.
export const tipoMidiaTemplate = z.enum(['imagem', 'video', 'audio', 'documento'])
export type TipoMidiaTemplate = z.infer<typeof tipoMidiaTemplate>

export const acaoDevedor = z.enum(['ja_paguei', 'optout'])
export type AcaoDevedor = z.infer<typeof acaoDevedor>

export const tipoChavePix = z.enum(['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'])
export type TipoChavePix = z.infer<typeof tipoChavePix>
