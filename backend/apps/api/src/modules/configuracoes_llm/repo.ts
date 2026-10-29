// Acesso a dados do modulo: SO via @whaviso/shared/db, sempre com sql`...` (parametrizado).
//
// REGRA DE SEGREDO (SEC-020/021): `chave_cifrada` NUNCA entra numa projecao de leitura. O grant
// por coluna ja barra o SELECT dela para a api; o repo reforca isso projetando SO as colunas de
// metadado (lista EXPLICITA, nunca `select *`). A unica escrita da chave e no upsert, cujo
// RETURNING tambem so traz metadado.
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'
import type { ProvedorLlm } from './schemas'

/** Timestamptz -> ISO 8601 UTC (ou null). Mesmo molde dos demais modulos. */
const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)

/** Linha de metadado (SEM chave_cifrada). */
export interface CredencialMeta {
  id: string
  provedor: ProvedorLlm
  ultimos4: string | null
  modelo_preferido: string | null
  ativo: boolean
  validada_em: string | null
  criado_em: string | null
  atualizado_em: string | null
}

// Projecao publica unica: lista fixa de metadados, sem chave_cifrada. Fragmento do codigo.
const SAIDA_META = sql`${sqlBruto('id, provedor, ultimos4, modelo_preferido, ativo')},
  ${TS('validada_em')} as validada_em, ${TS('criado_em')} as criado_em,
  ${TS('atualizado_em')} as atualizado_em`

/** Estado atual da credencial da loja (metadado) ou null se nao ha credencial. */
export async function buscarEstado(exec: Executor, lojaId: string): Promise<CredencialMeta | null> {
  return consultarUm<CredencialMeta>(
    exec,
    sql`select ${SAIDA_META} from public.credenciais_llm where loja_id = ${lojaId}`,
  )
}

export interface DadosUpsert {
  lojaId: string
  provedor: ProvedorLlm
  chaveCifrada: Buffer
  ultimos4: string
  modeloPreferido: string | null
}

/**
 * Set (primeiro cadastro) ou rotate (troca da chave) por `loja_id` (unique). Uma credencial por
 * loja: o conflito sobrescreve chave/metadados e reativa. `modelo_preferido` so e sobrescrito
 * quando veio um valor novo (coalesce preserva o atual num rotate que nao mexe no modelo).
 *
 * IMPORTANTE (write-only, SEC-021): o DO UPDATE referencia o PARAMETRO de `chave_cifrada`, nunca
 * `excluded.chave_cifrada`. Ler `excluded.chave_cifrada` exigiria SELECT nessa coluna, que a api
 * NAO tem (grant por coluna) e abortaria por privilegio. Escrever o parametro so exige UPDATE.
 *
 * `validada_em` NAO entra aqui (fora do grant de insert); e marcado em `marcarValidada`.
 * RETURNING so o `id` (o estado completo vem de `marcarValidada`).
 */
export async function upsert(exec: Executor, d: DadosUpsert): Promise<string> {
  const linha = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.credenciais_llm
          (loja_id, provedor, chave_cifrada, ultimos4, modelo_preferido, ativo)
        values (${d.lojaId}, ${d.provedor}, ${d.chaveCifrada}, ${d.ultimos4}, ${d.modeloPreferido}, true)
        on conflict (loja_id) do update set
          provedor = excluded.provedor,
          chave_cifrada = ${d.chaveCifrada},
          ultimos4 = excluded.ultimos4,
          modelo_preferido = coalesce(${d.modeloPreferido}, public.credenciais_llm.modelo_preferido),
          ativo = true
        returning id`,
  )
  // O upsert sempre devolve a linha afetada; o null seria impossivel.
  return linha!.id
}

/** Marca `validada_em = now()` (set/rotate acabou de validar) e devolve o estado completo. */
export async function marcarValidada(exec: Executor, lojaId: string): Promise<CredencialMeta> {
  const linha = await consultarUm<CredencialMeta>(
    exec,
    sql`update public.credenciais_llm set validada_em = now()
         where loja_id = ${lojaId} returning ${SAIDA_META}`,
  )
  return linha!
}

/** PATCH: ativar/desativar e/ou trocar modelo, SEM tocar na chave nem em `validada_em`. */
export async function ajustar(
  exec: Executor,
  lojaId: string,
  campos: { ativo?: boolean; modelo?: string | null },
): Promise<CredencialMeta | null> {
  const sets: Consulta[] = []
  if (campos.ativo !== undefined) sets.push(sql`ativo = ${campos.ativo}`)
  if (campos.modelo !== undefined) sets.push(sql`modelo_preferido = ${campos.modelo}`)
  // O service garante ao menos um campo (o contrato tem refine), mas protegemos a query.
  if (sets.length === 0) return buscarEstado(exec, lojaId)
  let clausula = sets[0]!
  for (let i = 1; i < sets.length; i++) clausula = sql`${clausula}, ${sets[i]!}`
  return consultarUm<CredencialMeta>(
    exec,
    sql`update public.credenciais_llm set ${clausula}
         where loja_id = ${lojaId} returning ${SAIDA_META}`,
  )
}

/** Auditoria sem a chave (tabela eventos). `detalhes` so carrega provedor/ultimos4/acao. */
export async function registrarEvento(
  exec: Executor,
  e: { lojaId: string; entidadeId: string; detalhes: object },
): Promise<void> {
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${e.lojaId}, 'credencial_llm.definida', 'credencial_llm', ${e.entidadeId}, 'loja',
                ${JSON.stringify(e.detalhes)}::jsonb)`,
  )
}

// ---- Read-model de consumo (uso_llm) --------------------------------------------------------

export interface UsoTotalLinha {
  total: number
  te: number
  ts: number
}
export interface UsoDiaLinha {
  dia: string
  custo: number
  te: number
  ts: number
}
export interface UsoRotuloLinha {
  rotulo: string
  custo: number
}

// Faixa crua sobre `criado_em` (coluna sem funcao) para usar o indice uso_llm_loja_tempo. Os
// limites sao o inicio do mes corrente e do proximo em America/Sao_Paulo, de volta a timestamptz.
const FILTRO_MES = sqlBruto(
  `criado_em >= (date_trunc('month', (now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo')
     and criado_em < ((date_trunc('month', (now() at time zone 'America/Sao_Paulo')) + interval '1 month') at time zone 'America/Sao_Paulo')`,
)

/** Total do mes corrente (America/Sao_Paulo): custo em centavos e tokens. */
export async function totalMes(exec: Executor, lojaId: string): Promise<UsoTotalLinha> {
  const linha = await consultarUm<UsoTotalLinha>(
    exec,
    sql`select coalesce(sum(custo_estimado_centavos), 0)::int as total,
               coalesce(sum(tokens_entrada), 0)::int as te,
               coalesce(sum(tokens_saida), 0)::int as ts
          from public.uso_llm
         where loja_id = ${lojaId} and ${FILTRO_MES}`,
  )
  return linha!
}

/** Consumo por dia nos ultimos 30 dias (fuso America/Sao_Paulo), em ordem crescente. */
export async function porDia(exec: Executor, lojaId: string): Promise<UsoDiaLinha[]> {
  return consultar<UsoDiaLinha>(
    exec,
    sql`select to_char((criado_em at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as dia,
               coalesce(sum(custo_estimado_centavos), 0)::int as custo,
               coalesce(sum(tokens_entrada), 0)::int as te,
               coalesce(sum(tokens_saida), 0)::int as ts
          from public.uso_llm
         where loja_id = ${lojaId}
           and criado_em >= (now() - interval '30 days')
         group by 1 order by 1`,
  )
}

/** Custo do mes agregado por origem (modulo que consumiu). */
export async function porOrigem(exec: Executor, lojaId: string): Promise<UsoRotuloLinha[]> {
  return consultar<UsoRotuloLinha>(
    exec,
    sql`select coalesce(origem, '(desconhecido)') as rotulo,
               coalesce(sum(custo_estimado_centavos), 0)::int as custo
          from public.uso_llm
         where loja_id = ${lojaId} and ${FILTRO_MES}
         group by 1 order by custo desc, rotulo`,
  )
}

/** Custo do mes agregado por modelo. */
export async function porModelo(exec: Executor, lojaId: string): Promise<UsoRotuloLinha[]> {
  return consultar<UsoRotuloLinha>(
    exec,
    sql`select coalesce(modelo, '(desconhecido)') as rotulo,
               coalesce(sum(custo_estimado_centavos), 0)::int as custo
          from public.uso_llm
         where loja_id = ${lojaId} and ${FILTRO_MES}
         group by 1 order by custo desc, rotulo`,
  )
}
