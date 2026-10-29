// retroalimentar_base (AT-realimentar): o PRODUTOR do loop de realimentacao do RAG. Observa conversas
// e gera RASCUNHOS de documento (producao automatica); nada e indexado sem aprovacao do dono (promocao
// manual, na api). Tres passos num ciclo (lote periodico ou sob demanda):
//   1. coletarSinais: handoff => lacuna; resposta humana => correcao; duvida recorrente => recorrente.
//      Anonimiza ANTES de qualquer LLM e enfileira em rag_feedback (append-only).
//   2. gerarRascunhos: para cada sinal novo, com a chave da LOJA, gera o texto (saida Zod, proibido
//      inventar), passa pela trava de dado vivo (validador do kernel de rag), deduplica e persiste
//      como documentos status='rascunho', origem='realimentado'. Sem credencial, a loja fica inativa.
//   3. expirarRascunhos: sinaliza (evento) os rascunhos vencidos (TTL); a api os arquiva.
// A saida do modelo e DADO (SEC-061): nunca confirma pedido, muda preco nem envia mensagem; so grava
// rascunho. Nunca loga conteudo de conversa nem PII (SEC-024): so ids, tipo e contadores. Nunca lanca.
import type { Executor } from '@whaviso/shared/db'
import type { Logger } from '@whaviso/shared/logger'
import { CODIGO, type ServicoLlm } from '../../shared/llm_client'
import { validarConteudoConhecimento } from '../../shared/rag'
import { anonimizar, type ContextoAnonimizacao } from './anonimizar'
import { montarMensagens } from './prompt'
import * as repo from './repo'
import { assinatura, hashConteudo, jaccard } from './texto'
import {
  JANELA_COLETA_DIAS,
  LIMIAR_DEDUP,
  MAX_RASCUNHOS_POR_LOTE,
  MAX_SINAIS_POR_LOTE,
  MIN_CORPO_CARACTERES,
  N_RECORRENCIA,
  ORIGEM_LLM,
  RascunhoGerado,
  TTL_RASCUNHO_DIAS,
  type CandidatoConhecimento,
  type DesfechoRascunho,
  type ResumoColeta,
  type ResumoGeracao,
  type ResumoRetroalimentacao,
} from './tipos'
import { escopoLoja } from '../../shared/escopo'

export interface DepsRetro {
  /** Executor sob o role whaviso_atendente (le conversas/documentos, grava rag_feedback/rascunho/eventos). */
  exec: Executor
  servico: ServicoLlm
  logger: Logger
  /** Janela de observacao (dias). */
  janelaDias?: number
  /** N de conversas distintas para recorrencia. */
  nRecorrencia?: number
  /** TTL do rascunho (dias). */
  ttlDias?: number
}

const ctxAnon = (nome: string | null, logradouros: string[] | null): ContextoAnonimizacao => ({
  nomeCliente: nome,
  logradouros: logradouros ?? [],
})

// ------------------------------------------------------------------ coleta de sinais

/** Coleta os tres tipos de sinal da janela e os enfileira (texto ja anonimizado). Nunca lanca. */
export async function coletarSinais(deps: DepsRetro, agora: Date = new Date()): Promise<ResumoColeta> {
  const resumo: ResumoColeta = { lacunas: 0, correcoes: 0, recorrentes: 0 }
  const janela = deps.janelaDias ?? JANELA_COLETA_DIAS
  const desde = new Date(agora.getTime() - janela * 24 * 60 * 60 * 1000)

  // 1) Lacuna: conversa que caiu para humano. A pergunta nao respondida vira o sinal.
  try {
    const linhas = await repo.coletarConversasHandoff(deps.exec, desde, MAX_SINAIS_POR_LOTE)
    for (const l of linhas) {
      const pergunta = anonimizar(l.pergunta ?? '', ctxAnon(l.nome_cliente, l.logradouros))
      if (!pergunta) continue
      await repo.enfileirarSinal(deps.exec, {
        lojaId: l.loja_id,
        tipo: 'lacuna',
        conversaId: l.conversa_id,
        mensagemId: l.mensagem_id,
        texto: pergunta,
        ocorrencias: 1,
      })
      resumo.lacunas++
    }
  } catch (erro) {
    deps.logger.error({ err: erro }, 'coleta de lacunas falhou')
  }

  // 2) Correcao humana: a resposta do atendente humano, pareada com a pergunta do cliente.
  try {
    const linhas = await repo.coletarRespostasHumanas(deps.exec, desde, MAX_SINAIS_POR_LOTE)
    for (const l of linhas) {
      const ctx = ctxAnon(l.nome_cliente, l.logradouros)
      const resposta = anonimizar(l.resposta ?? '', ctx)
      if (!resposta) continue
      const pergunta = anonimizar(l.pergunta ?? '', ctx)
      const texto = pergunta
        ? `Pergunta do cliente: ${pergunta}\nResposta do atendente: ${resposta}`
        : `Resposta do atendente: ${resposta}`
      await repo.enfileirarSinal(deps.exec, {
        lojaId: l.loja_id,
        tipo: 'correcao_humana',
        conversaId: l.conversa_id,
        mensagemId: l.mensagem_id,
        texto,
        ocorrencias: 1,
      })
      resumo.correcoes++
    }
  } catch (erro) {
    deps.logger.error({ err: erro }, 'coleta de correcoes humanas falhou')
  }

  // 3) Recorrente: a mesma duvida em N conversas distintas, sem bater em documento aprovado.
  try {
    resumo.recorrentes = await coletarRecorrentes(deps, desde)
  } catch (erro) {
    deps.logger.error({ err: erro }, 'coleta de recorrentes falhou')
  }

  return resumo
}

interface Grupo {
  rep: { texto: string; conversaId: string; mensagemId: string; nome: string | null; logradouros: string[] | null }
  conversas: Set<string>
}

async function coletarRecorrentes(deps: DepsRetro, desde: Date): Promise<number> {
  const n = deps.nRecorrencia ?? N_RECORRENCIA
  const linhas = await repo.coletarPerguntasClientes(deps.exec, desde, MAX_SINAIS_POR_LOTE * 10)

  // Agrupa por (loja, assinatura normalizada) contando conversas DISTINTAS.
  const grupos = new Map<string, Grupo>()
  for (const l of linhas) {
    const bruto = l.pergunta ?? ''
    const assin = assinatura(bruto)
    if (!assin) continue
    const chave = `${l.loja_id}::${assin}`
    const g = grupos.get(chave)
    if (g) {
      g.conversas.add(l.conversa_id)
    } else {
      grupos.set(chave, {
        rep: {
          texto: anonimizar(bruto, ctxAnon(l.nome_cliente, l.logradouros)),
          conversaId: l.conversa_id,
          mensagemId: l.mensagem_id,
          nome: l.nome_cliente,
          logradouros: l.logradouros,
        },
        conversas: new Set([l.conversa_id]),
      })
    }
  }

  let criados = 0
  const cacheExistentes = new Map<string, string[]>()
  for (const [chave, g] of grupos) {
    if (g.conversas.size < n || !g.rep.texto) continue
    const lojaId = chave.split('::')[0]!
    if (!cacheExistentes.has(lojaId)) cacheExistentes.set(lojaId, await repo.recorrentesExistentes(deps.exec, lojaId))
    const existentes = cacheExistentes.get(lojaId)!
    // Nao duplica uma duvida recorrente ja enfileirada (mesma assinatura ~ alta similaridade).
    if (existentes.some((t) => jaccard(t, g.rep.texto) >= LIMIAR_DEDUP)) continue
    await repo.enfileirarSinal(deps.exec, {
      lojaId,
      tipo: 'recorrente',
      conversaId: g.rep.conversaId,
      mensagemId: g.rep.mensagemId,
      texto: g.rep.texto,
      ocorrencias: g.conversas.size,
    })
    existentes.push(g.rep.texto)
    criados++
  }
  return criados
}

// ------------------------------------------------------------------ geracao de rascunhos

/**
 * Gera rascunhos para os sinais novos (uma tentativa por sinal, marcada em eventos). Anonimizacao ja
 * ocorreu na coleta; aqui passa pelo LLM da loja, trava de dado vivo, dedup e persiste 'rascunho'.
 */
export async function gerarRascunhos(deps: DepsRetro): Promise<ResumoGeracao> {
  const resumo: ResumoGeracao = { rascunhos: 0, descartados: 0, duplicados: 0, dadoVivo: 0, semLlm: 0, erros: 0 }
  const ttl = deps.ttlDias ?? TTL_RASCUNHO_DIAS
  const semOrcamento = new Set<string>() // lojas que estouraram o teto neste lote
  const comNovos = new Set<string>()

  let pendentes: repo.SinalPendente[]
  try {
    pendentes = await repo.sinaisPendentesGeracao(deps.exec, MAX_RASCUNHOS_POR_LOTE)
  } catch (erro) {
    deps.logger.error({ err: erro }, 'leitura de sinais pendentes falhou')
    return resumo
  }

  for (const sinal of pendentes) {
    if (semOrcamento.has(sinal.loja_id)) continue
    try {
      const desfecho = await gerarUm(deps, sinal)
      switch (desfecho) {
        case 'rascunho':
          resumo.rascunhos++
          comNovos.add(sinal.loja_id)
          break
        case 'descartado':
          resumo.descartados++
          break
        case 'duplicado':
          resumo.duplicados++
          break
        case 'dado_vivo':
          resumo.dadoVivo++
          break
        case 'sem_llm':
          resumo.semLlm++
          semOrcamento.add(sinal.loja_id) // teto/indisponivel: nao insiste nessa loja neste lote
          break
        default:
          resumo.erros++
      }
    } catch (erro) {
      // Falha inesperada (rede/banco): so ids e nome do erro no log (sem conteudo, sem PII).
      deps.logger.error({ loja_id: sinal.loja_id, feedback_id: sinal.id, erro: (erro as Error)?.name }, 'geracao de rascunho falhou')
      resumo.erros++
    }
  }

  // Evento para o painel (sem PII): ha sugestoes de conhecimento pendentes de curadoria.
  for (const lojaId of comNovos) {
    try {
      const pendentesLoja = await repo.contarPendentes(deps.exec, lojaId, ttl)
      await repo.emitirSugestoesPendentes(deps.exec, lojaId, { novos: 1, pendentes: pendentesLoja })
    } catch (erro) {
      deps.logger.error({ loja_id: lojaId, err: erro }, 'evento de sugestoes pendentes falhou')
    }
  }

  return resumo
}

async function gerarUm(deps: DepsRetro, sinal: repo.SinalPendente): Promise<DesfechoRascunho> {
  const r = await deps.servico.completarEstruturado(
    { exec: deps.exec, escopo: escopoLoja(sinal.loja_id), origem: ORIGEM_LLM, mensagens: montarMensagens(sinal.tipo, sinal.texto) },
    RascunhoGerado,
  )

  if (!r.ok) {
    // Sem credencial / teto estourado: a loja fica inativa; NAO marca (retoma quando houver chave/orcamento).
    if (r.erro.codigo === CODIGO.indisponivel || r.erro.codigo === CODIGO.limite || r.erro.codigo === CODIGO.limiteExcedido || r.erro.codigo === CODIGO.chaveInvalida) {
      return 'sem_llm'
    }
    // Saida invalida ou recusa de conteudo: antilixo. Marca para nao re-tentar o mesmo sinal ruim.
    if (r.erro.codigo === CODIGO.saidaInvalida || r.erro.codigo === CODIGO.conteudo) {
      await repo.marcarTentado(deps.exec, sinal.id, sinal.loja_id, { resultado: 'descartado', motivo: 'saida_invalida' })
      return 'descartado'
    }
    // Erro tecnico transitorio: nao marca (tenta de novo no proximo lote).
    return 'erro'
  }

  const g = r.valor.dados
  // Antilixo: modelo nao achou conhecimento estavel, ou corpo insignificante.
  if (!g.util || g.corpo.trim().length < MIN_CORPO_CARACTERES) {
    await repo.marcarTentado(deps.exec, sinal.id, sinal.loja_id, { resultado: 'descartado', motivo: 'sem_conteudo' })
    return 'descartado'
  }

  // Trava de dado vivo (RAG.md 3): reutiliza o validador deterministico do kernel de rag. Rascunho que
  // cheira a preco/disponibilidade/status/PII/segredo e descartado, nunca promovido.
  const validacao = validarConteudoConhecimento(`${g.titulo}\n${g.corpo}`)
  if (!validacao.ok) {
    await repo.marcarTentado(deps.exec, sinal.id, sinal.loja_id, { resultado: 'descartado', motivo: 'dado_vivo', categorias: validacao.motivos })
    return 'dado_vivo'
  }

  // Dedup e antilixo: hash exato + similaridade com documentos aprovados e rascunhos pendentes.
  const hash = hashConteudo(g.corpo)
  const duplicado =
    (await repo.existeDocumentoComHash(deps.exec, sinal.loja_id, hash)) ||
    (await repo.documentosParaDedup(deps.exec, sinal.loja_id)).some((d) => jaccard(d.conteudo, g.corpo) >= LIMIAR_DEDUP)
  if (duplicado) {
    await repo.marcarTentado(deps.exec, sinal.id, sinal.loja_id, { resultado: 'descartado', motivo: 'duplicado' })
    return 'duplicado'
  }

  const candidato: CandidatoConhecimento = {
    tipo: g.tipo,
    titulo: g.titulo.trim(),
    corpo: g.corpo.trim(),
    origem: 'realimentado',
    confianca: g.confianca,
    fonteConversaId: sinal.conversa_id,
    fonteMensagemId: sinal.mensagem_id,
    hashConteudo: hash,
  }
  const documentoId = await repo.inserirRascunho(deps.exec, sinal.loja_id, candidato)
  // Marca a tentativa e registra o vinculo sinal->rascunho (sem PII). A api correlaciona na curadoria
  // (o role atendente nao atualiza rag_feedback.documento_rascunho_id: isso e triagem da api).
  await repo.marcarTentado(deps.exec, sinal.id, sinal.loja_id, { resultado: 'rascunho', documento_id: documentoId })
  deps.logger.info({ loja_id: sinal.loja_id, documento_id: documentoId, tipo: g.tipo }, 'rascunho de conhecimento gerado')
  return 'rascunho'
}

// ------------------------------------------------------------------ TTL

/** Sinaliza (evento) os rascunhos realimentados vencidos; a api os arquiva (role atendente nao da UPDATE). */
export async function expirarRascunhos(deps: DepsRetro): Promise<number> {
  const ttl = deps.ttlDias ?? TTL_RASCUNHO_DIAS
  let n = 0
  try {
    const vencidos = await repo.rascunhosExpirados(deps.exec, ttl, MAX_SINAIS_POR_LOTE)
    for (const d of vencidos) {
      await repo.marcarExpirado(deps.exec, d.id, d.loja_id)
      n++
    }
  } catch (erro) {
    deps.logger.error({ err: erro }, 'expiracao de rascunhos falhou')
  }
  return n
}

// ------------------------------------------------------------------ ciclo completo

/** Ciclo completo (lote periodico ou sob demanda): coleta + geracao + TTL. Nunca lanca. */
export async function retroalimentar(deps: DepsRetro, agora: Date = new Date()): Promise<ResumoRetroalimentacao> {
  const coleta = await coletarSinais(deps, agora)
  const geracao = await gerarRascunhos(deps)
  const expirados = await expirarRascunhos(deps)
  return { coleta, geracao, expirados }
}
