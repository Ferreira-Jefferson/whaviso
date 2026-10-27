// Traduz uma LinhaMatriz num comando SQL sem efeito colateral: todas as formas usam `where false`
// (ou 0 linhas via `select ... where false`), entao o privilegio/coluna e checado no planejamento
// mas nenhuma linha e lida/escrita, nenhum constraint ou trigger de dado dispara. Identificadores
// vem da matriz declarativa (dado fixo do codigo), nunca de entrada externa; vao entre aspas duplas.
import type { LinhaMatriz } from '../matriz/privilegios'

/** Coluna representativa para INSERT/UPDATE quando a linha nao fixa uma (tabelas com loja_id). */
const COLUNA_PADRAO = 'loja_id'

function ident(nome: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(nome)) {
    throw new Error(`identificador invalido na matriz: "${nome}"`)
  }
  return `"${nome}"`
}

/** Monta o comando que exercita o privilegio da linha (sem tocar dados). */
export function sqlOperacao(linha: LinhaMatriz): string {
  const t = ident(linha.tabela)
  const col = linha.coluna ? ident(linha.coluna) : null
  switch (linha.operacao) {
    case 'select':
      return `select ${col ?? '1'} from ${t} where false`
    case 'delete':
      return `delete from ${t} where false`
    case 'update':
      return `update ${t} set ${col ?? ident(COLUNA_PADRAO)} = null where false`
    case 'insert':
      return `insert into ${t} (${col ?? ident(COLUNA_PADRAO)}) select null where false`
  }
}
