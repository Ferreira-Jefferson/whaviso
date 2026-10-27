// Contratos de borda do modulo configuracoes_llm. Fonte unica: os schemas vivem em
// @whaviso/shared/contracts/configuracoes_llm (o codegen reemite para o front). Schemas
// estritos (SEC-081). Nenhum schema de SAIDA carrega a chave (SEC-020): o estado so expoe
// metadados. O enum `provedorLlm` e transversal (enums.ts), importado da barra geral.
export {
  CredencialLlmEntrada,
  CredencialLlmPatch,
  CredencialLlmTestarEntrada,
  CredencialLlmEstado,
  CredencialLlmTesteSaida,
  UsoLlmResumo,
  resultadoValidacaoLlm,
  type ResultadoValidacaoLlm,
} from '@whaviso/shared/contracts'
export { provedorLlm, type ProvedorLlm } from '@whaviso/shared/contracts'
