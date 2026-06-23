// Teste de linguagem (Regras de Ouro, Épico 13): varre as strings de src/ e FALHA
// se encontrar palavra proibida (dívida/cobrança/atraso/inadimplência/devendo) OU
// travessão (em dash —, en dash –). Linguagem é requisito funcional: ver PROJETO.md
// seção 2 e plano riscos nº 6. Espelha o teste do backend (linguagem.test.ts).
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PALAVRAS_PROIBIDAS, TRAVESSAO, lintLinguagem, lintTravessao } from './linguagem'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// O próprio padrão e este teste contêm, por definição, as palavras/travessões.
const ARQUIVOS_IGNORADOS = ['linguagem.ts', 'linguagem.test.ts']

function arquivosDeSrc(dir: string): string[] {
  const out: string[] = []
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    const st = statSync(caminho)
    if (st.isDirectory()) {
      if (nome === 'node_modules' || nome === 'dist') continue
      out.push(...arquivosDeSrc(caminho))
    } else if (/\.(ts|tsx|css|html)$/.test(nome)) {
      out.push(caminho)
    }
  }
  return out
}

function arquivosVarridos(): string[] {
  return arquivosDeSrc(SRC).filter(
    (a) => !ARQUIVOS_IGNORADOS.some((ig) => a.endsWith(ig)),
  )
}

describe('linguagem das Regras de Ouro', () => {
  it('o lint detecta palavras proibidas e ignora texto limpo', () => {
    expect(lintLinguagem('isso é uma cobrança')).toBe('cobrança')
    expect(lintLinguagem('um lembrete educado')).toBeNull()
  })

  // Casos de borda: palavras que parecem proibidas mas não são.
  it('não dá falso positivo em "atrás"/"cadastro"', () => {
    expect(lintLinguagem('olhe atrás de você')).toBeNull()
    expect(lintLinguagem('faça o cadastro agora')).toBeNull()
  })

  it('o lint de travessão casa em/en dash, nunca hífen ASCII', () => {
    expect(lintTravessao('oi — tchau')).toBe('—')
    expect(lintTravessao('pagar-agora e a-b-c')).toBeNull()
  })

  it('nenhuma string da UI usa linguagem proibida', () => {
    const offensores: string[] = []
    for (const arquivo of arquivosVarridos()) {
      const m = PALAVRAS_PROIBIDAS.exec(readFileSync(arquivo, 'utf8'))
      if (m) offensores.push(`${relative(SRC, arquivo)}: "${m[0]}"`)
    }
    expect(offensores, `palavras proibidas encontradas:\n${offensores.join('\n')}`).toEqual([])
  })

  it('nenhuma string da UI usa travessão', () => {
    const offensores: string[] = []
    for (const arquivo of arquivosVarridos()) {
      const m = TRAVESSAO.exec(readFileSync(arquivo, 'utf8'))
      if (m) offensores.push(`${relative(SRC, arquivo)}: "${m[0]}"`)
    }
    expect(offensores, `travessão encontrado:\n${offensores.join('\n')}`).toEqual([])
  })
})
