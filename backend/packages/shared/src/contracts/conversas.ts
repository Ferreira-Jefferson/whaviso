// Contratos de borda do modulo conversas (fonte unica; o codegen reemite para o front).
// Schemas Zod estritos (SEC-081): z.strictObject, tamanhos e enums fechados.
// Nenhum DTO devolve telefone (nem decifrado nem hash): o cliente aparece por nome/rotulo.
import { z } from 'zod'
import {
  statusConversa,
  statusPedido,
  statusNumero,
  direcaoMensagem,
  autorMensagem,
  tipoMensagem,
} from './enums'
import { UuidSchema, DataHoraIso } from './primitivos'

const Uuid = UuidSchema
const DataHora = DataHoraIso

export const TEXTO_MAX = 4096
export const PREVIA_MAX = 80
export const LIMITE_PADRAO = 20
export const LIMITE_MAXIMO = 100

export const ConversaListaEntrada = z.strictObject({
  status: statusConversa.optional(),
  busca: z.string().trim().min(1).max(80).optional(),
  cursor: z.string().min(1).max(512).optional(),
  limite: z.coerce.number().int().min(1).max(LIMITE_MAXIMO).default(LIMITE_PADRAO),
})

export const MensagensEntrada = z.strictObject({
  cursor: z.string().min(1).max(512).optional(),
  limite: z.coerce.number().int().min(1).max(LIMITE_MAXIMO).default(LIMITE_PADRAO),
})

export const MensagemEnviarEntrada = z.strictObject({
  texto: z.string().trim().min(1).max(TEXTO_MAX),
  // Idempotencia de request: um UUID por submissao (reusado em retry). Opcional por compat;
  // quando presente, dois POSTs iguais (duplo clique/retry) nao criam duas mensagens nem dois envios.
  chave_idempotencia: Uuid.optional(),
})
export type MensagemEnviarEntrada = z.infer<typeof MensagemEnviarEntrada>

export const ConversaEncerrarEntrada = z.strictObject({
  motivo: z.enum(['resolvida', 'sem_resposta', 'outro']).optional(),
})
export type ConversaEncerrarEntrada = z.infer<typeof ConversaEncerrarEntrada>

/** Cliente exibido no painel: nome (se houver) e um rotulo estavel; sem telefone. */
export const ClienteResumo = z.strictObject({
  id: Uuid,
  nome: z.string().nullable(),
  rotulo: z.string(),
})

/** Estado da janela de 24h da Meta, sempre calculado no servidor. */
export const JanelaSaida = z.strictObject({
  janela_aberta: z.boolean(),
  janela_aberta_ate: DataHora.nullable(),
  janela_restante_segundos: z.number().int().nonnegative(),
})

export const ConversaListaItem = z.strictObject({
  id: Uuid,
  status: statusConversa,
  cliente: ClienteResumo,
  ultima_mensagem: z
    .strictObject({
      previa: z.string().nullable(),
      direcao: direcaoMensagem,
      tipo: tipoMensagem,
      criado_em: DataHora,
    })
    .nullable(),
  nao_lidas: z.number().int().nonnegative(),
  atualizado_em: DataHora,
  ...JanelaSaida.shape,
})
export type ConversaListaItem = z.infer<typeof ConversaListaItem>

export const ConversaListaSaida = z.strictObject({
  itens: z.array(ConversaListaItem),
  proximo_cursor: z.string().nullable(),
})

export const PedidoLigado = z.strictObject({
  id: Uuid,
  codigo: z.string(),
  status: statusPedido,
})

export const ConversaDetalheSaida = z.strictObject({
  id: Uuid,
  status: statusConversa,
  cliente: ClienteResumo,
  numero_whatsapp: z.strictObject({ id: Uuid, status: statusNumero }),
  humano_desde: DataHora.nullable(),
  // Handoff: alguem segura a conversa (atendido_por_membro_id preenchido) e se e o proprio
  // usuario da requisicao. Sem nome/telefone: so o necessario para decidir os botoes do painel.
  tem_atendente: z.boolean(),
  atendido_por_mim: z.boolean(),
  nao_lidas: z.number().int().nonnegative(),
  pedido_ligado: PedidoLigado.nullable(),
  criado_em: DataHora,
  atualizado_em: DataHora,
  ...JanelaSaida.shape,
})
export type ConversaDetalheSaida = z.infer<typeof ConversaDetalheSaida>

export const MensagemSaida = z.strictObject({
  id: Uuid,
  conversa_id: Uuid,
  direcao: direcaoMensagem,
  autor: autorMensagem,
  tipo: tipoMensagem,
  conteudo: z.string().nullable(),
  transcricao: z.string().nullable(),
  midia_ref: z.string().nullable(),
  criado_em: DataHora,
})
export type MensagemSaida = z.infer<typeof MensagemSaida>

export const MensagensSaida = z.strictObject({
  itens: z.array(MensagemSaida),
  proximo_cursor: z.string().nullable(),
})

export const MensagemEnviadaSaida = z.strictObject({
  mensagem: MensagemSaida,
  envio_id: Uuid,
})

export const ConversaEncerradaSaida = z.strictObject({
  id: Uuid,
  status: z.literal('encerrada'),
})

/** Handoff manual: resultado de assumir (status 'humano') ou devolver (status 'ia'). */
export const ConversaHandoffSaida = z.strictObject({
  id: Uuid,
  status: statusConversa,
})
export type ConversaHandoffSaida = z.infer<typeof ConversaHandoffSaida>

export const LidaSaida = z.strictObject({ ok: z.literal(true) })
