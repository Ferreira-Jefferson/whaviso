// Leitura do modulo motoboys. Acesso a dados SO via @whaviso/shared/db, sempre com sql`...`
// (parametrizado) e SEMPRE filtrando por loja_id do escopo (SEC-001/002). Escrita em repo_escrita.ts.
// Leituras cruzadas (read-model, sem importar codigo de outro modulo): `pessoas` + `cargos` (a
// pessoa de cargo 'motoboy': nome e telefone) e, na materializacao (repo_escrita), `pedidos` e
// `zonas_entrega`. Timestamps em ISO/UTC; datas de negocio 'YYYY-MM-DD'.
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'

const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)
const DIA = (col: string): Consulta => sqlBruto(`to_char(${col}, 'YYYY-MM-DD')`)

type TipoPix = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria'

export interface MotoboyLinha {
  id: string
  pessoa_id: string | null
  nome: string
  telefone_cifrado: Buffer | null
  veiculo: 'moto' | 'bicicleta' | 'carro' | 'a_pe'
  placa: string | null
  pix_tipo: TipoPix | null
  pix_cifrado: Buffer | null
  ativo: boolean
  pessoa_ativa: boolean | null
  criado_em: string
  atualizado_em: string
}

const COLUNAS_MOTOBOY = sql`
  m.id, m.pessoa_id, coalesce(p.nome, m.nome) as nome,
  coalesce(p.telefone_cifrado, m.telefone_cifrado) as telefone_cifrado,
  m.veiculo, m.placa, m.pix_tipo, m.pix_cifrado, m.ativo, p.ativo as pessoa_ativa,
  ${TS('m.criado_em')} as criado_em, ${TS('m.atualizado_em')} as atualizado_em
  from public.motoboys m
  left join public.pessoas p on p.id = m.pessoa_id and p.loja_id = m.loja_id`

export function listarMotoboys(exec: Executor, lojaId: string, incluirInativos: boolean) {
  return consultar<MotoboyLinha>(
    exec,
    sql`select ${COLUNAS_MOTOBOY}
         where m.loja_id = ${lojaId} and (${incluirInativos}::boolean or m.ativo)
         order by m.ativo desc, nome, m.id`,
  )
}

export function obterMotoboy(exec: Executor, lojaId: string, id: string) {
  return consultarUm<MotoboyLinha>(
    exec,
    sql`select ${COLUNAS_MOTOBOY} where m.loja_id = ${lojaId} and m.id = ${id}`,
  )
}

export interface PessoaMotoboy {
  id: string
  nome: string
  ativo: boolean
  cargo_chave: string | null
}

/** Pessoa da loja (qualquer cargo) para validar que e a de cargo 'motoboy'. */
export function pessoaDaLoja(exec: Executor, lojaId: string, pessoaId: string) {
  return consultarUm<PessoaMotoboy>(
    exec,
    sql`select p.id, p.nome, p.ativo, c.chave as cargo_chave
          from public.pessoas p join public.cargos c on c.id = p.cargo_id
         where p.loja_id = ${lojaId} and p.id = ${pessoaId}`,
  )
}

export async function motoboyDaPessoa(exec: Executor, lojaId: string, pessoaId: string) {
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`select id from public.motoboys where loja_id = ${lojaId} and pessoa_id = ${pessoaId}`,
  )
  return r?.id ?? null
}

export interface PixCifrado {
  pix_tipo: TipoPix | null
  pix_cifrado: Buffer | null
}

export function pixDoMotoboy(exec: Executor, lojaId: string, id: string) {
  return consultarUm<PixCifrado>(
    exec,
    sql`select pix_tipo, pix_cifrado from public.motoboys where loja_id = ${lojaId} and id = ${id}`,
  )
}

// ------------------------------------------------------------------------------ fechamento
export interface FechamentoLinhaDb {
  id: string
  motoboy_id: string
  motoboy_nome: string
  data: string
  status: 'aberto' | 'pago'
  pago_em: string | null
  qtd_entregas: number
  entregas_centavos: number
  ajustes_centavos: number
}

export interface LancamentoDb {
  id: string
  motoboy_id: string
  data: string
  tipo: 'entrega' | 'ajuste'
  pedido_id: string | null
  valor_centavos: number
  descricao: string | null
  criado_em: string
}

// Totais sempre DERIVADOS dos lancamentos (nunca armazenados). float8 evita overflow de int4 na soma.
const FECHAMENTO_BASE = sql`
  select f.id, f.motoboy_id, coalesce(p.nome, m.nome) as motoboy_nome, ${DIA('f.data')} as data,
         f.status, ${TS('f.pago_em')} as pago_em,
         coalesce(a.qtd, 0)::int as qtd_entregas,
         coalesce(a.entregas, 0)::float8 as entregas_centavos,
         coalesce(a.ajustes, 0)::float8 as ajustes_centavos
    from public.fechamentos f
    join public.motoboys m on m.id = f.motoboy_id and m.loja_id = f.loja_id
    left join public.pessoas p on p.id = m.pessoa_id and p.loja_id = m.loja_id
    left join lateral (
      select count(*) filter (where l.tipo = 'entrega') as qtd,
             sum(l.valor_centavos) filter (where l.tipo = 'entrega') as entregas,
             sum(l.valor_centavos) filter (where l.tipo = 'ajuste') as ajustes
        from public.motoboy_lancamentos l
       where l.motoboy_id = f.motoboy_id and l.data = f.data and l.loja_id = f.loja_id
    ) a on true`

export function fechamentosDoDia(exec: Executor, lojaId: string, data: string) {
  return consultar<FechamentoLinhaDb>(
    exec,
    sql`${FECHAMENTO_BASE}
         where f.loja_id = ${lojaId} and f.data = ${data}::date
         order by motoboy_nome, f.id`,
  )
}

export function fechamentoPorId(exec: Executor, lojaId: string, id: string) {
  return consultarUm<FechamentoLinhaDb>(
    exec,
    sql`${FECHAMENTO_BASE} where f.loja_id = ${lojaId} and f.id = ${id}`,
  )
}

export function lancamentosDoDia(exec: Executor, lojaId: string, data: string) {
  return consultar<LancamentoDb>(
    exec,
    sql`select l.id::text as id, l.motoboy_id, ${DIA('l.data')} as data, l.tipo, l.pedido_id,
               l.valor_centavos, l.descricao, ${TS('l.criado_em')} as criado_em
          from public.motoboy_lancamentos l
         where l.loja_id = ${lojaId} and l.data = ${data}::date
         order by l.id`,
  )
}

export interface ResumoLinhaDb {
  motoboy_id: string
  motoboy_nome: string
  qtd_entregas: number
  entregas_centavos: number
  ajustes_centavos: number
}

/** Total por motoboy entre datas (inclusive), so leitura: nao materializa nada. */
export function resumoPorPeriodo(exec: Executor, lojaId: string, de: string, ate: string) {
  return consultar<ResumoLinhaDb>(
    exec,
    sql`select l.motoboy_id, coalesce(p.nome, m.nome) as motoboy_nome,
               (count(*) filter (where l.tipo = 'entrega'))::int as qtd_entregas,
               coalesce(sum(l.valor_centavos) filter (where l.tipo = 'entrega'), 0)::float8 as entregas_centavos,
               coalesce(sum(l.valor_centavos) filter (where l.tipo = 'ajuste'), 0)::float8 as ajustes_centavos
          from public.motoboy_lancamentos l
          join public.motoboys m on m.id = l.motoboy_id and m.loja_id = l.loja_id
          left join public.pessoas p on p.id = m.pessoa_id and p.loja_id = m.loja_id
         where l.loja_id = ${lojaId} and l.data between ${de}::date and ${ate}::date
         group by l.motoboy_id, motoboy_nome
         order by motoboy_nome, l.motoboy_id`,
  )
}
