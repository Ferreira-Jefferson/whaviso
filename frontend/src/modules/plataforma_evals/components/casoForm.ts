// Formulario de caso que se adapta ao tipo da suite. Funcoes puras: estado do formulario <->
// payload (entrada/esperado) validado contra os schemas gerados por tipo.
import {
  evalPayloadPorTipo,
  type EvalCaso,
  type EvalTipo,
} from '@/shared/contracts/_generated/plataforma_evals'

export interface FormCaso {
  nome: string
  peso: string
  // nlu_intencao
  texto: string
  nluTipo: string
  nluItens: string
  foraDeEscopo: boolean
  // harness_turno
  persona: string
  historico: string
  desfecho: string
  rubrica: string
  naoVaza: boolean
  handoffEsperado: boolean
  scopeLock: boolean
  // rag_faithfulness
  consulta: string
}

export const FORM_VAZIO: FormCaso = {
  nome: '',
  peso: '1',
  texto: '',
  nluTipo: '',
  nluItens: '',
  foraDeEscopo: false,
  persona: '',
  historico: '',
  desfecho: '',
  rubrica: '',
  naoVaza: false,
  handoffEsperado: false,
  scopeLock: false,
  consulta: '',
}

export type ResultadoPayload =
  | { ok: true; nome: string; peso: number; entrada: Record<string, unknown>; esperado: Record<string, unknown> }
  | { ok: false; erro: string }

const linhas = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean)

/** "autor: texto" por linha -> turnos do historico. Linha sem ":" e recusada. */
function lerHistorico(s: string): { autor: string; texto: string }[] | null {
  const turnos: { autor: string; texto: string }[] = []
  for (const l of linhas(s)) {
    const i = l.indexOf(':')
    if (i <= 0) return null
    turnos.push({ autor: l.slice(0, i).trim(), texto: l.slice(i + 1).trim() })
  }
  return turnos
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const bool = (v: unknown): boolean => v === true

export function formDeCaso(caso: EvalCaso): FormCaso {
  const e = caso.entrada
  const x = caso.esperado
  const hist = Array.isArray(e.historico) ? (e.historico as { autor?: unknown; texto?: unknown }[]) : []
  return {
    ...FORM_VAZIO,
    nome: caso.nome,
    peso: String(caso.peso),
    texto: str(e.texto),
    consulta: str(e.consulta),
    persona: str(e.persona),
    historico: hist.map((t) => `${str(t.autor)}: ${str(t.texto)}`).join('\n'),
    nluTipo: str(x.tipo),
    nluItens: Array.isArray(x.itens) ? (x.itens as unknown[]).map(str).join('\n') : '',
    foraDeEscopo: bool(x.foraDeEscopo),
    desfecho: str(x.desfecho),
    rubrica: str(x.rubrica),
    naoVaza: bool(x.naoVaza),
    handoffEsperado: bool(x.handoffEsperado),
    scopeLock: bool(x.scopeLock),
  }
}

function rascunho(tipo: EvalTipo, f: FormCaso, historico: { autor: string; texto: string }[]) {
  const opc = <T,>(v: T, vazio: boolean): T | undefined => (vazio ? undefined : v)
  switch (tipo) {
    case 'nlu_intencao':
      return {
        entrada: { texto: f.texto },
        esperado: {
          tipo: f.nluTipo,
          itens: opc(linhas(f.nluItens), linhas(f.nluItens).length === 0),
          foraDeEscopo: opc(true, !f.foraDeEscopo),
        },
      }
    case 'harness_turno':
      return {
        entrada: {
          texto: f.texto,
          persona: opc(f.persona.trim(), f.persona.trim() === ''),
          historico: opc(historico, historico.length === 0),
        },
        esperado: {
          desfecho: opc(f.desfecho.trim(), f.desfecho.trim() === ''),
          rubrica: opc(f.rubrica.trim(), f.rubrica.trim() === ''),
          naoVaza: opc(true, !f.naoVaza),
          handoffEsperado: opc(true, !f.handoffEsperado),
          scopeLock: opc(true, !f.scopeLock),
        },
      }
    case 'rag_faithfulness':
      return {
        entrada: { consulta: f.consulta },
        esperado: { rubrica: opc(f.rubrica.trim(), f.rubrica.trim() === '') },
      }
    case 'rag_retrieval':
      return { entrada: {}, esperado: {} }
  }
}

/** Remove chaves `undefined` para o corpo ficar enxuto (o schema do servidor e estrito). */
function limpar(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
}

export function montarPayload(tipo: EvalTipo, f: FormCaso): ResultadoPayload {
  const nome = f.nome.trim()
  if (nome === '') return { ok: false, erro: 'Informe o nome do caso.' }
  const peso = Number(f.peso.replace(',', '.'))
  if (!Number.isFinite(peso) || peso <= 0 || peso > 100) return { ok: false, erro: 'O peso deve ser maior que 0 e no máximo 100.' }
  const historico = lerHistorico(f.historico)
  if (historico === null) return { ok: false, erro: 'No histórico, escreva cada turno como "autor: texto" (um por linha).' }
  const r = rascunho(tipo, f, historico)
  const entrada = limpar(r.entrada)
  const esperado = limpar(r.esperado)
  const schemas = evalPayloadPorTipo[tipo]
  const e1 = schemas.entrada.safeParse(entrada)
  if (!e1.success) return { ok: false, erro: mensagem(tipo, 'entrada') }
  const e2 = schemas.esperado.safeParse(esperado)
  if (!e2.success) return { ok: false, erro: mensagem(tipo, 'esperado') }
  return { ok: true, nome, peso, entrada, esperado }
}

function mensagem(tipo: EvalTipo, parte: 'entrada' | 'esperado'): string {
  if (parte === 'entrada') {
    return tipo === 'rag_faithfulness' ? 'Informe a consulta (até 4000 caracteres).' : 'Informe o texto da mensagem (até 4000 caracteres).'
  }
  return tipo === 'nlu_intencao'
    ? 'Informe o tipo esperado da intenção (até 60 caracteres).'
    : 'Confira os campos esperados: há valor acima do limite de tamanho.'
}
