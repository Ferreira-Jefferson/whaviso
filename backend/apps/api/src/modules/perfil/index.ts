import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import {
  atualizarPerfilBody,
  perfilSchema,
} from '@whaviso/shared/contracts'
import { comTransacao, type PoolClient } from '@whaviso/shared/db'

const COLS_PERFIL = 'id, nome, telefone, role, criado_em, atualizado_em'

// TODO(pivo): vincularAvisosPorTelefone referencia tabela do dominio antigo (public.avisos); remover/trocar.
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
      // Whitelist explícita de colunas editáveis: o nome da coluna nunca vem do body cru
      // (evita mass-assignment / injeção de coluna se o schema mudar). Mesmo padrão de
      // avisos/service.ts (camposEditados).
      const COLS_EDITAVEIS = ['nome', 'telefone'] as const
      const campos: string[] = []
      const valores: unknown[] = [req.userId]
      for (const coluna of COLS_EDITAVEIS) {
        const v = req.body[coluna]
        if (v === undefined) continue
        valores.push(v)
        campos.push(`${coluna} = $${valores.length}`)
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
        // Definiu um telefone → puxa os avisos abertos por esse número, MAS SÓ se o
        // telefone foi verificado via OTP (identidade phone em auth.identities). Evita
        // que um usuário Google "puxe" avisos de um número que não comprovou possuir.
        if (typeof telefone === 'string' && telefone.length > 0) {
          const { rows: idRows } = await cli.query<{ tem: boolean }>(
            `select public.usuario_tem_identidade_phone($1::uuid) as tem`,
            [req.userId],
          )
          if (idRows[0]?.tem) {
            await vincularAvisosPorTelefone(cli, req.userId, telefone)
          }
        }
        return perfil
      })
    },
  )
}
