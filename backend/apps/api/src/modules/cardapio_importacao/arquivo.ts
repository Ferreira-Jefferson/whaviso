// Validacao do arquivo enviado: o TIPO vem da assinatura (magic bytes), nunca do header/extensao do
// cliente. Funcoes puras (sem I/O). Allowlist: JPEG, PNG, WebP e PDF.
import { createHash } from 'node:crypto'

export interface ArquivoValido {
  bytes: Buffer
  tipo: 'imagem' | 'pdf'
  mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'
  hash: string
}

/** Detecta o tipo pela assinatura; null quando fora da allowlist. */
export function detectarTipo(b: Buffer): Pick<ArquivoValido, 'tipo' | 'mime'> | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { tipo: 'imagem', mime: 'image/jpeg' }
  }
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { tipo: 'imagem', mime: 'image/png' }
  }
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    return { tipo: 'imagem', mime: 'image/webp' }
  }
  if (b.length >= 5 && b.toString('latin1', 0, 5) === '%PDF-') {
    return { tipo: 'pdf', mime: 'application/pdf' }
  }
  return null
}

export function hashArquivo(b: Buffer): string {
  return createHash('sha256').update(b).digest('hex')
}
