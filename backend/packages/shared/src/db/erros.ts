// Traducao de erros do `pg` (SQLSTATE) para um erro de dominio neutro de HTTP. Nunca expoe
// `detail`/`where`/`message` do pg: so o tipo e o nome da constraint (identificador de schema).
export type TipoErroBanco =
  | 'unique' | 'fk' | 'check' | 'nao_nulo' | 'serializacao' | 'timeout' | 'indisponivel'

export class ErroBanco extends Error {
  constructor(
    public readonly tipo: TipoErroBanco,
    public readonly constraint: string | null,
    public readonly sqlstate: string | null,
  ) {
    super(`erro de banco: ${tipo}`)
    this.name = 'ErroBanco'
  }
}

const MAPA: Record<string, TipoErroBanco> = {
  '23505': 'unique',
  '23503': 'fk',
  '23514': 'check',
  '23502': 'nao_nulo',
  '40001': 'serializacao',
  '40P01': 'serializacao',
  '57014': 'timeout',
  '53300': 'indisponivel',
  '57P01': 'indisponivel',
  '08006': 'indisponivel',
}

export function traduzirErroPg(erro: unknown): ErroBanco | null {
  if (erro instanceof ErroBanco) return erro
  if (typeof erro !== 'object' || erro === null) return null
  const e = erro as { code?: unknown; constraint?: unknown }
  if (typeof e.code !== 'string' || !/^[0-9A-Z]{5}$/.test(e.code)) return null
  const tipo = MAPA[e.code]
  if (!tipo) return null
  return new ErroBanco(tipo, typeof e.constraint === 'string' ? e.constraint : null, e.code)
}
