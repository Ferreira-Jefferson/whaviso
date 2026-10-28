import { createConnection } from 'node:net'
import { falha, ok, ErroProvedor, Transitorio, type Resultado } from './erros'

// Fronteira ClienteImpressora (impressao termica ESC/POS da comanda).
//
// A comanda (texto colunado) ja e produzida pelo modulo pedidos (comandaTexto, 32 ou 48 colunas).
// Aqui so a transformamos em bytes ESC/POS (init, codepage pt-BR, destaque do cabecalho, corte) e,
// opcionalmente, entregamos esses bytes a uma impressora de rede (RAW TCP, porta de fato 9100).
//
// O PROVEDOR/transporte fica atras desta interface, como os demais Cliente* externos: trocar de
// transporte (TCP, agente local, USB) e uma nova implementacao, sem tocar em quem chama. A ligacao
// e GATED por ambiente (host da impressora ou "nenhum"): SEM impressora configurada o modulo cai no
// STUB no-op (`StubClienteImpressora`), que NUNCA quebra (em dev nao ha hardware de impressao). O
// encoder (`comandaEscPos`) e PURO: nao faz rede e e testado isoladamente.

/** Colunas da bobina: 32 (58 mm) ou 48 (80 mm). Mesma largura usada por comandaTexto. */
export type LarguraBobina = 32 | 48

export interface TrabalhoImpressao {
  /** Texto da comanda ja colunado (saida de comandaTexto), uma linha por `\n`. */
  texto: string
  /** Largura da bobina (so para registro/validacao; o texto ja vem colunado). */
  largura: LarguraBobina
  /** Cortar o papel ao final (default true). */
  cortar?: boolean
  /** Pulso na gaveta de dinheiro ao final (default false). */
  abrirGaveta?: boolean
  /** Numero de vias impressas (default 1; ex.: cozinha + balcao). */
  vias?: number
}

export interface ImprimirResposta {
  /** true quando os bytes foram entregues a impressora; false no stub no-op. */
  impresso: boolean
  /** Tamanho do payload ESC/POS gerado, em bytes (observabilidade; nunca conteudo). */
  bytes: number
}

type R<T> = Promise<Resultado<T, ErroProvedor>>

export interface ClienteImpressora {
  imprimir(trabalho: TrabalhoImpressao): R<ImprimirResposta>
}

// --- Encoder ESC/POS (puro) -------------------------------------------------

const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a

/**
 * Mapa Unicode -> CP860 (DOS Portugues) para as letras acentuadas do pt-BR. A impressora e posta
 * em CP860 (ESC t 3); o que nao estiver aqui e dobrado para ASCII (sem acento) e, se ainda assim
 * nao couber, vira '?'. Assim o acento sai correto na termica pt-BR e nada quebra fora dela.
 */
const CP860: Readonly<Record<string, number>> = {
  'Ç': 0x80, 'ü': 0x81, 'é': 0x82, 'â': 0x83, 'ã': 0x84, 'à': 0x85, 'Á': 0x86, 'ç': 0x87,
  'ê': 0x88, 'Ê': 0x89, 'Í': 0x8b, 'Ô': 0x8c, 'Ã': 0x8e, 'Â': 0x8f, 'É': 0x90, 'À': 0x91,
  'ô': 0x93, 'õ': 0x94, 'Ú': 0x96, 'Õ': 0x99, 'Ü': 0x9a, 'Ó': 0x9f, 'á': 0xa0, 'í': 0xa1,
  'ó': 0xa2, 'ú': 0xa3, 'ñ': 0xa4, 'Ñ': 0xa5, 'ª': 0xa6, 'º': 0xa7,
}

function byteDeChar(ch: string): number {
  const cp = ch.codePointAt(0)
  if (cp === undefined) return 0x3f
  if (cp < 0x80) return cp
  const mapeado = CP860[ch]
  if (mapeado !== undefined) return mapeado
  // Dobra diacriticos para a letra base (ex.: "ś" -> "s") e aceita se virar ASCII.
  const dobrado = ch.normalize('NFD').replace(/[̀-ͯ]/g, '')
  const base = dobrado.codePointAt(0)
  if (base !== undefined && base < 0x80) return base
  return 0x3f // '?'
}

function bytesDaLinha(texto: string): number[] {
  return Array.from(texto, byteDeChar)
}

/**
 * Codifica a comanda em bytes ESC/POS. Puro e deterministico (sem rede, sem relogio). Inicializa a
 * impressora, seleciona CP860, imprime o cabecalho (primeira linha) em destaque centralizado e o
 * corpo alinhado a esquerda, avanca e corta. `vias` repete o corpo; a gaveta pulsa uma vez ao final.
 */
export function comandaEscPos(trabalho: TrabalhoImpressao): Uint8Array {
  const cortar = trabalho.cortar ?? true
  const vias = Math.min(5, Math.max(1, trabalho.vias ?? 1))
  const linhas = trabalho.texto.split('\n')
  const b: number[] = [ESC, 0x40, ESC, 0x74, 0x03] // init + CP860

  for (let via = 0; via < vias; via++) {
    linhas.forEach((linha, i) => {
      if (i === 0) b.push(ESC, 0x61, 0x01, GS, 0x21, 0x11, ESC, 0x45, 0x01) // centro + dobro + negrito
      b.push(...bytesDaLinha(linha), LF)
      if (i === 0) b.push(ESC, 0x45, 0x00, GS, 0x21, 0x00, ESC, 0x61, 0x00) // volta ao normal
    })
    b.push(ESC, 0x64, 0x03) // avanca 3 linhas
    if (cortar) b.push(GS, 0x56, 0x01) // corte parcial
  }
  if (trabalho.abrirGaveta) b.push(ESC, 0x70, 0x00, 0x19, 0xfa) // pulso na gaveta (pino 2)
  return Uint8Array.from(b)
}

// --- Implementacao real: RAW TCP (porta 9100) -------------------------------

/** Transporte para a impressora (injetavel; os testes NUNCA abrem socket real). */
export interface EscritorImpressora {
  escrever(bytes: Uint8Array): Promise<void>
  fechar(): Promise<void>
}
export type Conectar = (host: string, porta: number, timeoutMs: number) => Promise<EscritorImpressora>

const conectarTcp: Conectar = (host, porta, timeoutMs) =>
  new Promise<EscritorImpressora>((resolve, reject) => {
    const socket = createConnection({ host, port: porta })
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => {
      socket.setTimeout(0)
      resolve({
        escrever: (bytes) =>
          new Promise<void>((res, rej) => socket.write(bytes, (e) => (e ? rej(e) : res()))),
        fechar: () => new Promise<void>((res) => socket.end(() => res())),
      })
    })
    socket.once('timeout', () => {
      socket.destroy()
      reject(new Error('tempo de conexao esgotado'))
    })
    socket.once('error', reject)
  })

export interface ConfigImpressoraTcp {
  /** Host/IP da impressora na rede local. */
  host: string
  /** Porta RAW (default 9100). */
  porta?: number
  /** Teto por impressao (conexao + escrita), em ms (default 8000). */
  timeoutMs?: number
  /** Injecao para teste (nunca socket real na suite). */
  conectar?: Conectar
}

function erroTransporte(e: unknown): ErroProvedor {
  if (e instanceof ErroProvedor) return e
  // Falha de impressao e sempre retentavel (impressora pode estar offline/sem papel momentaneamente).
  const codigo = e instanceof Error && 'code' in e && typeof e.code === 'string' ? e.code : 'impressora_rede'
  return new Transitorio('falha ao falar com a impressora', { codigo })
}

class ClienteImpressoraTcp implements ClienteImpressora {
  readonly #host: string
  readonly #porta: number
  readonly #timeoutMs: number
  readonly #conectar: Conectar

  constructor(cfg: ConfigImpressoraTcp) {
    this.#host = cfg.host
    this.#porta = cfg.porta ?? 9100
    this.#timeoutMs = cfg.timeoutMs ?? 8000
    this.#conectar = cfg.conectar ?? conectarTcp
  }

  async imprimir(trabalho: TrabalhoImpressao): R<ImprimirResposta> {
    const bytes = comandaEscPos(trabalho)
    let escritor: EscritorImpressora
    try {
      escritor = await this.#conectar(this.#host, this.#porta, this.#timeoutMs)
    } catch (e) {
      return falha(erroTransporte(e))
    }
    try {
      await escritor.escrever(bytes)
    } catch (e) {
      return falha(erroTransporte(e))
    } finally {
      try {
        await escritor.fechar()
      } catch {
        // fechar e best-effort; a impressao ja saiu.
      }
    }
    return ok({ impresso: true, bytes: bytes.length })
  }
}

export function criarImpressoraTcp(cfg: ConfigImpressoraTcp): ClienteImpressora {
  return new ClienteImpressoraTcp(cfg)
}

// --- Stub no-op (sem impressora configurada) --------------------------------

/**
 * Stub de producao/dev quando nao ha impressora: NUNCA envia nada e NUNCA quebra. Ainda codifica a
 * comanda para reportar o tamanho do payload (observabilidade), mas responde `impresso: false`.
 */
export class StubClienteImpressora implements ClienteImpressora {
  async imprimir(trabalho: TrabalhoImpressao): R<ImprimirResposta> {
    return ok({ impresso: false, bytes: comandaEscPos(trabalho).length })
  }
}

/**
 * Monta o ClienteImpressora real a partir do ambiente (convencao API_*). Gating por OPT-IN
 * explicito: so devolve a impressora TCP quando `API_IMPRESSORA_PROVEDOR=escpos_tcp` e ha
 * `API_IMPRESSORA_HOST`. Sem isso (dev/offline/testes), devolve `null` e o chamador cai no stub.
 *   API_IMPRESSORA_PROVEDOR   'escpos_tcp' para ativar (default: ausente -> stub)
 *   API_IMPRESSORA_HOST       host/IP da impressora na rede local (obrigatorio quando ativo)
 *   API_IMPRESSORA_PORTA      opcional: porta RAW (default 9100)
 *   API_IMPRESSORA_TIMEOUT_MS opcional: teto por impressao (default 8000)
 */
export function criarImpressoraDoAmbiente(
  env: Record<string, string | undefined> = process.env,
): ClienteImpressora | null {
  if ((env.API_IMPRESSORA_PROVEDOR ?? '').trim().toLowerCase() !== 'escpos_tcp') return null
  const host = env.API_IMPRESSORA_HOST?.trim()
  if (!host) return null
  const inteiro = (v: string | undefined) => {
    const n = v?.trim() ? Number(v.trim()) : NaN
    return Number.isInteger(n) && n > 0 ? n : undefined
  }
  return criarImpressoraTcp({
    host,
    porta: inteiro(env.API_IMPRESSORA_PORTA),
    timeoutMs: inteiro(env.API_IMPRESSORA_TIMEOUT_MS),
  })
}
