// Acesso a dados do modulo plataforma_cobranca: SO via @whaviso/shared/db, sempre com sql`...`
// (parametrizado; SEC-080). Dono de escrita de `assinaturas` e `faturas`; le `contas`/`lojas` so
// para validar vinculo. NUNCA faz UPDATE em `lojas` (a suspensao e derivada por TRIGGER no banco).
// Datas: date -> 'YYYY-MM-DD'; timestamptz -> ISO UTC. Nenhum dado pessoal e selecionado nem logado.
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'
import type { StatusAssinatura, StatusFatura } from '@whaviso/shared/contracts'

const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)
const DATA = (col: string): Consulta => sqlBruto(`to_char(${col}, 'YYYY-MM-DD')`)

export interface AssinaturaLinha {
  id: string
  conta_id: string
  loja_id: string | null
  status: StatusAssinatura
  valor_mensal_centavos: number
  dia_vencimento: number
  trial_ate: string | null
  inicio_em: string | null
  cancelada_em: string | null
  criado_em: string
  atualizado_em: string
}

export interface FaturaLinha {
  id: string
  assinatura_id: string
  conta_id: string
  competencia: string
  valor_centavos: number
  vencimento: string
  status: StatusFatura
  pago_em: string | null
  criado_em: string
  atualizado_em: string
}

const SAIDA_ASSINATURA = sql`
  id, conta_id, loja_id, status, valor_mensal_centavos, dia_vencimento,
  ${TS('trial_ate')} as trial_ate, ${TS('inicio_em')} as inicio_em,
  ${TS('cancelada_em')} as cancelada_em, ${TS('criado_em')} as criado_em,
  ${TS('atualizado_em')} as atualizado_em`

const SAIDA_FATURA = sql`
  id, assinatura_id, conta_id, ${DATA('competencia')} as competencia, valor_centavos,
  ${DATA('vencimento')} as vencimento, status, ${TS('pago_em')} as pago_em,
  ${TS('criado_em')} as criado_em, ${TS('atualizado_em')} as atualizado_em`

// ---- Validacao de vinculo (SELECT em contas/lojas) ------------------------------------------

export async function contaExiste(exec: Executor, contaId: string) {
  return consultarUm<{ id: string }>(exec, sql`select id from public.contas where id = ${contaId}`)
}

export async function lojaDaConta(exec: Executor, contaId: string, lojaId: string) {
  return consultarUm<{ id: string }>(
    exec,
    sql`select id from public.lojas where id = ${lojaId} and conta_id = ${contaId}`,
  )
}

// ---- Assinaturas ----------------------------------------------------------------------------

export async function inserirAssinatura(
  exec: Executor,
  d: {
    contaId: string
    lojaId: string | null
    status: StatusAssinatura
    valor: number
    diaVencimento: number
    trialAte: string | null
    inicioEm: string | null
  },
) {
  return consultarUm<AssinaturaLinha>(
    exec,
    sql`insert into public.assinaturas
          (conta_id, loja_id, status, valor_mensal_centavos, dia_vencimento, trial_ate, inicio_em)
        values (${d.contaId}, ${d.lojaId}, ${d.status}, ${d.valor}, ${d.diaVencimento},
                ${d.trialAte}, ${d.inicioEm})
        returning ${SAIDA_ASSINATURA}`,
  )
}

export async function obterAssinatura(exec: Executor, id: string) {
  return consultarUm<AssinaturaLinha>(
    exec,
    sql`select ${SAIDA_ASSINATURA} from public.assinaturas where id = ${id}`,
  )
}

export async function listarAssinaturas(
  exec: Executor,
  f: { contaId?: string; status?: StatusAssinatura },
) {
  const conta = f.contaId ?? null
  const status = f.status ?? null
  return consultar<AssinaturaLinha>(
    exec,
    sql`select ${SAIDA_ASSINATURA} from public.assinaturas
         where (${conta}::uuid is null or conta_id = ${conta}::uuid)
           and (${status}::status_assinatura is null or status = ${status}::status_assinatura)
         order by criado_em desc, id`,
  )
}

/** Assinaturas que faturam no ciclo: so 'ativa' (trial nao fatura). */
export async function assinaturasAtivas(exec: Executor) {
  return consultar<AssinaturaLinha>(
    exec,
    sql`select ${SAIDA_ASSINATURA} from public.assinaturas where status = 'ativa' order by id`,
  )
}

/**
 * Atualiza campos mutaveis e, opcionalmente, o status com os carimbos coerentes (inicio_em ao
 * ativar pela 1a vez, cancelada_em ao cancelar). UPDATE condicionado ao status atual esperado,
 * para barrar corrida entre duas transicoes concorrentes. Devolve null se o status mudou embaixo.
 */
export async function atualizarAssinatura(
  exec: Executor,
  id: string,
  statusEsperado: StatusAssinatura,
  campos: {
    status: StatusAssinatura | null
    valor: number | null
    diaVencimento: number | null
  },
) {
  return consultarUm<AssinaturaLinha>(
    exec,
    sql`update public.assinaturas set
          status = coalesce(${campos.status}::status_assinatura, status),
          valor_mensal_centavos = coalesce(${campos.valor}::int, valor_mensal_centavos),
          dia_vencimento = coalesce(${campos.diaVencimento}::smallint, dia_vencimento),
          inicio_em = case
            when ${campos.status}::status_assinatura = 'ativa' and inicio_em is null then now()
            else inicio_em end,
          cancelada_em = case
            when ${campos.status}::status_assinatura = 'cancelada' then now()
            else cancelada_em end
        where id = ${id} and status = ${statusEsperado}::status_assinatura
        returning ${SAIDA_ASSINATURA}`,
  )
}

// ---- Faturas --------------------------------------------------------------------------------

/**
 * Insere a fatura da competencia de forma idempotente (indice unico assinatura+competencia).
 * Devolve a linha quando criou; null quando ja existia (ON CONFLICT DO NOTHING).
 */
export async function inserirFaturaSeNova(
  exec: Executor,
  d: { assinaturaId: string; contaId: string; competencia: string; valor: number; vencimento: string },
) {
  return consultarUm<FaturaLinha>(
    exec,
    sql`insert into public.faturas (assinatura_id, conta_id, competencia, valor_centavos, vencimento)
        values (${d.assinaturaId}, ${d.contaId}, ${d.competencia}::date, ${d.valor}, ${d.vencimento}::date)
        on conflict (assinatura_id, competencia) do nothing
        returning ${SAIDA_FATURA}`,
  )
}

export async function obterFatura(exec: Executor, id: string) {
  return consultarUm<FaturaLinha>(
    exec,
    sql`select ${SAIDA_FATURA} from public.faturas where id = ${id}`,
  )
}

export async function listarFaturas(
  exec: Executor,
  f: { status?: StatusFatura; competencia?: string; contaId?: string },
) {
  const status = f.status ?? null
  const competencia = f.competencia ?? null
  const conta = f.contaId ?? null
  return consultar<FaturaLinha>(
    exec,
    sql`select ${SAIDA_FATURA} from public.faturas
         where (${status}::status_fatura is null or status = ${status}::status_fatura)
           and (${competencia}::date is null or competencia = ${competencia}::date)
           and (${conta}::uuid is null or conta_id = ${conta}::uuid)
         order by vencimento desc, id`,
  )
}

/** Faturas de UMA conta, visao do dono (ordenadas por competencia). */
export async function faturasDaConta(exec: Executor, contaId: string) {
  return consultar<FaturaLinha>(
    exec,
    sql`select ${SAIDA_FATURA} from public.faturas
         where conta_id = ${contaId} order by competencia desc, id`,
  )
}

/** Faturas atrasadas de uma assinatura (para decidir reativacao/suspensao). */
export async function faturasAtrasadasDaAssinatura(exec: Executor, assinaturaId: string) {
  return consultar<{ vencimento: string; status: StatusFatura }>(
    exec,
    sql`select ${DATA('vencimento')} as vencimento, status from public.faturas
         where assinatura_id = ${assinaturaId} and status = 'atrasada'`,
  )
}

/**
 * Marca como 'atrasada' toda fatura 'aberta' vencida antes de `hoje`. Idempotente (so pega
 * 'aberta'). Devolve as linhas afetadas (para contar e para reavaliar suspensao por assinatura).
 */
export async function marcarAtrasadas(exec: Executor, hojeIso: string) {
  return consultar<{ id: string; assinatura_id: string }>(
    exec,
    sql`update public.faturas set status = 'atrasada'
         where status = 'aberta' and vencimento < ${hojeIso}::date
         returning id, assinatura_id`,
  )
}

/**
 * Faturas 'atrasada' das assinaturas que ainda estao 'ativa' (candidatas a suspensao). Traz o
 * vencimento para a decisao pura `deveSuspender` e os ids (conta/loja) para o evento (sem PII).
 */
export async function atrasosDeAssinaturasAtivas(exec: Executor) {
  return consultar<{
    assinatura_id: string
    conta_id: string
    loja_id: string | null
    vencimento: string
  }>(
    exec,
    sql`select f.assinatura_id, a.conta_id, a.loja_id, ${DATA('f.vencimento')} as vencimento
          from public.faturas f
          join public.assinaturas a on a.id = f.assinatura_id
         where f.status = 'atrasada' and a.status = 'ativa'`,
  )
}

/** Baixa manual: so 'aberta'/'atrasada' viram 'paga'. Devolve null se ja estava fora desses estados. */
export async function marcarFaturaPaga(exec: Executor, id: string) {
  return consultarUm<FaturaLinha>(
    exec,
    sql`update public.faturas set status = 'paga', pago_em = now()
         where id = ${id} and status in ('aberta', 'atrasada')
         returning ${SAIDA_FATURA}`,
  )
}

/** Cancela a fatura: so 'aberta'/'atrasada'. Devolve null se ja estava paga/cancelada. */
export async function cancelarFatura(exec: Executor, id: string) {
  return consultarUm<FaturaLinha>(
    exec,
    sql`update public.faturas set status = 'cancelada'
         where id = ${id} and status in ('aberta', 'atrasada')
         returning ${SAIDA_FATURA}`,
  )
}

// ---- Auditoria (eventos, append-only, SEM PII) ----------------------------------------------

/**
 * Evento de dominio na trilha `eventos`. `ator = 'operador'` para acoes da equipe Whaviso,
 * 'sistema' para os jobs. `loja_id` opcional (assinatura de conta inteira nao tem loja). `detalhes`
 * carrega apenas ids e metadados nao sensiveis (nunca telefone, Pix, token, valor de cliente).
 */
export async function registrarEvento(
  exec: Executor,
  e: {
    tipo: string
    entidade: string
    entidadeId: string
    ator: 'operador' | 'sistema'
    lojaId?: string | null
    detalhes: object
  },
) {
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${e.lojaId ?? null}, ${e.tipo}, ${e.entidade}, ${e.entidadeId}, ${e.ator},
                ${JSON.stringify(e.detalhes)}::jsonb)`,
  )
}
