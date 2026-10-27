// Cursor opaco (base64url) de paginacao por (instante, id). O cliente so repassa.
// Copia local (modulo nunca importa modulo).
import { z } from 'zod'
import { Invalido } from '../../shared/http_errors'

const Corpo = z.strictObject({ t: z.iso.datetime({ offset: true }), i: z.uuid() })
export interface PosicaoCursor {
  instante: string
  id: string
}

export function codificarCursor(p: PosicaoCursor): string {
  return Buffer.from(JSON.stringify({ t: p.instante, i: p.id })).toString('base64url')
}

export function decodificarCursor(bruto: string): PosicaoCursor {
  try {
    const r = Corpo.parse(JSON.parse(Buffer.from(bruto, 'base64url').toString('utf8')))
    return { instante: r.t, id: r.i }
  } catch {
    throw new Invalido('Cursor invalido', 'cursor_invalido')
  }
}
