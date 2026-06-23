// Lock de instância única: impede dois processos brigando pela mesma sessão
// (causa do erro 440 connectionReplaced). Baseado em PID, com limpeza de lock órfão.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { Logger } from '@whaviso/shared/logger'

function estaVivo(pid: number): boolean {
  try {
    process.kill(pid, 0) // não mata; só testa se o PID existe
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM' // existe sem permissão → vivo
  }
}

/** Tenta adquirir o lock. Retorna false se outra instância viva já o detém. */
export function adquirirLock(arquivo: string, logger: Logger): boolean {
  if (existsSync(arquivo)) {
    const pid = Number.parseInt(readFileSync(arquivo, 'utf8'), 10)
    if (pid && estaVivo(pid)) {
      logger.error({ pid }, 'já existe uma instância do zap; não vou brigar pela sessão do WhatsApp')
      return false
    }
    rmSync(arquivo, { force: true }) // lock órfão de processo morto
  }
  writeFileSync(arquivo, String(process.pid))
  return true
}

/** Libera o lock se for nosso (idempotente, nunca lança). */
export function liberarLock(arquivo: string): void {
  try {
    if (existsSync(arquivo) && Number.parseInt(readFileSync(arquivo, 'utf8'), 10) === process.pid) {
      rmSync(arquivo, { force: true })
    }
  } catch {
    /* nada a fazer no shutdown */
  }
}
