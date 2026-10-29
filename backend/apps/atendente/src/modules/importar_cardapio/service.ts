// importar_cardapio (AT-importar): consumidor da fila `importacoes_cardapio`. Reivindica um job
// (FOR UPDATE SKIP LOCKED), le o arquivo, extrai o cardapio com a chave de LLM da LOJA (visao +
// estruturacao validada por Zod) e grava o RASCUNHO (rascunho_pronto) ou um CODIGO de erro.
// A saida do modelo e DADO: nada vai ao cardapio sem aprovacao do dono (SEC-060/061).
// Falha fechada: LLM indisponivel/erro tecnico deixa o job retentavel ate MAX_TENTATIVAS; nada aqui
// derruba o laco de drenagem. Nunca loga bytes, rascunho, texto do modelo nem a chave (SEC-024/026).
import { comTransacao, type Pool } from '@whaviso/shared/db'
import type { Logger } from '@whaviso/shared/logger'
import { RascunhoCardapio } from '@whaviso/shared/contracts'
import type { ErroProvedor } from '@whaviso/shared/clientes'
import { CODIGO, type ServicoLlm } from '../../shared/llm_client'
import { INSTRUCAO_VISAO, montarMensagensEstrutura, semCardapio } from './prompt'
import * as repo from './repo'
import {
  CODIGO_ERRO,
  MAX_JOBS_POR_DRENAGEM,
  MAX_TENTATIVAS,
  MIMES_SUPORTADOS,
  ORIGEM_LLM,
  type CodigoErro,
  type Desfecho,
  type JobImportacao,
  type ResumoDrenagem,
} from './tipos'
import { escopoLoja } from '../../shared/escopo'

export interface DepsImportador {
  pool: Pool
  servico: ServicoLlm
  logger: Logger
}

type Falha = { permanente: CodigoErro } | { retentavel: true }

/** Traduz o erro do provedor em codigo permanente (a api mapeia) ou em retentavel. */
function classificar(erro: ErroProvedor): Falha {
  switch (erro.codigo) {
    case CODIGO.indisponivel:
    case CODIGO.chaveInvalida:
      return { permanente: CODIGO_ERRO.naoConfigurada }
    case CODIGO.limiteExcedido:
    case CODIGO.limite:
      return { permanente: CODIGO_ERRO.limiteExcedido }
    case CODIGO.conteudo:
      // Recusa 4xx do provedor ao receber a imagem/PDF: o modelo configurado nao le o arquivo.
      return { permanente: CODIGO_ERRO.semVisao }
    case CODIGO.saidaInvalida:
      return { permanente: CODIGO_ERRO.extracaoInvalida }
    default:
      return erro.retentavel ? { retentavel: true } : { permanente: CODIGO_ERRO.erroInterno }
  }
}

type Extracao = { ok: true; rascunho: RascunhoCardapio } | { ok: false; falha: Falha }

async function extrair(deps: DepsImportador, job: JobImportacao, bytes: Uint8Array): Promise<Extracao> {
  // Passo 1: visao (imagem ou PDF) -> transcricao em texto.
  const v = await deps.servico.descreverImagem({
    exec: deps.pool,
    escopo: escopoLoja(job.lojaId),
    origem: ORIGEM_LLM,
    imagem: { bytes: new Uint8Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength), mimeType: job.mime },
    instrucao: INSTRUCAO_VISAO,
  })
  if (!v.ok) return { ok: false, falha: classificar(v.erro) }
  if (semCardapio(v.valor.descricao)) return { ok: false, falha: { permanente: CODIGO_ERRO.extracaoInvalida } }

  // Passo 2: texto -> RascunhoCardapio, validado pelo schema do contrato (1 reparo no ServicoLlm).
  const e = await deps.servico.completarEstruturado(
    {
      exec: deps.pool,
      escopo: escopoLoja(job.lojaId),
      origem: ORIGEM_LLM,
      mensagens: montarMensagensEstrutura(v.valor.descricao),
    },
    RascunhoCardapio,
  )
  if (!e.ok) return { ok: false, falha: classificar(e.erro) }
  // Cardapio vazio = nada lido: erro claro em vez de rascunho vazio para o dono.
  if (e.valor.dados.categorias.length === 0) return { ok: false, falha: { permanente: CODIGO_ERRO.extracaoInvalida } }
  return { ok: true, rascunho: e.valor.dados }
}

/** Reivindica e processa UM job. `excluir` = jobs ja tocados nesta drenagem. */
export async function processarProximoJob(
  deps: DepsImportador,
  excluir: readonly string[] = [],
): Promise<{ desfecho: Desfecho; id?: string }> {
  const job = await comTransacao(deps.pool, (tx) => repo.reivindicar(tx, excluir))
  if (!job) return { desfecho: 'vazio' }

  const bytes = job.arquivoBytes
  if (!bytes || bytes.byteLength === 0 || !(MIMES_SUPORTADOS as readonly string[]).includes(job.mime)) {
    await repo.concluirErro(deps.pool, job.id, CODIGO_ERRO.arquivoInvalido)
    return { desfecho: 'erro', id: job.id }
  }

  let resultado: Extracao
  try {
    resultado = await extrair(deps, job, bytes)
  } catch (erro) {
    // Falha inesperada (rede/banco): so o nome do erro e os ids vao ao log (sem PII, sem conteudo).
    deps.logger.error(
      { importacao_id: job.id, loja_id: job.lojaId, erro: (erro as Error)?.name },
      'importacao de cardapio: falha inesperada',
    )
    resultado = { ok: false, falha: { retentavel: true } }
  }

  if (resultado.ok) {
    await repo.concluirRascunho(deps.pool, job.id, resultado.rascunho)
    return { desfecho: 'rascunho_pronto', id: job.id }
  }

  const falha = resultado.falha
  if ('retentavel' in falha) {
    // Esta tentativa conta: no teto vira erro definitivo; senao volta para a fila (proximo tick).
    if (job.tentativas + 1 >= MAX_TENTATIVAS) {
      await repo.concluirErro(deps.pool, job.id, CODIGO_ERRO.provedorIndisponivel)
      return { desfecho: 'erro', id: job.id }
    }
    await repo.reenfileirar(deps.pool, job.id)
    return { desfecho: 'reenfileirado', id: job.id }
  }
  deps.logger.warn(
    { importacao_id: job.id, loja_id: job.lojaId, codigo: falha.permanente },
    'importacao de cardapio falhou',
  )
  await repo.concluirErro(deps.pool, job.id, falha.permanente)
  return { desfecho: 'erro', id: job.id }
}

/**
 * Drena a fila: ate `max` jobs por chamada, cada job tocado no maximo uma vez (um retry espera o
 * proximo tick). Nunca lanca: erro de um job e logado e a drenagem encerra o ciclo.
 */
export async function drenarImportacoes(deps: DepsImportador, max = MAX_JOBS_POR_DRENAGEM): Promise<ResumoDrenagem> {
  const resumo: ResumoDrenagem = { rascunhos: 0, erros: 0, reenfileirados: 0 }
  const tocados: string[] = []
  for (let i = 0; i < max; i++) {
    try {
      const r = await processarProximoJob(deps, tocados)
      if (r.desfecho === 'vazio') break
      if (r.id) tocados.push(r.id)
      if (r.desfecho === 'rascunho_pronto') resumo.rascunhos += 1
      else if (r.desfecho === 'erro') resumo.erros += 1
      else resumo.reenfileirados += 1
    } catch (erro) {
      deps.logger.error({ erro: (erro as Error)?.name }, 'drenagem de importacoes interrompida')
      break
    }
  }
  return resumo
}
