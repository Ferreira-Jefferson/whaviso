import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { comTransacao } from '@whaviso/shared/db'
import { recargaBody, recargaResposta } from '@whaviso/shared/contracts'
import { lerCarteira, lerCatalogo, precoPorEnvioCentavos } from '../../shared/planos'
import { lerConfigPlataforma, temChavePix } from '../../shared/config_plataforma'
import { enfileirarRecarga } from '../../shared/notificacoes_billing'
import { regraNegocio } from '../../shared/http_errors'

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

  // Confirma a RECARGA (H11.10): em vez de redirecionar para o WhatsApp com a chave
  // digitada à mão, o servidor valida a quantidade contra o catálogo, recalcula o valor
  // (fonte única) e ENFILEIRA a mensagem de compra (template billing.recarga + chave Pix da
  // plataforma) para o WhatsApp do PRÓPRIO usuário; o zap envia. O usuário paga e manda o
  // comprovante na conversa, e o owner credita (H11.11). A chave Pix NUNCA volta no HTTP
  // (H13.8): só vai na mensagem. NÃO credita nada aqui (charge-on-success continua manual).
  app.post(
    '/billing/recarga',
    { preHandler: app.autenticar, schema: { body: recargaBody, response: { 200: recargaResposta } } },
    async (req) => {
      const { quantidade } = req.body
      return await comTransacao(app.pool, async (cli) => {
        // 1) Precisa do WhatsApp do usuário para empurrar a mensagem.
        const { rows: pRows } = await cli.query<{ telefone: string | null }>(
          `select telefone from public.profiles where id = $1`,
          [req.userId],
        )
        const telefone = pRows[0]?.telefone?.trim()
        if (!telefone) {
          throw regraNegocio(
            'telefone_ausente',
            'Cadastre seu WhatsApp na Conta para receber as instruções de pagamento.',
          )
        }

        // 2) Quantidade dentro da faixa do catálogo (o slider já limita; defesa no servidor).
        const catalogo = await lerCatalogo(cli)
        if (quantidade < catalogo.envios_min || quantidade > catalogo.envios_max) {
          throw regraNegocio(
            'quantidade_invalida',
            `A recarga é de ${catalogo.envios_min} a ${catalogo.envios_max} envios.`,
          )
        }

        // 3) Sem chave Pix configurada não dá para montar o recibo (o owner cadastra no admin).
        const config = await lerConfigPlataforma(cli)
        if (!temChavePix(config)) {
          throw regraNegocio(
            'pix_nao_configurado',
            'O canal de recarga ainda não está disponível. Tente novamente em instantes.',
          )
        }

        // 4) Valor pela curva (mesma função que o front espelha) + enfileira.
        const valorCentavos = precoPorEnvioCentavos(catalogo, quantidade)
        await enfileirarRecarga(cli, {
          profileId: req.userId,
          telefone,
          quantidade,
          valorCentavos,
        })
        return { enfileirado: true, quantidade, valor_centavos: valorCentavos }
      })
    },
  )
}
