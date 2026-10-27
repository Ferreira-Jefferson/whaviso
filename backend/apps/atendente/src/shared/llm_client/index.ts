// Cliente de LLM do atendente (AT-llm): implementacao real da porta `ClienteLLM` de F2, com
// OpenRouter como provedor inicial (outros plugaveis), resolucao de credencial por loja, decifra no
// instante do uso, politica no-train, saida estruturada validada, contabilidade em `uso_llm` e teto
// de gasto. O stub de dev continua em `./stub`.
//
// Uso tipico (producao): `criarServicoLlmProducao({ logger })` e, por chamada, passar `exec` (role
// whaviso_atendente), `lojaId` e `origem` (modulo chamador). Veja `servico.ts`.
export { criarServicoLlmProducao, type OpcoesServicoProducao } from './producao'
export {
  criarServicoLlm,
  type ServicoLlm,
  type DepsServicoLlm,
  type BaseChamada,
  type CompletarLojaEntrada,
  type TranscreverLojaEntrada,
  type DescreverImagemLojaEntrada,
  type RespostaEstruturada,
} from './servico'
export { criarAdaptadorOpenRouter, NO_TRAIN, type OpcoesOpenRouter } from './provedores/openrouter'
export { resolverPorRegistro, type AdaptadorProvedor, type ResolverAdaptador } from './provedores/porta'
export { criarDecifraLlm, decifraPadrao, ErroCifra, type DecifraLlm } from './cifra'
export { lerCredencialAtiva, type CredencialLlmRow } from './credencial'
export {
  registrarUso,
  gastoDoDiaCentavos,
  seriePorDiaCentavos,
  detectarPico,
  FATOR_PICO,
  MIN_DIAS_PICO,
  type RegistroUso,
  type DiaCusto,
} from './uso'
export {
  custoEstimadoCentavos,
  PRECOS_PADRAO,
  TETO_DIARIO_CENTAVOS_PADRAO,
  OPENROUTER_BASE_URL,
  OPENROUTER_HOSTS,
  OPENROUTER_MODELO_PADRAO,
  type ProvedorLlm,
  type TabelaPrecos,
  type PrecoModelo,
} from './config'
export {
  CODIGO,
  LlmIndisponivel,
  LimiteExcedido,
  SaidaInvalida,
  ChaveInvalida,
  LimiteProvedor,
  ConteudoRecusado,
} from './erros'
