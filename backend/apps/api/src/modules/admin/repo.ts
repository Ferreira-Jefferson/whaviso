// Consultas read-only de auditoria do admin (owner). Sem escrita exceto troca de plano.
import type { Pool } from '@whaviso/shared/db'
import type {
  AdminAvisosQuery,
  AdminEnvio,
  AdminEnviosQuery,
  AdminNotificacao,
  AdminNotificacoesQuery,
  AdminUsuario,
  AdminUsuariosQuery,
  Aviso,
} from '@whaviso/shared/contracts'

interface LinhaAviso {
  id: string
  cobrador_id: string | null
  devedor_profile_id: string | null
  direcao: Aviso['direcao']
  criador_papel: Aviso['criador_papel']
  status: Aviso['status']
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
  aceito_em: Date | null
  arquivado_em: Date | null
  criado_em: Date
  atualizado_em: Date
}

const AVISO_COLS = `
  id, cobrador_id, devedor_profile_id, direcao, criador_papel, status,
  nome_devedor, telefone_devedor, nome_cobrador, telefone_cobrador, motivo,
  valor_centavos::bigint as valor_centavos,
  to_char(data_combinada, 'YYYY-MM-DD') as data_combinada, pix_chave,
  pix_titular, pix_banco,
  aceito_em, arquivado_em, criado_em, atualizado_em
`

function mapearAviso(l: LinhaAviso): Aviso {
  return { ...l, valor_centavos: Number(l.valor_centavos) }
}

function offset(page: number, perPage: number): number {
  return (page - 1) * perPage
}

// ---- Usuários (profiles + plano via assinaturas) ----
export async function listarUsuarios(
  pool: Pool,
  q: AdminUsuariosQuery,
): Promise<{ itens: AdminUsuario[]; total: number }> {
  const cond: string[] = []
  const params: unknown[] = []
  if (q.busca) {
    params.push(`%${q.busca}%`)
    cond.push(`(p.nome ilike $${params.length} or p.telefone ilike $${params.length})`)
  }
  const where = cond.length ? `where ${cond.join(' and ')}` : ''
  const total = await pool.query<{ n: string }>(
    `select count(*) as n from public.profiles p ${where}`,
    params,
  )
  params.push(q.per_page, offset(q.page, q.per_page))
  const { rows } = await pool.query<AdminUsuario & { criado_em: Date; atualizado_em: Date }>(
    `select p.id, p.nome, p.telefone, p.role, p.suspenso, p.criado_em, p.atualizado_em,
            s.plano_id, s.status as plano_status
     from public.profiles p
     left join public.assinaturas s on s.profile_id = p.id
     ${where}
     order by p.criado_em desc
     limit $${params.length - 1} offset $${params.length}`,
    params,
  )
  return { itens: rows, total: Number(total.rows[0]!.n) }
}

// ---- Envios (auditoria global, com nome do destinatário via join avisos) ----
export async function listarEnvios(
  pool: Pool,
  q: AdminEnviosQuery,
): Promise<{ itens: AdminEnvio[]; total: number }> {
  const cond: string[] = []
  const params: unknown[] = []
  if (q.status) {
    params.push(q.status)
    cond.push(`e.status = $${params.length}`)
  }
  if (q.etapa) {
    params.push(q.etapa)
    cond.push(`e.etapa = $${params.length}`)
  }
  if (q.de) {
    params.push(q.de)
    cond.push(`(e.agendado_para at time zone 'America/Sao_Paulo')::date >= $${params.length}`)
  }
  if (q.ate) {
    params.push(q.ate)
    cond.push(`(e.agendado_para at time zone 'America/Sao_Paulo')::date <= $${params.length}`)
  }
  const where = cond.length ? `where ${cond.join(' and ')}` : ''
  const total = await pool.query<{ n: string }>(
    `select count(*) as n from public.envios e ${where}`,
    params,
  )
  params.push(q.per_page, offset(q.page, q.per_page))
  const { rows } = await pool.query<AdminEnvio>(
    `select e.id, e.aviso_id, e.etapa, e.status, e.agendado_para, e.enviado_em, e.tentativas,
            e.proxima_tentativa_em, e.wamid, e.entrega_status, e.erro,
            a.nome_devedor as nome_devedor
     from public.envios e
     join public.avisos a on a.id = e.aviso_id
     ${where}
     order by e.agendado_para desc
     limit $${params.length - 1} offset $${params.length}`,
    params,
  )
  return { itens: rows, total: Number(total.rows[0]!.n) }
}

// ---- Notificações ao cobrador (outbox; estado/erro VISÍVEL ao owner, sem PII) ----
// Surface da fila notificacoes_cobrador para o painel admin. Inclui o motivo
// recuperável 'sem_template_ativo' (linha 'agendado' com erro preenchido) quando
// falta ativar o template (H12.8). Não expõe telefone/nome/Pix: só ids técnicos.
export async function listarNotificacoes(
  pool: Pool,
  q: AdminNotificacoesQuery,
): Promise<{ itens: AdminNotificacao[]; total: number }> {
  const cond: string[] = []
  const params: unknown[] = []
  if (q.status) {
    params.push(q.status)
    cond.push(`status = $${params.length}`)
  }
  const where = cond.length ? `where ${cond.join(' and ')}` : ''
  const total = await pool.query<{ n: string }>(
    `select count(*) as n from public.notificacoes_cobrador ${where}`,
    params,
  )
  params.push(q.per_page, offset(q.page, q.per_page))
  const { rows } = await pool.query<AdminNotificacao>(
    `select id, aviso_id, tipo, status, tentativas, erro, proxima_tentativa_em, criado_em
       from public.notificacoes_cobrador ${where}
      order by criado_em desc
      limit $${params.length - 1} offset $${params.length}`,
    params,
  )
  return { itens: rows, total: Number(total.rows[0]!.n) }
}

// ---- Avisos (visão global de todos os cobradores) ----
export async function listarAvisos(
  pool: Pool,
  q: AdminAvisosQuery,
): Promise<{ itens: Aviso[]; total: number }> {
  const cond: string[] = []
  const params: unknown[] = []
  if (q.status) {
    params.push(q.status)
    cond.push(`status = $${params.length}`)
  }
  if (q.direcao) {
    params.push(q.direcao)
    cond.push(`direcao = $${params.length}`)
  }
  const where = cond.length ? `where ${cond.join(' and ')}` : ''
  const total = await pool.query<{ n: string }>(
    `select count(*) as n from public.avisos ${where}`,
    params,
  )
  params.push(q.per_page, offset(q.page, q.per_page))
  const { rows } = await pool.query<LinhaAviso>(
    `select ${AVISO_COLS} from public.avisos ${where}
     order by criado_em desc
     limit $${params.length - 1} offset $${params.length}`,
    params,
  )
  return { itens: rows.map(mapearAviso), total: Number(total.rows[0]!.n) }
}

// ---- Troca de plano (assinaturas) ----
export async function planoExiste(pool: Pool, planoId: string): Promise<boolean> {
  const { rows } = await pool.query(`select 1 from public.planos where id = $1`, [planoId])
  return rows.length > 0
}

export async function usuarioExiste(pool: Pool, id: string): Promise<boolean> {
  const { rows } = await pool.query(`select 1 from public.profiles where id = $1`, [id])
  return rows.length > 0
}

/** Define o plano do usuário (upsert na assinatura). Status 'ativa'. */
export async function definirPlano(pool: Pool, id: string, planoId: string): Promise<void> {
  await pool.query(
    `insert into public.assinaturas (profile_id, plano_id, status)
     values ($1, $2, 'ativa')
     on conflict (profile_id) do update set plano_id = excluded.plano_id, status = 'ativa'`,
    [id, planoId],
  )
}

/** Suspende/reativa a conta. Não apaga dados; o bloqueio é no caminho de autenticação. */
export async function definirSuspenso(pool: Pool, id: string, suspenso: boolean): Promise<void> {
  await pool.query(`update public.profiles set suspenso = $2 where id = $1`, [id, suspenso])
}
