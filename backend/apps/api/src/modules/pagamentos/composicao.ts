// Composicao pura do valor de uma cobranca intermediada, dado o modo de encargo da loja.
//
// A taxa do whaviso (centavos, vinda de @whaviso/shared/taxas) e aplicada de dois jeitos:
//   - absorve: o cliente paga o total do pedido; a taxa sai do repasse do restaurante (o restaurante
//     recebe total - taxa, o whaviso recebe a taxa via split).
//   - repassa: o cliente paga total + taxa; o restaurante recebe o total cheio, o whaviso a taxa.
//
// A taxa do PSP (adquirencia) e SEMPRE do restaurante (split fee-liability), nunca do whaviso, e nao
// entra nesta conta: aqui so compomos o que o cliente paga e a parte do whaviso. Dinheiro em centavos.
export type EncargoModo = 'absorve' | 'repassa'

export interface ComposicaoCobranca {
  /** Quanto o cliente paga na cobranca. */
  valorCobradoCentavos: number
  /** A parte do whaviso (split), igual a taxa de intermediacao aplicada. */
  encargoWhavisoCentavos: number
}

export function comporCobranca(
  totalCentavos: number,
  taxaWhavisoCentavos: number,
  modo: EncargoModo,
): ComposicaoCobranca {
  const encargo = taxaWhavisoCentavos
  return modo === 'repassa'
    ? { valorCobradoCentavos: totalCentavos + encargo, encargoWhavisoCentavos: encargo }
    : { valorCobradoCentavos: totalCentavos, encargoWhavisoCentavos: encargo }
}
