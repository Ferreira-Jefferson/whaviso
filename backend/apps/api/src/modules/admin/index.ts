import { createRequire } from 'node:module'
import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { comTransacao } from '@whaviso/shared/db'
import {
  adminAtualizarPlanoBody,
  adminAtualizarUsuarioBody,
  adminAvisosQuery,
  adminAvisosResposta,
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
import * as repo from './repo'

const idParam = z.object({ id: z.uuid() })

// Catálogo de planos: chaves estáveis. O owner edita VALORES (H11.11), nunca cria
// nem apaga plano; por isso o `id` do PATCH é um enum, não um uuid.
const PLANO_IDS = ['free', 'start', 'profissional', 'plus'] as const
const planoIdParam = z.object({ id: z.enum(PLANO_IDS) })
// Colunas editáveis pelo PATCH (espelha adminAtualizarPlanoBody).
const COLS_EDITAVEIS_PLANO = [
  'nome',
  'preco_centavos',
  'preco_max_centavos',
  'capacidade_agenda',
  'vagas_ativas',
  'envios_min',
  'envios_max',
  'reengajamento_max',
  'permite_recorrente',
  'cadencia_configuravel',
  'menu_texto_livre',
  'informado_pago_habilitado',
  'totais_periodo',
  'somente_leitura',
] as const
// Colunas devolvidas: mesmo shape de GET /v1/billing/planos (planoSchema). O módulo
// billing tem a sua própria lista; aqui é redeclarada de propósito (módulo nunca
// importa módulo, ver AGENTS.md).
const COLS_PLANO_RETORNO = `
  id, nome, preco_centavos, max_avisos_ativos, permite_recorrente,
  capacidade_agenda, vagas_ativas, cadencia_configuravel, menu_texto_livre,
  informado_pago_habilitado, totais_periodo, por_unidade, agenda_por_unidade,
  ativaveis_por_unidade, reengajamento_max, somente_leitura,
  por_envio, envios_min, envios_max, preco_max_centavos
`
// Conjunto COMPLETO de colunas de alavanca/preço que compõem uma VERSÃO do plano
// (espelha public.plano_versoes, ordem fixa). Inclui as não-editáveis pelo body
// (max_avisos_ativos, por_unidade, agenda/ativaveis_por_unidade, edicoes_max), que são
// carregadas do estado atual. Usado para inserir a nova versão e atualizar a corrente.
const COLS_VERSAO = [
  'nome',
  'preco_centavos',
  'max_avisos_ativos',
  'permite_recorrente',
  'capacidade_agenda',
  'vagas_ativas',
  'cadencia_configuravel',
  'menu_texto_livre',
  'informado_pago_habilitado',
  'totais_periodo',
  'por_unidade',
  'agenda_por_unidade',
  'ativaveis_por_unidade',
  'reengajamento_max',
  'edicoes_max',
  'somente_leitura',
  'por_envio',
  'envios_min',
  'envios_max',
  'preco_max_centavos',
] as const

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

  // Troca de plano e/ou suspensão da conta. Suspenso = bloqueado na api (403 em toda
  // rota autenticada; ver shared/auth). Não apaga dados; reativar volta ao normal.
  app.patch(
    '/admin/usuarios/:id',
    { preHandler: owner, schema: { params: idParam, body: adminAtualizarUsuarioBody } },
    async (req) => {
      if (!(await repo.usuarioExiste(app.pool, req.params.id))) {
        throw naoEncontrado('Usuário não encontrado')
      }
      if (req.body.plano_id !== undefined) {
        if (!(await repo.planoExiste(app.pool, req.body.plano_id))) {
          throw regraNegocio('plano_invalido', `Plano "${req.body.plano_id}" não existe.`)
        }
        await repo.definirPlano(app.pool, req.params.id, req.body.plano_id)
      }
      if (req.body.suspenso !== undefined) {
        // Owner não pode se auto-suspender (evita se trancar para fora).
        if (req.body.suspenso && req.params.id === req.userId) {
          throw regraNegocio('auto_suspensao', 'Não é possível suspender a própria conta.')
        }
        await repo.definirSuspenso(app.pool, req.params.id, req.body.suspenso)
      }
      return { id: req.params.id, plano_id: req.body.plano_id ?? null, suspenso: req.body.suspenso }
    },
  )

  // Edição do CATÁLOGO de planos (H11.11/H11.12): preço, limites e recursos. VERSIONADO:
  // cada edição cria uma NOVA versão (plano_versoes, append-only) e avança a versão
  // corrente do plano; assinaturas vigentes NÃO mudam (fixaram a versão contratada, ver
  // billing/assinar + alavancas_do_plano). Vale só para novas contratações. Atualização
  // parcial: os campos não enviados são carregados do estado atual. Owner não cria nem
  // apaga planos. `COLS_EDITAVEIS_PLANO` lista o que o body pode sobrescrever; as demais
  // colunas da versão (max_avisos_ativos, por_unidade, edicoes_max...) são herdadas.
  app.patch(
    '/admin/planos/:id',
    { preHandler: owner, schema: { params: planoIdParam, body: adminAtualizarPlanoBody } },
    async (req) => {
      const id = req.params.id
      const body = req.body as Record<string, unknown>
      const editaveis = new Set<string>(COLS_EDITAVEIS_PLANO)
      return await comTransacao(app.pool, async (cli) => {
        // 1) Estado atual (lock por linha) de todas as colunas da versão.
        const { rows: atualRows } = await cli.query<Record<string, unknown>>(
          `select ${COLS_VERSAO.join(', ')} from public.planos where id = $1 for update`,
          [id],
        )
        const atual = atualRows[0]
        if (!atual) throw naoEncontrado('Plano não encontrado')

        // 2) Merge: body sobrescreve só os campos editáveis enviados; resto herda.
        const valores = COLS_VERSAO.map((c) =>
          editaveis.has(c) && body[c] !== undefined ? body[c] : atual[c],
        )

        // 3) Próxima versão do plano (append-only).
        const { rows: vmax } = await cli.query<{ v: number }>(
          `select coalesce(max(versao), 0) + 1 as v from public.plano_versoes where plano_id = $1`,
          [id],
        )
        const versao = vmax[0]!.v

        // 4) Insere a nova versão (id, plano_id, versao, depois as COLS_VERSAO).
        const insPh = COLS_VERSAO.map((_, i) => `$${i + 3}`).join(', ')
        const { rows: vins } = await cli.query<{ id: string }>(
          `insert into public.plano_versoes (plano_id, versao, ${COLS_VERSAO.join(', ')})
           values ($1, $2, ${insPh}) returning id`,
          [id, versao, ...valores],
        )
        const novaVersaoId = vins[0]!.id

        // 5) Atualiza a OFERTA CORRENTE (planos) + ponteiro da versão corrente.
        const setPlanos = COLS_VERSAO.map((c, i) => `${c} = $${i + 2}`).join(', ')
        await cli.query(
          `update public.planos
              set ${setPlanos}, versao_corrente_id = $${COLS_VERSAO.length + 2}
            where id = $1`,
          [id, ...valores, novaVersaoId],
        )

        // 6) Devolve o catálogo corrente (mesmo shape de GET /v1/billing/planos).
        const { rows } = await cli.query(
          `select ${COLS_PLANO_RETORNO} from public.planos where id = $1`,
          [id],
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
}
