// Harness de teste de integração: app real (rotas + serviços + DB) com auth controlável.
// Fixtures de auth.users exigem superusuário (FK profiles->auth.users); o app roda como whaviso_api.
import Fastify from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { registrarModulos } from '../src/routes'
import { bloquearSeSuspenso } from '../src/shared/auth'
import { tratadorDeErros, naoAutorizado, proibido } from '../src/shared/http_errors'
import type { AdminSupabase } from '../src/shared/supabase_admin'
import type { EnvApi } from '../src/env'

const SENHA = process.env.POSTGRES_PASSWORD ?? 'postgres'
const HOST = process.env.PGHOST ?? '127.0.0.1'
const DB = process.env.PGDATABASE ?? 'whaviso_dev'

export const poolSuper = new pg.Pool({
  connectionString: `postgresql://postgres:${SENHA}@${HOST}:5432/${DB}`,
  max: 3,
})
export const poolApi = new pg.Pool({
  connectionString: `postgresql://whaviso_api:whaviso_api_dev@${HOST}:5432/${DB}`,
  max: 3,
})

/** Cria um usuário (auth.users + profile) e devolve o id. */
export async function criarUsuario(nome = 'Teste'): Promise<string> {
  const id = randomUUID()
  // o trigger handle_new_user cria o profile automaticamente; aqui só ajustamos o nome.
  await poolSuper.query(`insert into auth.users (id) values ($1)`, [id])
  await poolSuper.query(`update public.profiles set nome = $2 where id = $1`, [id, nome])
  return id
}

export async function limparUsuario(id: string): Promise<void> {
  // cascateia para avisos/envios/eventos via FK.
  await poolSuper.query(`delete from auth.users where id = $1`, [id])
}

/**
 * E11: credita N envios na carteira da conta (modelo de créditos). A conta nasce com a
 * cortesia (5 envios); os testes que precisam de mais saldo para ativar avisos chamam
 * isto. Aditivo + lançamento 'credito_owner', espelhando o crédito do owner. Marca
 * ja_comprou=true (agenda generosa).
 */
export async function creditarConta(id: string, quantidade: number): Promise<void> {
  await poolSuper.query(
    `update public.creditos_carteira
        set saldo_livre = saldo_livre + $2, ja_comprou = true
      where profile_id = $1`,
    [id, quantidade],
  )
  await poolSuper.query(
    `insert into public.creditos_lancamentos (profile_id, tipo, quantidade, ator, ator_id)
     values ($1, 'credito_owner', $2, 'owner', $1)`,
    [id, quantidade],
  )
}

/**
 * Define o SALDO da conta no teste (compat com a antiga `definirPlano`). A conta nasce
 * Free com cortesia (5 envios), que basta para combinados simples; testes que ativam
 * recorrentes/vários avisos sobem o saldo aqui. O 2o/3o args (antigo planoId/unidades) são
 * ignorados (não há mais planos); este shim apenas credita um saldo GENEROSO o suficiente
 * para os cenários antigos não esbarrarem em `saldo_insuficiente`.
 */
export async function definirPlano(
  id: string,
  _planoId = 'profissional',
  _unidades: number | null = null,
): Promise<void> {
  void _planoId
  void _unidades
  await creditarConta(id, 1000)
}

/** Remove todos os avisos do usuário (isolamento entre testes). */
export async function limparAvisos(cobradorId: string): Promise<void> {
  await poolSuper.query(`delete from public.avisos where cobrador_id = $1`, [cobradorId])
}

/**
 * Aceita um convite DIRETO no banco (vincula o devedor, vira programado e cria os 4
 * envios), espelhando o que o aceite por WhatsApp (E5) faz. O site de aceite saiu (E5),
 * então os testes que precisavam de um aviso ATIVO ativam por aqui em vez de bater na
 * rota pública removida. Recebe o id do aviso e (opcional) o uid do devedor a vincular.
 */
export async function aceitarAvisoDireto(avisoId: string, devedorUid?: string): Promise<void> {
  await poolSuper.query(
    `update public.avisos
        set status='programado', aceito_em=now(),
            devedor_profile_id=coalesce($2, devedor_profile_id)
      where id=$1`,
    [avisoId, devedorUid ?? null],
  )
  for (const etapa of ['d_menos_2', 'd_menos_1', 'd', 'd_mais_1'] as const) {
    await poolSuper.query(
      `insert into public.envios (aviso_id, etapa, status, agendado_para)
       values ($1,$2,'agendado', now() + interval '1 day')
       on conflict (aviso_id, etapa) where ocorrencia_id is null do nothing`,
      [avisoId, etapa],
    )
  }
  await poolSuper.query(
    `insert into public.eventos_aviso (aviso_id, tipo, ator) values ($1,'aceite','devedor')`,
    [avisoId],
  )
}

const envFake: EnvApi = {
  PORT: 0,
  DATABASE_URL: 'x',
  SUPABASE_URL: 'http://localhost',
  APP_URL: 'http://app.local',
  WHAVISO_WHATSAPP: '5511999990000',
  LOG_LEVEL: 'silent',
}

/**
 * App de teste com as rotas reais. `comoUsuario` define o uid autenticado;
 * requisição sem header `authorization` recebe 401 (mesma semântica do auth real).
 */
export async function criarAppTeste(
  comoUsuario: string | null,
  admin: AdminSupabase | null = null,
) {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler(tratadorDeErros)
  app.decorate('pool', poolApi)
  app.decorate('env', envFake)
  app.decorate('adminSupabase', admin)
  app.decorate('autenticar', async (req) => {
    if (!req.headers.authorization) throw naoAutorizado()
    req.userId = comoUsuario ?? ''
    await bloquearSeSuspenso(poolApi, req.userId)
  })
  // Sessão opcional: com Authorization vincula a conta; sem header, segue anônimo.
  app.decorate('autenticarOpcional', async (req) => {
    if (!req.headers.authorization) return
    req.userId = comoUsuario ?? ''
    await bloquearSeSuspenso(poolApi, req.userId)
  })
  app.decorate('requireRole', (role: string) => async (req) => {
    if (!req.headers.authorization) throw naoAutorizado()
    req.userId = comoUsuario ?? ''
    await bloquearSeSuspenso(poolApi, req.userId)
    const { rows } = await poolApi.query<{ role: string }>(
      'select role from public.profiles where id = $1',
      [req.userId],
    )
    if (rows[0]?.role !== role) throw proibido()
  })
  app.decorateRequest('userId', '')
  await app.register(registrarModulos, { prefix: '/v1' })
  await app.ready()
  return app
}

/**
 * Admin do Supabase FAKE para teste: simula o GoTrue criando o auth.users via super
 * (o trigger handle_new_user cria o profile + assinatura free, igual ao real). A
 * unicidade por telefone é simulada por um índice único parcial criado no setup do
 * teste, e o 422 é simulado capturando a violação (idempotente). Sem rede.
 */
export function adminFakeSupabase(): AdminSupabase {
  return {
    // O nome não é usado no fake (o GoTrue real guarda no metadata; a api faz o
    // backfill do nome no profile pelo aviso). Só o telefone importa aqui.
    async garantirContaPorTelefone(telefoneE164) {
      // Tenta achar o usuário já existente por telefone (no profile, gravado no aceite
      // anterior, ou no metadata). Como o trigger grava nome vazio e sem telefone,
      // usamos uma tabela auxiliar de mapeamento telefone->uid simulando o GoTrue.
      const existente = await poolSuper.query<{ uid: string }>(
        `select uid from public._test_auth_telefones where telefone = $1`,
        [telefoneE164],
      )
      if (existente.rows[0]) {
        return { uid: existente.rows[0].uid, jaExistia: true }
      }
      const id = randomUUID()
      try {
        // INSERT atômico no mapa (unique no telefone) ANTES de criar o usuário: serializa
        // corridas; se outro inseriu primeiro, cai no 422 simulado.
        await poolSuper.query(
          `insert into public._test_auth_telefones (telefone, uid) values ($1, $2)`,
          [telefoneE164, id],
        )
      } catch (e) {
        if (e instanceof Error && 'code' in e && (e as { code: string }).code === '23505') {
          const r = await poolSuper.query<{ uid: string }>(
            `select uid from public._test_auth_telefones where telefone = $1`,
            [telefoneE164],
          )
          return { uid: r.rows[0]?.uid ?? null, jaExistia: true }
        }
        throw e
      }
      await poolSuper.query(`insert into auth.users (id) values ($1)`, [id])
      return { uid: id, jaExistia: false }
    },
  }
}

/** Cria a tabela auxiliar de mapeamento telefone->uid usada pelo admin fake. */
export async function prepararAuthFake(): Promise<void> {
  await poolSuper.query(
    `create table if not exists public._test_auth_telefones (
       telefone text primary key,
       uid uuid not null
     )`,
  )
}

/** Limpa o mapa e os auth.users criados pelo admin fake (entre testes). */
export async function limparAuthFake(): Promise<void> {
  await poolSuper.query(
    `delete from auth.users where id in (select uid from public._test_auth_telefones)`,
  )
  await poolSuper.query(`delete from public._test_auth_telefones`)
}

export async function encerrarPools(): Promise<void> {
  await poolSuper.end()
  await poolApi.end()
}
