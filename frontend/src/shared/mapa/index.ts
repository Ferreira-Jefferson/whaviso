// Seletor de area de entrega (shared, reutilizavel): o usuario desenha a area no mapa, sem digitar
// coordenada. Pode ser importado por qualquer modulo (shared nao importa de modules).
export { SeletorArea, SeletorPonto } from './SeletorArea'
export { useGeocodificarEndereco, useCentroLoja, type EnderecoParaGeocode } from './useGeocodificarEndereco'
export {
  CENTRO_PADRAO,
  kmParaMetros,
  metrosParaKm,
  verticesDistintos,
  montarAnelFechado,
  anelParaVertices,
  type PontoMapa,
  type AreaGeo,
} from './tipos'
