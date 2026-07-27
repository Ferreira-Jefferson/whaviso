import type { Pool, PoolClient } from '@whaviso/shared/db'
import type {
  Aviso,
  Categoria,
  DirecaoAviso,
  EtapaEnvio,
  PapelAviso,
  StatusAviso,
} from '@whaviso/shared/contracts'

type Executor = Pool | PoolClient

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

const COLS = `id, nome, cor, arquivada, criado_em, atualizado_em`

/** Categorias NÃO arquivadas da conta, por nome (H16.2). Isolamento por profile_id. */
export async function listar(ex: Executor, uid: string): Promise<Categoria[]> {
  const { rows } = await ex.query<Categoria>(
    `select ${COLS} from public.categorias
      where profile_id = $1 and not arquivada
      order by nome asc`,
    [uid],
  )
  return rows
}

/** Cria uma categoria (H16.1). Pode lançar 23505 (nome duplicado ativo) -> tratado no service. */
export async function criar(
  ex: Executor,
  uid: string,
  nome: string,
  cor: string | null,
): Promise<Categoria> {
  const { rows } = await ex.query<Categoria>(
    `insert into public.categorias (profile_id, nome, cor) values ($1, $2, $3)
     returning ${COLS}`,
    [uid, nome, cor],
  )
  return rows[0]!
}

/** Categoria da conta por id (ou null se não é minha). */
export async function buscar(ex: Executor, uid: string, id: string): Promise<Categoria | null> {
  const { rows } = await ex.query<Categoria>(
    `select ${COLS} from public.categorias where id = $1 and profile_id = $2`,
    [id, uid],
  )
  return rows[0] ?? null
}

export interface CamposCategoria {
  nome?: string
  cor?: string | null
  arquivada?: boolean
}

/**
 * Atualiza campos da categoria (H16.2), só os passados (undefined = mantém; cor null =
 * limpa). Escopo por profile_id. Pode lançar 23505 (renomear para nome já usado).
 */
export async function atualizar(
  ex: Executor,
  uid: string,
  id: string,
  campos: CamposCategoria,
): Promise<Categoria | null> {
  const sets: string[] = []
  const params: unknown[] = [id, uid]
  for (const [k, v] of Object.entries(campos)) {
    if (v === undefined) continue
    params.push(v)
    sets.push(`${k} = $${params.length}`)
  }
  if (sets.length === 0) return buscar(ex, uid, id)
  const { rows } = await ex.query<Categoria>(
    `update public.categorias set ${sets.join(', ')}
      where id = $1 and profile_id = $2
      returning ${COLS}`,
    params,
  )
  return rows[0] ?? null
}

/**
 * E18: combinados vinculados à categoria (via junção `aviso_categorias`), TODOS os estados
 * (com e sem aviso, inclusive `sem_aviso`/agenda; nenhum é filtrado). Escopo pelo DONO da
 * categoria: só quem criou o combinado pode ter usado uma categoria (a categoria é sempre do
 * próprio criador, H16.3), então o mesmo filtro de dono de `avisos` isola por uid.
 */
export async function combinadosPorCategoria(
  ex: Executor,
  uid: string,
  categoriaId: string,
): Promise<Aviso[]> {
  const { rows } = await ex.query<LinhaAviso>(
    `select ${COLS_AVISO}
       from public.avisos a
       join public.aviso_categorias ac on ac.aviso_id = a.id
      where ac.categoria_id = $1
        and ((a.criador_papel = 'cobrador' and a.cobrador_id = $2)
          or (a.criador_papel = 'devedor' and a.devedor_profile_id = $2))
      order by a.data_combinada desc, a.criado_em desc`,
    [categoriaId, uid],
  )
  return rows.map(mapearAviso)
}
