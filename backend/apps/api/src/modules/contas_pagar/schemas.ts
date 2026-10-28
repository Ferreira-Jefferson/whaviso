// Contratos de borda do modulo contas a pagar. Fonte unica: @whaviso/shared/contracts (o codegen
// reemite para o front). Aqui fica apenas o parametro de rota :id e os tipos de entrada do acerto.
import { z } from 'zod'
import {
  UuidSchema,
  AcertoAjusteEntrada as _AcertoAjuste,
  PagarAcertoEntrada as _PagarAcerto,
} from '@whaviso/shared/contracts'

export {
  FornecedorEntrada,
  FornecedorAtualizarEntrada,
  FornecedorListaQuery,
  FornecedorSaida,
  FornecedorListaSaida,
  FornecedorTelefoneSaida,
  ContaPagarEntrada,
  ContaPagarAtualizarEntrada,
  ContaPagarListaQuery,
  ContaPagarSaida,
  ContaPagarListaSaida,
  PagarContaEntrada,
  AcertoPeriodoQuery,
  AcertoLancamento,
  AcertoMotoboyLinha,
  AcertoPeriodoSaida,
  AcertoAjusteEntrada,
  PagarAcertoEntrada,
  AcertoPagoSaida,
  type FornecedorNovo,
  type FornecedorPatch,
  type FornecedorDto,
  type ContaPagarNovo,
  type ContaPagarPatch,
  type ContaPagarDto,
  type AcertoPagoDto,
  type AcertoMotoboyLinhaDto,
  type AcertoPeriodoDto,
} from '@whaviso/shared/contracts'

export type AcertoAjusteNovo = z.input<typeof _AcertoAjuste>
export type PagarAcertoNovo = z.input<typeof _PagarAcerto>

export const IdParams = z.strictObject({ id: UuidSchema })
