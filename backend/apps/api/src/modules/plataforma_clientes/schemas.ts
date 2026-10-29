// Contratos de borda do modulo plataforma_clientes. Fonte unica: contracts/plataforma_clientes
// (o codegen reemite para o front). Aqui so o parametro de rota :id (plumbing server-side).
// NOTA: importa pelo caminho do diretorio porque o barrel `@whaviso/shared/contracts` e do
// integrador; apos ele adicionar `export * from './plataforma_clientes'`, trocar por
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
// entradas por e-mail. Migrar para contracts/plataforma_clientes quando o integrador regerar o codegen.
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

/** Novo cliente: restaurante + e-mail do dono (que ja precisa ter entrado uma vez). */
export const NovoCliente = z.strictObject({
  nome_restaurante: z.string().trim().min(2).max(120),
  email_dono: z.string().trim().toLowerCase().email().max(254),
})
export type NovoCliente = z.infer<typeof NovoCliente>

export const NovoClienteSaida = z.strictObject({
  conta_id: UuidSchema,
  loja_id: UuidSchema,
})
export type NovoClienteSaida = z.infer<typeof NovoClienteSaida>
