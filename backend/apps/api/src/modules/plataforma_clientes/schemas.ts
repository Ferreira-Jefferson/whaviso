// Contratos de borda do modulo plataforma_clientes. Fonte unica: contracts/plataforma_clientes
// (o codegen reemite para o front). Aqui so o parametro de rota :id (plumbing server-side).
// NOTA: importa pelo caminho do diretorio porque o barrel `@whaviso/shared/contracts` e do
// integrador; apos ele adicionar `export * from './plataforma_clientes'`, trocar por
// `from '@whaviso/shared/contracts'` (mudanca de uma linha).
import { z } from 'zod'

export {
  PlataformaContasQuery,
  PlataformaContaResumo,
  PlataformaContaPagina,
  PlataformaContaFicha,
  PlataformaLojaResumo,
  OperadorDTO,
  OperadorListaSaida,
  OperadorConvite,
  OperadorPatch,
  type PlataformaContasQuery as ContasQuery,
  type PlataformaContaFicha as ContaFicha,
  type PlataformaContaResumo as ContaResumo,
  type PlataformaSituacaoConta as SituacaoConta,
  type PlataformaSaudeWhatsapp as SaudeWhatsapp,
  type OperadorConvite as OperadorNovo,
  type OperadorPatch as OperadorAlteracao,
} from '@whaviso/shared/contracts'

export const IdParams = z.strictObject({ id: z.uuid() })
