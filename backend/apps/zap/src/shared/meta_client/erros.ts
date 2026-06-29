// Classifica o erro do Graph (código da Meta + status HTTP) em ErroEnvio: permanente
// (o drainer NÃO reagenda) vs transitório (reagenda, max 3). Mantém o `codigo` da Meta
// para a auditoria do drain (motivo `envio_<codigo>`), ex.: `envio_130497` quando a
// empresa ainda não foi verificada (não resolve retentando agora, resolve no tempo).
import { ErroEnvio } from '../whats'

// Falhas definitivas: número não entregável, fora da janela 24h (precisa template),
// template inexistente/não aprovado/parâmetros errados/pausado, conta sem verificação,
// payload malformado, token inválido.
const PERMANENTES = new Set<number>([
  100, // parâmetro inválido / payload malformado
  131026, // mensagem não entregável
  131047, // re-engagement: fora da janela de 24h (precisa template)
  131051, // tipo de mensagem não suportado
  131008, // parâmetro obrigatório ausente
  131009, // valor de parâmetro inválido
  130472, // usuário não elegível
  130497, // conta restrita de enviar para este país (empresa não verificada)
  132000, // número de parâmetros do template não bate
  132001, // template inexistente
  132005, // template excede o tamanho
  132007, // template viola política de formato
  132012, // formato de parâmetro do template inválido
  132015, // template pausado
  132016, // template desabilitado
  190, // token de acesso inválido/expirado (alerta operacional)
])

// Falhas temporárias: limites de taxa/spam, throttle de fluxo, indisponibilidade breve.
const TRANSITORIOS = new Set<number>([
  80007, // limite de requisições do app
  130429, // limite de taxa (cloud api)
  131048, // limite de spam
  131056, // limite de par (rate) por destinatário
  132068, // flow throttle
  132069, // flow throttle
  133016, // conta temporariamente indisponível
])

export function classificarErroGraph(
  code: number | undefined,
  message: string,
  httpStatus?: number,
): ErroEnvio {
  if (code && PERMANENTES.has(code)) return new ErroEnvio(code, message, true)
  if (code && TRANSITORIOS.has(code)) return new ErroEnvio(code, message, false)
  // Sem código mapeado: usa o status HTTP. 5xx = transitório (reagenda); 4xx = permanente.
  if (httpStatus && httpStatus >= 500) return new ErroEnvio(httpStatus, message, false)
  if (httpStatus && httpStatus >= 400) return new ErroEnvio(code ?? httpStatus, message, true)
  // Rede/timeout/desconhecido: transitório (vale reagendar).
  return new ErroEnvio(code ?? 0, message, false)
}
