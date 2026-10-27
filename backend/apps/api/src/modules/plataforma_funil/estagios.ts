// Regras puras do funil de aquisicao (sem banco, sem HTTP). Estagios: novo, contato, proposta,
// ativo, perdido. `ativo` e terminal e SO nasce do vinculo de conta (o funil nunca mente sobre
// quem virou cliente); por isso nunca e alvo de mudanca manual de estagio.
import type { EstagioProspecto } from '@whaviso/shared/contracts'

/** Matriz de transicoes (inclui `ativo` como destino logico; a rota manual o recusa). */
export const TRANSICOES: Readonly<Record<EstagioProspecto, readonly EstagioProspecto[]>> = {
  novo: ['contato', 'perdido'],
  contato: ['proposta', 'perdido', 'novo'],
  proposta: ['ativo', 'perdido', 'contato'],
  perdido: ['novo'], // reabrir
  ativo: [],
}

/** Estagios dos quais ainda se pode vincular conta (fechar). Perdido precisa reabrir antes. */
export const ESTAGIOS_VINCULAVEIS: readonly EstagioProspecto[] = ['novo', 'contato', 'proposta']

export type ResultadoTransicao = { ok: true } | { ok: false; code: string; message: string }

/** Valida uma mudanca MANUAL de estagio. */
export function validarTransicaoManual(de: EstagioProspecto, para: EstagioProspecto): ResultadoTransicao {
  if (para === 'ativo') {
    return {
      ok: false,
      code: 'estagio_ativo_via_vinculo',
      message: 'O estagio ativo so e alcancado ao vincular a conta do restaurante',
    }
  }
  if (de === 'ativo') {
    return { ok: false, code: 'estagio_terminal', message: 'Prospecto ativo nao muda de estagio' }
  }
  if (!TRANSICOES[de].includes(para)) {
    return { ok: false, code: 'transicao_invalida', message: `Transicao ${de} -> ${para} nao permitida` }
  }
  return { ok: true }
}

/** Valida se o prospecto pode ser vinculado a uma conta (e virar `ativo`). */
export function validarVinculo(de: EstagioProspecto): ResultadoTransicao {
  if (de === 'ativo') {
    return { ok: false, code: 'prospecto_ja_vinculado', message: 'Prospecto ja esta ativo' }
  }
  if (!ESTAGIOS_VINCULAVEIS.includes(de)) {
    return { ok: false, code: 'estagio_nao_vinculavel', message: 'Reabra o prospecto antes de vincular a conta' }
  }
  return { ok: true }
}

// --- Conclusao de follow-up: atividade e imutavel, entao concluir = nova atividade cuja
// `descricao` e o JSON {"conclui": <id>, "texto": "..."} (texto opcional). ---

const RE_CONCLUI = /^\{"conclui":(\d+)(?:,|\})/

/** Monta a descricao estruturada de uma atividade que conclui um follow-up. */
export function descricaoDeConclusao(atividadeId: number, texto?: string): string {
  return JSON.stringify(texto ? { conclui: atividadeId, texto } : { conclui: atividadeId })
}

/** Le a descricao: devolve o id concluido (se houver) e o texto livre. */
export function lerDescricao(descricao: string | null): { concluiId: number | null; texto: string | null } {
  if (descricao === null) return { concluiId: null, texto: null }
  const m = RE_CONCLUI.exec(descricao)
  if (!m) return { concluiId: null, texto: descricao }
  try {
    const o = JSON.parse(descricao) as { conclui?: unknown; texto?: unknown }
    if (typeof o.conclui === 'number') {
      return { concluiId: o.conclui, texto: typeof o.texto === 'string' ? o.texto : null }
    }
  } catch {
    // texto livre que so parece JSON: trata como texto.
  }
  return { concluiId: null, texto: descricao }
}

/** Descricao livre nao pode imitar a marca de conclusao (evita forjar conclusao pela entrada). */
export function imitaConclusao(descricao: string): boolean {
  return /^\s*\{\s*"conclui"/.test(descricao)
}

// --- Cursor opaco (base64url de JSON), usado nas paginacoes por keyset. ---

export function codificarCursor(valor: object): string {
  return Buffer.from(JSON.stringify(valor), 'utf8').toString('base64url')
}

/** Decodifica; devolve null se malformado (service converte em 422). */
export function decodificarCursor(cursor: string): Record<string, unknown> | null {
  try {
    const o: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    return o !== null && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : null
  } catch {
    return null
  }
}
