// H10.10: central de notificações do usuário (item 6, feedback 2026-07-22), servida numa
// página própria (/app/notificacoes). Só LEITURA (o enfileiramento já existe, ver
// apps/api/src/shared/notificacoes e shared/notificacoes_billing); este módulo une as
// duas outbox e expõe a leitura/"lida" SEM importar outro módulo (query própria direto
// nas tabelas, mesma fronteira do painel).
//
// Escopo desta leva (deliberado, ver historias/10-notificacoes-cobrador.md H10.10): só
// 'pagamento_informado' e 'combinado_dado_incorreto' de `notificacoes_cobrador` + toda
// `notificacoes_billing` (recarga). Os demais TipoNotificacao (optout, reativação,
// encerramento, edição, reengajamento...) continuam só WhatsApp/auditoria, fora da central.
import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  marcarNotificacaoLidaResposta,
  notificacoesCentralQuery,
  notificacoesCentralResposta,
} from '@whaviso/shared/contracts'

const idParam = z.object({ id: z.uuid() })

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

  // Feed cronológico paginado (mais recentes primeiro), isolado por req.userId.
  // `nao_lidas` conta TODAS as pendentes (independente da página atual): é o número do
  // atalho do sino.
  app.get(
    '/notificacoes',
    {
      preHandler: app.autenticar,
      schema: { querystring: notificacoesCentralQuery, response: { 200: notificacoesCentralResposta } },
    },
    async (req) => {
      const { page, per_page: perPage } = req.query
      const offset = (page - 1) * perPage

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
         limit $3 offset $4`,
        [req.userId, TIPOS_COBRADOR_NA_CENTRAL, perPage, offset],
      )

      const { rows: contagem } = await app.pool.query<{ total: string; nao_lidas: string }>(
        `select
           (
             (select count(*) from public.notificacoes_cobrador
               where cobrador_id = $1 and tipo = any($2::text[]))
             +
             (select count(*) from public.notificacoes_billing where profile_id = $1)
           ) as total,
           (
             (select count(*) from public.notificacoes_cobrador
               where cobrador_id = $1 and tipo = any($2::text[]) and lida_em is null)
             +
             (select count(*) from public.notificacoes_billing
               where profile_id = $1 and lida_em is null)
           ) as nao_lidas`,
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
        total: Number(contagem[0]?.total ?? 0),
        page,
        per_page: perPage,
        nao_lidas: Number(contagem[0]?.nao_lidas ?? 0),
      }
    },
  )

  // Marca UMA notificação como lida (decisão de produto: o contador do sino só cai item a
  // item, ao clicar naquele especifico; abrir a página/sino não marca nada em massa). Sem
  // `origem` no corpo: tenta em ambas as tabelas escopado por dono, só uma bate (ids são de
  // tabelas diferentes). Idempotente: já lida devolve `lida: true` sem tocar `lida_em` de novo.
  app.post(
    '/notificacoes/:id/marcar-lida',
    {
      preHandler: app.autenticar,
      schema: { params: idParam, response: { 200: marcarNotificacaoLidaResposta } },
    },
    async (req) => {
      const cobrador = await app.pool.query(
        `update public.notificacoes_cobrador set lida_em = now()
           where id = $1 and cobrador_id = $2 and tipo = any($3::text[]) and lida_em is null`,
        [req.params.id, req.userId, TIPOS_COBRADOR_NA_CENTRAL],
      )
      if ((cobrador.rowCount ?? 0) > 0) return { lida: true }

      const billing = await app.pool.query(
        `update public.notificacoes_billing set lida_em = now()
           where id = $1 and profile_id = $2 and lida_em is null`,
        [req.params.id, req.userId],
      )
      if ((billing.rowCount ?? 0) > 0) return { lida: true }

      // Idempotente: já lida (ou não encontrada por outro dono) devolve `lida: true`
      // igual, sem revelar se o id existe em outra conta (mesma régua de isolamento).
      return { lida: true }
    },
  )
}
