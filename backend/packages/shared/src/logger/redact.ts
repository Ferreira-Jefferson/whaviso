// Redaction recursiva por NOME de campo (SEC-024). O pino so redige por path explicito
// (curingas de 1 nivel), o que deixa vazar shapes profundos; aqui varremos o objeto inteiro,
// em qualquer profundidade, inclusive Errors (err.config.headers.authorization etc.).
export const CENSOR = '[oculto]'

const NOMES_SENSIVEIS = new Set([
  'authorization', 'proxy-authorization', 'cookie', 'set-cookie',
  'token', 'access_token', 'refresh_token', 'id_token', 'apikey', 'api_key',
  'chave', 'chave_cifrada', 'master_key', 'secret', 'segredo',
  'senha', 'password', 'otp', 'codigo',
  'telefone', 'numero', 'pix', 'titular', 'banco',
  // Convite de membro: o numero/token do convite nunca vai a log (SEC-024, F7).
  'convite', 'numero_convite', 'token_convite',
  // Conteudo de conversa com o cliente: texto/transcricao de mensagem nunca vai a log.
  'conteudo', 'transcricao', 'texto',
])

/** Nome sensivel: exato, `*_hash`, ou derivado de telefone/pix/token/convite (ex.: pix_chave). */
export function campoSensivel(nome: string): boolean {
  const n = nome.toLowerCase()
  return (
    NOMES_SENSIVEIS.has(n) ||
    n.endsWith('_hash') ||
    n.startsWith('telefone') ||
    n.startsWith('pix') ||
    n.endsWith('_token') ||
    n.endsWith('_secret') ||
    n.endsWith('_cifrada') ||
    n.endsWith('_convite')
  )
}

const PROFUNDIDADE_MAX = 12

export function redigir(valor: unknown, vistos = new WeakSet<object>(), nivel = 0): unknown {
  if (valor === null || typeof valor !== 'object') return valor
  if (vistos.has(valor)) return '[circular]'
  if (nivel > PROFUNDIDADE_MAX) return '[profundo]'
  vistos.add(valor)
  if (Array.isArray(valor)) return valor.map((v) => redigir(v, vistos, nivel + 1))
  const fonte: Record<string, unknown> =
    valor instanceof Error
      ? { ...valor, type: valor.name, message: valor.message, stack: valor.stack }
      : (valor as Record<string, unknown>)
  const saida: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fonte)) {
    saida[k] = campoSensivel(k) ? CENSOR : redigir(v, vistos, nivel + 1)
  }
  return saida
}
