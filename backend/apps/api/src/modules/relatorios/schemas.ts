// Contratos de borda do modulo relatorios. Fonte unica: contracts/relatorios do @whaviso/shared.
// Import relativo ate o barrel (contracts/index.ts) reexportar `./relatorios`; depois disso
// trocar por '@whaviso/shared/contracts'.
export {
  RelatorioPeriodo,
  VendasFiltro,
  VendasSaida,
  FormasPagamentoSaida,
  CancelamentosFiltro,
  CancelamentosSaida,
  CoortesSaida,
  type VendasDimensao,
} from '@whaviso/shared/contracts'
