// Tipos, constantes e funcoes puras do editor de perfil da loja (endereco).
// A entrega (zonas) vive na aba Entrega (modules/lojas/entrega) e o horario de atendimento na
// disponibilidade (fonte unica na loja), ambos fora deste formulario.
// Ficam fora dos arquivos de componente para o Fast Refresh (um arquivo = so componentes).
// Montagem no formato do contrato e validacao ficam no FormularioLoja.
import type { Endereco } from '@/shared/contracts/_generated/lojas'

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
