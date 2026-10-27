// Hub de realtime em memoria (F5, etapas 3 e 5). Recebe cada NOTIFY cru da conexao LISTEN
// unica da instancia, valida, atribui id monotonico e roteia por `loja_id` so aos assinantes
// cujo escopo contem a loja E cujo papel pode ver o tipo. Guarda um buffer curto para
// retomada por Last-Event-ID. Sem I/O: o plugin SSE entrega as mensagens.
// Logs/erros nunca carregam payload (SEC-024).
import { EventoDominio, validarEvento, type EscopoLoja } from '@whaviso/shared/contracts'
import { podeVerEvento } from './permissoes'

export type MensagemHub =
  | { tipo: 'evento'; id: string; evento: EventoDominio }
  | { tipo: 'resync'; motivo: 'reconectou' | 'id_antigo' }
  | { tipo: 'fim'; motivo: 'encerrando' | 'token_expirado' }

export class LimiteExcedido extends Error {
  constructor(public readonly por: 'usuario' | 'loja') {
    super(`limite de conexoes por ${por}`)
    this.name = 'LimiteExcedido'
  }
}

export interface OpcoesHub {
  limitePorUsuario?: number
  limitePorLoja?: number
  tamanhoBuffer?: number
  epoca?: string
}

export interface Assinatura {
  user_id: string
  escopo: Pick<EscopoLoja, 'tipo' | 'loja_ids' | 'papel_por_loja'>
  entregar: (msg: MensagemHub) => void
}

export interface Handle {
  cancelar(): void
  /** Reenvia o que falta apos `ultimoId` (ou `resync` se nao for possivel). */
  retomar(ultimoId: string | null): void
}

interface Item {
  seq: number
  evento: EventoDominio
}

const ID_RE = /^([a-z0-9]{1,12})-(\d{1,15})$/

/** Parser do Last-Event-ID; null se malformado. */
export function lerUltimoId(bruto: string | undefined): { epoca: string; seq: number } | null {
  if (!bruto) return null
  const m = ID_RE.exec(bruto.trim())
  if (!m) return null
  return { epoca: m[1]!, seq: Number(m[2]) }
}

export class HubRealtime {
  private readonly porLoja = new Map<string, Set<Assinatura>>()
  private readonly porUsuario = new Map<string, number>()
  private readonly todos = new Set<Assinatura>()
  private readonly buffer: Item[] = []
  private seq = 0
  readonly epoca: string
  private readonly limiteUsuario: number
  private readonly limiteLoja: number
  private readonly tamanhoBuffer: number

  constructor(opcoes: OpcoesHub = {}) {
    this.epoca = opcoes.epoca ?? Date.now().toString(36)
    this.limiteUsuario = opcoes.limitePorUsuario ?? 5
    this.limiteLoja = opcoes.limitePorLoja ?? 500
    this.tamanhoBuffer = opcoes.tamanhoBuffer ?? 500
  }

  total(): number {
    return this.todos.size
  }

  assinar(a: Assinatura): Handle {
    // SEC-003: so escopo de loja assina; operador (ou qualquer outro tipo) nunca.
    if (a.escopo.tipo !== 'loja') throw new Error('escopo nao-loja nao assina realtime')
    if ((this.porUsuario.get(a.user_id) ?? 0) >= this.limiteUsuario) throw new LimiteExcedido('usuario')
    for (const loja of a.escopo.loja_ids) {
      if ((this.porLoja.get(loja)?.size ?? 0) >= this.limiteLoja) throw new LimiteExcedido('loja')
    }
    this.todos.add(a)
    this.porUsuario.set(a.user_id, (this.porUsuario.get(a.user_id) ?? 0) + 1)
    for (const loja of a.escopo.loja_ids) {
      let set = this.porLoja.get(loja)
      if (!set) this.porLoja.set(loja, (set = new Set()))
      set.add(a)
    }
    let ativo = true
    return {
      cancelar: () => {
        if (!ativo) return
        ativo = false
        this.remover(a)
      },
      retomar: (ultimoId) => {
        if (ativo) this.retomar(a, ultimoId)
      },
    }
  }

  private remover(a: Assinatura): void {
    if (!this.todos.delete(a)) return
    const n = (this.porUsuario.get(a.user_id) ?? 1) - 1
    if (n <= 0) this.porUsuario.delete(a.user_id)
    else this.porUsuario.set(a.user_id, n)
    for (const loja of a.escopo.loja_ids) {
      const set = this.porLoja.get(loja)
      set?.delete(a)
      if (set && set.size === 0) this.porLoja.delete(loja)
    }
  }

  private retomar(a: Assinatura, ultimoId: string | null): void {
    if (ultimoId === null) return
    const lido = lerUltimoId(ultimoId)
    const maisAntigo = this.buffer[0]?.seq ?? this.seq + 1
    if (!lido || lido.epoca !== this.epoca || lido.seq > this.seq || lido.seq + 1 < maisAntigo) {
      a.entregar({ tipo: 'resync', motivo: 'id_antigo' })
      return
    }
    for (const item of this.buffer) {
      if (item.seq > lido.seq) this.entregarSe(a, item)
    }
  }

  private entregarSe(a: Assinatura, item: Item): void {
    if (!podeVerEvento(a.escopo, item.evento.loja_id, item.evento.tipo)) return
    a.entregar({ tipo: 'evento', id: `${this.epoca}-${item.seq}`, evento: item.evento })
  }

  /**
   * Processa um NOTIFY cru. Descarta (false) o que nao for um evento valido: JSON quebrado,
   * envelope/payload fora do contrato, sem loja_id ou loja divergente.
   */
  publicar(bruto: string): boolean {
    let json: unknown
    try {
      json = JSON.parse(bruto)
    } catch {
      return false
    }
    const env = EventoDominio.safeParse(json)
    if (!env.success) return false
    const evento = env.data
    const p = validarEvento(evento.tipo, evento.payload)
    if (!p.success || (p.data as { loja_id: string }).loja_id !== evento.loja_id) return false

    const item: Item = { seq: ++this.seq, evento }
    this.buffer.push(item)
    if (this.buffer.length > this.tamanhoBuffer) this.buffer.shift()
    for (const a of [...(this.porLoja.get(evento.loja_id) ?? [])]) this.entregarSe(a, item)
    return true
  }

  /** Avisa todos que eventos podem ter sido perdidos (reconexao do LISTEN). */
  ressincronizar(): void {
    for (const a of [...this.todos]) a.entregar({ tipo: 'resync', motivo: 'reconectou' })
  }

  /** Graceful shutdown: manda `fim` a todos e solta as assinaturas. */
  encerrar(): void {
    for (const a of [...this.todos]) {
      a.entregar({ tipo: 'fim', motivo: 'encerrando' })
      this.remover(a)
    }
  }
}
