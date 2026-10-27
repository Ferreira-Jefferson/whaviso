// Rastreabilidade (etapa 13): liga o SEGURANCA.md ao registro catalogo_estado.json e aos testes.
// Falha se:
//   - um SEC-### do documento nao esta no registro (item esquecido);
//   - o registro cita um SEC-### que nao existe no documento (item fantasma);
//   - um SEC marcado `verde` nao tem nenhum teste com esse id no titulo;
//   - um teste cita um SEC-### que nao existe no documento.
// E o que impede "esquecer" um item do catalogo.
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

const RAIZ = resolve(__dirname, '../../..') // .../whaviso
const CAMINHO_SEGURANCA = resolve(RAIZ, 'docs/pivot/SEGURANCA.md')
const CAMINHO_REGISTRO = resolve(__dirname, '../catalogo_estado.json')
const RAIZ_SUITE = resolve(__dirname, '..') // backend/security
// A suite exercita um id quando ele aparece no titulo de um teste (test/) OU na matriz declarativa
// que gera esses titulos em tempo de execucao (matriz/). Ambos contam como "a suite cobre o id".
const DIRS_SUITE = ['test', 'matriz']

const RE_SEC = /SEC-\d{3}/g

function idsDe(texto: string): Set<string> {
  return new Set(texto.match(RE_SEC) ?? [])
}

interface ItemCatalogo {
  estado: 'verde' | 'pendente' | 'n/a'
  modulo?: string
  teste?: string
  nota?: string
}
interface Registro {
  itens: Record<string, ItemCatalogo>
}

const idsDoc = idsDe(readFileSync(CAMINHO_SEGURANCA, 'utf8'))
const registro = JSON.parse(readFileSync(CAMINHO_REGISTRO, 'utf8')) as Registro
const idsRegistro = new Set(Object.keys(registro.itens))

// Todos os SEC-### que a suite exercita (titulos de teste + matriz declarativa).
const idsNosTestes = new Set<string>()
for (const dir of DIRS_SUITE) {
  const caminhoDir = resolve(RAIZ_SUITE, dir)
  for (const arquivo of readdirSync(caminhoDir)) {
    if (!arquivo.endsWith('.ts')) continue
    for (const id of idsDe(readFileSync(resolve(caminhoDir, arquivo), 'utf8'))) idsNosTestes.add(id)
  }
}

describe('SEC-cat: rastreabilidade entre SEGURANCA.md, o registro e a suite', () => {
  it('todo SEC-### do SEGURANCA.md esta no registro (nenhum esquecido)', () => {
    const faltando = [...idsDoc].filter((id) => !idsRegistro.has(id)).sort()
    expect(faltando, `SEC sem entrada em catalogo_estado.json: ${faltando.join(', ')}`).toEqual([])
  })

  it('o registro nao tem SEC fantasma (todo id do registro existe no documento)', () => {
    const fantasmas = [...idsRegistro].filter((id) => !idsDoc.has(id)).sort()
    expect(fantasmas, `SEC no registro que nao existe no SEGURANCA.md: ${fantasmas.join(', ')}`).toEqual([])
  })

  it('todo SEC marcado `verde` tem um teste com esse id no titulo', () => {
    const verdes = Object.entries(registro.itens)
      .filter(([, v]) => v.estado === 'verde')
      .map(([id]) => id)
    const semTeste = verdes.filter((id) => !idsNosTestes.has(id)).sort()
    expect(semTeste, `SEC 'verde' sem teste carregando o id: ${semTeste.join(', ')}`).toEqual([])
    // Sanidade: ha pelo menos os verdes esperados desta onda.
    expect(verdes.length).toBeGreaterThanOrEqual(8)
  })

  it('nenhum teste cita um SEC-### inexistente no SEGURANCA.md', () => {
    const inexistentes = [...idsNosTestes].filter((id) => !idsDoc.has(id)).sort()
    expect(inexistentes, `testes citam SEC inexistente no documento: ${inexistentes.join(', ')}`).toEqual([])
  })

  it('todo estado do registro e um valor valido', () => {
    const invalidos = Object.entries(registro.itens)
      .filter(([, v]) => !['verde', 'pendente', 'n/a'].includes(v.estado))
      .map(([id]) => id)
    expect(invalidos, `estados invalidos: ${invalidos.join(', ')}`).toEqual([])
  })
})
