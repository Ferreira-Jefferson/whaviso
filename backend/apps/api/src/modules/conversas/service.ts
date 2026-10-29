// Regra do modulo. Sem acesso HTTP aqui; erros de dominio via shared/http_errors.
// Nunca logar conteudo de mensagem nem telefone (SEC-024): so ids e codigos.
import { comTransacao, notificar, type Executor, type Pool } from '@whaviso/shared/db'
import { Conflito, NaoEncontrado, Proibido } from '../../shared/http_errors'
import { codificarCursor, decodificarCursor } from './cursor'
import { janela24h } from './janela'
import {
  buscarConversa,
  listarConversas,
  listarMensagens,
  membroDoUsuarioNaLoja,
  pedidoDaConversa,
  type LinhaConversa,
  type LinhaMensagem,
} from './repo'
import {
  encerrarConversa,
  enfileirarTextoLivre,
  inserirMensagemHumana,
  registrarEvento,
  respostaJaEnfileirada,
  tocarConversa,
  travarConversa,
} from './repo_escrita'
import type {
  ConversaDetalheSaida,
  ConversaListaItem,
  MensagemSaida,
} from './schemas'
import type { StatusConversa } from '@whaviso/shared/contracts'

export type Relogio = () => Date

const naoAchou = () => new NaoEncontrado('Conversa nao encontrada', 'conversa_nao_encontrada')

function rotuloCliente(l: LinhaConversa): { id: string; nome: string | null; rotulo: string } {
  return { id: l.cliente_id, nome: l.cliente_nome, rotulo: l.cliente_nome ?? `Cliente ${l.telefone_hash.slice(-4)}` }
}

function paraItem(l: LinhaConversa, agora: Date): ConversaListaItem {
  return {
    id: l.id,
    status: l.status,
    cliente: rotuloCliente(l),
    ultima_mensagem:
      l.prev_direcao && l.prev_tipo && l.prev_criado_em
        ? { previa: l.prev_previa, direcao: l.prev_direcao, tipo: l.prev_tipo, criado_em: l.prev_criado_em.toISOString() }
        : null,
    nao_lidas: l.nao_lidas,
    atualizado_em: l.atualizado_em.toISOString(),
    ...janela24h(l.ultima_entrada_em, agora),
  }
}

function paraMensagem(m: LinhaMensagem): MensagemSaida {
  return {
    id: m.id,
    conversa_id: m.conversa_id,
    direcao: m.direcao,
    autor: m.autor,
    tipo: m.tipo,
    conteudo: m.conteudo,
    transcricao: m.transcricao,
    midia_ref: m.midia_ref,
    criado_em: m.criado_em.toISOString(),
  }
}

export async function listar(
  exec: Executor,
  lojaId: string,
  f: { status?: StatusConversa; busca?: string; cursor?: string; limite: number },
  agora: Date,
) {
  const linhas = await listarConversas(exec, lojaId, {
    status: f.status,
    busca: f.busca,
    cursor: f.cursor ? decodificarCursor(f.cursor) : undefined,
    limite: f.limite,
  })
  const pagina = linhas.slice(0, f.limite)
  const ultima = pagina[pagina.length - 1]
  const temMais = linhas.length > f.limite && ultima
  return {
    itens: pagina.map((l) => paraItem(l, agora)),
    proximo_cursor: temMais ? codificarCursor({ instante: ultima.cursor_t, id: ultima.id }) : null,
  }
}

export async function abrir(
  exec: Executor,
  lojaId: string,
  conversaId: string,
  userId: string,
  agora: Date,
): Promise<ConversaDetalheSaida> {
  const l = await buscarConversa(exec, lojaId, conversaId)
  if (!l) throw naoAchou()
  const pedido = await pedidoDaConversa(exec, lojaId, conversaId)
  // Handoff: alguem segura a conversa e, em caso afirmativo, se e o proprio usuario (para
  // habilitar devolver/responder no painel). So consultamos o membro quando ha dono.
  const temAtendente = l.atendido_por_membro_id !== null
  const meuMembro = temAtendente ? await membroDoUsuarioNaLoja(exec, userId, lojaId) : null
  return {
    id: l.id,
    status: l.status,
    cliente: rotuloCliente(l),
    numero_whatsapp: { id: l.numero_id, status: l.numero_status },
    humano_desde: l.humano_desde ? l.humano_desde.toISOString() : null,
    tem_atendente: temAtendente,
    atendido_por_mim: temAtendente && meuMembro !== null && l.atendido_por_membro_id === meuMembro,
    nao_lidas: l.nao_lidas,
    pedido_ligado: pedido,
    criado_em: l.criado_em.toISOString(),
    atualizado_em: l.atualizado_em.toISOString(),
    ...janela24h(l.ultima_entrada_em, agora),
  }
}

/** Historico para tras: cada pagina vem em ordem cronologica; o cursor aponta para a mais antiga. */
export async function historico(
  exec: Executor,
  lojaId: string,
  conversaId: string,
  f: { cursor?: string; limite: number },
) {
  if (!(await buscarConversa(exec, lojaId, conversaId))) throw naoAchou()
  const linhas = await listarMensagens(
    exec,
    lojaId,
    conversaId,
    f.limite,
    f.cursor ? decodificarCursor(f.cursor) : undefined,
  )
  const pagina = linhas.slice(0, f.limite)
  const maisAntiga = pagina[pagina.length - 1]
  const temMais = linhas.length > f.limite && maisAntiga
  return {
    itens: [...pagina].reverse().map(paraMensagem),
    proximo_cursor: temMais ? codificarCursor({ instante: maisAntiga.cursor_t, id: maisAntiga.id }) : null,
  }
}

/** "Nao lida" e derivada (entrada mais nova que a ultima saida): marcar e no-op documentado. */
export async function marcarLida(exec: Executor, lojaId: string, conversaId: string): Promise<{ ok: true }> {
  if (!(await buscarConversa(exec, lojaId, conversaId))) throw naoAchou()
  return { ok: true }
}

export async function responder(
  pool: Pool,
  lojaId: string,
  conversaId: string,
  userId: string,
  texto: string,
  agora: Date,
  chaveIdempotencia?: string,
) {
  return comTransacao(pool, async (tx) => {
    const c = await travarConversa(tx, lojaId, conversaId)
    if (!c) throw naoAchou()
    // Idempotencia de request: o lock de travarConversa serializa dois POSTs iguais (duplo clique
    // ou retry) na MESMA conversa; o segundo so chega aqui depois do commit do primeiro. Se a
    // resposta desta chave ja foi enfileirada, devolve a original sem criar segunda mensagem/envio.
    const dedupeChave = chaveIdempotencia ? 'conversa_resp:' + chaveIdempotencia : undefined
    if (dedupeChave) {
      const previa = await respostaJaEnfileirada(tx, lojaId, conversaId, c.numero_whatsapp_id, dedupeChave)
      if (previa) return { mensagem: paraMensagem(previa.mensagem), envio_id: previa.envioId }
    }
    if (c.status === 'encerrada') throw new Conflito('Conversa encerrada', 'conversa_encerrada')
    if (c.status === 'ia' || c.status === 'aguardando') {
      throw new Conflito('A conversa esta com a automacao; assuma o atendimento antes de responder', 'conversa_com_ia')
    }
    // status === 'humano': so o atendente que assumiu responde (spec step 6).
    if (c.atendido_por_membro_id === null) {
      throw new Conflito('Assuma o atendimento antes de responder', 'conversa_nao_assumida')
    }
    const meuMembro = await membroDoUsuarioNaLoja(tx, userId, lojaId)
    if (meuMembro === null || c.atendido_por_membro_id !== meuMembro) {
      throw new Proibido('Esta conversa esta com outro atendente; so quem assumiu pode responder', 'nao_e_o_atendente')
    }
    if (!janela24h(c.ultima_entrada_em, agora).janela_aberta) {
      throw new Conflito(
        'Janela de 24h fechada: texto livre nao pode ser enviado. Use um template aprovado.',
        'janela_fechada',
      )
    }
    if (c.numero_status !== 'conectado') {
      throw new Conflito('Numero de WhatsApp indisponivel', 'numero_indisponivel')
    }
    // Mensagem e outbox na MESMA transacao: falha em um desfaz o outro.
    const msg = await inserirMensagemHumana(tx, lojaId, conversaId, texto)
    const envioId = await enfileirarTextoLivre(tx, {
      lojaId,
      conversaId,
      numeroId: c.numero_whatsapp_id,
      clienteId: c.cliente_id,
      destinatarioHash: c.telefone_hash,
      texto,
      mensagemId: msg.id,
      dedupeChave,
    })
    // Com dedupeChave, o `do nothing` pode nao retornar id so se ja houvesse envio com a chave;
    // o pre-check acima ja teria curto-circuitado, entao aqui envioId sempre existe.
    if (!envioId) throw new Conflito('Resposta ja enfileirada', 'resposta_duplicada')
    await tocarConversa(tx, lojaId, conversaId)
    await registrarEvento(tx, {
      lojaId,
      tipo: 'conversa.resposta_enviada',
      conversaId,
      detalhes: { mensagem_id: msg.id, envio_id: envioId },
    })
    // NOTIFY so sai no COMMIT; payload so referencia (sem conteudo, sem telefone).
    await notificar(tx, {
      tipo: 'conversa.mensagem',
      loja_id: lojaId,
      payload: { conversa_id: conversaId, loja_id: lojaId, direcao: 'saida', autor: 'humano' },
    })
    return { mensagem: paraMensagem(msg), envio_id: envioId }
  })
}

export async function encerrar(pool: Pool, lojaId: string, conversaId: string, motivo?: string) {
  return comTransacao(pool, async (tx) => {
    const c = await travarConversa(tx, lojaId, conversaId)
    if (!c) throw naoAchou()
    if (c.status === 'encerrada') throw new Conflito('Conversa ja encerrada', 'conversa_encerrada')
    await encerrarConversa(tx, lojaId, conversaId)
    await registrarEvento(tx, {
      lojaId,
      tipo: 'conversa.encerrada',
      conversaId,
      detalhes: { de: c.status, motivo: motivo ?? 'nao_informado' },
    })
    await notificar(tx, {
      tipo: 'conversa.handoff',
      loja_id: lojaId,
      payload: { conversa_id: conversaId, loja_id: lojaId, status: 'encerrada' },
    })
    return { id: conversaId, status: 'encerrada' as const }
  })
}
