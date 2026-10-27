// Codegen dos contratos (F1). O front nao importa @whaviso/shared (independencia de
// deploy): este script REEMITE os contratos Zod do kernel para
// frontend/src/shared/contracts/_generated/, como codigo TypeScript autocontido.
//
// Abordagem: os arquivos de contrato do kernel ja importam SO `zod` e os irmaos relativos
// (./enums, ./primitivos, ...). Entao a geracao os copia VERBATIM (com um cabecalho
// "GERADO") para o _generated, preservando todo refinamento (.min/.max/.strict) exatamente,
// e o front resolve `zod` localmente e os relativos dentro do proprio _generated.
//
// Determinismo: ordem estavel (nomes ordenados), sem timestamp; o manifest carrega um hash
// do conteudo de origem. `--check` reemite em memoria e compara com o que esta no disco,
// falhando se o gerado estiver fora de sincronia (gate de CI).
import { readdirSync, readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const AQUI = dirname(fileURLToPath(import.meta.url))
const ORIGEM = resolve(AQUI, '../../packages/shared/src/contracts')
const DESTINO = resolve(AQUI, '../../../frontend/src/shared/contracts/_generated')
const ORIGEM_REL = 'backend/packages/shared/src/contracts'

const CABECALHO = (nome) =>
  `// GERADO POR scripts/gen_contracts a partir de ${ORIGEM_REL}/${nome}.\n` +
  `// NAO EDITAR A MAO: rode \`npm run gen:contracts\` no backend. Ver historias/00-fundacao/kernel-contratos.md.\n\n`

/** Lista ordenada dos arquivos de contrato de origem (sem testes). */
function arquivosDeOrigem() {
  return readdirSync(ORIGEM)
    .filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'))
    .sort()
}

/** Monta o conteudo gerado (Map nome -> texto) e o manifest, de forma pura/deterministica. */
function gerar() {
  const arquivos = arquivosDeOrigem()
  const saida = new Map()
  const hash = createHash('sha256')
  for (const nome of arquivos) {
    const original = readFileSync(join(ORIGEM, nome), 'utf8').replace(/\r\n/g, '\n')
    hash.update(nome + '\0' + original + '\0')
    saida.set(nome, CABECALHO(nome) + original)
  }
  const manifest =
    JSON.stringify(
      { gerado_de: ORIGEM_REL, arquivos, hash: hash.digest('hex') },
      null,
      2,
    ) + '\n'
  saida.set('manifest.json', manifest)
  return saida
}

function escrever(saida) {
  rmSync(DESTINO, { recursive: true, force: true })
  mkdirSync(DESTINO, { recursive: true })
  for (const [nome, texto] of saida) writeFileSync(join(DESTINO, nome), texto, 'utf8')
}

function checar(saida) {
  const problemas = []
  for (const [nome, esperado] of saida) {
    const alvo = join(DESTINO, nome)
    if (!existsSync(alvo)) {
      problemas.push(`faltando: ${nome}`)
      continue
    }
    const atual = readFileSync(alvo, 'utf8').replace(/\r\n/g, '\n')
    if (atual !== esperado.replace(/\r\n/g, '\n')) problemas.push(`fora de sincronia: ${nome}`)
  }
  if (existsSync(DESTINO)) {
    const extras = readdirSync(DESTINO).filter((n) => !saida.has(n))
    for (const e of extras) problemas.push(`sobrando (nao gerado): ${e}`)
  }
  return problemas
}

const saida = gerar()
if (process.argv.includes('--check')) {
  const problemas = checar(saida)
  if (problemas.length > 0) {
    console.error('Contratos gerados fora de sincronia. Rode `npm run gen:contracts`.\n' + problemas.join('\n'))
    process.exit(1)
  }
  console.log('Contratos gerados em sincronia.')
} else {
  escrever(saida)
  console.log(`Gerados ${saida.size} arquivos em frontend/src/shared/contracts/_generated/`)
}
