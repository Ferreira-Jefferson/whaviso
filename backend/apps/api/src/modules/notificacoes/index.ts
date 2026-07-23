// H10.10: central de notificações do usuário (item 6, feedback 2026-07-22). Só LEITURA
// (o enfileiramento já existe, ver apps/api/src/shared/notificacoes e
// shared/notificacoes_billing); este módulo une as duas outbox e expõe a leitura/"lida"
// SEM importar outro módulo (query própria direto nas tabelas, mesma fronteira do painel).
//
// Escopo desta leva (deliberado, ver historias/10-notificacoes-cobrador.md H10.10): só
// 'pagamento_informado' e 'combinado_dado_incorreto' de `notificacoes_cobrador` + toda
// `notificacoes_billing` (recarga). Os demais TipoNotificacao (optout, reativação,
// encerramento, edição, reengajamento...) continuam só WhatsApp/auditoria, fora da central.
import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { comTransacao } from '@whaviso/shared/db'
import {
  marcarNotificacoesLidasResposta,
  notificacoesCentralQuery,
  notificacoesCentralResposta,
} from '@whaviso/shared/contracts'

const LIMITE_PADRAO = 30

// Únicas categorias de `notificacoes_cobrador.tipo` que entram na central (H10.10). Vale
// para qualquer alvo/papel: o enfileiramento (enfileirarNotificacao) já roteia para o
// CRIADOR do combinado (cobrador no receber, devedor-criador no invertido); aqui só
// filtramos o DONO da linha (cobrador_id = usuário logado), sem checar o papel.
const TIPOS_COBRADOR_NA_CENTRAL = ['pagamento_informado', 'combinado_dado_incorreto'] as const

interface LinhaNotificacaoCentral {
  id: string
  origem: 'cobrador' | 'billing'
  tipo: 'pagamento_informado' | 'combinado_dado_incorreto' | 'recarga'
  aviso_id: string | null
  criado_em: Date
  lida_em: Date | null
}

export const notificacoesRoutes: FastifyPluginAsync = async (raiz) => {
  const app = raiz.withTypeProvider<ZodTypeProvider>()

  // Feed cronológico (mais recentes primeiro), isolado por req.userId. `nao_lidas` conta
  // TODAS as pendentes (não só as retornadas por `limit`): é o número do badge do sino.
  app.get(
    '/notificacoes',
    {
      preHandler: app.autenticar,
      schema: { querystring: notificacoesCentralQuery, response: { 200: notificacoesCentralResposta } },
    },
    async (req) => {
      const limite = req.query.limit ?? LIMITE_PADRAO
      const { rows } = await app.pool.query<LinhaNotificacaoCentral>(
        `(
           select id, 'cobrador'::text as origem, tipo, aviso_id, criado_em, lida_em
             from public.notificacoes_cobrador
            where cobrador_id = $1 and tipo = any($2::text[])
         )
         union all
         (
           select id, 'billing'::text as origem, 'recarga'::text as tipo,
                  null::uuid as aviso_id, criado_em, lida_em
             from public.notificacoes_billing
            where profile_id = $1
         )
         order by criado_em desc
         limit $3`,
        [req.userId, TIPOS_COBRADOR_NA_CENTRAL, limite],
      )

      const { rows: contagem } = await app.pool.query<{ n: string }>(
        `select
           (select count(*) from public.notificacoes_cobrador
             where cobrador_id = $1 and tipo = any($2::text[]) and lida_em is null)
           +
           (select count(*) from public.notificacoes_billing
             where profile_id = $1 and lida_em is null) as n`,
        [req.userId, TIPOS_COBRADOR_NA_CENTRAL],
      )

      return {
        itens: rows.map((r) => ({
          id: r.id,
          origem: r.origem,
          tipo: r.tipo,
          aviso_id: r.aviso_id,
          criado_em: r.criado_em,
          lida: r.lida_em !== null,
        })),
        nao_lidas: Number(contagem[0]?.n ?? 0),
      }
    },
  )

  // Marca TODAS as não lidas do usuário como lidas de uma vez (mecanismo mais simples que
  // resolve o caso de uso: abrir o sino zera o contador). Idempotente: reprocessar sem
  // pendentes novas devolve marcadas=0, nunca erro.
  app.post(
    '/notificacoes/marcar-lidas',
    { preHandler: app.autenticar, schema: { response: { 200: marcarNotificacoesLidasResposta } } },
    async (req) =>
      comTransacao(app.pool, async (cli) => {
        const cobrador = await cli.query(
          `update public.notificacoes_cobrador set lida_em = now()
             where cobrador_id = $1 and tipo = any($2::text[]) and lida_em is null`,
          [req.userId, TIPOS_COBRADOR_NA_CENTRAL],
        )
        const billing = await cli.query(
          `update public.notificacoes_billing set lida_em = now()
             where profile_id = $1 and lida_em is null`,
          [req.userId],
        )
        return { marcadas: (cobrador.rowCount ?? 0) + (billing.rowCount ?? 0) }
      }),
  )
}
