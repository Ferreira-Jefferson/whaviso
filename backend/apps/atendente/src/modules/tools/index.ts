// AT-tools: registry + tools do atendente (fronteira de AUTORIZACAO do agente). Ver MODULE.md.
export {
  criarRegistroTools,
  CAMPOS_PROIBIDOS_NO_ARGS,
  type RegistroTools,
  type ChamadaTool,
  type ResultadoTool,
} from './registry'
export { selarConversaCtx, selarCtxDaConversa } from './ctx'
export { ferramentasPadrao, clienteCadastrar, tempoDeEntrega, chaveIdempotencia, type DepsTools } from './ferramentas'
export { ErroTool } from './erros'
