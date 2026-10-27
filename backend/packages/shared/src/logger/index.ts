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
const reqSerializer = (req: Parameters<typeof stdSerializers.req>[0]) =>
  redigir(stdSerializers.req(req))

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
