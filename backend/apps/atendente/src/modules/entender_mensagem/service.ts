// entender_mensagem (AT-entender): transcreve audio (STT) e classifica a intencao do cliente.
// O resultado e DADO: o motor/harness decide (HARNESS-ATENDENTE, SEC-061). Falha fechada: sem LLM
// (credencial ausente, teto, erro), devolve `sem_llm` e o motor segue o fluxo por botoes.
// Nao grava nada: a transcricao volta no resultado para o chamador persistir em `mensagens.transcricao`
// (SEC-024: texto e transcricao nunca vao para log). O audio so existe em memoria e e descartado.
import type { Executor } from '@whaviso/shared/db'
import type { Logger } from '@whaviso/shared/logger'
import type { ErroProvedor } from '@whaviso/shared/clientes'
import { CODIGO, type ServicoLlm } from '../../shared/llm_client'
import { ancorarItem } from './ancoragem'
import { montarMensagens, pareceInjecao } from './prompt'
import {
  IntencaoModelo,
  type CardapioEntendimento,
  type EntradaMensagem,
  type IntencaoEntendida,
  type MotivoSemLlm,
  type ResultadoEntendimento,
} from './tipos'

export const ORIGEM_LLM = 'entender_mensagem'
export const LIMIAR_CONFIANCA_PADRAO = 0.6
export const MAX_BYTES_AUDIO = 16 * 1024 * 1024 // teto de midia do WhatsApp
export const MIMES_AUDIO = ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr', 'audio/wav', 'audio/webm'] as const

export interface DepsEntendedor {
  servico: ServicoLlm
  logger: Logger
  /** Abaixo disto o motor apresenta botoes em vez de agir. */
  limiarConfianca?: number
}

export interface EntenderEntrada {
  exec: Executor
  lojaId: string
  mensagem: EntradaMensagem
  /** Cardapio vivo SOMENTE desta loja (SEC-062). */
  cardapio: CardapioEntendimento
}

export interface Entendedor {
  entender(e: EntenderEntrada): Promise<ResultadoEntendimento>
}

function motivoSemLlm(erro: ErroProvedor): MotivoSemLlm {
  switch (erro.codigo) {
    case CODIGO.indisponivel:
      return 'indisponivel'
    case CODIGO.limiteExcedido:
    case CODIGO.limite:
      return 'limite_excedido'
    case CODIGO.chaveInvalida:
      return 'credencial_recusada'
    default:
      return 'erro_provedor'
  }
}

const mimeBase = (m: string): string => (m.split(';')[0] ?? '').trim().toLowerCase()

export function criarEntendedor(deps: DepsEntendedor): Entendedor {
  const limiar = deps.limiarConfianca ?? LIMIAR_CONFIANCA_PADRAO

  return {
    async entender(e) {
      let texto: string
      let transcricao: string | undefined

      if (e.mensagem.tipo === 'audio') {
        const { bytes, mimeType } = e.mensagem.audio
        const mime = mimeBase(mimeType)
        if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES_AUDIO || !(MIMES_AUDIO as readonly string[]).includes(mime)) {
          return { estado: 'esclarecer', motivo: 'audio_invalido' }
        }
        const t = await deps.servico.transcrever({
          exec: e.exec,
          lojaId: e.lojaId,
          origem: ORIGEM_LLM,
          audio: { bytes, mimeType: mime },
          idioma: 'pt',
        })
        if (!t.ok) {
          deps.logger.warn({ loja_id: e.lojaId, codigo: t.erro.codigo }, 'stt indisponivel ou falhou')
          // Provedor sem audio ou erro tecnico: degrada (o motor pede para escrever, segue por botoes).
          return { estado: 'sem_llm', motivo: motivoSemLlm(t.erro) }
        }
        texto = t.valor.texto.trim()
        if (!texto) return { estado: 'esclarecer', motivo: 'audio_nao_entendido' }
        transcricao = texto
      } else {
        texto = e.mensagem.texto.trim()
      }

      const comTranscricao = transcricao === undefined ? {} : { transcricao }
      const naoEntendi = {
        estado: 'baixa_confianca' as const,
        intencao: { tipo: 'desconhecida' as const, confianca: 0, motivo: 'ambigua' as const },
        foraDeEscopo: false,
        ...comTranscricao,
      }

      if (!texto) return naoEntendi

      // Pre-filtro de injecao: caso obvio nem gasta token da chave da loja (SEC-060).
      if (pareceInjecao(texto)) {
        return {
          estado: 'entendido',
          intencao: { tipo: 'desconhecida', confianca: 1, motivo: 'injecao' },
          confianca: 1,
          foraDeEscopo: true,
          ...comTranscricao,
        }
      }

      const r = await deps.servico.completarEstruturado(
        { exec: e.exec, lojaId: e.lojaId, origem: ORIGEM_LLM, mensagens: montarMensagens(texto, e.cardapio.itens) },
        IntencaoModelo,
      )
      if (!r.ok) {
        deps.logger.warn({ loja_id: e.lojaId, codigo: r.erro.codigo }, 'entendimento de intencao falhou')
        // Saida invalida ou recusada: "nao entendi" (botoes), nunca uma acao.
        if (r.erro.codigo === CODIGO.saidaInvalida || r.erro.codigo === CODIGO.conteudo) return naoEntendi
        return { estado: 'sem_llm', motivo: motivoSemLlm(r.erro) }
      }

      const intencao = r.valor.dados
      const foraDeEscopo =
        intencao.tipo === 'desconhecida' && (intencao.motivo === 'fora_de_escopo' || intencao.motivo === 'injecao')

      if (intencao.confianca < limiar) {
        return { estado: 'baixa_confianca', intencao, foraDeEscopo, ...comTranscricao }
      }

      // Ancoragem: nome citado -> item real. Sem correspondencia ou ambiguo vira esclarecimento.
      let entendida: IntencaoEntendida = intencao
      if (intencao.tipo === 'adicionar_item' || intencao.tipo === 'remover_item' || intencao.tipo === 'alterar_item') {
        const anc = ancorarItem(intencao.item, e.cardapio.itens)
        if (anc.estado === 'sem_correspondencia') {
          return { estado: 'esclarecer', motivo: 'item_sem_correspondencia', citado: anc.citado, ...comTranscricao }
        }
        if (anc.estado === 'ambiguo') {
          return { estado: 'esclarecer', motivo: 'item_ambiguo', citado: anc.citado, candidatos: anc.candidatos, ...comTranscricao }
        }
        entendida = { ...intencao, itemAncorado: anc }
      } else if (intencao.tipo === 'consulta' && intencao.item) {
        // Consulta de item inexistente nao bloqueia: o motor responde pelo cardapio real.
        entendida = { ...intencao, itemAncorado: ancorarItem(intencao.item, e.cardapio.itens) }
      }

      return { estado: 'entendido', intencao: entendida, confianca: intencao.confianca, foraDeEscopo, ...comTranscricao }
    },
  }
}
