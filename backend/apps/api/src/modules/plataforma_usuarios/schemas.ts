// Contratos de borda do modulo plataforma_usuarios. Fonte unica: contracts/plataforma_usuarios
// (o codegen reemite para o front). Aqui so o parametro de rota :id (plumbing server-side).
// NOTA: importa pelo caminho do diretorio porque o barrel `@whaviso/shared/contracts` e do
// integrador; apos ele adicionar `export * from './plataforma_usuarios'`, trocar por
// `from '@whaviso/shared/contracts'` (mudanca de uma linha).
import { z } from 'zod'
import { DataHoraIso, UuidSchema, papelOperador } from '@whaviso/shared/contracts'

export {
  PlataformaContasQuery,
  PlataformaContaResumo,
  PlataformaContaPagina,
  PlataformaContaFicha,
  PlataformaLojaResumo,
  OperadorPatch,
  type PlataformaContasQuery as ContasQuery,
  type PlataformaContaFicha as ContaFicha,
  type PlataformaContaResumo as ContaResumo,
  type PlataformaSituacaoConta as SituacaoConta,
  type PlataformaSaudeWhatsapp as SaudeWhatsapp,
  type OperadorPatch as OperadorAlteracao,
} from '@whaviso/shared/contracts'

export const IdParams = z.strictObject({ id: z.uuid() })

// Contratos locais (ainda nao promovidos ao pacote shared): operador com e-mail/metodo de login e
// entradas por e-mail. Migrar para contracts/plataforma_usuarios quando o integrador regerar o codegen.
export const MetodoLogin = z.enum(['google', 'whatsapp', 'email'])
export type MetodoLogin = z.infer<typeof MetodoLogin>

export const OperadorDTO = z.strictObject({
  id: UuidSchema,
  user_id: UuidSchema,
  nome: z.string(),
  papel: papelOperador,
  ativo: z.boolean(),
  criado_em: DataHoraIso,
  email: z.string().nullable(),
  metodo: MetodoLogin.nullable(),
})
export type OperadorDTO = z.infer<typeof OperadorDTO>

export const OperadorListaSaida = z.strictObject({ itens: z.array(OperadorDTO) })

/** Adiciona a equipe pelo e-mail de quem ja entrou no Whaviso (o servidor resolve o usuario). */
export const OperadorConvite = z.strictObject({
  email: z.string().trim().toLowerCase().email().max(254),
  nome: z.string().trim().min(1).max(120),
  papel: papelOperador.default('operador'),
})
export type OperadorNovo = z.infer<typeof OperadorConvite>

/**
 * Cadastro de usuario pelo operador. Dois caminhos, mutuamente exclusivos:
 * - `loja_codigo_publico` informado: vincula o usuario (precisa ja ter entrado no Whaviso uma vez)
 *   como membro de uma loja JA cadastrada (acha a loja pelo codigo publico dela).
 * - ausente: cria uma conta nova (o usuario cria a propria loja depois); `plano_id` so se aplica
 *   aqui, associando uma assinatura a conta nova.
 * `ativo` aprova o acesso de login na hora (allowlist); se falso, fica pendente de aprovacao
 * (ex.: aguardando confirmacao de pagamento).
 */
export const NovoUsuario = z.strictObject({
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  ativo: z.boolean(),
  loja_codigo_publico: z.string().trim().min(1).max(40).optional(),
  plano_id: UuidSchema.optional(),
})
export type NovoUsuario = z.infer<typeof NovoUsuario>

export const NovoUsuarioSaida = z.strictObject({
  conta_id: UuidSchema,
  loja_id: UuidSchema.nullable(),
  membro_id: UuidSchema.nullable(),
  vinculado_loja_existente: z.boolean(),
})
export type NovoUsuarioSaida = z.infer<typeof NovoUsuarioSaida>
