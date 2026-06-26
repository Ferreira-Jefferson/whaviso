import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { lerCarteira, lerCatalogo } from '../../shared/planos'

// Billing do Épico 11 (modelo de CARTEIRA DE CRÉDITOS). O whaviso é pré-pago por crédito
// de envio (1 envio = 1 ocorrência). Não há mais planos, assinatura, checkout nem webhook
// de pagamento: a compra é MANUAL no MVP (o usuário escolhe a quantidade num slider, fala
// no WhatsApp e paga via Pix; o OWNER credita depois, ver modulo admin). Aqui o usuário só
// LÊ: o saldo da carteira (livre/reservado/em hold/consumido) + a curva do catálogo para o
// slider, e o extrato dos lançamentos. NÃO existe endpoint que o usuário use para se
// creditar (fecha a brecha de saldo de graça, H11.11).

// Paginação do extrato (mesma convenção do admin).
const extratoQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(50),
})

export const billingRoutes: FastifyPluginAsync = async (raiz) => {
  const app = raiz.withTypeProvider<ZodTypeProvider>()

  // Carteira da conta (espelho do servidor, H11.8) + curva do catálogo para o slider de
  // compra (H11.3). O front recomputa o preço ao vivo com a mesma função (fonte única).
  app.get('/billing/carteira', { preHandler: app.autenticar }, async (req) => {
    const carteira = await lerCarteira(app.pool, req.userId)
    const catalogo = await lerCatalogo(app.pool)
    return { carteira, catalogo }
  })

  // Extrato dos lançamentos da conta (compra, crédito, reserva, consumo, devolução, hold),
  // paginado e em ordem cronológica decrescente (H11.8: transparência). Sem PII.
  app.get(
    '/billing/extrato',
    { preHandler: app.autenticar, schema: { querystring: extratoQuery } },
    async (req) => {
      const { page, per_page } = req.query
      const offset = (page - 1) * per_page
      const total = await app.pool.query<{ n: string }>(
        `select count(*) as n from public.creditos_lancamentos where profile_id = $1`,
        [req.userId],
      )
      const { rows } = await app.pool.query(
        `select id, tipo, quantidade, ref_tipo, ref_id, ator, criado_em
           from public.creditos_lancamentos
          where profile_id = $1
          order by criado_em desc
          limit $2 offset $3`,
        [req.userId, per_page, offset],
      )
      return { itens: rows, total: Number(total.rows[0]!.n), page, per_page }
    },
  )
}
