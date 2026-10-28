// Tipos, constantes e funcoes puras dos editores do perfil da loja (endereco, area de entrega).
// O horario de atendimento e as excecoes vivem na disponibilidade (fonte unica na loja), fora deste
// formulario.
// Ficam fora dos arquivos de componente para o Fast Refresh (um arquivo = so componentes).
// Montagem no formato do contrato e validacao ficam no FormularioLoja.
import type { AreaEntrega, Endereco } from '@/shared/contracts/_generated/lojas'

// --- Endereco ---
export interface EnderecoForm {
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  cep: string
}

export const ENDERECO_VAZIO: EnderecoForm = {
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  cep: '',
}

/** true se o usuario nao preencheu nenhum campo (nao envia endereco). */
export function enderecoEmBranco(e: EnderecoForm): boolean {
  return Object.values(e).every((v) => v.trim() === '')
}

export function enderecoParaForm(e: Endereco | null): EnderecoForm {
  if (!e) return { ...ENDERECO_VAZIO }
  return {
    logradouro: e.logradouro,
    numero: e.numero,
    complemento: e.complemento ?? '',
    bairro: e.bairro,
    cidade: e.cidade,
    uf: e.uf,
    cep: e.cep,
  }
}

export function montarEndereco(e: EnderecoForm): Endereco | null {
  if (enderecoEmBranco(e)) return null
  const complemento = e.complemento.trim()
  return {
    logradouro: e.logradouro.trim(),
    numero: e.numero.trim(),
    ...(complemento ? { complemento } : {}),
    bairro: e.bairro.trim(),
    cidade: e.cidade.trim(),
    uf: e.uf.trim(),
    cep: e.cep.trim(),
  }
}

// --- Area de entrega ---
export type ModoArea = 'nenhuma' | 'raio' | 'bairros'

export interface AreaForm {
  modo: ModoArea
  raioKm: string
  lat: string
  lng: string
  bairros: string[]
}

export const AREA_VAZIA: AreaForm = { modo: 'nenhuma', raioKm: '', lat: '', lng: '', bairros: [] }

/** Converte o DTO (ou null) para o estado do formulario. */
export function areaParaForm(a: AreaEntrega | null): AreaForm {
  if (!a) return { ...AREA_VAZIA }
  if (a.modo === 'raio') {
    return { modo: 'raio', raioKm: String(a.raio_km), lat: String(a.centro.lat), lng: String(a.centro.lng), bairros: [] }
  }
  return { modo: 'bairros', raioKm: '', lat: '', lng: '', bairros: [...a.bairros] }
}

export function montarArea(a: AreaForm): AreaEntrega | null {
  if (a.modo === 'nenhuma') return null
  if (a.modo === 'raio') {
    return { modo: 'raio', raio_km: Number(a.raioKm), centro: { lat: Number(a.lat), lng: Number(a.lng) } }
  }
  return { modo: 'bairros', bairros: a.bairros }
}
