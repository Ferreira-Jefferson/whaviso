import { createHash, randomBytes } from 'node:crypto'

/** Token opaco para links públicos (aceite/ação). NUNCA armazenar em claro. */
export function gerarToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Hash que vai para o banco (colunas *_token_hash). */
export function sha256Hex(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
