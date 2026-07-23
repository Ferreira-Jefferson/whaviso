import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { comTransacao } from '@whaviso/shared/db'
import { recargaBody, recargaResposta } from '@whaviso/shared/contracts'
import { lerCarteira, lerCatalogo, precoPorEnvioCentavos, creditarEnvios } from '../../shared/planos'
import { lerConfigPlataforma, temChavePix } from '../../shared/config_plataforma'
import { enfileirarRecarga } from '../../shared/notificacoes_billing'
import { lerNumeroVendas } from '../../shared/whats_sessao'
import { regraNegocio, naoEncontrado } from '../../shared/http_errors'
import {
  subirComprovante,
  assinarUrlComprovante,
  extensaoPorMime,
} from '../../shared/storage_comprovantes'
import { validarComprovante, comprovanteConfiavel } from '../../shared/validacao_comprovante'

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

const idParam = z.object({ id: z.uuid() })

// Item 19 (leva 2026-07-22 1D): resposta da recarga ganha o `id` (o próprio id da linha em
// notificacoes_billing) para o front saber em qual recarga anexar o comprovante depois.
// Extensão LOCAL do contrato compartilhado (não editamos @whaviso/shared/contracts nesta
// leva: fora do escopo de arquivos desta tarefa); só este módulo usa recargaResposta hoje.
const recargaRespostaComId = recargaResposta.extend({ id: z.uuid() })

// Só os 4 tipos de arquivo aceitos como comprovante (foto ou PDF do Pix).
const comprovanteMime = z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])

// Upload por JSON base64 (não multipart): este backend não tem @fastify/multipart instalado
// e adicionar a dependência ficaria fora do escopo de arquivos desta leva (package.json do
// app não está no escopo). Base64 tem ~33% de overhead; o bodyLimit da rota é elevado só
// aqui (rota específica, sem tocar no bodyLimit global da api).
const enviarComprovanteBody = z.object({
  arquivo_base64: z.string().min(1).max(14_000_000), // ~10.5MB decodificados
  arquivo_mime: comprovanteMime,
})
const BODY_LIMIT_COMPROVANTE = 15 * 1024 * 1024

const resolverComprovanteBody = z.object({ aprovado: z.boolean() })

export const billingRoutes: FastifyPluginAsync = async (raiz) => {
  const app = raiz.withTypeProvider<ZodTypeProvider>()
  const owner = app.requireRole('owner')

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
    { preHandler: app.autenticar, schema: { body: recargaBody, response: { 200: recargaRespostaComId } } },
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
        // enfileirarRecarga não devolve o id (assinatura de shared/notificacoes_billing,
        // fora do escopo desta leva); a linha que acabamos de inserir é a mais recente desta
        // conta NESTA MESMA transação (sem corrida: é a nossa própria escrita, ainda não
        // commitada). Item 19: o front usa este id para anexar o comprovante depois.
        const { rows: novaRecarga } = await cli.query<{ id: string }>(
          `select id from public.notificacoes_billing
             where profile_id = $1
             order by criado_em desc
             limit 1`,
          [req.userId],
        )
        const recargaId = novaRecarga[0]!.id
        // 5) Número da conversa para o front montar o link "abrir conversa": é o próprio
        // número pareado pelo zap (whats_sessao), então sempre bate com quem envia a
        // mensagem e recebe o comprovante. null se a sessão estiver desconectada.
        const telefoneVendas = await lerNumeroVendas(cli)
        return {
          id: recargaId,
          enfileirado: true,
          quantidade,
          valor_centavos: valorCentavos,
          telefone_vendas: telefoneVendas,
        }
      })
    },
  )

  // Item 19 (leva 2026-07-22 1D, H11.14): anexa o comprovante da recarga (foto/PDF). Guarda
  // no Storage e chama a validação por IA (OpenRouter, visão): confiança alta + valor batendo
  // credita na hora (reaproveita creditarEnvios, tipo 'compra'); qualquer outro caso (baixa
  // confiança, valor não confirmado, IA indisponível) fica 'aguardando_revisao_manual' até o
  // owner decidir (H11.11): nunca credita nem rejeita sozinho nesse caso.
  //
  // NUNCA logar o conteúdo do arquivo nem a resposta bruta da IA (dado bancário do usuário ou
  // de terceiro). `for update` na linha existente (se houver) serializa contra um resolver
  // concorrente do owner na mesma recarga (sem crédito em dobro).
  app.post(
    '/billing/recarga/:id/comprovante',
    {
      preHandler: app.autenticar,
      schema: { params: idParam, body: enviarComprovanteBody },
      bodyLimit: BODY_LIMIT_COMPROVANTE,
    },
    async (req) => {
      const { id } = req.params
      const { arquivo_base64: arquivoBase64, arquivo_mime: arquivoMime } = req.body
      return await comTransacao(app.pool, async (cli) => {
        const { rows: recargaRows } = await cli.query<{
          id: string
          profile_id: string
          quantidade: number
          valor_centavos: number
        }>(
          `select id, profile_id, quantidade, valor_centavos
             from public.notificacoes_billing
            where id = $1 and profile_id = $2`,
          [id, req.userId],
        )
        const recarga = recargaRows[0]
        if (!recarga) throw naoEncontrado('Recarga não encontrada.')

        const { rows: existentes } = await cli.query<{ status: string }>(
          `select status from public.billing_comprovantes where recarga_id = $1 for update`,
          [id],
        )
        if (existentes[0] && ['aprovado', 'rejeitado'].includes(existentes[0].status)) {
          throw regraNegocio(
            'comprovante_ja_processado',
            'Este comprovante já foi analisado e não pode ser reenviado.',
          )
        }

        if (!app.env.SUPABASE_SERVICE_ROLE_KEY) {
          throw regraNegocio(
            'armazenamento_indisponivel',
            'Envio de comprovante indisponível no momento. Tente novamente mais tarde.',
          )
        }

        let bytes: Buffer
        try {
          bytes = Buffer.from(arquivoBase64, 'base64')
        } catch {
          throw regraNegocio('arquivo_invalido', 'Não foi possível ler o arquivo enviado.')
        }
        if (bytes.length === 0) {
          throw regraNegocio('arquivo_invalido', 'Arquivo vazio.')
        }

        const path = `recargas/${id}/comprovante-${Date.now()}.${extensaoPorMime(arquivoMime)}`
        const upload = await subirComprovante({
          supabaseUrl: app.env.SUPABASE_URL,
          serviceRoleKey: app.env.SUPABASE_SERVICE_ROLE_KEY,
          path,
          bytes,
          mime: arquivoMime,
        })
        if (!upload.ok) {
          throw regraNegocio(
            'armazenamento_indisponivel',
            'Não foi possível enviar o comprovante agora. Tente novamente em instantes.',
          )
        }

        const resultado = await validarComprovante({
          bytesBase64: arquivoBase64,
          mime: arquivoMime,
          quantidade: recarga.quantidade,
          valorCentavosEsperado: recarga.valor_centavos,
        })
        const creditaAutomatico = comprovanteConfiavel(resultado)
        const status = creditaAutomatico ? 'aprovado' : 'aguardando_revisao_manual'

        const { rows: comprovanteRows } = await cli.query<{ id: string }>(
          `insert into public.billing_comprovantes
             (recarga_id, profile_id, arquivo_path, arquivo_mime, status,
              ia_confianca, ia_valor_bate, ia_motivo, revisado_em)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           on conflict (recarga_id) do update set
             arquivo_path = excluded.arquivo_path,
             arquivo_mime = excluded.arquivo_mime,
             status = excluded.status,
             ia_confianca = excluded.ia_confianca,
             ia_valor_bate = excluded.ia_valor_bate,
             ia_motivo = excluded.ia_motivo,
             revisado_em = excluded.revisado_em,
             revisado_por = null
           returning id`,
          [
            id,
            req.userId,
            path,
            arquivoMime,
            status,
            resultado.confianca,
            resultado.valorBate,
            resultado.motivo,
            creditaAutomatico ? new Date() : null,
          ],
        )
        const comprovanteId = comprovanteRows[0]!.id

        if (creditaAutomatico) {
          await creditarEnvios(cli, recarga.profile_id, recarga.quantidade, 'compra', {
            ator: 'sistema',
          })
        }

        return { id: comprovanteId, status }
      })
    },
  )

  // Item 19 (H11.14): fila simples de revisão manual do owner (sem UI sofisticada, só
  // listagem + resolver abaixo). Owner-only (mesmo padrão de H11.11).
  app.get('/billing/comprovantes/revisao', { preHandler: owner }, async () => {
    const { rows } = await app.pool.query<{
      id: string
      recarga_id: string
      profile_id: string
      quantidade: number
      valor_centavos: number
      ia_confianca: number | null
      ia_valor_bate: boolean | null
      ia_motivo: string | null
      arquivo_path: string
      criado_em: Date
    }>(
      `select c.id, c.recarga_id, c.profile_id, n.quantidade, n.valor_centavos,
              c.ia_confianca, c.ia_valor_bate, c.ia_motivo, c.arquivo_path, c.criado_em
         from public.billing_comprovantes c
         join public.notificacoes_billing n on n.id = c.recarga_id
        where c.status = 'aguardando_revisao_manual'
        order by c.criado_em asc`,
    )
    const chaveStorage = app.env.SUPABASE_SERVICE_ROLE_KEY
    const itens = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        recarga_id: r.recarga_id,
        profile_id: r.profile_id,
        quantidade: r.quantidade,
        valor_centavos: r.valor_centavos,
        ia_confianca: r.ia_confianca,
        ia_valor_bate: r.ia_valor_bate,
        ia_motivo: r.ia_motivo,
        criado_em: r.criado_em,
        url_comprovante: chaveStorage
          ? await assinarUrlComprovante({
              supabaseUrl: app.env.SUPABASE_URL,
              serviceRoleKey: chaveStorage,
              path: r.arquivo_path,
            })
          : null,
      })),
    )
    return { itens }
  })

  // Item 19 (H11.14): o owner aprova (credita) ou rejeita um comprovante pendente. Espelha o
  // padrão de H11.11 (owner credita com confirmação; usuário nunca se credita). `for update`
  // serializa contra um reenvio concorrente do usuário na mesma recarga.
  app.post(
    '/billing/comprovantes/:id/resolver',
    { preHandler: owner, schema: { params: idParam, body: resolverComprovanteBody } },
    async (req) => {
      const { aprovado } = req.body
      return await comTransacao(app.pool, async (cli) => {
        const { rows } = await cli.query<{
          id: string
          recarga_id: string
          profile_id: string
          status: string
        }>(
          `select id, recarga_id, profile_id, status
             from public.billing_comprovantes
            where id = $1 for update`,
          [req.params.id],
        )
        const comprovante = rows[0]
        if (!comprovante) throw naoEncontrado('Comprovante não encontrado.')
        if (comprovante.status !== 'aguardando_revisao_manual') {
          throw regraNegocio('comprovante_nao_pendente', 'Este comprovante já foi resolvido.')
        }

        if (aprovado) {
          const { rows: recargaRows } = await cli.query<{ quantidade: number }>(
            `select quantidade from public.notificacoes_billing where id = $1`,
            [comprovante.recarga_id],
          )
          const quantidade = recargaRows[0]?.quantidade ?? 0
          if (quantidade > 0) {
            await creditarEnvios(cli, comprovante.profile_id, quantidade, 'compra', {
              ator: 'owner',
              atorId: req.userId,
            })
          }
        }

        const novoStatus = aprovado ? 'aprovado' : 'rejeitado'
        await cli.query(
          `update public.billing_comprovantes
              set status = $2, revisado_por = $3, revisado_em = now()
            where id = $1`,
          [comprovante.id, novoStatus, req.userId],
        )
        return { id: comprovante.id, status: novoStatus }
      })
    },
  )
}
