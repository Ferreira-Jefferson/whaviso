// Conexao de superusuario ao Postgres LOCAL (whaviso_dev) para a suite de seguranca.
//
// REGRA DURA: o harness so fala com o banco de DEV local; nunca com o Supabase cloud. A
// matriz de privilegio faz SET ROLE e o teste de dump roda pg_dump: rodar isso contra o
// cloud seria desastroso. `garantirBancoLocal()` roda no beforeAll de cada suite e ABORTA
// se o host parecer do Supabase (ou nao for loopback).
import pg from 'pg'

const SENHA = process.env.POSTGRES_PASSWORD ?? process.env.PGPASSWORD ?? 'postgres'
export const HOST = process.env.PGHOST ?? '127.0.0.1'
export const PORTA = process.env.PGPORT ?? '5432'
export const BANCO = process.env.PGDATABASE ?? 'whaviso_dev'
export const USUARIO_SUPER = process.env.PGUSER ?? 'postgres'

/** String de conexao do superusuario de teste (postgres), para SET ROLE e pg_dump. */
export const URL_SUPER = `postgresql://${USUARIO_SUPER}:${encodeURIComponent(SENHA)}@${HOST}:${PORTA}/${BANCO}`

/** Hosts que denunciam um banco gerenciado do Supabase: jamais aceitos aqui. */
const PADROES_CLOUD = [/supabase\.(co|com|net|io)$/i, /\.pooler\./i, /pooler\.supabase/i]

/**
 * Aborta se o alvo nao for um Postgres local. Chame no beforeAll de cada suite ANTES de
 * qualquer SET ROLE ou pg_dump. Fail-closed: na duvida, recusa.
 */
export function garantirBancoLocal(): void {
  const host = HOST.toLowerCase()
  const ehLoopback =
    host === '127.0.0.1' || host === '::1' || host === 'localhost' || host === '0.0.0.0'
  const pareceCloud = PADROES_CLOUD.some((re) => re.test(host))
  if (pareceCloud || !ehLoopback) {
    throw new Error(
      `Harness de seguranca abortado: PGHOST="${HOST}" nao e um Postgres local. ` +
        'A suite so pode rodar contra whaviso_dev (loopback); nunca contra o Supabase cloud.',
    )
  }
  // Defesa extra: um banco de nome claramente de producao tambem e recusado.
  if (/prod|cloud|supabase/i.test(BANCO)) {
    throw new Error(`Harness de seguranca abortado: PGDATABASE="${BANCO}" nao parece um banco de teste.`)
  }
}

/** Pool de superusuario (aberto sob demanda). Usa SET ROLE para exercer cada role de servico. */
export const poolSuper = new pg.Pool({ connectionString: URL_SUPER, max: 4 })

/** Verdadeiro se o banco local responde. Suites se pulam com aviso quando offline. */
export async function bancoAcessivel(): Promise<boolean> {
  try {
    await poolSuper.query('select 1')
    return true
  } catch {
    return false
  }
}

export async function fecharPoolSuper(): Promise<void> {
  await poolSuper.end().catch(() => {})
}
