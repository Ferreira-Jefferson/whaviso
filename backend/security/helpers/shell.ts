// Execucao de scripts bash do harness (check_rls_coverage.sh, check_dump_secrets.sh) de dentro
// dos testes. Portavel entre o Windows desta maquina (Git Bash) e o Linux do CI. Nunca imprime
// segredo: devolve o codigo de saida e as saidas cruas para o teste inspecionar com cuidado.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { HOST, USUARIO_SUPER, BANCO } from './conexao'

/** Raiz do backend (onde moram os scripts e o .env), a partir de security/helpers. */
export const RAIZ_BACKEND = resolve(__dirname, '../..')

export interface ResultadoBash {
  /** Codigo de saida do script (0 = sucesso). null se o processo nem iniciou. */
  code: number | null
  stdout: string
  stderr: string
  /** false quando o proprio `bash` nao foi encontrado (ambiente sem shell). */
  disponivel: boolean
}

/** true se `bash` esta no PATH (Git Bash no Windows, bash no Linux). */
export function bashDisponivel(): boolean {
  const r = spawnSync('bash', ['-c', 'exit 0'], { stdio: 'ignore' })
  return !r.error
}

/** Roda um script do backend via bash. `args[0]` e o caminho relativo a backend/. */
export function rodarScriptBash(args: string[]): ResultadoBash {
  const r = spawnSync('bash', args, {
    cwd: RAIZ_BACKEND,
    encoding: 'utf8',
    env: process.env,
  })
  if (r.error) {
    return { code: null, stdout: '', stderr: String(r.error), disponivel: false }
  }
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', disponivel: true }
}

/** Converte um caminho estilo Git Bash (/c/Program Files) para o que o node entende (C:/...). */
function paraCaminhoNode(p: string): string {
  const m = /^\/([a-zA-Z])\/(.*)$/.exec(p)
  return m ? `${m[1]!.toUpperCase()}:/${m[2]}` : p
}

/** Resolve o binario pg_dump: caminho com espaco no Windows (PGBIN) ou `pg_dump` do PATH. */
export function caminhoPgDump(): string {
  const bases = [process.env.PGBIN, '/c/Program Files/PostgreSQL/18/bin', 'C:/Program Files/PostgreSQL/18/bin']
    .filter((b): b is string => Boolean(b))
  for (const base of bases) {
    const win = paraCaminhoNode(`${base}/pg_dump.exe`)
    if (existsSync(win)) return win
  }
  return 'pg_dump'
}

/** true se o pg_dump esta disponivel (Windows via PGBIN, ou no PATH). */
export function pgDumpDisponivel(): boolean {
  const r = spawnSync(caminhoPgDump(), ['--version'], { stdio: 'ignore' })
  return !r.error
}

/** Roda pg_dump (schema + dados) e devolve o texto do dump. Usa o superusuario de teste. */
export function rodarPgDump(banco = BANCO): { code: number | null; dump: string } {
  const senha = process.env.POSTGRES_PASSWORD ?? process.env.PGPASSWORD ?? 'postgres'
  const r = spawnSync(
    caminhoPgDump(),
    ['-h', HOST, '-U', USUARIO_SUPER, '--no-owner', '--no-privileges', banco],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: { ...process.env, PGPASSWORD: senha, PGCLIENTENCODING: 'UTF8' } },
  )
  return { code: r.status, dump: r.stdout ?? '' }
}
