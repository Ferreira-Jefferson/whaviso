// Escrita do modulo contas a pagar: SO via @whaviso/shared/db, sql`...` parametrizado. Tudo carimba
// loja_id da loja ativa (nunca do corpo). Sem DELETE: fornecedor sai de cena com ativo=false; conta
// a pagar nunca some (muda de status). Auditoria em `eventos` sem PII.
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'
import { TZ } from '@whaviso/shared/datas'
import type { FornecedorLinha } from './repo'

const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)

const COLS_FORNECEDOR = sql`id, nome, documento, telefone_cifrado, observacoes, ativo,
  ${TS('criado_em')} as criado_em, ${TS('atualizado_em')} as atualizado_em`

function montarSets(partes: Consulta[]): Consulta {
  return partes.reduce((acc, parte, i) => (i === 0 ? parte : sql`${acc}, ${parte}`))
}

// --- fornecedores ---
export interface FornecedorNovoDb {
  nome: string
  documento: string | null
  telefoneCifrado: Buffer | null
  observacoes: string | null
}

export async function inserirFornecedor(exec: Executor, lojaId: string, n: FornecedorNovoDb) {
  return consultarUm<FornecedorLinha>(
    exec,
    sql`insert into public.fornecedores (loja_id, nome, documento, telefone_cifrado, observacoes)
        values (${lojaId}, ${n.nome}, ${n.documento}, ${n.telefoneCifrado}, ${n.observacoes})
        returning ${COLS_FORNECEDOR}`,
  )
}

export interface FornecedorParcial {
  nome?: string
  /** undefined mantem; null limpa; string troca. */
  documento?: string | null | undefined
  /** undefined mantem; null limpa; Buffer troca. */
  telefoneCifrado?: Buffer | null | undefined
  observacoes?: string | null | undefined
  ativo?: boolean
}

export async function atualizarFornecedor(exec: Executor, lojaId: string, id: string, p: FornecedorParcial) {
  const partes: Consulta[] = []
  if (p.nome !== undefined) partes.push(sql`nome = ${p.nome}`)
  if (p.documento !== undefined) partes.push(sql`documento = ${p.documento}`)
  if (p.telefoneCifrado !== undefined) partes.push(sql`telefone_cifrado = ${p.telefoneCifrado}`)
  if (p.observacoes !== undefined) partes.push(sql`observacoes = ${p.observacoes}`)
  if (p.ativo !== undefined) partes.push(sql`ativo = ${p.ativo}`)
  if (partes.length === 0) return null
  return consultarUm<FornecedorLinha>(
    exec,
    sql`update public.fornecedores set ${montarSets(partes)}
         where id = ${id} and loja_id = ${lojaId}
        returning ${COLS_FORNECEDOR}`,
  )
}

// --- contas a pagar ---
export interface ContaNovaDb {
  lojaId: string
  credorTipo: 'fornecedor' | 'pessoa'
  credorId: string
  descricao: string
  valorCentavos: number
  vencimento: string | null
  competencia: string | null
  userId: string
  chaveIdempotencia: string | null
}

/**
 * Insere um lancamento manual. A FK preenchida segue o credor_tipo (a constraint
 * contas_pagar_credor_coerente exige exatamente uma). Com `chaveIdempotencia`, o reenvio da mesma
 * chave (duplo-clique/retry) e no-op: o `on conflict do nothing` nao grava a 2a linha e o fallback
 * devolve a conta original, tornando o lancamento idempotente. Sem chave, insere sempre.
 */
export async function inserirConta(
  exec: Executor,
  n: ContaNovaDb,
): Promise<{ id: string; criado: boolean }> {
  const fornecedorId = n.credorTipo === 'fornecedor' ? n.credorId : null
  const pessoaId = n.credorTipo === 'pessoa' ? n.credorId : null
  const inserido = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.contas_pagar
          (loja_id, credor_tipo, fornecedor_id, pessoa_id, descricao, valor_centavos,
           vencimento, competencia, criado_por_user_id, chave_idempotencia)
        values (${n.lojaId}, ${n.credorTipo}::credor_tipo, ${fornecedorId}, ${pessoaId},
                ${n.descricao}, ${n.valorCentavos}, ${n.vencimento}::date, ${n.competencia}::date,
                ${n.userId}, ${n.chaveIdempotencia})
        on conflict (loja_id, chave_idempotencia) where chave_idempotencia is not null do nothing
        returning id`,
  )
  if (inserido) return { id: inserido.id, criado: true }
  // Conflito: ja havia uma conta com esta chave. Devolve a original (idempotente), sem novo evento.
  const existente = await consultarUm<{ id: string }>(
    exec,
    sql`select id from public.contas_pagar
         where loja_id = ${n.lojaId} and chave_idempotencia = ${n.chaveIdempotencia}`,
  )
  return { id: existente!.id, criado: false }
}

export interface ContaParcial {
  descricao?: string
  valorCentavos?: number
  /** undefined mantem; null limpa; string troca. */
  vencimento?: string | null | undefined
  competencia?: string | null | undefined
}

/** UPDATE da conta (so enquanto `a_pagar`; o service garante o status antes). */
export async function atualizarConta(exec: Executor, lojaId: string, id: string, p: ContaParcial) {
  const partes: Consulta[] = []
  if (p.descricao !== undefined) partes.push(sql`descricao = ${p.descricao}`)
  if (p.valorCentavos !== undefined) partes.push(sql`valor_centavos = ${p.valorCentavos}`)
  if (p.vencimento !== undefined) partes.push(sql`vencimento = ${p.vencimento}::date`)
  if (p.competencia !== undefined) partes.push(sql`competencia = ${p.competencia}::date`)
  if (partes.length === 0) return
  await consultar(
    exec,
    sql`update public.contas_pagar set ${montarSets(partes)}
         where id = ${id} and loja_id = ${lojaId} and status = 'a_pagar'`,
  )
}

/** Lock da linha da conta (id) para pagar/editar sem corrida; devolve status e valor atual. */
export function travarConta(exec: Executor, lojaId: string, id: string) {
  return consultarUm<{ id: string; status: 'a_pagar' | 'pago'; valor_centavos: number }>(
    exec,
    sql`select id, status, valor_centavos from public.contas_pagar
         where loja_id = ${lojaId} and id = ${id} for update`,
  )
}

export async function marcarContaPaga(exec: Executor, lojaId: string, id: string, userId: string) {
  await consultar(
    exec,
    sql`update public.contas_pagar
          set status = 'pago', pago_em = now(), pago_por_user_id = ${userId}
         where loja_id = ${lojaId} and id = ${id} and status = 'a_pagar'`,
  )
}

// --- Acerto do motoboy por periodo (ledger motoboy_lancamentos + snapshot em acertos_motoboy) ---

/** Serializa ajustar x pagar o acerto de um motoboy (mesmo lock que o pagar usa). */
export async function travarAcertoMotoboy(exec: Executor, motoboyId: string): Promise<void> {
  await consultar(exec, sql`select pg_advisory_xact_lock(hashtext(${'acerto:' + motoboyId}))`)
}

/**
 * Materializa as entregas do periodo [de,ate] (dia de negocio em America/Sao_Paulo). Uma linha
 * `entrega` por pedido entregue com motoboy; valor = valor_motoboy da zona (0 sem zona). Idempotente
 * pela unique `lancamentos_entrega_unica` (1 por pedido). NAO materializa pedido cuja data ja esteja
 * coberta por um acerto PAGO do mesmo motoboy. Duplica de proposito a materializacao do modulo
 * motoboys (transiente ate a fase 4; ambas idempotentes no mesmo indice).
 */
export async function materializarEntregasPeriodo(
  exec: Executor, lojaId: string, de: string, ate: string,
): Promise<void> {
  await consultar(
    exec,
    sql`insert into public.motoboy_lancamentos (loja_id, motoboy_id, data, tipo, pedido_id, valor_centavos)
        select p.loja_id, p.motoboy_id, (p.entregue_em at time zone ${TZ})::date, 'entrega', p.id,
               coalesce(z.valor_motoboy_centavos, 0)
          from public.pedidos p
          join public.motoboys m on m.id = p.motoboy_id and m.loja_id = p.loja_id
          left join public.zonas_entrega z on z.id = p.zona_id and z.loja_id = p.loja_id
         where p.loja_id = ${lojaId} and p.status = 'entregue' and p.motoboy_id is not null
           and p.entregue_em >= (${de}::date::timestamp at time zone ${TZ})
           and p.entregue_em < ((${ate}::date + 1)::timestamp at time zone ${TZ})
           and not exists (
             select 1 from public.acertos_motoboy ac
              where ac.loja_id = p.loja_id and ac.motoboy_id = p.motoboy_id and ac.status = 'pago'
                and (p.entregue_em at time zone ${TZ})::date between ac.periodo_inicio and ac.periodo_fim)
        on conflict (pedido_id) where tipo = 'entrega' do nothing`,
  )
}

export interface AjusteGravado {
  id: string
  data: string
  valor_centavos: number
  descricao: string | null
  criado_em: string
}

/**
 * Insere um ajuste manual no ledger (append-only). Com `chaveIdempotencia`, o reenvio da mesma chave
 * (duplo-clique/retry) e no-op: o `on conflict do nothing` nao grava a 2a linha e o fallback devolve o
 * lancamento original. Sem chave, insere sempre (o indice parcial nao se aplica a null).
 */
export async function inserirAjuste(
  exec: Executor,
  l: {
    lojaId: string; motoboyId: string; data: string; valorCentavos: number
    descricao: string; userId: string; chaveIdempotencia: string | null
  },
): Promise<{ lancamento: AjusteGravado; criado: boolean }> {
  const saida = sql`id::text as id, to_char(data, 'YYYY-MM-DD') as data, valor_centavos, descricao,
                    to_char(criado_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as criado_em`
  const inserido = await consultarUm<AjusteGravado>(
    exec,
    sql`insert into public.motoboy_lancamentos
          (loja_id, motoboy_id, data, tipo, valor_centavos, descricao, criado_por_user_id, chave_idempotencia)
        values (${l.lojaId}, ${l.motoboyId}, ${l.data}::date, 'ajuste', ${l.valorCentavos}, ${l.descricao},
                ${l.userId}, ${l.chaveIdempotencia})
        on conflict (loja_id, chave_idempotencia) where chave_idempotencia is not null do nothing
        returning ${saida}`,
  )
  if (inserido) return { lancamento: inserido, criado: true }
  const existente = await consultarUm<AjusteGravado>(
    exec,
    sql`select ${saida} from public.motoboy_lancamentos
         where loja_id = ${l.lojaId} and chave_idempotencia = ${l.chaveIdempotencia}`,
  )
  return { lancamento: existente!, criado: false }
}

export interface AcertoPagoDb {
  id: string
  periodo_inicio: string
  periodo_fim: string
  total_pago_centavos: number
  pago_em: string
}

/** Grava o acerto PAGO com o total ja recomputado (snapshot congelado). */
export async function inserirAcertoPago(
  exec: Executor,
  n: { lojaId: string; motoboyId: string; de: string; ate: string; totalCentavos: number; userId: string },
): Promise<AcertoPagoDb> {
  const r = await consultarUm<AcertoPagoDb>(
    exec,
    sql`insert into public.acertos_motoboy
          (loja_id, motoboy_id, periodo_inicio, periodo_fim, status, total_pago_centavos,
           pago_em, pago_por_user_id)
        values (${n.lojaId}, ${n.motoboyId}, ${n.de}::date, ${n.ate}::date, 'pago', ${n.totalCentavos},
                now(), ${n.userId})
        returning id, to_char(periodo_inicio, 'YYYY-MM-DD') as periodo_inicio,
                  to_char(periodo_fim, 'YYYY-MM-DD') as periodo_fim, total_pago_centavos,
                  ${TS('pago_em')} as pago_em`,
  )
  return r!
}

/** Auditoria sem PII (tabela eventos): so ids, user_id e valores de negocio (nunca telefone). */
export async function registrarEvento(
  exec: Executor,
  e: { lojaId: string; tipo: string; entidade: string; entidadeId: string; detalhes: Record<string, unknown> },
) {
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${e.lojaId}, ${e.tipo}, ${e.entidade}, ${e.entidadeId}, 'loja',
                ${JSON.stringify(e.detalhes)}::jsonb)`,
  )
}
