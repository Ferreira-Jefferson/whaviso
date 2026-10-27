// Traduz o erro da Meta (codigo numerico do Graph + status HTTP) para o erro tipado do
// kernel (ErroProvedor), que e o que deixa o chamador (ZAP-enviar) decidir retry.
//
// SEC-024: NUNCA propagamos o texto da mensagem da Meta nem telefone/token no erro; so o
// codigo numerico estavel (nao sensivel) vai no `codigo`, para a auditoria do dreno.
import {
  ErroProvedor,
  JanelaExpirada,
  Permanente,
  RateLimit,
  TemplateNaoAprovado,
  Transitorio,
} from '@whaviso/shared/clientes'

// Fora da janela de 24h: so template resolve (a regra da janela e do chamador).
const CODIGO_JANELA = 131047

// Template inexistente/pausado/recusado/parametros errados: nao adianta retentar.
const CODIGOS_TEMPLATE = new Set<number>([
  132000, // numero de parametros do template nao bate
  132001, // template inexistente
  132005, // template excede o tamanho
  132007, // template viola politica de formato
  132012, // formato de parametro do template invalido
  132015, // template pausado
  132016, // template desabilitado
])

// Limites de taxa/spam/throttle e indisponibilidade breve: vale retentar.
const CODIGOS_RATE = new Set<number>([
  80007, // limite de requisicoes do app
  130429, // limite de taxa (cloud api)
  131048, // limite de spam
  131056, // limite de par (rate) por destinatario
  132068, // flow throttle
  132069, // flow throttle
  133016, // conta temporariamente indisponivel
])

// Token/credencial invalido ou expirado: permanente para o envio, mas sinaliza saude do
// numero (o chamador marca a coluna de saude; este modulo nao toca no banco).
const CODIGOS_CREDENCIAL = new Set<number>([
  190, // token de acesso invalido/expirado
])

/** `codigo` estavel para a auditoria: `meta_<code>` ou `http_<status>` (nunca texto livre). */
function codigoEstavel(code: number | undefined, httpStatus: number): string {
  if (code !== undefined) return `meta_${code}`
  return `http_${httpStatus}`
}

/**
 * Mapeia uma resposta de erro da Meta para ErroProvedor. Nao recebe (nem repassa) o texto
 * da Meta: so o codigo numerico e o status HTTP, ambos nao sensiveis.
 */
export function mapearErroMeta(
  code: number | undefined,
  httpStatus: number,
  retryAposMs?: number,
): ErroProvedor {
  const codigo = codigoEstavel(code, httpStatus)

  if (code === CODIGO_JANELA) return new JanelaExpirada(undefined, { codigo })
  if (code !== undefined && CODIGOS_TEMPLATE.has(code)) return new TemplateNaoAprovado(undefined, { codigo })
  if (code !== undefined && CODIGOS_RATE.has(code)) return new RateLimit(undefined, retryAposMs, { codigo })
  if (code !== undefined && CODIGOS_CREDENCIAL.has(code)) {
    return new Permanente('credencial invalida', { codigo: 'credencial_invalida' })
  }

  // Sem codigo mapeado: decide pelo status HTTP.
  if (httpStatus === 429) return new RateLimit(undefined, retryAposMs, { codigo })
  if (httpStatus === 401 || httpStatus === 403) {
    return new Permanente('credencial invalida', { codigo: 'credencial_invalida' })
  }
  if (httpStatus >= 500) return new Transitorio(undefined, { codigo })
  if (httpStatus >= 400) return new Permanente(undefined, { codigo })
  return new Permanente(undefined, { codigo })
}

/** Excecao de transporte (rede/timeout/SSRF): ErroProvedor passa reto; o resto vira Transitorio. */
export function normalizarExcecao(e: unknown): ErroProvedor {
  if (e instanceof ErroProvedor) return e
  // AbortError (timeout) e TypeError de rede nao carregam token/telefone, mas por seguranca
  // NAO embutimos a mensagem original: so um codigo estavel e generico.
  return new Transitorio('falha de rede ou timeout', { codigo: 'rede' })
}
