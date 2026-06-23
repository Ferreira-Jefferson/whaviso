import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import {
  atualizarChavePixBody,
  atualizarPerfilBody,
  criarChavePixBody,
  listaChavesPixResposta,
  chavePixSchema,
  perfilSchema,
} from '@whaviso/shared/contracts'
import { comTransacao, type PoolClient } from '@whaviso/shared/db'
import { z } from 'zod'
import { conflito, naoEncontrado } from '../../shared/http_errors'

const COLS_PERFIL = 'id, nome, telefone, role, criado_em, atualizado_em'
const COLS_CHAVE =
  'id, tipo, chave, rotulo, titular, banco, padrao, arquivada, criado_em, atualizado_em'
const idParam = z.object({ id: z.uuid() })

/**
 * Backfill por telefone: ao definir o telefone do perfil, "puxa" para esta conta os
 * avisos abertos por esse número (vínculo por telefone, criados sem conta), nos dois papéis:
 *  - sou o alvo dos lembretes (devedor) → avisos.telefone_devedor = tel → grava devedor_profile_id
 *  - fui convidado como cobrador        → avisos.telefone_cobrador = tel → grava cobrador_id
 * Só preenche o slot quando está NULL (idempotente; nunca rouba um aviso já vinculado a outra conta).
 * ATENÇÃO: o telefone aqui NÃO é verificado (login é por Google). Decisão de produto 2026-06-18:
 * risco de "puxar" combinados de um número alheio aceito para a fase atual. Quando houver
 * verificação de posse do número (OTP), condicionar este backfill a ela. Ver memória whaviso-pagar-invertido.
 */
async function vincularAvisosPorTelefone(
  cli: PoolClient,
  uid: string,
  telefone: string,
): Promise<void> {
  await cli.query(
    `update public.avisos set devedor_profile_id = $1
       where telefone_devedor = $2 and devedor_profile_id is null`,
    [uid, telefone],
  )
  await cli.query(
    `update public.avisos set cobrador_id = $1
       where telefone_cobrador = $2 and cobrador_id is null`,
    [uid, telefone],
  )
}

export const perfilRoutes: FastifyPluginAsync = async (raiz) => {
  const app = raiz.withTypeProvider<ZodTypeProvider>()

  app.get(
    '/perfil',
    { preHandler: app.autenticar, schema: { response: { 200: perfilSchema } } },
    async (req) => {
      const { rows } = await app.pool.query(
        `select ${COLS_PERFIL} from public.profiles where id = $1`,
        [req.userId],
      )
      return rows[0]
    },
  )

  app.patch(
    '/perfil',
    { preHandler: app.autenticar, schema: { body: atualizarPerfilBody, response: { 200: perfilSchema } } },
    async (req) => {
      const campos: string[] = []
      const valores: unknown[] = [req.userId]
      for (const [k, v] of Object.entries(req.body)) {
        if (v === undefined) continue
        valores.push(v)
        campos.push(`${k} = $${valores.length}`)
      }
      const { telefone } = req.body
      return comTransacao(app.pool, async (cli) => {
        let perfil
        if (campos.length === 0) {
          const { rows } = await cli.query(
            `select ${COLS_PERFIL} from public.profiles where id = $1`,
            [req.userId],
          )
          perfil = rows[0]
        } else {
          const { rows } = await cli.query(
            `update public.profiles set ${campos.join(', ')} where id = $1
             returning ${COLS_PERFIL}`,
            valores,
          )
          perfil = rows[0]
        }
        // Definiu um telefone → puxa os avisos abertos por esse número para esta conta.
        if (typeof telefone === 'string' && telefone.length > 0) {
          await vincularAvisosPorTelefone(cli, req.userId, telefone)
        }
        return perfil
      })
    },
  )

  // ---- Chaves Pix do usuário (N por perfil; 1 padrão). Escopo: profile_id = userId. ----

  app.get(
    '/perfil/chaves-pix',
    { preHandler: app.autenticar, schema: { response: { 200: listaChavesPixResposta } } },
    async (req) => {
      const { rows } = await app.pool.query(
        `select ${COLS_CHAVE} from public.chaves_pix
         where profile_id = $1 and not arquivada
         order by padrao desc, criado_em desc`,
        [req.userId],
      )
      return rows
    },
  )

  app.post(
    '/perfil/chaves-pix',
    { preHandler: app.autenticar, schema: { body: criarChavePixBody, response: { 201: chavePixSchema } } },
    async (req, reply) => {
      const { tipo, chave, rotulo, titular, banco, padrao } = req.body
      try {
        const linha = await comTransacao(app.pool, async (cli) => {
          if (padrao) {
            await cli.query(
              `update public.chaves_pix set padrao = false
               where profile_id = $1 and padrao and not arquivada`,
              [req.userId],
            )
          }
          const { rows } = await cli.query(
            `insert into public.chaves_pix (profile_id, tipo, chave, rotulo, titular, banco, padrao)
             values ($1, $2, $3, $4, $5, $6, $7) returning ${COLS_CHAVE}`,
            [req.userId, tipo, chave, rotulo ?? null, titular, banco, padrao ?? false],
          )
          return rows[0]
        })
        return reply.status(201).send(linha)
      } catch (e) {
        // unique parcial chaves_pix_unq (mesma chave ativa do usuário).
        if (e instanceof Error && 'code' in e && e.code === '23505') {
          throw conflito('chave_pix_duplicada', 'Você já tem essa chave Pix cadastrada.')
        }
        throw e
      }
    },
  )

  app.patch(
    '/perfil/chaves-pix/:id',
    {
      preHandler: app.autenticar,
      schema: { params: idParam, body: atualizarChavePixBody, response: { 200: chavePixSchema } },
    },
    async (req) => {
      const { rotulo, titular, banco, padrao, arquivada } = req.body
      // Arquivar (soft-delete) também tira o status de padrão.
      const padraoFinal = arquivada === true ? false : padrao

      const linha = await comTransacao(app.pool, async (cli) => {
        if (padraoFinal === true) {
          await cli.query(
            `update public.chaves_pix set padrao = false
             where profile_id = $1 and padrao and not arquivada and id <> $2`,
            [req.userId, req.params.id],
          )
        }
        const sets: string[] = []
        const valores: unknown[] = [req.params.id, req.userId]
        if (rotulo !== undefined) {
          valores.push(rotulo)
          sets.push(`rotulo = $${valores.length}`)
        }
        if (titular !== undefined) {
          valores.push(titular)
          sets.push(`titular = $${valores.length}`)
        }
        if (banco !== undefined) {
          valores.push(banco)
          sets.push(`banco = $${valores.length}`)
        }
        if (arquivada !== undefined) {
          valores.push(arquivada)
          sets.push(`arquivada = $${valores.length}`)
        }
        if (padraoFinal !== undefined) {
          valores.push(padraoFinal)
          sets.push(`padrao = $${valores.length}`)
        }
        const { rows } = await cli.query(
          `update public.chaves_pix set ${sets.join(', ')}
           where id = $1 and profile_id = $2 returning ${COLS_CHAVE}`,
          valores,
        )
        return rows[0]
      })

      if (!linha) throw naoEncontrado('Chave Pix não encontrada.')
      return linha
    },
  )
}
