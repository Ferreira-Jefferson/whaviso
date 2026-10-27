// API publica do especialista de autenticacao (F3). Consuma sempre por aqui, nunca
// por arquivo interno (fronteira feature-first).
export {
  criarVerificador,
  criarVerificadorSupabase,
  ALGORITMOS_PADRAO,
  ErroJwt,
  type Verificador,
  type OpcoesVerificador,
  type OpcoesVerificadorSupabase,
} from './verificador'
export { autenticarPlugin, type OpcoesAutenticar } from './plugin'
