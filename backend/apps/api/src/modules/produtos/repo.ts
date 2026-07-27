import type { Pool, PoolClient } from '@whaviso/shared/db'
import type {
  Aviso,
  DirecaoAviso,
  EtapaEnvio,
  PapelAviso,
  Produto,
  StatusAviso,
} from '@whaviso/shared/contracts'

type Executor = Pool | PoolClient

// preco_venda_centavos é bigint: node-pg devolve como string -> cast + Number no mapear.
const COLS = `id, nome, preco_venda_centavos::bigint as preco_venda_centavos, arquivado, criado_em, atualizado_em`

interface LinhaProduto {
  id: string
  nome: string
  preco_venda_centavos: string
  arquivado: boolean
  criado_em: Date
  atualizado_em: Date
}

function mapear(l: LinhaProduto): Produto {
  return { ...l, preco_venda_centavos: Number(l.preco_venda_centavos) }
}

// Mesmas colunas do módulo avisos (a fronteira do lint impede importar aquele módulo); espelha
// o padrão de pessoas/repo.ts. categoria_ids/itens ficam de fora (nullish no schema, não usados
// nesta listagem).
const COLS_AVISO = `
  id, cobrador_id, devedor_profile_id, direcao, criador_papel, status,
  nome_devedor, telefone_devedor, nome_cobrador, telefone_cobrador, motivo,
  valor_centavos::bigint as valor_centavos,
  to_char(data_combinada, 'YYYY-MM-DD') as data_combinada, pix_chave,
  pix_titular, pix_banco,
  recorrencia_tipo, recorrencia_freq, recorrencia_intervalo,
  ocorrencias_total, ocorrencia_atual,
  cadencia_etapas::text[] as cadencia_etapas,
  aceito_em, arquivado_em, criado_em, atualizado_em
`

interface LinhaAviso {
  id: string
  cobrador_id: string | null
  devedor_profile_id: string | null
  direcao: DirecaoAviso
  criador_papel: PapelAviso
  status: StatusAviso
  nome_devedor: string
  telefone_devedor: string | null
  nome_cobrador: string | null
  telefone_cobrador: string | null
  motivo: string
  valor_centavos: string
  data_combinada: string
  pix_chave: string | null
  pix_titular: string | null
  pix_banco: string | null
  recorrencia_tipo: 'periodo' | 'avulsas' | null
  recorrencia_freq: 'mensal' | 'semanal' | null
  recorrencia_intervalo: number | null
  ocorrencias_total: number | null
  ocorrencia_atual: number | null
  cadencia_etapas: EtapaEnvio[] | null
  aceito_em: Date | null
  arquivado_em: Date | null
  criado_em: Date
  atualizado_em: Date
}

function mapearAviso(l: LinhaAviso): Aviso {
  return { ...l, valor_centavos: Number(l.valor_centavos) }
}

/** Produtos NÃO arquivados da conta, por nome (H17.2). Isolamento por profile_id. */
export async function listar(ex: Executor, uid: string): Promise<Produto[]> {
  const { rows } = await ex.query<LinhaProduto>(
    `select ${COLS} from public.produtos
      where profile_id = $1 and not arquivado
      order by nome asc`,
    [uid],
  )
  return rows.map(mapear)
}

/** Cria um produto (H17.1). Pode lançar 23505 (nome duplicado ativo) -> tratado no service. */
export async function criar(
  ex: Executor,
  uid: string,
  nome: string,
  precoVendaCentavos: number,
): Promise<Produto> {
  const { rows } = await ex.query<LinhaProduto>(
    `insert into public.produtos (profile_id, nome, preco_venda_centavos) values ($1, $2, $3)
     returning ${COLS}`,
    [uid, nome, precoVendaCentavos],
  )
  return mapear(rows[0]!)
}

/** Produto da conta por id (ou null se não é meu). */
export async function buscar(ex: Executor, uid: string, id: string): Promise<Produto | null> {
  const { rows } = await ex.query<LinhaProduto>(
    `select ${COLS} from public.produtos where id = $1 and profile_id = $2`,
    [id, uid],
  )
  return rows[0] ? mapear(rows[0]) : null
}

export interface CamposProduto {
  nome?: string
  preco_venda_centavos?: number
  arquivado?: boolean
}

/**
 * Atualiza campos do produto (H17.2), só os passados. Escopo por profile_id. Pode lançar
 * 23505 (renomear para nome já usado).
 */
export async function atualizar(
  ex: Executor,
  uid: string,
  id: string,
  campos: CamposProduto,
): Promise<Produto | null> {
  const sets: string[] = []
  const params: unknown[] = [id, uid]
  for (const [k, v] of Object.entries(campos)) {
    if (v === undefined) continue
    params.push(v)
    sets.push(`${k} = $${params.length}`)
  }
  if (sets.length === 0) return buscar(ex, uid, id)
  const { rows } = await ex.query<LinhaProduto>(
    `update public.produtos set ${sets.join(', ')}
      where id = $1 and profile_id = $2
      returning ${COLS}`,
    params,
  )
  return rows[0] ? mapear(rows[0]) : null
}

/**
 * H17.3: PROPAGA um novo nome do produto para a `descricao` dos itens dos combinados que o
 * referenciam (`produto_id`), reescrevendo o jsonb `avisos.itens`. Escopado ao DONO (espelha
 * o escopo de itens/repo: cobrador dono OU devedor dono no invertido). NÃO toca em
 * `valor_unit_centavos` (o preço é snapshot congelado). Retorna quantos combinados foram
 * afetados. Editar SÓ o preço/arquivar não chama isto (decisão E17: preço não propaga).
 */
export async function propagarNome(
  ex: Executor,
  uid: string,
  produtoId: string,
  novoNome: string,
): Promise<number> {
  const { rowCount } = await ex.query(
    `update public.avisos a
        set itens = (
          select jsonb_agg(
            case when elem->>'produto_id' = $2
                 then jsonb_set(elem, '{descricao}', to_jsonb($3::text))
                 else elem end
          )
          from jsonb_array_elements(a.itens) elem
        )
      where a.itens is not null
        and ((a.criador_papel = 'cobrador' and a.cobrador_id = $1)
          or (a.criador_papel = 'devedor'  and a.devedor_profile_id = $1))
        and exists (
          select 1 from jsonb_array_elements(a.itens) e where e->>'produto_id' = $2
        )`,
    [uid, produtoId, novoNome],
  )
  return rowCount ?? 0
}

/**
 * E18: combinados que usam o produto (algum item com `produto_id` igual), TODOS os estados
 * (com e sem aviso, inclusive `sem_aviso`/agenda; nenhum é filtrado). Escopo pelo DONO do
 * produto: só o criador do combinado pode ter escolhido um produto do seu próprio catálogo
 * (H17.5), então o mesmo filtro de dono de `avisos` isola por uid.
 */
export async function combinadosPorProduto(
  ex: Executor,
  uid: string,
  produtoId: string,
): Promise<Aviso[]> {
  const { rows } = await ex.query<LinhaAviso>(
    `select ${COLS_AVISO}
       from public.avisos a
      where a.itens is not null
        and ((a.criador_papel = 'cobrador' and a.cobrador_id = $1)
          or (a.criador_papel = 'devedor' and a.devedor_profile_id = $1))
        and exists (
          select 1 from jsonb_array_elements(a.itens) e where e->>'produto_id' = $2
        )
      order by a.data_combinada desc, a.criado_em desc`,
    [uid, produtoId],
  )
  return rows.map(mapearAviso)
}
