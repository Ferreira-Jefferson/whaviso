// Captura a saida do logger do F4 (pino) num stream em memoria, para os testes de redaction
// (SEC-024). `semSentinelas` confirma que nenhum valor sentinela aparece na saida bruta.
import { Writable } from 'node:stream'
import { criarLogger, CENSOR, type Logger } from '@whaviso/shared/logger'

export { CENSOR }

export interface CapturaLog {
  logger: Logger
  /** Toda a saida acumulada (uma linha JSON por evento de log). */
  texto(): string
  /** true se NENHUMA das sentinelas aparece na saida (o que queremos). */
  semSentinelas(sentinelas: readonly string[]): boolean
  /** Nomes logicos (chaves do mapa) cujos valores vazaram; nunca expoe o valor em claro. */
  nomesVazados(mapa: Readonly<Record<string, string>>): string[]
}

export function criarCapturaLog(nome = 'teste-seguranca'): CapturaLog {
  const pedacos: string[] = []
  const destino = new Writable({
    write(chunk: Buffer | string, _enc, cb) {
      pedacos.push(chunk.toString())
      cb()
    },
  })
  // Nivel 'trace': captura tudo, inclusive logs automaticos de request/response.
  const logger = criarLogger(nome, 'trace', destino)
  const texto = () => pedacos.join('')
  return {
    logger,
    texto,
    semSentinelas: (sentinelas) => !sentinelas.some((s) => texto().includes(s)),
    nomesVazados: (mapa) => Object.entries(mapa).filter(([, v]) => texto().includes(v)).map(([k]) => k),
  }
}
