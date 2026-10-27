// API publica do modulo retroalimentar_base (AT-realimentar): o PRODUTOR do loop de realimentacao do
// RAG. Observa conversas, enfileira sinais, gera rascunhos de documento (status='rascunho',
// origem='realimentado') e sinaliza TTL. Nada e aprovado nem indexado aqui: isso e da api e do rag.
export {
  retroalimentar,
  coletarSinais,
  gerarRascunhos,
  expirarRascunhos,
  type DepsRetro,
} from './service'
export {
  EVENTO,
  ORIGEM_LLM,
  N_RECORRENCIA,
  TTL_RASCUNHO_DIAS,
  JANELA_COLETA_DIAS,
  RascunhoGerado,
  type CandidatoConhecimento,
  type SinalColetado,
  type ResumoColeta,
  type ResumoGeracao,
  type ResumoRetroalimentacao,
} from './tipos'
export { anonimizar, type ContextoAnonimizacao } from './anonimizar'
export { montarMensagens, sanearSinal } from './prompt'
export { normalizar, hashConteudo, assinatura, jaccard, tokens } from './texto'
