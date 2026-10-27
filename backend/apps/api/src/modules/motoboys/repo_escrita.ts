// Escrita do modulo motoboys. Sempre escopada por loja_id; sem DELETE (remover = ativo=false).
// `motoboy_lancamentos` e append-only (so insert; trigger barra UPDATE). Auditoria sem PII.
import { consultar, consultarUm, sql, type Executor } from '@whaviso/shared/db'
import { TZ } from '@whaviso/shared/datas'

export interface MotoboyNovoDb {
  pessoaId: string
  nome: string
  veiculo: string
  placa: string | null
  pixTipo: string | null
  pixHash: string | null
  pixCifrado: Buffer | null
}

export async function inserirMotoboy(exec: Executor, lojaId: string, n: MotoboyNovoDb): Promise<string> {
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.motoboys (loja_id, pessoa_id, nome, veiculo, placa, pix_tipo, pix_hash, pix_cifrado)
        values (${lojaId}, ${n.pessoaId}, ${n.nome}, ${n.veiculo}::tipo_veiculo, ${n.placa}, ${n.pixTipo},
                ${n.pixHash}, ${n.pixCifrado})
        returning id`,
  )
  return r!.id
}

export interface MotoboyParcial {
  veiculo?: string | undefined
  placa?: string | null | undefined
  /** Pix completo (tipo, hash, cifra) ou null para limpar; undefined mantem. */
  pix?: { tipo: string; hash: string; cifrado: Buffer } | null | undefined
}

/** Atualiza so os campos presentes (undefined = manter; null = limpar). */
export async function atualizarMotoboy(exec: Executor, lojaId: string, id: string, p: MotoboyParcial) {
  const tem = (v: unknown) => v !== undefined
  await consultar(
    exec,
    sql`update public.motoboys set
          veiculo = case when ${tem(p.veiculo)}::boolean then ${p.veiculo ?? null}::tipo_veiculo else veiculo end,
          placa = case when ${tem(p.placa)}::boolean then ${p.placa ?? null} else placa end,
          pix_tipo = case when ${tem(p.pix)}::boolean then ${p.pix?.tipo ?? null} else pix_tipo end,
          pix_hash = case when ${tem(p.pix)}::boolean then ${p.pix?.hash ?? null} else pix_hash end,
          pix_cifrado = case when ${tem(p.pix)}::boolean then ${p.pix?.cifrado ?? null}::bytea else pix_cifrado end
        where loja_id = ${lojaId} and id = ${id}`,
  )
}

export async function definirAtivo(exec: Executor, lojaId: string, id: string, ativo: boolean) {
  await consultar(
    exec,
    sql`update public.motoboys set ativo = ${ativo} where loja_id = ${lojaId} and id = ${id}`,
  )
}

/**
 * Lancamento automatico por entrega do dia (data de negocio em America/Sao_Paulo). Pedido `entregue`
 * com motoboy da loja; valor = valor_motoboy da zona (0 sem zona). Idempotente pela unique
 * `lancamentos_entrega_unica` (1 por pedido). Nao toca motoboy cujo dia ja foi pago.
 */
export async function materializarEntregas(exec: Executor, lojaId: string, data: string): Promise<void> {
  await consultar(
    exec,
    sql`insert into public.motoboy_lancamentos (loja_id, motoboy_id, data, tipo, pedido_id, valor_centavos)
        select p.loja_id, p.motoboy_id, ${data}::date, 'entrega', p.id, coalesce(z.valor_motoboy_centavos, 0)
          from public.pedidos p
          join public.motoboys m on m.id = p.motoboy_id and m.loja_id = p.loja_id
          left join public.zonas_entrega z on z.id = p.zona_id and z.loja_id = p.loja_id
         where p.loja_id = ${lojaId} and p.status = 'entregue' and p.motoboy_id is not null
           and (p.entregue_em at time zone ${TZ})::date = ${data}::date
           and not exists (
             select 1 from public.fechamentos f
              where f.motoboy_id = p.motoboy_id and f.data = ${data}::date and f.status = 'pago')
        on conflict (pedido_id) where tipo = 'entrega' do nothing`,
  )
}

/** Cria (se faltar) o fechamento `aberto` de cada motoboy com movimento no dia. */
export async function garantirFechamentos(exec: Executor, lojaId: string, data: string): Promise<void> {
  await consultar(
    exec,
    sql`insert into public.fechamentos (loja_id, motoboy_id, data)
        select distinct l.loja_id, l.motoboy_id, l.data
          from public.motoboy_lancamentos l
         where l.loja_id = ${lojaId} and l.data = ${data}::date
        on conflict (motoboy_id, data) do nothing`,
  )
}

/** Trava o fechamento do dia do motoboy (se existir) e devolve o status; serializa lancar x pagar. */
export async function travarFechamentoDoDia(
  exec: Executor,
  lojaId: string,
  motoboyId: string,
  data: string,
): Promise<'aberto' | 'pago' | null> {
  const r = await consultarUm<{ status: 'aberto' | 'pago' }>(
    exec,
    sql`select status from public.fechamentos
         where loja_id = ${lojaId} and motoboy_id = ${motoboyId} and data = ${data}::date for update`,
  )
  return r?.status ?? null
}

export async function inserirLancamentoManual(
  exec: Executor,
  l: { lojaId: string; motoboyId: string; data: string; valorCentavos: number; descricao: string; userId: string },
) {
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.motoboy_lancamentos
          (loja_id, motoboy_id, data, tipo, valor_centavos, descricao, criado_por_user_id)
        values (${l.lojaId}, ${l.motoboyId}, ${l.data}::date, 'ajuste', ${l.valorCentavos}, ${l.descricao}, ${l.userId})
        returning id::text as id`,
  )
  return r!.id
}

/** Lock da linha do fechamento (id) para pagar sem corrida. */
export function travarFechamento(exec: Executor, lojaId: string, id: string) {
  return consultarUm<{ id: string; status: 'aberto' | 'pago' }>(
    exec,
    sql`select id, status from public.fechamentos where loja_id = ${lojaId} and id = ${id} for update`,
  )
}

export async function marcarPago(exec: Executor, lojaId: string, id: string, userId: string) {
  await consultar(
    exec,
    sql`update public.fechamentos set status = 'pago', pago_em = now(), pago_por_user_id = ${userId}
         where loja_id = ${lojaId} and id = ${id} and status = 'aberto'`,
  )
}

/** Auditoria sem PII (tabela eventos): so ids, user_id e nomes de campo/valores de negocio. */
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
