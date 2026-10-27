// Escrita do modulo: SO via @whaviso/shared/db, sql`...` parametrizado. Sem DELETE em nada;
// prospecto_atividades e append-only (so INSERT). `eventos` leva ids e metadados, nunca PII.
import { consultar, consultarUm, sql, type Consulta, type Executor } from '@whaviso/shared/db'
import type { EstagioProspecto, TipoAtividadeProspecto } from '@whaviso/shared/contracts'

function montarSets(partes: Consulta[]): Consulta {
  return partes.reduce((acc, parte, i) => (i === 0 ? parte : sql`${acc}, ${parte}`))
}

/** Serializa operacoes concorrentes sobre o mesmo telefone (unique logico por hash). */
export async function travarHash(exec: Executor, hash: string): Promise<void> {
  await consultar(exec, sql`select pg_advisory_xact_lock(hashtext(${'prospecto-tel:' + hash}))`)
}

/** Serializa vinculos concorrentes da mesma conta. */
export async function travarConta(exec: Executor, contaId: string): Promise<void> {
  await consultar(exec, sql`select pg_advisory_xact_lock(hashtext(${'prospecto-conta:' + contaId}))`)
}

export async function inserirProspecto(
  exec: Executor,
  d: {
    nome: string
    contatoNome: string | null
    hash: string | null
    cifrado: Buffer | null
    email: string | null
    cidade: string | null
    origem: string | null
    observacoes: string | null
    responsavelId: string
  },
) {
  return consultarUm<{ id: string }>(
    exec,
    sql`insert into public.prospectos
          (nome_restaurante, contato_nome, contato_telefone_hash, contato_telefone_cifrado,
           contato_email, cidade, origem, observacoes, responsavel_operador_id)
        values (${d.nome}, ${d.contatoNome}, ${d.hash}, ${d.cifrado}, ${d.email}, ${d.cidade},
                ${d.origem}, ${d.observacoes}, ${d.responsavelId})
        returning id`,
  )
}

export interface PatchProspecto {
  nome?: string
  contatoNome?: string | null
  /** Telefone: hash e cifra andam juntos (undefined mantem; null limpa). */
  telefone?: { hash: string; cifrado: Buffer } | null
  email?: string | null
  cidade?: string | null
  origem?: string | null
  observacoes?: string | null
  responsavelId?: string | null
}

export async function atualizarProspecto(exec: Executor, id: string, p: PatchProspecto) {
  const partes: Consulta[] = []
  if (p.nome !== undefined) partes.push(sql`nome_restaurante = ${p.nome}`)
  if (p.contatoNome !== undefined) partes.push(sql`contato_nome = ${p.contatoNome}`)
  if (p.telefone !== undefined) {
    partes.push(sql`contato_telefone_hash = ${p.telefone?.hash ?? null}`)
    partes.push(sql`contato_telefone_cifrado = ${p.telefone?.cifrado ?? null}`)
  }
  if (p.email !== undefined) partes.push(sql`contato_email = ${p.email}`)
  if (p.cidade !== undefined) partes.push(sql`cidade = ${p.cidade}`)
  if (p.origem !== undefined) partes.push(sql`origem = ${p.origem}`)
  if (p.observacoes !== undefined) partes.push(sql`observacoes = ${p.observacoes}`)
  if (p.responsavelId !== undefined) partes.push(sql`responsavel_operador_id = ${p.responsavelId}`)
  if (partes.length === 0) return false
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`update public.prospectos set ${montarSets(partes)} where id = ${id} returning id`,
  )
  return r !== null
}

export async function atualizarEstagio(exec: Executor, id: string, estagio: EstagioProspecto) {
  await consultar(exec, sql`update public.prospectos set estagio = ${estagio} where id = ${id}`)
}

export async function vincularConta(exec: Executor, id: string, contaId: string) {
  await consultar(
    exec,
    sql`update public.prospectos set conta_id = ${contaId}, estagio = 'ativo' where id = ${id}`,
  )
}

export async function inserirAtividade(
  exec: Executor,
  d: {
    prospectoId: string
    operadorId: string | null
    tipo: TipoAtividadeProspecto
    descricao: string | null
    agendadaPara: string | null
  },
) {
  return consultarUm<{ id: string }>(
    exec,
    sql`insert into public.prospecto_atividades (prospecto_id, operador_id, tipo, descricao, agendada_para)
        values (${d.prospectoId}, ${d.operadorId}, ${d.tipo}, ${d.descricao}, ${d.agendadaPara})
        returning id::text as id`,
  )
}

/** Auditoria sem PII (tabela eventos, ator operador, sem loja). */
export async function registrarEvento(
  exec: Executor,
  e: { tipo: string; prospectoId: string; detalhes: object },
) {
  await consultar(
    exec,
    sql`insert into public.eventos (tipo, entidade, entidade_id, ator, detalhes)
        values (${e.tipo}, 'prospecto', ${e.prospectoId}, 'operador', ${JSON.stringify(e.detalhes)}::jsonb)`,
  )
}
