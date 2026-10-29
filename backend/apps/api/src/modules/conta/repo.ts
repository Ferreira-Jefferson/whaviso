// Acesso a dados do modulo: SO via @whaviso/shared/db, sempre com sql`...` (parametrizado).
// Dono de escrita: contas, membros, convites. Leitura: lojas (pertencimento da loja do convite).
import { consultar, consultarUm, sql, type Executor } from '@whaviso/shared/db'
import type { PapelMembro } from '@whaviso/shared/contracts'

export interface Vinculo {
  id: string
  conta_id: string
  loja_id: string | null
  papel: PapelMembro
}

export interface ContaLinha {
  id: string
  nome: string
  criado_em: string
}

export interface MembroLinha {
  id: string
  conta_id: string
  user_id: string
  loja_id: string | null
  papel: PapelMembro
  ativo: boolean
  criado_em: string
}

export interface ConviteLinha {
  id: string
  conta_id: string
  loja_id: string | null
  papel: PapelMembro
  expira_em: string
  criado_em: string
  aceito_em: string | null
  revogado_em: string | null
}

type Bruto<T> = { [K in keyof T]: T[K] extends string | null ? string | Date | T[K] : T[K] }

function iso<T>(linha: Bruto<T>, campos: string[]): T {
  const copia: Record<string, unknown> = { ...linha }
  for (const c of campos) {
    const v = copia[c]
    if (v instanceof Date) copia[c] = v.toISOString()
  }
  return copia as T
}

const mapConta = (r: Bruto<ContaLinha>): ContaLinha => iso<ContaLinha>(r, ['criado_em'])
const mapMembro = (r: Bruto<MembroLinha>): MembroLinha => iso<MembroLinha>(r, ['criado_em'])
const mapConvite = (r: Bruto<ConviteLinha>): ConviteLinha =>
  iso<ConviteLinha>(r, ['expira_em', 'criado_em', 'aceito_em', 'revogado_em'])

export async function vinculosAtivos(exec: Executor, userId: string): Promise<Vinculo[]> {
  return consultar<Vinculo>(
    exec,
    sql`select id, conta_id, loja_id, papel from public.membros
         where user_id = ${userId} and ativo order by criado_em`,
  )
}

// ---------- gate de allowlist de login (migration 0082) ----------

/** E-mail do usuario no Auth, via funcao SECURITY DEFINER (0069). null se nunca teve e-mail. */
export async function emailDoUsuario(exec: Executor, userId: string): Promise<string | null> {
  const r = await consultarUm<{ email: string | null }>(
    exec,
    sql`select email from public.plataforma_auth_info(array[${userId}]::uuid[]) limit 1`,
  )
  return r?.email ?? null
}

/** true se o e-mail esta APROVADO na allowlist (case-insensitive). */
export async function emailAprovado(exec: Executor, email: string): Promise<boolean> {
  const r = await consultarUm(
    exec,
    sql`select 1 as ok from public.acessos_permitidos
         where lower(email) = lower(${email}) and status = 'aprovado'`,
  )
  return r !== null
}

export async function contaDoDono(exec: Executor, userId: string): Promise<ContaLinha | null> {
  const r = await consultarUm<Bruto<ContaLinha>>(
    exec,
    sql`select id, nome, criado_em from public.contas
         where dono_user_id = ${userId} order by criado_em limit 1`,
  )
  return r ? mapConta(r) : null
}

/** Serializa criacoes concorrentes do mesmo usuario (so vale dentro de transacao). */
export async function travarUsuario(exec: Executor, userId: string): Promise<void> {
  await consultar(exec, sql`select pg_advisory_xact_lock(hashtext(${userId}))`)
}

/** Serializa mutacoes de membros da conta (guarda do ultimo dono). */
export async function travarConta(exec: Executor, contaId: string): Promise<void> {
  await consultar(exec, sql`select id from public.contas where id = ${contaId} for update`)
}

export async function inserirConta(exec: Executor, userId: string, nome: string): Promise<ContaLinha> {
  const r = await consultarUm<Bruto<ContaLinha>>(
    exec,
    sql`insert into public.contas (dono_user_id, nome) values (${userId}, ${nome})
         returning id, nome, criado_em`,
  )
  return mapConta(r!)
}

export async function buscarConta(exec: Executor, contaId: string): Promise<ContaLinha | null> {
  const r = await consultarUm<Bruto<ContaLinha>>(
    exec,
    sql`select id, nome, criado_em from public.contas where id = ${contaId}`,
  )
  return r ? mapConta(r) : null
}

export async function renomearConta(exec: Executor, contaId: string, nome: string): Promise<ContaLinha> {
  const r = await consultarUm<Bruto<ContaLinha>>(
    exec,
    sql`update public.contas set nome = ${nome} where id = ${contaId} returning id, nome, criado_em`,
  )
  return mapConta(r!)
}

export async function inserirMembro(
  exec: Executor,
  m: { contaId: string; lojaId: string | null; userId: string; papel: PapelMembro },
): Promise<MembroLinha> {
  const r = await consultarUm<Bruto<MembroLinha>>(
    exec,
    sql`insert into public.membros (conta_id, loja_id, user_id, papel)
         values (${m.contaId}, ${m.lojaId}, ${m.userId}, ${m.papel})
         returning id, conta_id, user_id, loja_id, papel, ativo, criado_em`,
  )
  return mapMembro(r!)
}

export async function listarMembros(exec: Executor, contaId: string): Promise<MembroLinha[]> {
  const rs = await consultar<Bruto<MembroLinha>>(
    exec,
    sql`select id, conta_id, user_id, loja_id, papel, ativo, criado_em from public.membros
         where conta_id = ${contaId} order by criado_em, id`,
  )
  return rs.map(mapMembro)
}

export async function buscarMembro(
  exec: Executor,
  id: string,
  contaId: string,
): Promise<MembroLinha | null> {
  const r = await consultarUm<Bruto<MembroLinha>>(
    exec,
    sql`select id, conta_id, user_id, loja_id, papel, ativo, criado_em from public.membros
         where id = ${id} and conta_id = ${contaId}`,
  )
  return r ? mapMembro(r) : null
}

export async function contarDonosAtivos(
  exec: Executor,
  contaId: string,
  excetoMembroId: string,
): Promise<number> {
  const r = await consultarUm<{ n: number }>(
    exec,
    sql`select count(*)::int as n from public.membros
         where conta_id = ${contaId} and papel = 'dono' and ativo and id <> ${excetoMembroId}`,
  )
  return r?.n ?? 0
}

export async function atualizarMembro(
  exec: Executor,
  id: string,
  papel: PapelMembro,
  ativo: boolean,
): Promise<MembroLinha> {
  const r = await consultarUm<Bruto<MembroLinha>>(
    exec,
    sql`update public.membros set papel = ${papel}, ativo = ${ativo} where id = ${id}
         returning id, conta_id, user_id, loja_id, papel, ativo, criado_em`,
  )
  return mapMembro(r!)
}

/** Vinculo (ativo ou nao) do usuario naquela conta+loja exata (loja NULL = todas). */
export async function membroExato(
  exec: Executor,
  userId: string,
  contaId: string,
  lojaId: string | null,
): Promise<MembroLinha | null> {
  const r = await consultarUm<Bruto<MembroLinha>>(
    exec,
    sql`select id, conta_id, user_id, loja_id, papel, ativo, criado_em from public.membros
         where user_id = ${userId} and conta_id = ${contaId}
           and loja_id is not distinct from ${lojaId}::uuid`,
  )
  return r ? mapMembro(r) : null
}

// ---------- lojas (somente leitura) ----------

export async function lojaDaConta(exec: Executor, lojaId: string, contaId: string): Promise<boolean> {
  const r = await consultarUm(
    exec,
    sql`select 1 as ok from public.lojas where id = ${lojaId} and conta_id = ${contaId}`,
  )
  return r !== null
}

// ---------- convites ----------

export async function inserirConvite(
  exec: Executor,
  c: {
    contaId: string
    lojaId: string | null
    papel: PapelMembro
    tokenHash: string
    criadoPor: string
    dias: number
  },
): Promise<ConviteLinha> {
  const r = await consultarUm<Bruto<ConviteLinha>>(
    exec,
    sql`insert into public.convites
          (conta_id, loja_id, papel, token_hash, criado_por_membro_id, expira_em)
        values (${c.contaId}, ${c.lojaId}, ${c.papel}, ${c.tokenHash}, ${c.criadoPor},
                now() + make_interval(days => ${c.dias}::int))
        returning id, conta_id, loja_id, papel, expira_em, criado_em, aceito_em, revogado_em`,
  )
  return mapConvite(r!)
}

export async function listarConvitesPendentes(exec: Executor, contaId: string): Promise<ConviteLinha[]> {
  const rs = await consultar<Bruto<ConviteLinha>>(
    exec,
    sql`select id, conta_id, loja_id, papel, expira_em, criado_em, aceito_em, revogado_em
          from public.convites
         where conta_id = ${contaId} and aceito_em is null and revogado_em is null
           and expira_em > now()
         order by criado_em, id`,
  )
  return rs.map(mapConvite)
}

export async function buscarConvite(
  exec: Executor,
  id: string,
  contaId: string,
): Promise<ConviteLinha | null> {
  const r = await consultarUm<Bruto<ConviteLinha>>(
    exec,
    sql`select id, conta_id, loja_id, papel, expira_em, criado_em, aceito_em, revogado_em
          from public.convites where id = ${id} and conta_id = ${contaId}`,
  )
  return r ? mapConvite(r) : null
}

export async function buscarConvitePorHash(
  exec: Executor,
  tokenHash: string,
): Promise<(ConviteLinha & { expirado: boolean }) | null> {
  const r = await consultarUm<Bruto<ConviteLinha> & { expirado: boolean }>(
    exec,
    sql`select id, conta_id, loja_id, papel, expira_em, criado_em, aceito_em, revogado_em,
               (expira_em <= now()) as expirado
          from public.convites where token_hash = ${tokenHash}`,
  )
  return r ? { ...mapConvite(r), expirado: r.expirado } : null
}

/** Revoga um convite pendente. false se ja estava aceito/revogado. */
export async function revogarConvite(exec: Executor, id: string): Promise<boolean> {
  const rs = await consultar(
    exec,
    sql`update public.convites set revogado_em = now()
         where id = ${id} and aceito_em is null and revogado_em is null returning id`,
  )
  return rs.length === 1
}

/** Consome o convite (uso unico, atomico). false se perdeu a corrida ou nao esta mais valido. */
export async function consumirConvite(exec: Executor, id: string, userId: string): Promise<boolean> {
  const rs = await consultar(
    exec,
    sql`update public.convites set aceito_em = now(), aceito_por_user_id = ${userId}
         where id = ${id} and aceito_em is null and revogado_em is null and expira_em > now()
         returning id`,
  )
  return rs.length === 1
}

// ---------- auditoria (sem PII) ----------

export async function auditar(
  exec: Executor,
  e: {
    tipo: string
    entidade: 'conta' | 'membro' | 'convite'
    entidadeId: string
    lojaId?: string | null
    detalhes?: Record<string, string | boolean | null>
  },
): Promise<void> {
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${e.lojaId ?? null}, ${e.tipo}, ${e.entidade}, ${e.entidadeId}, 'loja',
                ${JSON.stringify(e.detalhes ?? {})}::jsonb)`,
  )
}
