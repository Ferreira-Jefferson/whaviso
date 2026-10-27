// Escrita do modulo: SO via @whaviso/shared/db, sql`...` parametrizado. Tudo carimba loja_id da
// loja ativa (nunca do corpo). Sem DELETE: escala/pessoa/cargo saem de cena com ativo=false.
import { consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'
import type { CargoLinha, EscalaLinha } from './repo'

const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)
const HM = (col: string): Consulta => sqlBruto(`to_char(${col}, 'HH24:MI')`)

const COLS_CARGO = sql`id, loja_id, chave, nome, sistema, ativo,
  ${TS('criado_em')} as criado_em, ${TS('atualizado_em')} as atualizado_em`
const COLS_ESCALA = sql`id, pessoa_id, dia_semana, ${HM('entrada')} as entrada,
  ${HM('saida')} as saida, ativo, ${TS('criado_em')} as criado_em`

function montarSets(partes: Consulta[]): Consulta {
  return partes.reduce((acc, parte, i) => (i === 0 ? parte : sql`${acc}, ${parte}`))
}

// --- cargos (so os proprios da loja; preset nunca e tocado) ---
export async function inserirCargo(exec: Executor, lojaId: string, nome: string) {
  return consultarUm<CargoLinha>(
    exec,
    sql`insert into public.cargos (loja_id, nome, sistema, ativo)
        values (${lojaId}, ${nome}, false, true)
        returning ${COLS_CARGO}`,
  )
}

export async function atualizarCargo(
  exec: Executor,
  lojaId: string,
  id: string,
  p: { nome?: string; ativo?: boolean },
) {
  const partes: Consulta[] = []
  if (p.nome !== undefined) partes.push(sql`nome = ${p.nome}`)
  if (p.ativo !== undefined) partes.push(sql`ativo = ${p.ativo}`)
  return consultarUm<CargoLinha>(
    exec,
    sql`update public.cargos set ${montarSets(partes)}
         where id = ${id} and loja_id = ${lojaId} and not sistema
        returning ${COLS_CARGO}`,
  )
}

// --- pessoas (retorna o id; o service recompoe a linha com o join do cargo) ---
export async function inserirPessoa(
  exec: Executor,
  lojaId: string,
  d: { nome: string; cargoId: string; cifrado: Buffer | null; observacoes: string | null },
) {
  return consultarUm<{ id: string }>(
    exec,
    sql`insert into public.pessoas (loja_id, nome, cargo_id, telefone_cifrado, observacoes)
        values (${lojaId}, ${d.nome}, ${d.cargoId}, ${d.cifrado}, ${d.observacoes})
        returning id`,
  )
}

export async function atualizarPessoa(
  exec: Executor,
  lojaId: string,
  id: string,
  p: {
    nome?: string
    cargoId?: string
    cifrado?: Buffer | null
    observacoes?: string | null
    ativo?: boolean
  },
) {
  const partes: Consulta[] = []
  if (p.nome !== undefined) partes.push(sql`nome = ${p.nome}`)
  if (p.cargoId !== undefined) partes.push(sql`cargo_id = ${p.cargoId}`)
  if (p.cifrado !== undefined) partes.push(sql`telefone_cifrado = ${p.cifrado}`)
  if (p.observacoes !== undefined) partes.push(sql`observacoes = ${p.observacoes}`)
  if (p.ativo !== undefined) partes.push(sql`ativo = ${p.ativo}`)
  if (partes.length === 0) return { afetou: false }
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`update public.pessoas set ${montarSets(partes)}
         where id = ${id} and loja_id = ${lojaId}
        returning id`,
  )
  return { afetou: r !== null }
}

// --- escalas ---
export async function inserirEscala(
  exec: Executor,
  lojaId: string,
  pessoaId: string,
  d: { dia_semana: number; entrada: string; saida: string },
) {
  return consultarUm<EscalaLinha>(
    exec,
    sql`insert into public.escalas (loja_id, pessoa_id, dia_semana, entrada, saida)
        values (${lojaId}, ${pessoaId}, ${d.dia_semana}, ${d.entrada}::time, ${d.saida}::time)
        returning ${COLS_ESCALA}`,
  )
}

export async function atualizarEscala(
  exec: Executor,
  lojaId: string,
  id: string,
  p: { dia_semana?: number; entrada?: string; saida?: string; ativo?: boolean },
) {
  const partes: Consulta[] = []
  if (p.dia_semana !== undefined) partes.push(sql`dia_semana = ${p.dia_semana}`)
  if (p.entrada !== undefined) partes.push(sql`entrada = ${p.entrada}::time`)
  if (p.saida !== undefined) partes.push(sql`saida = ${p.saida}::time`)
  if (p.ativo !== undefined) partes.push(sql`ativo = ${p.ativo}`)
  return consultarUm<EscalaLinha>(
    exec,
    sql`update public.escalas set ${montarSets(partes)}
         where id = ${id} and loja_id = ${lojaId}
        returning ${COLS_ESCALA}`,
  )
}

export async function desativarEscala(exec: Executor, lojaId: string, id: string) {
  return consultarUm<EscalaLinha>(
    exec,
    sql`update public.escalas set ativo = false where id = ${id} and loja_id = ${lojaId}
        returning ${COLS_ESCALA}`,
  )
}
