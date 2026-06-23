import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { naoAutorizado, regraNegocio } from '../../shared/http_errors'
import { provedorAtivo } from './provedor'

// Billing do Épico 11: catálogo de 4 planos (free/start/profissional/plus) com
// AGENDA balde único e alavancas por plano lidas do catálogo (migration 0026). O
// Plus é vendido por UNIDADE (1 unidade = 1 ativável + 10 de agenda). Conta nasce
// no free (linha real de assinatura no signup). No MVP o pagamento em dinheiro é
// stub trial (assinar grava 'trial'); a estrutura de fatura/gateway existe e liga
// depois (H11.7 🟡).

// Colunas de alavanca expostas pelo catálogo (lidas em runtime, nunca hardcode).
const COLS_PLANO = `
  id, nome, preco_centavos, max_avisos_ativos, permite_recorrente,
  capacidade_agenda, vagas_ativas, cadencia_configuravel, menu_texto_livre,
  informado_pago_habilitado, totais_periodo, por_unidade, agenda_por_unidade,
  ativaveis_por_unidade, reengajamento_max, somente_leitura
`

const assinarBody = z
  .object({
    plano_id: z.enum(['free', 'start', 'profissional', 'plus']),
    // Só o Plus usa `unidades` (>= 1). Os demais ignoram.
    unidades: z.number().int().min(1).max(2000).optional(),
  })
  .refine((b) => b.plano_id !== 'plus' || b.unidades !== undefined, {
    message: 'o plano Plus exige a quantidade de unidades',
  })

export const billingRoutes: FastifyPluginAsync = async (raiz) => {
  const app = raiz.withTypeProvider<ZodTypeProvider>()

  // Catálogo de planos (centavos). No Plus, `preco_centavos` é o preço de UMA
  // unidade; o front multiplica pela quantidade escolhida.
  app.get('/billing/planos', async () => {
    const { rows } = await app.pool.query(
      `select ${COLS_PLANO} from public.planos
       where id in ('free','start','profissional','plus')
       order by preco_centavos, por_unidade`,
    )
    return { planos: rows }
  })

  // Assinatura vigente da conta + alavancas EFETIVAS (capacidade/vagas já resolvidas
  // por unidade no Plus, via alavancas_do_plano). Sem linha no banco (caso raro: a
  // conta nasce free no signup) → plano free implícito. `unidades` só no Plus.
  app.get('/billing/assinatura', { preHandler: app.autenticar }, async (req) => {
    // Alavancas efetivas (resolve Plus por unidade e default free). Fonte única.
    const { rows: alav } = await app.pool.query(
      `select * from public.alavancas_do_plano($1)`,
      [req.userId],
    )
    // status/preço congelado/nome vêm da linha de assinatura (se houver).
    const { rows: assi } = await app.pool.query<{
      status: string
      preco_centavos: number | null
      nome: string
    }>(
      `select a.status, a.preco_centavos, p.nome
       from public.assinaturas a join public.planos p on p.id = a.plano_id
       where a.profile_id = $1`,
      [req.userId],
    )
    const a = alav[0]!
    return {
      plano_id: a.plano_id,
      status: assi[0]?.status ?? 'trial',
      nome: assi[0]?.nome ?? null,
      preco_centavos: assi[0]?.preco_centavos ?? 0,
      unidades: a.unidades,
      // Alavancas efetivas (lidas do catálogo, resolvidas por unidade).
      capacidade_agenda: a.capacidade_agenda,
      vagas_ativas: a.vagas_ativas,
      somente_leitura: a.somente_leitura,
      permite_recorrente: a.permite_recorrente,
      cadencia_configuravel: a.cadencia_configuravel,
      menu_texto_livre: a.menu_texto_livre,
      informado_pago_habilitado: a.informado_pago_habilitado,
      totais_periodo: a.totais_periodo,
      reengajamento_max: a.reengajamento_max,
      implicito: assi.length === 0,
    }
  })

  // Define/atualiza o plano escolhido. No Plus, congela o preço total (preço de
  // unidade * unidades) no momento da contratação. Grava 'trial' (sem pagamento).
  app.post(
    '/billing/assinar',
    { preHandler: app.autenticar, schema: { body: assinarBody } },
    async (req) => {
      const { plano_id } = req.body
      const { rows: catalogo } = await app.pool.query<{
        preco_centavos: number
        por_unidade: boolean
      }>(`select preco_centavos, por_unidade from public.planos where id = $1`, [plano_id])
      const plano = catalogo[0]
      if (!plano) throw regraNegocio('plano_invalido', `Plano "${plano_id}" não existe.`)

      const unidades = plano.por_unidade ? req.body.unidades! : null
      const preco_centavos = plano.por_unidade
        ? plano.preco_centavos * unidades!
        : plano.preco_centavos

      const { rows } = await app.pool.query(
        `insert into public.assinaturas (profile_id, plano_id, status, unidades, preco_centavos)
         values ($1, $2, 'trial', $3, $4)
         on conflict (profile_id) do update set
           plano_id = excluded.plano_id,
           status = 'trial',
           unidades = excluded.unidades,
           preco_centavos = excluded.preco_centavos
         returning plano_id, status, unidades, preco_centavos`,
        [req.userId, plano_id, unidades, preco_centavos],
      )
      return rows[0]
    },
  )

  // Inicia o pagamento da assinatura atual: cria a fatura pendente e chama o
  // adaptador do provedor. O provedor real devolveria uma checkout_url.
  app.post('/billing/checkout', { preHandler: app.autenticar }, async (req) => {
    const { rows: assi } = await app.pool.query<{
      plano_id: string
      unidades: number | null
      preco_centavos: number | null
    }>(
      `select plano_id, unidades, preco_centavos
       from public.assinaturas where profile_id = $1`,
      [req.userId],
    )
    const a = assi[0]
    if (!a || a.preco_centavos === null || a.preco_centavos === 0) {
      throw regraNegocio(
        'sem_assinatura',
        'Escolha um plano pago antes de iniciar o pagamento.',
      )
    }

    const fatura = await provedorAtivo.criarFatura({
      valor_centavos: a.preco_centavos,
      descricao: `whaviso ${a.plano_id}`,
      profile_id: req.userId,
    })

    const { rows: pag } = await app.pool.query<{ id: string; status: string }>(
      `insert into public.pagamentos
         (profile_id, plano_id, quantidade, valor_centavos, status, provedor, provedor_ref)
       values ($1, $2, $3, $4, 'pendente', $5, $6)
       returning id, status`,
      [
        req.userId,
        a.plano_id,
        a.unidades,
        a.preco_centavos,
        fatura.provedor,
        fatura.provedor_ref,
      ],
    )

    await app.pool.query(
      `insert into public.eventos_pagamento (pagamento_id, tipo, provedor, provedor_ref, dados)
       values ($1, 'checkout_criado', $2, $3, '{}'::jsonb)`,
      [pag[0]!.id, fatura.provedor, fatura.provedor_ref],
    )

    return {
      pagamento_id: pag[0]!.id,
      status: pag[0]!.status,
      checkout_url: fatura.checkout_url,
    }
  })

  // Webhook do provedor (sem JWT). Em prod, validar a ASSINATURA do provedor; o
  // stub aceita um segredo simples via header se BILLING_WEBHOOK_SECRET existir.
  app.post('/billing/webhook', async (req, reply) => {
    const segredo = app.env.BILLING_WEBHOOK_SECRET
    if (segredo && req.headers['x-webhook-secret'] !== segredo) {
      throw naoAutorizado('webhook não autorizado')
    }

    const ev = provedorAtivo.interpretarWebhook(req.body)
    if (!ev) {
      return reply.status(400).send({
        error: { code: 'webhook_invalido', message: 'Evento de pagamento não reconhecido.' },
      })
    }

    const { rows } = await app.pool.query<{ id: string; profile_id: string }>(
      `select id, profile_id from public.pagamentos where provedor = $1 and provedor_ref = $2`,
      [ev.provedor, ev.provedor_ref],
    )
    const pagamento = rows[0] ?? null

    // Loga o evento bruto sempre (auditoria), mesmo se a fatura for desconhecida.
    await app.pool.query(
      `insert into public.eventos_pagamento (pagamento_id, tipo, provedor, provedor_ref, dados)
       values ($1, $2, $3, $4, $5::jsonb)`,
      [pagamento?.id ?? null, ev.tipo, ev.provedor, ev.provedor_ref, JSON.stringify(req.body ?? {})],
    )

    if (pagamento) {
      await app.pool.query(`update public.pagamentos set status = $2 where id = $1`, [
        pagamento.id,
        ev.status,
      ])
      // Pagamento confirmado → ativa a assinatura do usuário.
      if (ev.status === 'pago') {
        await app.pool.query(
          `update public.assinaturas set status = 'ativa' where profile_id = $1`,
          [pagamento.profile_id],
        )
      }
    }

    return { ok: true }
  })
}
