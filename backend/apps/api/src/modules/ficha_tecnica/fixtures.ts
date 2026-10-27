// Apoio de TESTE do modulo ficha_tecnica. As tabelas insumos/movimentos_insumo nascem na
// migration 0026 (outro modulo) e fichas_tecnicas na 0027; enquanto o banco de teste nao tiver
// essas tabelas, as suites se PULAM (describe.skipIf). Como nao conhecemos o esquema final de
// `insumos`, montamos o INSERT por introspecao: preenchemos as colunas NOT NULL sem default com
// valores de teste por tipo. Se aparecer uma coluna obrigatoria que nao sabemos preencher (ex.:
// outra FK uuid, enum), `inserivel` fica false e a suite se pula com aviso.
//
// O texto SQL dinamico e montado numa variavel a partir de nomes vindos de information_schema
// (fonte segura) e todos os VALORES vao parametrizados; nunca ha dado de usuario interpolado.
import { randomUUID } from 'node:crypto'
import { poolSuper } from '../../../test/db'

export async function tabelaExiste(nome: string): Promise<boolean> {
  const { rows } = await poolSuper.query<{ ok: boolean }>(
    `select exists (
       select 1 from information_schema.tables
        where table_schema = 'public' and table_name = $1
     ) as ok`,
    [nome],
  )
  return rows[0]?.ok ?? false
}

interface Coluna {
  column_name: string
  data_type: string
  is_nullable: 'YES' | 'NO'
  column_default: string | null
}

/** Colunas NOT NULL sem default de `insumos`. */
async function colunasObrigatorias(): Promise<Coluna[]> {
  const { rows } = await poolSuper.query<Coluna>(
    `select column_name, data_type, is_nullable, column_default
       from information_schema.columns
      where table_schema = 'public' and table_name = 'insumos'
      order by ordinal_position`,
  )
  return rows.filter((c) => c.is_nullable === 'NO' && c.column_default === null)
}

const CONHECIDAS = new Set(['loja_id', 'quantidade_atual'])

function valorParaTipo(dataType: string): string | number | boolean | undefined {
  if (dataType === 'text' || dataType.includes('char')) return 'teste'
  if (dataType === 'boolean') return true
  if (['numeric', 'integer', 'bigint', 'smallint'].includes(dataType) || dataType.includes('double')) return 0
  return undefined // tipo que nao sabemos preencher (uuid FK, enum, etc.)
}

export interface InsertInsumo {
  inserivel: boolean
  motivo?: string
  criar: (lojaId: string, quantidadeAtual: number) => Promise<string>
}

/** Monta um inseridor de insumo robusto ao esquema real da 0026 (ou diz por que nao da). */
export async function montarInsercaoInsumo(): Promise<InsertInsumo> {
  if (!(await tabelaExiste('insumos'))) {
    return { inserivel: false, motivo: 'tabela insumos ausente', criar: async () => '' }
  }
  const extras = (await colunasObrigatorias()).filter((c) => !CONHECIDAS.has(c.column_name))
  const naoPreenchiveis: string[] = []
  const preenchiveis: { nome: string; valor: string | number | boolean }[] = []
  for (const c of extras) {
    const v = valorParaTipo(c.data_type)
    if (v === undefined) naoPreenchiveis.push(`${c.column_name}:${c.data_type}`)
    else preenchiveis.push({ nome: c.column_name, valor: v })
  }
  if (naoPreenchiveis.length > 0) {
    return {
      inserivel: false,
      motivo: `colunas obrigatorias de insumos sem valor de teste: ${naoPreenchiveis.join(', ')}`,
      criar: async () => '',
    }
  }
  const colunas = ['id', 'loja_id', 'quantidade_atual', ...preenchiveis.map((p) => p.nome)]
  const placeholders = colunas.map((_, i) => `$${i + 1}`).join(', ')
  // Identificadores vem SO de information_schema; valores vao parametrizados.
  const insertSql = `insert into public.insumos (${colunas.join(', ')}) values (${placeholders})`
  return {
    inserivel: true,
    criar: async (lojaId: string, quantidadeAtual: number) => {
      const id = randomUUID()
      const vals: unknown[] = [id, lojaId, quantidadeAtual, ...preenchiveis.map((p) => p.valor)]
      await poolSuper.query(insertSql, vals)
      return id
    },
  }
}

/** Quantidade_atual real do insumo (numero). */
export async function quantidadeAtual(insumoId: string): Promise<number> {
  const { rows } = await poolSuper.query<{ q: string }>(
    'select quantidade_atual::text as q from public.insumos where id = $1',
    [insumoId],
  )
  return Number(rows[0]?.q ?? 'NaN')
}

/** Movimentos 'consumo' de um pedido/insumo (para checar idempotencia). */
export async function movimentosConsumo(pedidoId: string, insumoId: string) {
  const { rows } = await poolSuper.query<{ quantidade: string; quantidade_resultante: string }>(
    `select quantidade::text, quantidade_resultante::text
       from public.movimentos_insumo
      where pedido_id = $1 and insumo_id = $2 and tipo = 'consumo'`,
    [pedidoId, insumoId],
  )
  return rows
}

export async function limparFichaEstoque(lojaId: string): Promise<void> {
  await poolSuper.query('delete from public.movimentos_insumo where loja_id = $1', [lojaId]).catch(() => {})
  await poolSuper.query('delete from public.fichas_tecnicas where loja_id = $1', [lojaId]).catch(() => {})
  await poolSuper.query('delete from public.insumos where loja_id = $1', [lojaId]).catch(() => {})
  await poolSuper.query('delete from public.eventos where loja_id = $1', [lojaId]).catch(() => {})
}

/** Insere um item minimo do cardapio (precisa de uma categoria). Devolve itemId. */
export async function criarItem(lojaId: string): Promise<string> {
  const catId = randomUUID()
  await poolSuper.query(
    `insert into public.categorias (id, loja_id, nome) values ($1, $2, 'Cat teste')`,
    [catId, lojaId],
  )
  const itemId = randomUUID()
  await poolSuper.query(
    `insert into public.itens (id, loja_id, categoria_id, nome, preco_centavos)
     values ($1, $2, $3, 'Item teste', 1000)`,
    [itemId, lojaId, catId],
  )
  return itemId
}
