// Allowlist de login. Default = pagina do console do OPERADOR (gestao de e-mails liberados).
// `AcessoNaoLiberado` = tela mostrada ao usuario logado cujo e-mail ainda nao foi liberado.
// `ehAcessoNaoAprovado` = detector do erro da api para acionar essa tela no fluxo de bootstrap.
export { default } from './pages/Acessos'
export { AcessoNaoLiberado } from './AcessoNaoLiberado'
export { ehAcessoNaoAprovado, CODIGO_ACESSO_NAO_APROVADO } from './erros'
