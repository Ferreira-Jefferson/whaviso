import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { comTransacao } from '@whaviso/shared/db'
import {
  adminAtualizarUsuarioBody,
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

export const adminRoutes: FastifyPluginAsync = async (raiz) => {
  const app = raiz.withTypeProvider<ZodTypeProvider>()
  const owner = app.requireRole('owner')

  // ---- Templates UNIFICADOS por chave (tabela `templates`) ------------------
  // Mesma maquinaria do ciclo (propor versão -> aprovar -> ativar -> apagar), mas
  // sobre a tabela unificada, com conteúdo ESTRUTURADO (texto + botões + mídia) e
  // chaveado por `chave`. É a casa futura de TODA mensagem; hoje serve a família
  // resposta.* (respostas a botão). O zap lê daqui e renderiza (shared/templates).

  app.get('/admin/mensagens', { preHandler: owner }, async () => {
    const { rows } = await app.pool.query(
      `select id, chave, contexto, nome_meta, idioma, conteudo, variaveis, versao, status_meta, ativo, criado_em,
              categoria, meta_template_id, meta_submetido_em, meta_motivo, exemplos
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
      // O nome_meta é DERIVADO no servidor, nunca vem do cliente: cada versão de uma
      // (chave, contexto) recebe um nome próprio (base + próximo número), para que ao
      // submeter à Meta seja um template NOVO (CREATE) sem colidir nem mexer no aprovado.
      // base = nome da versão ativa (ou mais recente) sem o sufixo numérico; a 1ª versão
      // de uma chave nova deriva da própria chave. versao = max por (chave, contexto) + 1.
      const { rows } = await app.pool.query(
        `insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, versao, status_meta, ativo, categoria, exemplos)
         select $1, $2::template_contexto,
           case
             when v.max_versao is null
               then replace($1, '.', '_') || case when $2::template_contexto = 'revisao' then '_revisao' else '' end
             else v.base || '_' || (v.max_versao + 1)
           end,
           $3, $4::jsonb, $5::jsonb,
           coalesce(v.max_versao, 0) + 1,
           'pendente', false, $6, $7::jsonb
         from (
           select
             max(versao) as max_versao,
             (select regexp_replace(nome_meta, '_[0-9]+$', '')
                from public.templates
               where chave = $1 and contexto = $2::template_contexto
               order by ativo desc, versao desc
               limit 1) as base
           from public.templates where chave = $1 and contexto = $2::template_contexto
         ) v
         returning id, chave, nome_meta, versao, status_meta, ativo`,
        [
          req.body.chave,
          req.body.contexto,
          req.body.idioma,
          JSON.stringify(req.body.conteudo),
          JSON.stringify(req.body.variaveis),
          req.body.categoria,
          JSON.stringify(req.body.exemplos),
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

  // Submissão à Meta: o owner enfileira a versão para a Meta VALIDAR (a api não fala com a
  // Meta; só marca meta_acao='criar'). O zap drena (sincronizar_templates), cria/edita o
  // template na WABA e o status_meta passa a refletir o veredito REAL (pendente em análise,
  // aprovado/rejeitado via webhook/reconcile): o painel nunca liga status_meta na mão, a
  // Meta é quem decide. Só submete o que ainda não foi aprovado.
  app.post(
    '/admin/mensagens/:id/submeter',
    { preHandler: owner, schema: { params: idParam } },
    async (req) => {
      const { rows } = await app.pool.query(
        `select id, status_meta from public.templates where id=$1`,
        [req.params.id],
      )
      const t = rows[0]
      if (!t) throw naoEncontrado('Mensagem não encontrada')
      if (t.status_meta === 'aprovado') {
        throw conflito('template_ja_aprovado', 'Esta versão já está aprovada na Meta.')
      }
      const { rows: upd } = await app.pool.query(
        `update public.templates set meta_acao='criar', meta_motivo=null where id=$1
         returning id, status_meta, meta_acao`,
        [req.params.id],
      )
      return { id: upd[0].id, status_meta: upd[0].status_meta, meta_acao: upd[0].meta_acao }
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

  // Usuários (profiles), paginado e com busca por nome/telefone.
  app.get(
    '/admin/usuarios',
    { preHandler: owner, schema: { querystring: adminUsuariosQuery, response: { 200: adminUsuariosResposta } } },
    async (req) => {
      const { itens, total } = await repo.listarUsuarios(app.pool, req.query)
      return { itens, total, page: req.query.page, per_page: req.query.per_page }
    },
  )

  // Suspensão/reativação da conta. Suspenso = bloqueado na api (403 em toda rota
  // autenticada; ver shared/auth). Não apaga dados; reativar volta ao normal.
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

  // ---- Conexão do WhatsApp (Meta Cloud API) --------------------------------
  // O transporte vive no `zap` (processo separado), que valida token+phone_id e grava
  // o status na tabela whats_sessao. A api só LÊ o status/numero para a tela de admin.
  // Não há QR nem comando de conectar/desconectar: a conexão é por credenciais (env).

  // Status atual da conexão (status + número de exibição).
  app.get('/admin/whatsapp', { preHandler: owner }, async () => {
    const { rows } = await app.pool.query<{
      status: string
      numero: string | null
      atualizado_em: Date
    }>(`select status, numero, atualizado_em from public.whats_sessao where id = 1`)
    const s = rows[0]
    if (!s) return { status: 'desconectado' as const, numero: null, atualizado_em: null }
    // Só 'conectado'/'desconectado' hoje; qualquer valor legado da tabela cai em 'desconectado'.
    const status = s.status === 'conectado' ? ('conectado' as const) : ('desconectado' as const)
    return { status, numero: s.numero, atualizado_em: s.atualizado_em }
  })

  // ---- Mini-chat de teste do WhatsApp (diagnóstico) ------------------------
  // O owner cadastra um número de teste e troca mensagens de TEXTO com ele, sem passar
  // pelo template/agendamento do ciclo. A api só enfileira a saída e lê o histórico
  // (whats_teste_*); quem envia/recebe pela Meta Cloud API é o zap (mesma fila/transporte das
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
