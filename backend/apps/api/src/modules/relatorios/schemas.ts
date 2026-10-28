// Contratos de borda do modulo relatorios. Fonte unica: contracts/relatorios do @whaviso/shared.
// Import relativo ate o barrel (contracts/index.ts) reexportar `./relatorios`; depois disso
// trocar por '@whaviso/shared/contracts'.
export {
  RelatorioPeriodo,
  DimensaoFixa,
  RE_DIMENSAO_OPCAO,
  VendasFiltro,
  VendasConsulta,
  VendasSaida,
  SalaoSaida,
  DimensoesSaida,
  FormasPagamentoSaida,
  CancelamentosFiltro,
  CancelamentosSaida,
  CoortesSaida,
  type Dimensao,
} from '@whaviso/shared/contracts'
