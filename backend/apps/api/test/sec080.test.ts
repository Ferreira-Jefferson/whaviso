// SEC-080: nenhuma query por interpolacao/concatenacao. Varre o codigo de producao e falha
// se achar template com ${} ou concatenacao no 1o argumento de consultar( / .query(.
// (A mesma regra roda no ESLint: ver eslint.config.mjs, `whaviso/sem-sql-interpolado`.)
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const RAIZ = resolve(__dirname, '../../..')

function arquivos(dir: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules') continue
    const p = join(dir, nome)
    if (statSync(p).isDirectory()) arquivos(p, out)
    else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) out.push(p)
  }
  return out
}

// consultar(x, `...${` | .query(`...${` | .query('a' + | .query(x + ...
const PADROES = [/\.query\(\s*`[^`]*\$\{/, /\.query\(\s*['"][^'"]*['"]\s*\+/, /consultar(?:Um)?\(\s*[\w.]+\s*,\s*`[^`]*\$\{/]

function semComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('SEC-080: sem SQL por interpolacao no codigo de producao', () => {
  const fontes = [
    ...arquivos(join(RAIZ, 'apps')).filter((f) => f.includes(`${join('src')}`)),
    ...arquivos(join(RAIZ, 'packages')),
  ]
  it('varre fontes', () => {
    expect(fontes.length).toBeGreaterThan(10)
  })
  it('nenhum .query/consultar com ${} ou concatenacao', () => {
    const ruins = fontes.filter((f) => PADROES.some((r) => r.test(semComentarios(readFileSync(f, 'utf8')))))
    expect(ruins).toEqual([])
  })
  it('os padroes pegam o anti-padrao (sanidade)', () => {
    expect(PADROES.some((r) => r.test('pool.query(`select ${x}`)'))).toBe(true)
    expect(PADROES.some((r) => r.test("pool.query('select ' + x)"))).toBe(true)
    expect(PADROES.some((r) => r.test('pool.query(`select $1`, [x])'))).toBe(false)
  })
})
