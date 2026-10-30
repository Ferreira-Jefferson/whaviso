// Leitura do console do operador. Acesso a dados SO via @whaviso/shared/db, sempre com sql`...`
// (parametrizado), colunas sempre explicitas (curinga proibido). Le APENAS: contas, lojas, membros
// (papel/ids, sem contato), numeros_whatsapp (status/verificado, nunca token nem hash),
// assinaturas, operadores. Tabelas de conteudo de loja (pedidos, conversas, mensagens,
// clientes, enderecos...) NAO podem aparecer aqui (guarda estatica em escopo.test.ts).
// Escrita de operadores em repo_escrita.ts.
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'
import type { PapelOperador } from '@whaviso/shared/contracts'

const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)

export interface ContaLinha {
  id: string
  nome: string
  criado_em: string
  situacao: 'trial' | 'ativa' | 'suspensa' | 'cancelada' | 'sem_assinatura'
  qtd_lojas: number
  qtd_lojas_ativas: number
  saude_whatsapp: 'ok' | 'atencao' | 'sem_numero'
}

export interface FiltroContas {
  busca: string | null
  situacao: string | null
  /** posicao do cursor (instante ISO, id) ou null na primeira pagina */
  apos: { instante: string; id: string } | null
  limite: number
}

/** Escapa `%`, `_` e `\` para que a busca ILIKE trate a entrada como texto literal. */
export function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`)
}

const COLUNAS_CONTA = sql`
  c.id, c.nome, ${TS('c.criado_em')} as criado_em,
  coalesce(a.status::text, 'sem_assinatura') as situacao,
  (select count(*)::int from public.lojas l where l.conta_id = c.id) as qtd_lojas,
  (select count(*)::int from public.lojas l where l.conta_id = c.id and l.ativo) as qtd_lojas_ativas,
  case
    when not exists (
      select 1 from public.numeros_whatsapp n join public.lojas l on l.id = n.loja_id
       where l.conta_id = c.id and n.status = 'conectado'
    ) then 'sem_numero'
    when exists (
      select 1 from public.numeros_whatsapp n join public.lojas l on l.id = n.loja_id
       where l.conta_id = c.id and n.status = 'conectado' and n.verificado
    ) then 'ok'
    else 'atencao'
  end as saude_whatsapp`

const ULTIMA_ASSINATURA = sql`
  left join lateral (
    select s.status from public.assinaturas s
     where s.conta_id = c.id order by s.criado_em desc, s.id desc limit 1
  ) a on true`

/** Pagina de contas (criado_em desc, id desc). Devolve ate `limite + 1` linhas (sentinela).
 * Primeiro pagina (CTE `pag`) usando o indice de contas + o lateral leve da assinatura (para o
 * filtro de situacao); so entao computa as subconsultas pesadas (contagem de lojas, saude do
 * WhatsApp) para as linhas da pagina. Antes, essas subconsultas rodavam por TODA conta antes do
 * limit. Saida identica. */
export async function listarContas(exec: Executor, f: FiltroContas): Promise<ContaLinha[]> {
  const like = f.busca === null ? null : `%${escaparLike(f.busca)}%`
  return consultar<ContaLinha>(
    exec,
    sql`with pag as (
          select c.id, c.criado_em
            from public.contas c ${ULTIMA_ASSINATURA}
           where (${like}::text is null
                  or c.nome ilike ${like} escape '\\'
                  or exists (select 1 from public.lojas l
                              where l.conta_id = c.id and l.nome ilike ${like} escape '\\'))
             and (${f.situacao}::text is null or coalesce(a.status::text, 'sem_assinatura') = ${f.situacao})
             and (${f.apos?.instante ?? null}::timestamptz is null
                  or (c.criado_em, c.id) < (${f.apos?.instante ?? null}::timestamptz, ${f.apos?.id ?? null}::uuid))
           order by c.criado_em desc, c.id desc
           limit ${f.limite + 1}
        )
        select ${COLUNAS_CONTA}
          from public.contas c ${ULTIMA_ASSINATURA}
         where c.id in (select id from pag)
         order by c.criado_em desc, c.id desc`,
  )
}

export interface FichaContaLinha extends ContaLinha {
  dono_user_id: string
}

export async function obterConta(exec: Executor, id: string): Promise<FichaContaLinha | null> {
  return consultarUm<FichaContaLinha>(
    exec,
    sql`select ${COLUNAS_CONTA}, c.dono_user_id
          from public.contas c ${ULTIMA_ASSINATURA}
         where c.id = ${id}`,
  )
}

export interface LojaLinha {
  id: string
  nome: string
  ativo: boolean
  criado_em: string
  numero_status: 'conectado' | 'pausado' | 'removido' | null
  numero_verificado: boolean | null
  numero_criado_em: string | null
}

/** Lojas da conta com o numero mais recente nao removido (so status/verificado/criado_em). */
export async function lojasDaConta(exec: Executor, contaId: string): Promise<LojaLinha[]> {
  return consultar<LojaLinha>(
    exec,
    sql`select l.id, l.nome, l.ativo, ${TS('l.criado_em')} as criado_em,
               n.status as numero_status, n.verificado as numero_verificado,
               ${TS('n.criado_em')} as numero_criado_em
          from public.lojas l
          left join lateral (
            select w.status, w.verificado, w.criado_em
              from public.numeros_whatsapp w
             where w.loja_id = l.id and w.status <> 'removido'
             order by w.criado_em desc, w.id desc limit 1
          ) n on true
         where l.conta_id = ${contaId}
         order by l.criado_em asc, l.id asc`,
  )
}

export interface MembroLinha {
  user_id: string
  papel: 'dono' | 'gerente' | 'atendente'
  loja_id: string | null
  ativo: boolean
  criado_em: string
}

/** Membros da conta: somente papel e ids opacos (sem nome de contato, telefone ou e-mail). */
export async function membrosDaConta(exec: Executor, contaId: string): Promise<MembroLinha[]> {
  return consultar<MembroLinha>(
    exec,
    sql`select m.user_id, m.papel, m.loja_id, m.ativo, ${TS('m.criado_em')} as criado_em
          from public.membros m
         where m.conta_id = ${contaId}
         order by m.criado_em asc, m.id asc`,
  )
}

export interface AssinaturaLinha {
  id: string
  loja_id: string | null
  status: 'trial' | 'ativa' | 'suspensa' | 'cancelada'
  valor_mensal_centavos: number
  dia_vencimento: number
  trial_ate: string | null
  inicio_em: string | null
  cancelada_em: string | null
}

export async function ultimaAssinatura(exec: Executor, contaId: string): Promise<AssinaturaLinha | null> {
  return consultarUm<AssinaturaLinha>(
    exec,
    sql`select s.id, s.loja_id, s.status, s.valor_mensal_centavos, s.dia_vencimento,
               ${TS('s.trial_ate')} as trial_ate, ${TS('s.inicio_em')} as inicio_em,
               ${TS('s.cancelada_em')} as cancelada_em
          from public.assinaturas s
         where s.conta_id = ${contaId}
         order by s.criado_em desc, s.id desc limit 1`,
  )
}

export interface OperadorLinha {
  id: string
  user_id: string
  nome: string
  papel: PapelOperador
  ativo: boolean
  criado_em: string
}

export interface AuthInfo {
  user_id: string
  email: string | null
  provedores: string[]
}

/** E-mail e provedores de login (auth.identities) de uma lista de usuarios, via funcao SECURITY DEFINER. */
export async function authInfoDeUsuarios(exec: Executor, userIds: string[]): Promise<Map<string, AuthInfo>> {
  if (userIds.length === 0) return new Map()
  const linhas = await consultar<AuthInfo>(
    exec,
    sql`select user_id, email, provedores from public.plataforma_auth_info(${userIds}::uuid[])`,
  )
  return new Map(linhas.map((l) => [l.user_id, l]))
}

/** Resolve o user_id do Auth pelo e-mail (sem diferenciar caixa); null se a pessoa nunca entrou. */
export async function userIdPorEmail(exec: Executor, email: string): Promise<string | null> {
  const r = await consultarUm<{ id: string | null }>(
    exec,
    sql`select public.plataforma_user_id_por_email(${email}) as id`,
  )
  return r?.id ?? null
}

export async function listarOperadores(exec: Executor): Promise<OperadorLinha[]> {
  return consultar<OperadorLinha>(
    exec,
    sql`select o.id, o.user_id, o.nome, o.papel, o.ativo, ${TS('o.criado_em')} as criado_em
          from public.operadores o
         order by o.criado_em asc, o.id asc`,
  )
}

/** Usuario ja e dono de conta ou membro ativo de alguma? (guarda do provisionamento de cliente) */
export async function usuarioTemVinculo(exec: Executor, userId: string): Promise<boolean> {
  const r = await consultarUm<{ existe: boolean }>(
    exec,
    sql`select (exists (select 1 from public.contas where dono_user_id = ${userId})
             or exists (select 1 from public.membros where user_id = ${userId} and ativo)) as existe`,
  )
  return r?.existe ?? false
}
