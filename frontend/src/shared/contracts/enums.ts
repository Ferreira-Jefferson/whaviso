// ESPELHO de backend/packages/shared/src/contracts/enums.ts
// O frontend é standalone e NÃO importa @whaviso/shared. Estes schemas Zod
// são uma cópia própria mantida manualmente em sincronia com o backend.
// Qualquer mudança de contrato de API deve atualizar AMBOS os lados.
import { z } from 'zod'

export const direcaoAviso = z.enum(['receber', 'pagar'])
export type DirecaoAviso = z.infer<typeof direcaoAviso>

// Papel relacional de quem criou o aviso (receber: cobrador; pagar invertido: devedor).
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
  'combinado_gerado',
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

// Categoria do template na Meta (exigida no create). UTILITY cobre quase tudo; AUTHENTICATION
// é o OTP (formato fixo); MARKETING permitido mas não usado hoje. Espelha o backend.
export const categoriaTemplate = z.enum(['UTILITY', 'AUTHENTICATION', 'MARKETING'])
export type CategoriaTemplate = z.infer<typeof categoriaTemplate>

// Contexto de um template: 'padrao' ou 'revisao' (variante para avisos em informado_pago).
export const contextoTemplate = z.enum(['padrao', 'revisao'])
export type ContextoTemplate = z.infer<typeof contextoTemplate>

// Ações de botão conhecidas pelo código (comportamento). O rótulo é editável no template.
// Espelha o enum da api (@whaviso/shared acaoBotaoTemplate), que por sua vez espelha
// ACOES_BOTAO do webhook do zap (a fonte da verdade de quais botões o transporte trata).
// TODA ação semeada em algum template (mesmo via migration) precisa constar aqui: uma
// única ação fora do enum derruba a validação Zod de GET /admin/mensagens (z.array falha
// inteiro) e a tela de templates deixa de carregar.
//
// E5: 'dado_incorreto' é a terceira opção do aceite (aceitar / algum dado incorreto /
// recusar). Emitida hoje no template combinado.resumo (editável em /admin/mensagens),
// enviado pelo zap via Meta Cloud API como template aprovado.
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
