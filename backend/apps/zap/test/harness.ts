// Harness de integração do zap: fixtures via superusuário, módulos rodam como whaviso_zap.
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import type { EtapaEnvio } from '@whaviso/shared/contracts'
import type {
  ClienteWhats,
  EventoBotao,
  EventoStatus,
  EventoTexto,
  HandlerBotao,
  HandlerStatus,
  HandlerTexto,
  MensagemWhats,
} from '../src/shared/whats'
import type { EnvZap } from '../src/env'

const SENHA = process.env.POSTGRES_PASSWORD ?? 'postgres'
const HOST = process.env.PGHOST ?? '127.0.0.1'
const DB = process.env.PGDATABASE ?? 'whaviso_dev'

export const poolSuper = new pg.Pool({
  connectionString: `postgresql://postgres:${SENHA}@${HOST}:5432/${DB}`,
  max: 3,
})
export const poolZap = new pg.Pool({
  connectionString: `postgresql://whaviso_zap:whaviso_zap_dev@${HOST}:5432/${DB}`,
  max: 3,
})

export interface FixtureAviso {
  cobradorId: string
  avisoId: string
}

export async function criarAvisoPendente(opts: {
  dataCombinada: string
  telefone?: string | null
  pixChave?: string | null
}): Promise<FixtureAviso> {
  const cobradorId = randomUUID()
  await poolSuper.query(`insert into auth.users (id) values ($1)`, [cobradorId])
  await poolSuper.query(`update public.profiles set nome='Cobrador' where id=$1`, [cobradorId])
  // E11: a carteira + cortesia são criadas pelo trigger handle_new_user; notificar o
  // criador é universal (não há mais gate de plano), então nada a configurar aqui.
  const { rows } = await poolSuper.query<{ id: string }>(
    `insert into public.avisos
       (cobrador_id, direcao, status, nome_devedor, telefone_devedor, motivo, valor_centavos, data_combinada, pix_chave)
     values ($1,'receber','programado','Maria',$2,'mensalidade',9900,$3,$4)
     returning id`,
    // Pix obrigatório no receber (E2): default uma chave quando o teste não a informa.
    [cobradorId, opts.telefone ?? '+5511999998888', opts.dataCombinada, opts.pixChave ?? 'cobrador@pix.com'],
  )
  return { cobradorId, avisoId: rows[0]!.id }
}

/**
 * Aviso no fluxo INVERTIDO (criador = devedor; cobrador convidado por telefone).
 * Por padrão SEM conta do cobrador (cobrador_id null, telefone_cobrador preenchido):
 * o alvo das notificações ao "criador" é o DEVEDOR-criador (devedor_profile_id).
 */
export async function criarAvisoInvertido(opts: {
  dataCombinada: string
  comContaDevedor?: boolean
  telefoneDevedor?: string
}): Promise<{ devedorId: string; avisoId: string }> {
  const devedorId = randomUUID()
  await poolSuper.query(`insert into auth.users (id) values ($1)`, [devedorId])
  await poolSuper.query(`update public.profiles set nome='Devedor', telefone=$2 where id=$1`, [
    devedorId,
    opts.telefoneDevedor ?? '+5511970001111',
  ])
  const { rows } = await poolSuper.query<{ id: string }>(
    `insert into public.avisos
       (cobrador_id, devedor_profile_id, direcao, criador_papel, status,
        nome_devedor, telefone_devedor, nome_cobrador, telefone_cobrador,
        motivo, valor_centavos, data_combinada, pix_chave)
     values (null, $1, 'pagar', 'devedor', 'programado',
             'Devedor', $2, 'Cobrador Convidado', '+5511960002222',
             'aluguel', 5000, $3, 'cobrador@pix.com')
     returning id`,
    [opts.comContaDevedor === false ? null : devedorId, opts.telefoneDevedor ?? '+5511970001111', opts.dataCombinada],
  )
  return { devedorId, avisoId: rows[0]!.id }
}

/**
 * Convite INVERTIDO em aguardando_aceite (criador = devedor; cobrador convidado por
 * telefone, SEM conta: cobrador_id null). Usado para testar o aceite do invertido (o
 * ciclo precisa sair mesmo com cobrador_id null, G1). Devolve o id e o telefone-alvo.
 */
export async function criarConviteInvertido(opts: {
  dataCombinada: string
  telefoneCobrador?: string
  telefoneDevedor?: string
  conviteHash: string
}): Promise<{ devedorId: string; avisoId: string }> {
  const devedorId = randomUUID()
  await poolSuper.query(`insert into auth.users (id) values ($1)`, [devedorId])
  await poolSuper.query(`update public.profiles set nome='Devedor' where id=$1`, [devedorId])
  const { rows } = await poolSuper.query<{ id: string }>(
    `insert into public.avisos
       (cobrador_id, devedor_profile_id, direcao, criador_papel, status,
        nome_devedor, telefone_devedor, nome_cobrador, telefone_cobrador,
        motivo, valor_centavos, data_combinada, pix_chave, convite_hash, convite_expira_em)
     values (null, $1, 'pagar', 'devedor', 'aguardando_aceite',
             'Devedor', $2, 'Cobrador Convidado', $3,
             'aluguel', 5000, $4, 'cobrador@pix.com', $5, now() + interval '7 days')
     returning id`,
    [
      devedorId,
      opts.telefoneDevedor ?? '+5511970001111',
      opts.telefoneCobrador ?? '+5511960002222',
      opts.dataCombinada,
      opts.conviteHash,
    ],
  )
  return { devedorId, avisoId: rows[0]!.id }
}

/** Lê as colunas de horário reservado de um aviso. */
export async function lerHorario(avisoId: string): Promise<{
  seg: number | null
  orig: number | null
  espacamento_ideal: boolean
}> {
  const { rows } = await poolSuper.query(
    `select horario_reservado_seg as seg, horario_reservado_orig as orig,
            horario_espacamento_ideal as espacamento_ideal
       from public.avisos where id=$1`,
    [avisoId],
  )
  return rows[0]
}

export async function criarEnvioAgendado(
  avisoId: string,
  etapa: EtapaEnvio,
  agendadoPara: 'now' | Date = 'now',
): Promise<string> {
  const valor = agendadoPara === 'now' ? new Date() : agendadoPara
  const { rows } = await poolSuper.query<{ id: string }>(
    `insert into public.envios (aviso_id, etapa, status, agendado_para) values ($1,$2,'agendado',$3) returning id`,
    [avisoId, etapa, valor],
  )
  return rows[0]!.id
}

export async function lerEnvio(id: string): Promise<{
  status: string
  wamid: string | null
  tentativas: number
  erro: string | null
  proxima_tentativa_em: Date | null
}> {
  const { rows } = await poolSuper.query(
    `select status, wamid, tentativas, erro, proxima_tentativa_em from public.envios where id=$1`,
    [id],
  )
  return rows[0]
}

/** E11: credita N envios na carteira da conta (modelo de créditos). Aditivo + lançamento. */
export async function creditarConta(profileId: string, quantidade: number): Promise<void> {
  await poolSuper.query(
    `update public.creditos_carteira set saldo_livre = saldo_livre + $2, ja_comprou = true where profile_id = $1`,
    [profileId, quantidade],
  )
  await poolSuper.query(
    `insert into public.creditos_lancamentos (profile_id, tipo, quantidade, ator, ator_id)
     values ($1, 'credito_owner', $2, 'owner', $1)`,
    [profileId, quantidade],
  )
}

export async function limpar(cobradorId: string): Promise<void> {
  await poolSuper.query(`delete from auth.users where id=$1`, [cobradorId])
}

export async function encerrarPools(): Promise<void> {
  await poolSuper.end()
  await poolZap.end()
}

export interface WhatsFake extends ClienteWhats {
  /** mensagens passadas a enviarMensagem (com botões) e textos avulsos. */
  enviadas: MensagemWhats[]
  textos: Array<{ para: string; texto: string }>
  /** simula um clique de botão chegando pelo socket (inbound). */
  disparar(evento: EventoBotao): Promise<void>
  /** simula uma mensagem de TEXTO chegando pelo socket (inbound, E5). */
  dispararTexto(evento: EventoTexto): Promise<void>
  /** simula um recibo de entrega chegando (sent/delivered/read/failed). */
  dispararStatus(evento: EventoStatus): Promise<void>
}

/**
 * ClienteWhats fake configurável. `comportamento` decide o retorno/erro de cada
 * envio (ex.: lançar ErroEnvio para testar os ramos do drainer). Não toca a rede
 * nem importa o Baileys real (sem banner/socket nos testes).
 */
export function clienteWhatsFake(
  comportamento?: (m: MensagemWhats) => { wamid: string },
): WhatsFake {
  const enviadas: MensagemWhats[] = []
  const textos: Array<{ para: string; texto: string }> = []
  const handlers: HandlerBotao[] = []
  const handlersTexto: HandlerTexto[] = []
  const handlersStatus: HandlerStatus[] = []
  let n = 0
  const responder = (m: MensagemWhats): { wamid: string } =>
    comportamento ? comportamento(m) : { wamid: `wamid_${++n}` }

  return {
    enviadas,
    textos,
    conectar: async () => undefined,
    parar: async () => undefined,
    desconectar: async () => undefined,
    status: () => ({ conectado: true }),
    onBotao: (cb) => {
      handlers.push(cb)
    },
    onTexto: (cb) => {
      handlersTexto.push(cb)
    },
    onStatus: (cb) => {
      handlersStatus.push(cb)
    },
    enviarMensagem: async (m) => {
      enviadas.push(m)
      return responder(m)
    },
    enviarTexto: async (para, texto) => {
      const m: MensagemWhats = { para, texto }
      textos.push({ para, texto })
      enviadas.push(m)
      return responder(m)
    },
    disparar: async (evento) => {
      for (const h of handlers) await h(evento)
    },
    dispararTexto: async (evento) => {
      for (const h of handlersTexto) await h(evento)
    },
    dispararStatus: async (evento) => {
      for (const h of handlersStatus) await h(evento)
    },
  }
}

/** Env do zap para montar o app nos testes (shape novo, sem META_*). */
export function envZapFake(over: Partial<EnvZap> = {}): EnvZap {
  return {
    PORT: 0,
    DATABASE_URL: 'x',
    SCHEDULER_INTERVAL_MS: 30_000,
    LOG_LEVEL: 'silent',
    ZAP_APP_URL: 'http://app.local',
    WHATS_AUTH_DIR: './auth_baileys',
    WHATS_USE_PAIRING: false,
    WHATS_BROWSER: 'Whaviso',
    WHATS_HUMANIZE: false,
    WHATS_DRY_RUN: false,
    WHATS_GAP_MIN: 0,
    WHATS_GAP_MAX: 0,
    WHATS_BATCH_SIZE: 20,
    WHATS_BATCH_PAUSE_MIN: 0,
    WHATS_BATCH_PAUSE_MAX: 0,
    WHATS_MAX_POR_HORA: 60,
    META_GRAPH_URL: 'https://graph.facebook.com',
    META_API_VERSION: 'v23.0',
    META_OTP_TEMPLATE: 'whaviso_otp',
    META_OTP_IDIOMA: 'pt_BR',
    ...over,
  }
}
