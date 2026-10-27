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
  type Permissao,
} from './papeis'
export { escopoLojaPlugin, type OpcoesEscopoLoja } from './plugin'
