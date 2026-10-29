// API publica do especialista de escopo de loja (F3, tenant). Consuma por aqui.
export {
  type LeitorEscopo,
  type VinculoLoja,
  type OperadorResolvido,
  criarLeitorEscopoSql,
} from './leitor_escopo'
export { montarEscopoLoja, ErroEscopoAmbiguo } from './escopo'
export {
  fragmentoLojaIds,
  papelNaLojaAtiva,
  escopoPermite,
  escopoTemPapel,
} from './consulta'
export {
  PERMISSOES,
  PERMISSOES_POR_PAPEL,
  FORCA_PAPEL,
  papelMaisForte,
  papelPermite,
  operadorPermite,
  type Permissao,
} from './papeis'
export {
  CATALOGO,
  PAPEIS_CONSOLE,
  PAPEIS_LOJA,
  PAPEL_FIXO,
  SO_PAPEL_FIXO,
  definicaoDe,
  padraoPermite,
  type DefinicaoPermissao,
  type EscopoAcesso,
} from './catalogo'
export { permite, configurarFonteGrade, recarregarGrade, garantirGradeFresca, resetarGrade } from './grade'
export { escopoLojaPlugin, type OpcoesEscopoLoja } from './plugin'
