import { pino, stdSerializers, type DestinationStream, type Logger } from 'pino'
import { CENSOR, redigir } from './redact'

export type { Logger }
export { campoSensivel, redigir, CENSOR } from './redact'

// Mantido para compat: paths nativos do pino (1 e 2 niveis). A cobertura real e recursiva
// e vem de `formatters.log` + serializers abaixo (SEC-024).
export const REDACT = {
  paths: ['authorization', 'cookie', 'token', 'chave', 'chave_cifrada', 'senha', 'telefone', 'numero', 'pix', 'titular']
    .flatMap((c) => [c, `*.${c}`, `*.*.${c}`]),
  censor: CENSOR,
}

// Headers de request so passam pela lista de sensiveis; res nao loga body.
// O `url` do pino inclui a query string, que nao e nome de campo e pode carregar PII
// (ex.: GET /v1/clientes?q=<telefone>). Logamos so o path; a query inteira e descartada (SEC-024).
const reqSerializer = (req: Parameters<typeof stdSerializers.req>[0]) => {
  const s = stdSerializers.req(req) as unknown as Record<string, unknown>
  if (typeof s['url'] === 'string') s['url'] = (s['url'] as string).split('?')[0]
  if ('query' in s) delete s['query']
  return redigir(s)
}

export function criarLogger(
  nome: string,
  nivel = process.env.LOG_LEVEL ?? 'info',
  destino?: DestinationStream,
): Logger {
  return pino(
    {
      name: nome,
      level: nivel,
      redact: REDACT,
      formatters: { log: (obj) => redigir(obj) as Record<string, unknown> },
      serializers: {
        err: (e: Error) => redigir(stdSerializers.err(e)),
        req: reqSerializer,
        res: stdSerializers.res,
      },
    },
    destino as DestinationStream,
  )
}
