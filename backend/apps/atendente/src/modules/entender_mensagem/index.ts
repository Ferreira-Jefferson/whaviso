// API publica do modulo entender_mensagem (AT-entender): STT + classificacao de intencao, como DADO.
// O motor_fluxo (ou o harness) consome `ResultadoEntendimento`; este modulo nunca executa efeito.
export {
  criarEntendedor,
  LIMIAR_CONFIANCA_PADRAO,
  MAX_BYTES_AUDIO,
  MIMES_AUDIO,
  ORIGEM_LLM,
  type Entendedor,
  type DepsEntendedor,
  type EntenderEntrada,
} from './service'
export { ancorarItem, normalizar } from './ancoragem'
export { montarMensagens, pareceInjecao, sanearTexto } from './prompt'
export {
  IntencaoModelo,
  MotivoDesconhecida,
  AssuntoConsulta,
  type CardapioEntendimento,
  type EntradaMensagem,
  type AudioEntrada,
  type IntencaoEntendida,
  type ItemAncorado,
  type ItemCardapio,
  type ResultadoEntendimento,
  type MotivoEsclarecer,
  type MotivoSemLlm,
  type TipoIntencao,
} from './tipos'
