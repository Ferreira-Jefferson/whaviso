// Kernel compartilhado de CRÉDITOS (Épico 11, modelo de carteira). Ponto único que lê a
// curva de preço do CATÁLOGO (creditos_catalogo), conta a AGENDA (balde único) e
// movimenta a CARTEIRA (reserva, consumo, devolução, crédito) sempre escrevendo no
// LIVRO-RAZÃO junto. Vive em shared/ porque módulo nunca importa módulo: avisos, billing
// e admin chamam estas funções, não umas às outras.
//
// O whaviso é PRÉ-PAGO por crédito de envio: 1 envio = 1 ocorrência de aviso. Tudo é
// liberado para todos; o que limita é o SALDO. Charge-on-success: a ativação RESERVA
// (saldo_livre -> reservado), o disparo CONSOME (reservado -> consumido, permanente), o
// convite não aceito DEVOLVE (reservado -> saldo_livre), opt-out/cancelamento põe o não
// disparado em HOLD de 24h (reservado -> em_hold) e depois devolve.
//
// Todas as movimentações de carteira rodam em transação com `select ... for update` na
// linha da carteira (H11.12, sem janela de corrida) e SEMPRE lançam no livro-razão
// append-only (creditos_lancamentos) junto da atualização dos baldes.
import type { Pool, PoolClient } from '@whaviso/shared/db'
import { regraNegocio } from '../http_errors'

type Executor = Pool | PoolClient

/** Tipos de lançamento do livro-razão (espelha o check da migration 0057). */
export type TipoLancamento =
  | 'cortesia'
  | 'compra'
  | 'credito_owner'
  | 'reserva'
  | 'consumo'
  | 'devolucao'
  | 'hold'
  | 'estorno'

/** Quem originou o lançamento (para a auditoria do livro-razão). */
export type AtorLancamento = 'sistema' | 'owner' | 'usuario'

/** Um MARCO da curva: a partir de `envios`, o preço é `centavos` POR ENVIO. */
export interface CurvaPonto {
  envios: number
  centavos: number
}

/** Curva de preço dos créditos (catálogo, 1 linha). Editável pelo owner em runtime. */
export interface CreditosCatalogo {
  envios_min: number
  envios_max: number
  /** Marcos (envios -> R$/envio em centavos), ordenados por `envios`. Fonte do preço. */
  curva: CurvaPonto[]
  cortesia_inicial: number
  agenda_teto_free: number
  agenda_teto_pago: number
}

/** Estado da carteira de uma conta (baldes de trabalho). */
export interface CarteiraSaldo {
  saldo_livre: number
  reservado: number
  em_hold: number
  consumido: number
  ja_comprou: boolean
}

/**
 * Preço TOTAL (centavos) de uma compra de `n` envios pela curva de MARCOS. O R$/envio é
 * interpolado linearmente entre os dois marcos vizinhos (passando exatamente pelos valores
 * da tabela nos marcos); o total é `round(n * R$/envio(n))`. Fora da faixa, `n` é grampeado
 * ao primeiro/último marco. Fonte única: a UI espelha esta função e o backend a recomputa
 * quando precisa do total.
 */
export function precoPorEnvioCentavos(curva: { curva: CurvaPonto[] }, n: number): number {
  const pts = curva.curva
  const lo = pts[0]
  const hi = pts[pts.length - 1]
  if (!lo || !hi) return 0
  const nn = Math.min(Math.max(n, lo.envios), hi.envios)
  let porEnvio = hi.centavos
  if (nn <= lo.envios) porEnvio = lo.centavos
  else {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      if (!a || !b) continue
      if (nn >= a.envios && nn <= b.envios) {
        porEnvio =
          b.envios === a.envios
            ? a.centavos
            : a.centavos + ((b.centavos - a.centavos) * (nn - a.envios)) / (b.envios - a.envios)
        break
      }
    }
  }
  return Math.round(nn * porEnvio)
}

/** Lê a curva de preço + tetos do catálogo (1 linha, id=1). Fonte única do preço. */
export async function lerCatalogo(ex: Executor): Promise<CreditosCatalogo> {
  const { rows } = await ex.query<CreditosCatalogo>(
    `select envios_min, envios_max, curva,
            cortesia_inicial, agenda_teto_free, agenda_teto_pago
       from public.creditos_catalogo where id = 1`,
  )
  const c = rows[0]
  if (!c) throw regraNegocio('catalogo_indisponivel', 'O catálogo de créditos não está configurado.')
  return c
}

/**
 * Lê a carteira da conta. Cria a linha (saldo zero) se ainda não existir (defesa: o
 * trigger handle_new_user cria com cortesia, mas mantemos a leitura idempotente).
 */
export async function lerCarteira(ex: Executor, uid: string): Promise<CarteiraSaldo> {
  const { rows } = await ex.query<CarteiraSaldo>(
    `select saldo_livre, reservado, em_hold, consumido, ja_comprou
       from public.creditos_carteira where profile_id = $1`,
    [uid],
  )
  const c = rows[0]
  if (c) return c
  await ex.query(
    `insert into public.creditos_carteira (profile_id) values ($1)
     on conflict (profile_id) do nothing`,
    [uid],
  )
  return { saldo_livre: 0, reservado: 0, em_hold: 0, consumido: 0, ja_comprou: false }
}

/**
 * Trava a carteira da conta (lock por linha) DENTRO da transação que reserva/move, para
 * fechar a janela de corrida do H11.12: dois requests simultâneos na última unidade de
 * saldo serializam neste lock e só um passa. Cria a linha se faltar (idempotente).
 */
export async function travarCarteira(cli: PoolClient, uid: string): Promise<CarteiraSaldo> {
  const { rows } = await cli.query<CarteiraSaldo>(
    `select saldo_livre, reservado, em_hold, consumido, ja_comprou
       from public.creditos_carteira where profile_id = $1 for update`,
    [uid],
  )
  if (rows[0]) return rows[0]
  await cli.query(
    `insert into public.creditos_carteira (profile_id) values ($1)
     on conflict (profile_id) do nothing`,
    [uid],
  )
  const { rows: r2 } = await cli.query<CarteiraSaldo>(
    `select saldo_livre, reservado, em_hold, consumido, ja_comprou
       from public.creditos_carteira where profile_id = $1 for update`,
    [uid],
  )
  return r2[0] ?? { saldo_livre: 0, reservado: 0, em_hold: 0, consumido: 0, ja_comprou: false }
}

/** Lança um movimento no livro-razão (append-only). Quantidade sempre positiva. */
export async function lancar(
  cli: PoolClient,
  args: {
    uid: string
    tipo: TipoLancamento
    quantidade: number
    refTipo?: 'aviso' | 'ocorrencia' | 'pagamento' | null
    refId?: string | null
    ator?: AtorLancamento
    atorId?: string | null
  },
): Promise<void> {
  await cli.query(
    `insert into public.creditos_lancamentos
       (profile_id, tipo, quantidade, ref_tipo, ref_id, ator, ator_id)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      args.uid,
      args.tipo,
      args.quantidade,
      args.refTipo ?? null,
      args.refId ?? null,
      args.ator ?? 'sistema',
      args.atorId ?? null,
    ],
  )
}

/**
 * RESERVA `quantidade` créditos para um aviso (ativação, H11.4): exige saldo livre
 * suficiente, move saldo_livre -> reservado e lança 'reserva'. Roda na transação que
 * ativa, com lock na carteira (sem corrida). Recusa com `saldo_insuficiente` se faltar.
 */
export async function reservarCreditos(
  cli: PoolClient,
  uid: string,
  quantidade: number,
  avisoId: string,
): Promise<void> {
  if (quantidade <= 0) return
  const carteira = await travarCarteira(cli, uid)
  if (carteira.saldo_livre < quantidade) {
    throw regraNegocio(
      'saldo_insuficiente',
      `Seu saldo é de ${carteira.saldo_livre} ${carteira.saldo_livre === 1 ? 'envio' : 'envios'} e este combinado precisa de ${quantidade}. Recarregue créditos para ativar.`,
    )
  }
  await cli.query(
    `update public.creditos_carteira
        set saldo_livre = saldo_livre - $2, reservado = reservado + $2
      where profile_id = $1`,
    [uid, quantidade],
  )
  await lancar(cli, { uid, tipo: 'reserva', quantidade, refTipo: 'aviso', refId: avisoId })
}

/**
 * CONSOME 1 crédito no disparo de um lembrete (H11.5): move reservado -> consumido e
 * lança 'consumo'. Consumido é permanente (nunca volta). Defesa: se não houver reservado
 * (caso raro de dessincronização), não estoura saldo negativo (o check do banco barraria).
 */
export async function consumirCredito(
  cli: PoolClient,
  uid: string,
  quantidade: number,
  ref: { tipo: 'aviso' | 'ocorrencia'; id: string },
): Promise<void> {
  if (quantidade <= 0) return
  await travarCarteira(cli, uid)
  await cli.query(
    `update public.creditos_carteira
        set reservado = greatest(reservado - $2, 0), consumido = consumido + $2
      where profile_id = $1`,
    [uid, quantidade],
  )
  await lancar(cli, { uid, tipo: 'consumo', quantidade, refTipo: ref.tipo, refId: ref.id })
}

/**
 * CONSOME `quantidade` créditos DIRETO do saldo livre (envio avulso fora do ciclo, ex.:
 * reengajamento manual H8.3, que consome 1 envio do saldo): exige saldo_livre suficiente,
 * move saldo_livre -> consumido e lança 'consumo'. Roda na transação que dispara o envio
 * avulso, com lock na carteira. Recusa com `saldo_insuficiente` se faltar.
 */
export async function consumirDoSaldoLivre(
  cli: PoolClient,
  uid: string,
  quantidade: number,
  ref: { tipo: 'aviso' | 'ocorrencia'; id: string },
): Promise<void> {
  if (quantidade <= 0) return
  const carteira = await travarCarteira(cli, uid)
  if (carteira.saldo_livre < quantidade) {
    throw regraNegocio(
      'saldo_insuficiente',
      `Seu saldo é de ${carteira.saldo_livre} ${carteira.saldo_livre === 1 ? 'envio' : 'envios'}. Recarregue créditos para enviar.`,
    )
  }
  await cli.query(
    `update public.creditos_carteira
        set saldo_livre = saldo_livre - $2, consumido = consumido + $2
      where profile_id = $1`,
    [uid, quantidade],
  )
  await lancar(cli, { uid, tipo: 'consumo', quantidade, refTipo: ref.tipo, refId: ref.id })
}

/**
 * DEVOLVE `quantidade` créditos reservados ao saldo livre (convite não aceito, H11.5;
 * arquivar não disparado, H11.4): move reservado -> saldo_livre e lança 'devolucao'.
 */
export async function devolverReserva(
  cli: PoolClient,
  uid: string,
  quantidade: number,
  avisoId: string,
): Promise<void> {
  if (quantidade <= 0) return
  await travarCarteira(cli, uid)
  await cli.query(
    `update public.creditos_carteira
        set reservado = greatest(reservado - $2, 0), saldo_livre = saldo_livre + $2
      where profile_id = $1`,
    [uid, quantidade],
  )
  await lancar(cli, { uid, tipo: 'devolucao', quantidade, refTipo: 'aviso', refId: avisoId })
}

/**
 * CREDITA `quantidade` envios na conta. Usado por:
 *  - 'credito_owner': o owner ativa quem pagou via WhatsApp (H11.11);
 *  - 'compra': compra com gateway (🟡 futuro).
 * Aditivo (soma em saldo_livre), marca `ja_comprou=true` (libera a agenda generosa, H11.7)
 * e lança no livro-razão. Roda na transação com lock. `quantidade` deve ser > 0.
 */
export async function creditarEnvios(
  cli: PoolClient,
  uid: string,
  quantidade: number,
  tipo: 'credito_owner' | 'compra',
  ator: { ator: AtorLancamento; atorId?: string | null },
): Promise<CarteiraSaldo> {
  await travarCarteira(cli, uid)
  await cli.query(
    `update public.creditos_carteira
        set saldo_livre = saldo_livre + $2, ja_comprou = true
      where profile_id = $1`,
    [uid, quantidade],
  )
  await lancar(cli, { uid, tipo, quantidade, ator: ator.ator, atorId: ator.atorId ?? null })
  return lerCarteira(cli, uid)
}

/** Resolve o uid do CRIADOR (dono da carteira) de um aviso: cobrador no receber, devedor no invertido. */
export function donoDoAviso(aviso: {
  criador_papel: 'cobrador' | 'devedor'
  cobrador_id: string | null
  devedor_profile_id: string | null
}): string | null {
  return aviso.criador_papel === 'cobrador' ? aviso.cobrador_id : aviso.devedor_profile_id
}

/**
 * Créditos AINDA reservados (não disparados) de um aviso: reserva total menos o que já foi
 * consumido. Soma os lançamentos: reservados pela conta para ESTE aviso (ref aviso) menos
 * os 'consumo'/'devolucao'/'hold' já lançados para o aviso ou suas ocorrências. Como cada
 * ocorrência consome 1 e o convite não aceito devolve a reserva inteira, o saldo reservado
 * de um aviso é (reserva - consumo - devolucao - hold), nunca negativo. Usado para devolver
 * a reserva (não aceito/arquivar) e para pôr em hold (opt-out/cancelamento de recorrente).
 */
export async function reservaPendenteDoAviso(ex: Executor, avisoId: string): Promise<number> {
  const { rows } = await ex.query<{ n: string }>(
    `select coalesce(sum(
              case when l.tipo = 'reserva' then l.quantidade
                   when l.tipo in ('consumo','devolucao','hold') then -l.quantidade
                   else 0 end
            ), 0) as n
       from public.creditos_lancamentos l
      where (l.ref_tipo = 'aviso' and l.ref_id = $1)
         or (l.ref_tipo = 'ocorrencia' and l.ref_id in (
              select id from public.aviso_ocorrencias where aviso_id = $1))`,
    [avisoId],
  )
  return Math.max(0, Number(rows[0]?.n ?? 0))
}

/**
 * Põe `quantidade` créditos reservados de um aviso em HOLD de 24h (opt-out/cancelamento de
 * recorrente no meio, H11.6): move reservado -> em_hold, lança 'hold' e cria a linha em
 * creditos_hold (worklist do job de devolução) com vence_em = now()+24h. Idempotente sob a
 * transação do chamador (lock da carteira). Devolve a quantidade efetivamente posta em hold.
 */
export async function holdReserva(
  cli: PoolClient,
  uid: string,
  quantidade: number,
  avisoId: string,
): Promise<number> {
  if (quantidade <= 0) return 0
  await travarCarteira(cli, uid)
  await cli.query(
    `update public.creditos_carteira
        set reservado = greatest(reservado - $2, 0), em_hold = em_hold + $2
      where profile_id = $1`,
    [uid, quantidade],
  )
  await lancar(cli, { uid, tipo: 'hold', quantidade, refTipo: 'aviso', refId: avisoId })
  await cli.query(
    `insert into public.creditos_hold (profile_id, aviso_id, quantidade, vence_em)
     values ($1, $2, $3, now() + interval '24 hours')`,
    [uid, avisoId, quantidade],
  )
  return quantidade
}

/**
 * Houve algum envio efetivamente disparado (status 'enviado') deste aviso? Decide entre
 * DEVOLVER a reserva (nada disparou) ou pôr o restante em HOLD (recorrente interrompido no
 * meio) ao cancelar/encerrar (H11.5/H11.6). Em shared para avisos e recebimentos usarem
 * sem cross-import de módulo.
 */
export async function algumEnvioDisparado(ex: Executor, avisoId: string): Promise<boolean> {
  const { rows } = await ex.query<{ existe: boolean }>(
    `select exists (
       select 1 from public.envios where aviso_id = $1 and status = 'enviado'
     ) as existe`,
    [avisoId],
  )
  return rows[0]?.existe ?? false
}

/**
 * Resolve os créditos AINDA reservados de um aviso ao ele SAIR do ciclo sem disparo total
 * (cancelamento/opt-out, H11.5/H11.6): se nada disparou, DEVOLVE direto ao saldo livre; se
 * já houve disparo (recorrente interrompido no meio), põe o restante em HOLD de 24h. No-op
 * se não há reserva pendente. Roda na transação do chamador (com lock na carteira).
 */
export async function resolverReservaAoEncerrar(
  cli: PoolClient,
  uid: string,
  avisoId: string,
): Promise<{ devolvido: number; emHold: number }> {
  const reservaPend = await reservaPendenteDoAviso(cli, avisoId)
  if (reservaPend <= 0) return { devolvido: 0, emHold: 0 }
  if (await algumEnvioDisparado(cli, avisoId)) {
    const n = await holdReserva(cli, uid, reservaPend, avisoId)
    return { devolvido: 0, emHold: n }
  }
  await devolverReserva(cli, uid, reservaPend, avisoId)
  return { devolvido: reservaPend, emHold: 0 }
}

/** Conta a agenda (balde único): anotações não-arquivadas do criador, por papel. */
export async function contarAgenda(ex: Executor, uid: string): Promise<number> {
  const { rows } = await ex.query<{ n: number }>(`select public.contar_agenda($1) as n`, [uid])
  return Number(rows[0]?.n ?? 0)
}

/** Teto de agenda da conta (regra de 2 estados, H11.7): Free modesto / generoso após 1a compra. */
export async function agendaTetoDaConta(ex: Executor, uid: string): Promise<number> {
  const { rows } = await ex.query<{ n: number }>(`select public.agenda_teto_da_conta($1) as n`, [uid])
  return Number(rows[0]?.n ?? 0)
}

/**
 * Guarda de CRIAÇÃO de anotação na agenda (H11.7), na MESMA transação que faz o insert
 * (com lock por conta, fecha a corrida do H11.12): recusa quando a agenda atinge o teto da
 * conta. NÃO há mais gating por recurso nem somente_leitura: criar anotação é livre, só o
 * teto de agenda limita. Trava a carteira (serializa) e compara com agenda_teto_da_conta.
 */
export async function exigirCapacidadeDeAgenda(cli: PoolClient, uid: string): Promise<void> {
  await travarCarteira(cli, uid)
  const teto = await agendaTetoDaConta(cli, uid)
  const usado = await contarAgenda(cli, uid)
  if (usado >= teto) {
    throw regraNegocio(
      'agenda_cheia',
      `Sua agenda está cheia (${teto} itens). Arquive um item encerrado ou recarregue créditos para liberar uma agenda maior.`,
    )
  }
}
