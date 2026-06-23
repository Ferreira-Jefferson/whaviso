// Guarda automática das Regras de Ouro de linguagem (Épico 13, H13.1/H13.2/H13.9).
// Esta é a fonte única do backend; o teste cobre:
//   - lint de palavra proibida e de travessão, com casos de borda (falso positivo);
//   - varredura de TODO o código de produto (apps/*/src + packages/*/src) por
//     palavra proibida e travessão (H13.1 em código/comentários, H13.2);
//   - igualdade dos TRÊS padrões com o espelho do front (H13.9), já que o front
//     não importa @whaviso/shared (são cópias mantidas à mão).
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PALAVRAS_PROIBIDAS,
  PALAVRAS_PROIBIDAS_PATTERN,
  TRAVESSAO,
  TRAVESSAO_PATTERN,
  GENERO_ALERTA_PATTERNS,
  lintLinguagem,
  lintTravessao,
  alertaGenero,
} from './linguagem'

// .../packages/shared/src/contracts -> sobe 4 níveis para backend/.
const ESTE_DIR = dirname(fileURLToPath(import.meta.url))
const BACKEND = join(ESTE_DIR, '..', '..', '..', '..')

describe('lint de linguagem (H13.1/H13.2)', () => {
  it('detecta palavra proibida e ignora texto limpo', () => {
    expect(lintLinguagem('isso é uma cobrança')).toBe('cobrança')
    expect(lintLinguagem('está em atraso')).toBe('atraso')
    expect(lintLinguagem('um lembrete educado do combinado')).toBeNull()
  })

  // Casos de borda: palavras que PARECEM proibidas mas não são (H13.1/H13.10, gap B2).
  it('não dá falso positivo em palavras legítimas', () => {
    expect(lintLinguagem('olhe atrás de você')).toBeNull() // "atrás" (com acento, sem sufixo o/ad)
    expect(lintLinguagem('faça o cadastro agora')).toBeNull() // "cadastro"
    expect(lintLinguagem('a astronave decolou')).toBeNull()
    expect(lintLinguagem('o combinado foi aceito')).toBeNull()
  })

  // Travessão casa SÓ em dash/en dash, NUNCA hífen ASCII (gap C1/E12-B2).
  it('detecta em dash e en dash, mas não hífen ASCII', () => {
    expect(lintTravessao('texto — com em dash')).toBe('—')
    expect(lintTravessao('texto – com en dash')).toBe('–')
    expect(lintTravessao('pagar-agora')).toBeNull()
    expect(lintTravessao('https://x/a-b-c')).toBeNull()
    expect(lintTravessao('2026-06-22 é uma data')).toBeNull()
    expect(lintTravessao('acao_com_underscore e palavra-composta')).toBeNull()
  })

  it('alerta de gênero acende em gendered e fica vazio em neutro', () => {
    expect(alertaGenero('Sou a Ana').length).toBeGreaterThan(0)
    expect(alertaGenero('o cobrador avisou').length).toBeGreaterThan(0)
    expect(alertaGenero('Aqui é Ana, sobre o combinado de pagamento')).toEqual([])
  })
})

// --- Varredura do código de produto (H13.1 em código/comentários + H13.2) ------

// Raízes de código de produto a varrer. Doc interno (.claude, historias) é exento.
const RAIZES = ['apps/api/src', 'apps/zap/src', 'packages/shared/src']

// Exclusões:
//  - os próprios arquivos de definição da regra (contêm as palavras por definição);
//  - testes (.test.ts) usam fixtures intencionais com termo proibido/travessão.
// O módulo `billing/` JÁ NÃO é excluído (débito do E13 quitado no Épico 11): os
// identificadores do gateway passaram a usar vocabulário neutro ("fatura").
function ignorar(caminho: string): boolean {
  const p = caminho.replace(/\\/g, '/')
  return p.endsWith('linguagem.ts') || p.endsWith('.test.ts')
}

function arquivosDe(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    const st = statSync(caminho)
    if (st.isDirectory()) {
      if (nome === 'node_modules' || nome === 'dist') continue
      out.push(...arquivosDe(caminho))
    } else if (/\.(ts|tsx)$/.test(nome)) {
      out.push(caminho)
    }
  }
  return out
}

function todosOsArquivos(): string[] {
  return RAIZES.flatMap((r) => arquivosDe(join(BACKEND, r))).filter((c) => !ignorar(c))
}

describe('varredura de linguagem no código de produto', () => {
  it('nenhum código de produto usa palavra proibida (H13.1)', () => {
    const offensores: string[] = []
    for (const arquivo of todosOsArquivos()) {
      const m = PALAVRAS_PROIBIDAS.exec(readFileSync(arquivo, 'utf8'))
      if (m) offensores.push(`${relative(BACKEND, arquivo)}: "${m[0]}"`)
    }
    expect(offensores, `palavras proibidas:\n${offensores.join('\n')}`).toEqual([])
  })

  it('nenhum código de produto usa travessão (H13.2)', () => {
    const offensores: string[] = []
    for (const arquivo of todosOsArquivos()) {
      const m = TRAVESSAO.exec(readFileSync(arquivo, 'utf8'))
      if (m) offensores.push(`${relative(BACKEND, arquivo)}: "${m[0]}"`)
    }
    expect(offensores, `travessão:\n${offensores.join('\n')}`).toEqual([])
  })
})

// --- Espelho backend <-> front (H13.9): patterns têm que ser idênticos ---------

describe('espelho backend <-> front (H13.9)', () => {
  const frontLinguagem = join(BACKEND, '..', 'frontend', 'src', 'shared', 'contracts', 'linguagem.ts')
  const backLinguagem = join(ESTE_DIR, 'linguagem.ts')

  // Extrai o literal de string de `NOME = '...'` (PALAVRAS_PROIBIDAS_PATTERN etc.),
  // tolerando a quebra de linha entre `=` e a aspa. Retorna o texto-fonte do literal.
  function literal(src: string, nome: string): string | null {
    const m = src.match(new RegExp(`${nome}\\s*=\\s*\\n?\\s*'([^']*)'`))
    return m ? m[1]! : null
  }

  // Extrai a LISTA de literais de string de dentro de GENERO_ALERTA_PATTERNS = [...].
  // Pega só os '...' (ignora comentários entre os itens, que podem diferir entre os
  // dois arquivos). Comparamos a fonte crua (com `\\b` etc.), não o valor em runtime.
  function listaGenero(src: string): string[] | null {
    const bloco = src.match(/GENERO_ALERTA_PATTERNS\s*=\s*\[([\s\S]*?)\]\s*as const/)
    if (!bloco) return null
    return [...bloco[1]!.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]!)
  }

  it('os três padrões são idênticos no front e no backend', () => {
    expect(existsSync(frontLinguagem), `front não encontrado em ${frontLinguagem}`).toBe(true)
    const front = readFileSync(frontLinguagem, 'utf8')
    const back = readFileSync(backLinguagem, 'utf8')

    // PALAVRAS_PROIBIDAS_PATTERN e TRAVESSAO_PATTERN: o valor em runtime bate com o
    // literal-fonte (não têm escape de barra), então confronto direto serve.
    expect(literal(front, 'PALAVRAS_PROIBIDAS_PATTERN')).toBe(PALAVRAS_PROIBIDAS_PATTERN)
    expect(literal(back, 'PALAVRAS_PROIBIDAS_PATTERN')).toBe(PALAVRAS_PROIBIDAS_PATTERN)
    expect(literal(front, 'TRAVESSAO_PATTERN')).toBe(TRAVESSAO_PATTERN)
    expect(literal(back, 'TRAVESSAO_PATTERN')).toBe(TRAVESSAO_PATTERN)

    // GENERO_ALERTA_PATTERNS: compara a lista de literais-fonte dos dois lados.
    const generoFront = listaGenero(front)
    const generoBack = listaGenero(back)
    expect(generoBack, 'backend não tem o bloco GENERO_ALERTA_PATTERNS').not.toBeNull()
    expect(generoFront, 'front difere do backend em GENERO_ALERTA_PATTERNS').toEqual(generoBack)
    // E confirma que o array em runtime tem o mesmo número de padrões que a fonte.
    expect(generoBack!.length).toBe(GENERO_ALERTA_PATTERNS.length)
  })
})
