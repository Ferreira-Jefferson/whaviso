import { createRequire } from 'node:module'
import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { comTransacao } from '@whaviso/shared/db'
import {
  adminAtualizarConfigPlataformaBody,
  type AdminAtualizarConfigPlataformaBody,
  configPlataformaSchema,
  adminAtualizarCreditosCatalogoBody,
  type AdminAtualizarCreditosCatalogoBody,
  type CurvaPonto,
  adminAtualizarUsuarioBody,
  adminAvisosQuery,
  adminAvisosResposta,
  adminCreditarBody,
  adminEnviosQuery,
  adminEnviosResposta,
  adminMetricasQuery,
  adminMetricasResposta,
  adminNotificacoesQuery,
  adminNotificacoesResposta,
  adminUsuariosQuery,
  adminUsuariosResposta,
  lintLinguagem,
  lintTravessao,
  alertaGenero,
  novaMensagemBody,
  previewMensagemBody,
  renderizarTexto,
} from '@whaviso/shared/contracts'
import { conflito, naoEncontrado, regraNegocio } from '../../shared/http_errors'
import { creditarEnvios } from '../../shared/planos'
import { lerConfigPlataforma } from '../../shared/config_plataforma'
import * as repo from './repo'

const idParam = z.object({ id: z.uuid() })

// Colunas retornadas do catálogo de créditos (GET e PATCH devolvem o catálogo inteiro).
// O owner edita VALORES em runtime; nunca cria nem apaga (1 linha, id=1). envios_min/max
// derivam dos marcos da curva (primeiro/último), não são editados direto.
const COLS_CATALOGO_RETORNO =
  'envios_min, envios_max, curva, cortesia_inicial, agenda_teto_free, agenda_teto_pago'

// Lint de linguagem do conteúdo estruturado: texto + rótulos dos botões.
// Concatena tudo que é texto editável (texto + rótulos) e aplica as três regras:
//  - vocabulário proibido (regra de ouro nº1): BLOQUEIA (H13.1).
//  - travessão em dash/en dash (regra de ouro nº2): BLOQUEIA (H13.2). Nunca casa
//    o hífen ASCII, legítimo em url/acao.
//  - gênero gendered (regra de ouro nº3): só ALERTA, não bloqueia (H13.10 🟡).
function lintConteudo(c: { texto?: string; botoes?: { rotulo: string }[] }): {
  palavra_proibida: string | null
  travessao: string | null
  avisos_genero: string[]
} {
  const alvo = [c.texto ?? '', ...(c.botoes?.map((b) => b.rotulo) ?? [])].join(' ')
  return {
    palavra_proibida: lintLinguagem(alvo),
    travessao: lintTravessao(alvo),
    avisos_genero: alertaGenero(alvo),
  }
}

// qrcode é CJS (igual ao zap): carrega por createRequire para evitar atrito de
// interop ESM sob verbatimModuleSyntax. Renderiza a string do QR como PNG dataURL.
const exigir = createRequire(import.meta.url)
interface GeradorQr {
  toDataURL: (texto: string, opcoes?: Record<string, unknown>) => Promise<string>
}

export const adminRoutes: FastifyPluginAsync = async (raiz) => {
  const app = raiz.withTypeProvider<ZodTypeProvider>()
  const owner = app.requireRole('owner')

  // Métricas globais. Período opcional (de/ate, datas de negócio em America/Sao_Paulo)
  // filtra por data_combinada dos avisos e agendado_para dos envios. Inclui opt-out.
  app.get(
    '/admin/metricas',
    { preHandler: owner, schema: { querystring: adminMetricasQuery, response: { 200: adminMetricasResposta } } },
    async (req) => {
      const { de, ate } = req.query
      // Filtros por período (parametrizados; mesmas datas para avisos e envios).
      const avisoCond: string[] = []
      const avisoParams: unknown[] = []
      if (de) {
        avisoParams.push(de)
        avisoCond.push(`data_combinada >= $${avisoParams.length}`)
      }
      if (ate) {
        avisoParams.push(ate)
        avisoCond.push(`data_combinada <= $${avisoParams.length}`)
      }
      const avisoWhere = avisoCond.length ? `where ${avisoCond.join(' and ')}` : ''

      const envioCond: string[] = []
      const envioParams: unknown[] = []
      if (de) {
        envioParams.push(de)
        envioCond.push(`(agendado_para at time zone 'America/Sao_Paulo')::date >= $${envioParams.length}`)
      }
      if (ate) {
        envioParams.push(ate)
        envioCond.push(`(agendado_para at time zone 'America/Sao_Paulo')::date <= $${envioParams.length}`)
      }
      const envioWhere = envioCond.length ? `where ${envioCond.join(' and ')}` : ''

      // Opt-out: avisos no período (mesmo filtro) que têm pelo menos um evento 'optout'.
      const optoutSql = `
        select count(*)::int as n from public.avisos a
        ${avisoWhere}${avisoWhere ? ' and' : ' where'}
          exists (select 1 from public.eventos_aviso e
                  where e.aviso_id = a.id and e.tipo = 'optout')`

      const [avisos, envios, usuarios, optout] = await Promise.all([
        app.pool.query(`select status, count(*)::int as n from public.avisos ${avisoWhere} group by status`, avisoParams),
        app.pool.query(`select status, count(*)::int as n from public.envios ${envioWhere} group by status`, envioParams),
        app.pool.query(`select count(*)::int as n from public.profiles`),
        app.pool.query(optoutSql, avisoParams),
      ])
      const porStatus = (rows: { status: string; n: number }[]) =>
        Object.fromEntries(rows.map((r) => [r.status, r.n]))
      const totalAvisos = avisos.rows.reduce((s, r) => s + r.n, 0)
      const optoutTotal = optout.rows[0].n
      return {
        avisos_por_status: porStatus(avisos.rows),
        envios_por_status: porStatus(envios.rows),
        total_usuarios: usuarios.rows[0].n,
        optout_total: optoutTotal,
        optout_taxa: totalAvisos > 0 ? optoutTotal / totalAvisos : 0,
      }
    },
  )

  // ---- Templates UNIFICADOS por chave (tabela `templates`) ------------------
  // Mesma maquinaria do ciclo (propor versão -> aprovar -> ativar -> apagar), mas
  // sobre a tabela unificada, com conteúdo ESTRUTURADO (texto + botões + mídia) e
  // chaveado por `chave`. É a casa futura de TODA mensagem; hoje serve a família
  // resposta.* (respostas a botão). O zap lê daqui e renderiza (shared/templates).

  app.get('/admin/mensagens', { preHandler: owner }, async () => {
    const { rows } = await app.pool.query(
      `select id, chave, contexto, nome_meta, idioma, conteudo, variaveis, versao, status_meta, ativo, criado_em
       from public.templates order by chave, versao desc`,
    )
    return { mensagens: rows }
  })

  // Nova versão nasce 'pendente' (precisa aprovar antes de ativar).
  app.post(
    '/admin/mensagens',
    { preHandler: owner, schema: { body: novaMensagemBody } },
    async (req, reply) => {
      const lint = lintConteudo(req.body.conteudo)
      if (lint.palavra_proibida) {
        throw regraNegocio(
          'linguagem_proibida',
          `O texto contém termo proibido: "${lint.palavra_proibida}".`,
        )
      }
      if (lint.travessao) {
        throw regraNegocio(
          'linguagem_travessao',
          'O texto contém travessão. Use vírgula, dois-pontos ou parênteses.',
        )
      }
      const { rows } = await app.pool.query(
        `insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, versao, status_meta, ativo)
         values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,
           coalesce((select max(versao)+1 from public.templates where nome_meta=$3), 1),
           'pendente', false)
         returning id, chave, nome_meta, versao, status_meta, ativo`,
        [
          req.body.chave,
          req.body.contexto,
          req.body.nome_meta,
          req.body.idioma,
          JSON.stringify(req.body.conteudo),
          JSON.stringify(req.body.variaveis),
        ],
      )
      // Gênero é só ALERTA: salva mesmo assim, mas devolve os trechos para revisão.
      return reply.status(201).send({ ...rows[0], avisos_genero: lint.avisos_genero })
    },
  )

  // Render + lint sem persistir (auxílio à redação). Substitui {{n}} do texto
  // pelo MESMO renderizador do envio real do zap (renderizarTexto, @whaviso/shared):
  // o que o owner vê no preview é byte a byte o que vai sair, inclusive valor
  // ausente (-> string vazia, não placeholder). Paridade preview↔envio (H12.7/M1).
  app.post(
    '/admin/mensagens/preview',
    { preHandler: owner, schema: { body: previewMensagemBody } },
    async (req) => {
      const render = renderizarTexto(req.body.conteudo.texto, req.body.variaveis, req.body.valores)
      const lint = lintConteudo(req.body.conteudo)
      // Preview INFORMA (não bloqueia, ao contrário do POST). lint_ok cai com
      // proibida OU travessão; gênero é só aviso e não afeta lint_ok.
      return {
        render,
        lint_ok: lint.palavra_proibida === null && lint.travessao === null,
        palavra_proibida: lint.palavra_proibida,
        travessao: lint.travessao,
        avisos_genero: lint.avisos_genero,
      }
    },
  )

  // Ativação só se aprovada; troca o ativo da (chave, contexto) em dois passos.
  app.post(
    '/admin/mensagens/:id/ativar',
    { preHandler: owner, schema: { params: idParam } },
    async (req) => {
      const { rows } = await app.pool.query(
        `select chave, contexto, status_meta from public.templates where id=$1`,
        [req.params.id],
      )
      const t = rows[0]
      if (!t) throw naoEncontrado('Mensagem não encontrada')
      if (t.status_meta !== 'aprovado') {
        throw conflito('template_nao_aprovado', 'Só é possível ativar uma versão aprovada.')
      }
      await comTransacao(app.pool, async (cli) => {
        await cli.query(
          `update public.templates set ativo=false where chave=$1 and contexto=$2 and ativo`,
          [t.chave, t.contexto],
        )
        await cli.query(`update public.templates set ativo=true where id=$1`, [req.params.id])
      })
      return { id: req.params.id, ativo: true }
    },
  )

  // Aprovação manual (era Baileys, sem submissão à Meta), habilita a ativação.
  app.post(
    '/admin/mensagens/:id/aprovar',
    { preHandler: owner, schema: { params: idParam } },
    async (req) => {
      const { rows } = await app.pool.query(
        `update public.templates set status_meta='aprovado' where id=$1 returning id, status_meta`,
        [req.params.id],
      )
      const t = rows[0]
      if (!t) throw naoEncontrado('Mensagem não encontrada')
      return { id: t.id, status_meta: t.status_meta }
    },
  )

  // Apagar uma versão. Guarda: nunca apaga a ativa (deixaria a chave sem mensagem).
  app.delete(
    '/admin/mensagens/:id',
    { preHandler: owner, schema: { params: idParam } },
    async (req) => {
      const { rows } = await app.pool.query(`select ativo from public.templates where id=$1`, [
        req.params.id,
      ])
      const t = rows[0]
      if (!t) throw naoEncontrado('Mensagem não encontrada')
      if (t.ativo) {
        throw conflito(
          'template_ativo',
          'Não é possível apagar a versão ativa. Ative outra versão antes de apagar esta.',
        )
      }
      await app.pool.query(`delete from public.templates where id=$1`, [req.params.id])
      return { id: req.params.id, apagado: true }
    },
  )

  // ---- Auditoria (read-only) -----------------------------------------------

  // Usuários (profiles + plano via assinaturas), paginado e com busca por nome/telefone.
  app.get(
    '/admin/usuarios',
    { preHandler: owner, schema: { querystring: adminUsuariosQuery, response: { 200: adminUsuariosResposta } } },
    async (req) => {
      const { itens, total } = await repo.listarUsuarios(app.pool, req.query)
      return { itens, total, page: req.query.page, per_page: req.query.per_page }
    },
  )

  // Suspensão/reativação da conta. Suspenso = bloqueado na api (403 em toda rota
  // autenticada; ver shared/auth). Não apaga dados; reativar volta ao normal. E11: a troca
  // de plano saiu (não há planos); creditar envios é endpoint próprio (POST .../creditar).
  app.patch(
    '/admin/usuarios/:id',
    { preHandler: owner, schema: { params: idParam, body: adminAtualizarUsuarioBody } },
    async (req) => {
      if (!(await repo.usuarioExiste(app.pool, req.params.id))) {
        throw naoEncontrado('Usuário não encontrado')
      }
      // Owner não pode se auto-suspender (evita se trancar para fora).
      if (req.body.suspenso && req.params.id === req.userId) {
        throw regraNegocio('auto_suspensao', 'Não é possível suspender a própria conta.')
      }
      await repo.definirSuspenso(app.pool, req.params.id, req.body.suspenso)
      return { id: req.params.id, suspenso: req.body.suspenso }
    },
  )

  // E11 H11.11: o owner CREDITA envios numa conta (ativação manual pós-pagamento via
  // WhatsApp). Aditivo, lançamento 'credito_owner' (append-only), marca ja_comprou=true
  // (libera a agenda generosa). Owner-only; o usuário NUNCA se credita. Cada crédito é uma
  // transação com lock na carteira. Devolve o saldo atualizado.
  app.post(
    '/admin/usuarios/:id/creditar',
    { preHandler: owner, schema: { params: idParam, body: adminCreditarBody } },
    async (req) => {
      if (!(await repo.usuarioExiste(app.pool, req.params.id))) {
        throw naoEncontrado('Usuário não encontrado')
      }
      const carteira = await comTransacao(app.pool, (cli) =>
        creditarEnvios(cli, req.params.id, req.body.quantidade, 'credito_owner', {
          ator: 'owner',
          atorId: req.userId,
        }),
      )
      return { id: req.params.id, ...carteira }
    },
  )

  // Edição da CURVA de créditos (H11.11): a tabela de MARCOS (envios -> R$/envio), a
  // cortesia inicial e os tetos de agenda (free/após compra). Atualização PARCIAL: o que não
  // veio fica como está. 1 linha só (id=1); o owner não cria nem apaga. envios_min/max NÃO
  // são editados direto, derivam do primeiro/último marco da curva. As CHECKs da migration
  // (curva com >= 2 marcos crescentes; agenda free <= pago) são espelhadas no contrato e
  // revalidadas aqui contra o estado MERGEADO (defesa em profundidade), para erro limpo.
  app.patch(
    '/admin/creditos-catalogo',
    { preHandler: owner, schema: { body: adminAtualizarCreditosCatalogoBody } },
    async (req) => {
      const body = req.body as AdminAtualizarCreditosCatalogoBody
      return await comTransacao(app.pool, async (cli) => {
        // 1) Estado atual (lock por linha).
        const { rows: atualRows } = await cli.query<{
          curva: CurvaPonto[]
          cortesia_inicial: number
          agenda_teto_free: number
          agenda_teto_pago: number
        }>(
          `select curva, cortesia_inicial, agenda_teto_free, agenda_teto_pago
             from public.creditos_catalogo where id = 1 for update`,
        )
        const atual = atualRows[0]
        if (!atual) throw naoEncontrado('Catálogo de créditos não encontrado')

        // 2) Merge: o body sobrescreve só o que veio; o resto fica.
        const curva = body.curva ?? atual.curva
        const cortesia = body.cortesia_inicial ?? atual.cortesia_inicial
        const agendaFree = body.agenda_teto_free ?? atual.agenda_teto_free
        const agendaPago = body.agenda_teto_pago ?? atual.agenda_teto_pago

        // 3) Revalida o estado mergeado (defesa antes da constraint).
        if (curva.length < 2) {
          throw regraNegocio('catalogo_invalido', 'A curva precisa de ao menos 2 marcos.')
        }
        if (
          curva.some((p, i) => {
            const ant = curva[i - 1]
            return ant !== undefined && p.envios <= ant.envios
          })
        ) {
          throw regraNegocio('catalogo_invalido', 'Os marcos da curva devem ter envios crescentes.')
        }
        if (agendaPago < agendaFree) {
          throw regraNegocio(
            'catalogo_invalido',
            'O teto de agenda após a compra não pode ser menor que o do free.',
          )
        }

        // envios_min/max derivam dos marcos (primeiro/último), bounds do slider.
        const primeiro = curva[0]
        const ultimo = curva[curva.length - 1]
        if (!primeiro || !ultimo) {
          throw regraNegocio('catalogo_invalido', 'A curva precisa de ao menos 2 marcos.')
        }
        const enviosMin = primeiro.envios
        const enviosMax = ultimo.envios

        // 4) Atualiza a linha única e devolve o catálogo corrente.
        const { rows } = await cli.query(
          `update public.creditos_catalogo
              set envios_min = $1, envios_max = $2, curva = $3::jsonb,
                  cortesia_inicial = $4, agenda_teto_free = $5, agenda_teto_pago = $6
            where id = 1
          returning ${COLS_CATALOGO_RETORNO}`,
          [enviosMin, enviosMax, JSON.stringify(curva), cortesia, agendaFree, agendaPago],
        )
        return rows[0]
      })
    },
  )

  // Chave Pix DA PLATAFORMA (config singleton 0059): a chave que vai na mensagem de compra
  // de crédito empurrada ao WhatsApp do usuário (template billing.recarga). Mesmo formato da
  // chave do cobrador (tipo/chave/titular/banco) + comentário livre. Só o owner lê/edita; a
  // chave nunca volta para o usuário final (vai só na mensagem do WhatsApp, via zap).
  app.get(
    '/admin/config-plataforma',
    { preHandler: owner, schema: { response: { 200: configPlataformaSchema } } },
    async () => lerConfigPlataforma(app.pool),
  )

  // PATCH parcial: o que não veio fica como está; `null` LIMPA o campo. 1 linha só (id=1);
  // o owner não cria nem apaga. Nunca loga a chave.
  app.patch(
    '/admin/config-plataforma',
    { preHandler: owner, schema: { body: adminAtualizarConfigPlataformaBody, response: { 200: configPlataformaSchema } } },
    async (req) => {
      const body = req.body as AdminAtualizarConfigPlataformaBody
      return await comTransacao(app.pool, async (cli) => {
        const { rows: atualRows } = await cli.query<{
          pix_tipo: string | null
          pix_chave: string | null
          pix_titular: string | null
          pix_banco: string | null
          pix_comentario: string | null
        }>(
          `select pix_tipo, pix_chave, pix_titular, pix_banco, pix_comentario
             from public.config_plataforma where id = 1 for update`,
        )
        const atual = atualRows[0]
        if (!atual) throw naoEncontrado('Configuração da plataforma não encontrada')

        // Merge: undefined = mantém; null = limpa; string = substitui. (Não usar ?? aqui:
        // null é "limpar", não "manter".)
        const merge = <T,>(novo: T | null | undefined, velho: T | null): T | null =>
          novo === undefined ? velho : novo
        const tipo = merge(body.pix_tipo, atual.pix_tipo)
        const chave = merge(body.pix_chave, atual.pix_chave)
        const titular = merge(body.pix_titular, atual.pix_titular)
        const banco = merge(body.pix_banco, atual.pix_banco)
        const comentario = merge(body.pix_comentario, atual.pix_comentario)

        const { rows } = await cli.query(
          `update public.config_plataforma
              set pix_tipo = $1::tipo_chave_pix, pix_chave = $2, pix_titular = $3,
                  pix_banco = $4, pix_comentario = $5
            where id = 1
          returning pix_tipo, pix_chave, pix_titular, pix_banco, pix_comentario`,
          [tipo, chave, titular, banco, comentario],
        )
        return rows[0]
      })
    },
  )

  // Auditoria de envios (período/status/etapa), com nome do destinatário.
  app.get(
    '/admin/envios',
    { preHandler: owner, schema: { querystring: adminEnviosQuery, response: { 200: adminEnviosResposta } } },
    async (req) => {
      const { itens, total } = await repo.listarEnvios(app.pool, req.query)
      return { itens, total, page: req.query.page, per_page: req.query.per_page }
    },
  )

  // Outbox de notificações ao cobrador (estado da fila + motivo recuperável,
  // ex.: 'sem_template_ativo' quando falta ativar o template, H12.8). Sem PII.
  app.get(
    '/admin/notificacoes',
    { preHandler: owner, schema: { querystring: adminNotificacoesQuery, response: { 200: adminNotificacoesResposta } } },
    async (req) => {
      const { itens, total } = await repo.listarNotificacoes(app.pool, req.query)
      return { itens, total, page: req.query.page, per_page: req.query.per_page }
    },
  )

  // Visão global de avisos (todos os cobradores) para auditoria.
  app.get(
    '/admin/avisos',
    { preHandler: owner, schema: { querystring: adminAvisosQuery, response: { 200: adminAvisosResposta } } },
    async (req) => {
      const { itens, total } = await repo.listarAvisos(app.pool, req.query)
      return { itens, total, page: req.query.page, per_page: req.query.per_page }
    },
  )

  // ---- Conexão do WhatsApp (Baileys) ---------------------------------------
  // O socket vive no `zap` (processo separado). A api só LÊ a sessão (status/QR,
  // tabela whats_sessao) e ENFILEIRA comandos (coluna `comando`); quem age é o
  // zap. Assim o owner cria/derruba a conexão e pega o QR pela tela de admin.

  // Status atual + QR renderizado como imagem (PNG dataURL) quando aguardando.
  app.get('/admin/whatsapp', { preHandler: owner }, async () => {
    const { rows } = await app.pool.query<{
      status: 'desconectado' | 'aguardando_qr' | 'conectado'
      numero: string | null
      qr: string | null
      comando: 'conectar' | 'desconectar' | null
      atualizado_em: Date
    }>(
      `select status, numero, qr, comando, atualizado_em from public.whats_sessao where id = 1`,
    )
    const s = rows[0]
    if (!s) return { status: 'desconectado', numero: null, qr_img: null, comando_pendente: null, atualizado_em: null }

    let qrImg: string | null = null
    if (s.status === 'aguardando_qr' && s.qr) {
      try {
        const qrcode = exigir('qrcode') as GeradorQr
        qrImg = await qrcode.toDataURL(s.qr, { width: 320, margin: 2 })
      } catch {
        qrImg = null // sem o gerador, o front cai no estado "aguardando" sem imagem
      }
    }
    return {
      status: s.status,
      numero: s.numero,
      qr_img: qrImg,
      comando_pendente: s.comando,
      atualizado_em: s.atualizado_em,
    }
  })

  // Enfileira "conectar": o zap (re)abre o socket e emite um QR novo se preciso.
  app.post('/admin/whatsapp/conectar', { preHandler: owner }, async () => {
    await app.pool.query(
      `update public.whats_sessao set comando = 'conectar', comando_em = now() where id = 1`,
    )
    return { comando: 'conectar' as const }
  })

  // Enfileira "desconectar": o zap faz logout e apaga a sessão (exige QR novo).
  app.post('/admin/whatsapp/desconectar', { preHandler: owner }, async () => {
    await app.pool.query(
      `update public.whats_sessao set comando = 'desconectar', comando_em = now() where id = 1`,
    )
    return { comando: 'desconectar' as const }
  })

  // ---- Mini-chat de teste do WhatsApp (diagnóstico) ------------------------
  // O owner cadastra um número de teste e troca mensagens de TEXTO com ele, sem passar
  // pelo template/agendamento do ciclo. A api só enfileira a saída e lê o histórico
  // (whats_teste_*); quem envia/recebe pelo Baileys é o zap (mesma fila/transporte das
  // automáticas). Serve para checar se o número conectado realmente envia/recebe.

  // Número de teste atual (E.164) ou null.
  app.get('/admin/whatsapp/teste/numero', { preHandler: owner }, async () => {
    const { rows } = await app.pool.query<{ telefone: string | null }>(
      `select telefone from public.whats_teste_config where id = 1`,
    )
    return { telefone: rows[0]?.telefone ?? null }
  })

  // Cadastra/edita o número de teste. Aceita E.164 ou null (limpar). Normaliza dígitos.
  app.post(
    '/admin/whatsapp/teste/numero',
    { preHandler: owner, schema: { body: z.object({ telefone: z.string().max(24).nullable() }) } },
    async (req) => {
      const digitos = (req.body.telefone ?? '').replace(/\D/g, '')
      const telefone = digitos.length >= 10 ? `+${digitos}` : null
      await app.pool.query(
        `update public.whats_teste_config set telefone = $1, atualizado_em = now() where id = 1`,
        [telefone],
      )
      return { telefone }
    },
  )

  // Histórico do mini-chat (cronológico: mais antigas primeiro). Horário em SP.
  app.get('/admin/whatsapp/teste/mensagens', { preHandler: owner }, async () => {
    const { rows } = await app.pool.query<{
      id: string
      direcao: 'saida' | 'entrada'
      texto: string
      status: string
      erro: string | null
      horario: string
    }>(
      `select id, direcao, texto, status, erro,
              to_char(criado_em at time zone 'America/Sao_Paulo', 'HH24:MI') as horario
       from public.whats_teste_mensagens
       order by criado_em desc
       limit 100`,
    )
    return { itens: rows.reverse() }
  })

  // Enfileira uma mensagem de saída para o número de teste (o zap drena e envia).
  app.post(
    '/admin/whatsapp/teste/enviar',
    { preHandler: owner, schema: { body: z.object({ texto: z.string().trim().min(1).max(1000) }) } },
    async (req) => {
      const { rows: cfg } = await app.pool.query<{ telefone: string | null }>(
        `select telefone from public.whats_teste_config where id = 1`,
      )
      const telefone = cfg[0]?.telefone ?? null
      if (!telefone) {
        throw regraNegocio('sem_numero_teste', 'Cadastre um número de teste antes de enviar.')
      }
      const { rows } = await app.pool.query<{ id: string }>(
        `insert into public.whats_teste_mensagens (direcao, telefone, texto)
         values ('saida', $1, $2) returning id`,
        [telefone, req.body.texto],
      )
      return { id: rows[0]!.id, status: 'agendado' as const }
    },
  )
}
