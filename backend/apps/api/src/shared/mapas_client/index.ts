import {
  FakeClienteMapas,
  type ClienteMapas,
  type OpcoesFakeMapas,
} from '@whaviso/shared/clientes'

// Stub de ClienteMapas para dev/testes da api: geocodifica tudo para um ponto fixo (centro de
// Sao Paulo) e calcula matriz/rota por distancia euclidiana. Sem rede. A implementacao real
// (Nominatim + OSRM/ORS, Google opcional) e do modulo API-roteiriza e substitui este diretorio.
// O F4 (api-core) registra este stub como `mapas` ate la.

export { type ClienteMapas } from '@whaviso/shared/clientes'

export const PONTO_PADRAO_STUB = { lat: -23.55, lng: -46.63 } as const

export function criarMapasStub(op: OpcoesFakeMapas = {}): ClienteMapas {
  return new FakeClienteMapas({ padrao: PONTO_PADRAO_STUB, ...op })
}
