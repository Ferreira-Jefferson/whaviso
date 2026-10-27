// SQL do produtor retroalimentar_base: SO o que o grant do whaviso_atendente permite.
//   Le:    conversas/mensagens/clientes/enderecos (origem do sinal), documentos (dedup), credenciais_llm
//          (gate: sem credencial a loja fica inativa), eventos (marcas idempotentes).
//   Grava: rag_feedback (append-only), documentos SOMENTE status='rascunho'+origem='realimentado',
//          eventos (append-only, sem PII). NUNCA grava status='aprovado' nem chunks.
// SQL parametrizado (SEC-080). Nunca loga conteudo de conversa (quem loga e o service, so com ids).
import { consultar, consultarUm, sql, type Executor } from '@whaviso/shared/db'
import { EVENTO, type CandidatoConhecimento, type SinalTipo } from './tipos'

export interface LinhaConversaHandoff {
  conversa_id: string
  loja_id: string
  cliente_id: string
  nome_cliente: string | null
  logradouros: string[] | null
  mensagem_id: string | null
  pergunta: string | null
}

/**
 * Lacuna: conversas que cairam para humano na janela e que ainda nao viraram sinal. A pergunta e a
 * ultima mensagem do cliente ate o momento do handoff (o que a IA nao soube responder).
 */
export async function coletarConversasHandoff(
  exec: Executor,
  desde: Date,
  max: number,
): Promise<LinhaConversaHandoff[]> {
  return consultar<LinhaConversaHandoff>(
    exec,
    sql`select c.id as conversa_id, c.loja_id, c.cliente_id, cl.nome as nome_cliente,
               (select array_agg(e.logradouro) from public.enderecos e where e.cliente_id = c.cliente_id) as logradouros,
               m.id as mensagem_id, coalesce(m.transcricao, m.conteudo) as pergunta
          from public.conversas c
          join public.clientes cl on cl.id = c.cliente_id
          left join lateral (
            select mm.id, mm.conteudo, mm.transcricao
              from public.mensagens mm
             where mm.conversa_id = c.id and mm.autor = 'cliente' and mm.direcao = 'entrada'
               and (c.humano_desde is null or mm.criado_em <= c.humano_desde)
             order by mm.criado_em desc
             limit 1
          ) m on true
         where c.status = 'humano' and coalesce(c.humano_desde, c.atualizado_em) >= ${desde}
           and not exists (
             select 1 from public.rag_feedback f where f.conversa_id = c.id and f.tipo = 'lacuna'
           )
         order by coalesce(c.humano_desde, c.atualizado_em) desc
         limit ${max}`,
  )
}

export interface LinhaCorrecao {
  mensagem_id: string
  conversa_id: string
  loja_id: string
  cliente_id: string
  nome_cliente: string | null
  logradouros: string[] | null
  resposta: string | null
  pergunta: string | null
}

/**
 * Correcao humana: respostas do atendente humano (autor='humano', saida) na janela, pareadas com a
 * ultima pergunta do cliente antes delas. O par pergunta+resposta e o rascunho de maior valor.
 */
export async function coletarRespostasHumanas(
  exec: Executor,
  desde: Date,
  max: number,
): Promise<LinhaCorrecao[]> {
  return consultar<LinhaCorrecao>(
    exec,
    sql`select m.id as mensagem_id, m.conversa_id, c.loja_id, c.cliente_id, cl.nome as nome_cliente,
               (select array_agg(e.logradouro) from public.enderecos e where e.cliente_id = c.cliente_id) as logradouros,
               coalesce(m.transcricao, m.conteudo) as resposta,
               (select coalesce(q.transcricao, q.conteudo) from public.mensagens q
                 where q.conversa_id = c.id and q.autor = 'cliente' and q.direcao = 'entrada'
                   and q.criado_em <= m.criado_em
                 order by q.criado_em desc limit 1) as pergunta
          from public.mensagens m
          join public.conversas c on c.id = m.conversa_id
          join public.clientes cl on cl.id = c.cliente_id
         where m.autor = 'humano' and m.direcao = 'saida' and m.criado_em >= ${desde}
           and not exists (
             select 1 from public.rag_feedback f where f.mensagem_id = m.id and f.tipo = 'correcao_humana'
           )
         order by m.criado_em desc
         limit ${max}`,
  )
}

export interface LinhaPerguntaCliente {
  mensagem_id: string
  conversa_id: string
  loja_id: string
  cliente_id: string
  nome_cliente: string | null
  logradouros: string[] | null
  pergunta: string | null
}

/** Perguntas de cliente (texto) na janela, para agrupar recorrencia em app (normalizacao/assinatura). */
export async function coletarPerguntasClientes(
  exec: Executor,
  desde: Date,
  max: number,
): Promise<LinhaPerguntaCliente[]> {
  return consultar<LinhaPerguntaCliente>(
    exec,
    sql`select m.id as mensagem_id, m.conversa_id, c.loja_id, c.cliente_id, cl.nome as nome_cliente,
               (select array_agg(e.logradouro) from public.enderecos e where e.cliente_id = c.cliente_id) as logradouros,
               coalesce(m.transcricao, m.conteudo) as pergunta
          from public.mensagens m
          join public.conversas c on c.id = m.conversa_id
          join public.clientes cl on cl.id = c.cliente_id
         where m.autor = 'cliente' and m.direcao = 'entrada' and m.tipo = 'texto'
           and m.criado_em >= ${desde}
         order by m.criado_em desc
         limit ${max}`,
  )
}

/** Textos de sinais recorrentes ja enfileirados numa loja (para nao duplicar a mesma duvida). */
export async function recorrentesExistentes(exec: Executor, lojaId: string): Promise<string[]> {
  const rows = await consultar<{ texto: string }>(
    exec,
    sql`select texto from public.rag_feedback where loja_id = ${lojaId} and tipo = 'recorrente'`,
  )
  return rows.map((r) => r.texto)
}

/** Enfileira um sinal em rag_feedback (append-only). Status nasce 'novo'; a api tria depois. */
export async function enfileirarSinal(
  exec: Executor,
  s: { lojaId: string; tipo: SinalTipo; conversaId: string | null; mensagemId: string | null; texto: string; ocorrencias: number },
): Promise<void> {
  await consultar(
    exec,
    sql`insert into public.rag_feedback (loja_id, conversa_id, mensagem_id, tipo, texto, ocorrencias, status)
        values (${s.lojaId}, ${s.conversaId}, ${s.mensagemId}, ${s.tipo}, ${s.texto}, ${s.ocorrencias}, 'novo')`,
  )
}

export interface SinalPendente {
  id: string
  loja_id: string
  tipo: SinalTipo
  texto: string
  conversa_id: string | null
  mensagem_id: string | null
  ocorrencias: number
}

/**
 * Sinais 'novo' ainda sem tentativa de geracao, SO de lojas com credencial de LLM ATIVA (sem
 * credencial a loja fica inativa). A marca `rascunho_tentado` (eventos) garante uma tentativa por
 * sinal (nao re-gasta a chave da loja). Prioriza recorrencia (ocorrencias) e antiguidade.
 */
export async function sinaisPendentesGeracao(exec: Executor, max: number): Promise<SinalPendente[]> {
  return consultar<SinalPendente>(
    exec,
    sql`select f.id, f.loja_id, f.tipo, f.texto, f.conversa_id, f.mensagem_id, f.ocorrencias
          from public.rag_feedback f
         where f.status = 'novo' and f.documento_rascunho_id is null
           and exists (select 1 from public.credenciais_llm cr where cr.loja_id = f.loja_id and cr.ativo = true)
           and not exists (
             select 1 from public.eventos e
              where e.tipo = ${EVENTO.rascunhoTentado} and e.entidade = 'rag_feedback' and e.entidade_id = f.id
           )
         order by f.ocorrencias desc, f.criado_em
         limit ${max}`,
  )
}

export interface DocDedup {
  hash_conteudo: string | null
  titulo: string
  conteudo: string
}

/** Documentos aprovados e rascunhos pendentes da loja, para dedup por hash e similaridade. */
export async function documentosParaDedup(exec: Executor, lojaId: string): Promise<DocDedup[]> {
  return consultar<DocDedup>(
    exec,
    sql`select hash_conteudo, titulo, conteudo
          from public.documentos
         where loja_id = ${lojaId} and status in ('rascunho', 'aprovado')`,
  )
}

/**
 * Persiste um candidato como RASCUNHO. status e origem sao LITERAIS fixos: este caminho nunca produz
 * 'aprovado' (a aprovacao e do dono via api) nem outra origem. Retorna o id do documento criado.
 */
export async function inserirRascunho(exec: Executor, lojaId: string, c: CandidatoConhecimento): Promise<string> {
  const row = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.documentos
          (loja_id, tipo, titulo, conteudo, status, origem, fonte_conversa_id, fonte_mensagem_id, hash_conteudo)
        values (${lojaId}, ${c.tipo}::documento_tipo, ${c.titulo}, ${c.corpo},
                'rascunho'::documento_status, 'realimentado'::documento_origem,
                ${c.fonteConversaId}, ${c.fonteMensagemId}, ${c.hashConteudo})
        returning id`,
  )
  return row!.id
}

/** Marca idempotente da tentativa de geracao de um sinal (eventos, sem PII). */
export async function marcarTentado(
  exec: Executor,
  feedbackId: string,
  lojaId: string,
  detalhes: Record<string, unknown>,
): Promise<void> {
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${lojaId}, ${EVENTO.rascunhoTentado}, 'rag_feedback', ${feedbackId}, 'ia', ${JSON.stringify(detalhes)}::jsonb)`,
  )
}

/** Rascunhos realimentados vencidos (TTL) ainda nao sinalizados como expirados. */
export async function rascunhosExpirados(
  exec: Executor,
  ttlDias: number,
  max: number,
): Promise<Array<{ id: string; loja_id: string }>> {
  return consultar<{ id: string; loja_id: string }>(
    exec,
    sql`select d.id, d.loja_id
          from public.documentos d
         where d.status = 'rascunho' and d.origem = 'realimentado'
           and d.criado_em < now() - make_interval(days => ${ttlDias})
           and not exists (
             select 1 from public.eventos e
              where e.tipo = ${EVENTO.rascunhoExpirado} and e.entidade = 'documento' and e.entidade_id = d.id
           )
         order by d.criado_em
         limit ${max}`,
  )
}

/** Sinaliza um rascunho vencido (a api o arquiva; aqui so emitimos o evento append-only, sem PII). */
export async function marcarExpirado(exec: Executor, documentoId: string, lojaId: string): Promise<void> {
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${lojaId}, ${EVENTO.rascunhoExpirado}, 'documento', ${documentoId}, 'ia', '{}'::jsonb)`,
  )
}

/** Conta rascunhos realimentados ainda na fila (nasceram dentro do TTL), por loja. */
export async function contarPendentes(exec: Executor, lojaId: string, ttlDias: number): Promise<number> {
  const row = await consultarUm<{ n: number }>(
    exec,
    sql`select count(*)::int as n from public.documentos
         where loja_id = ${lojaId} and status = 'rascunho' and origem = 'realimentado'
           and criado_em >= now() - make_interval(days => ${ttlDias})`,
  )
  return row?.n ?? 0
}

/** Evento para o painel: ha sugestoes de conhecimento pendentes de curadoria (sem PII). */
export async function emitirSugestoesPendentes(
  exec: Executor,
  lojaId: string,
  detalhes: { novos: number; pendentes: number },
): Promise<void> {
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${lojaId}, ${EVENTO.sugestoesPendentes}, 'conhecimento', null, 'ia', ${JSON.stringify(detalhes)}::jsonb)`,
  )
}
