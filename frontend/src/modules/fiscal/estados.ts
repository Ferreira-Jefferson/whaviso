// Rotulos e utilitarios do modulo fiscal.
import type {
  StatusDocumentoFiscal,
  TipoDocumentoFiscal,
  RegimeFiscalDto,
} from '@/shared/contracts/_generated/fiscal'

export const ROTULO_REGIME: Record<RegimeFiscalDto, string> = {
  mei: 'MEI',
  simples_nacional: 'Simples Nacional',
  lucro_presumido: 'Lucro presumido',
  lucro_real: 'Lucro real',
}

export const OPCOES_REGIME = (Object.keys(ROTULO_REGIME) as RegimeFiscalDto[]).map((value) => ({
  value,
  label: ROTULO_REGIME[value],
}))

export const ROTULO_AMBIENTE = { homologacao: 'Homologação (testes)', producao: 'Produção' } as const

export const OPCOES_AMBIENTE = [
  { value: 'homologacao', label: ROTULO_AMBIENTE.homologacao },
  { value: 'producao', label: ROTULO_AMBIENTE.producao },
] as const

export const ROTULO_TIPO: Record<TipoDocumentoFiscal, string> = { nfce: 'NFC-e', nfse: 'NFS-e' }

export const ROTULO_STATUS: Record<StatusDocumentoFiscal, string> = {
  pendente: 'Em emissão',
  emitido: 'Emitido',
  erro: 'Com erro',
}

export const TOM_STATUS: Record<StatusDocumentoFiscal, 'atencao' | 'sucesso' | 'erro'> = {
  pendente: 'atencao',
  emitido: 'sucesso',
  erro: 'erro',
}

/** So dígitos do CNPJ (a api exige 14 dígitos, sem máscara). */
export function soDigitos(v: string): string {
  return v.replace(/\D/g, '')
}

/** 00.000.000/0000-00 (exibição). Devolve o texto original se não tiver 14 dígitos. */
export function formatarCnpj(v: string): string {
  const d = soDigitos(v)
  if (d.length !== 14) return v
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

/** Aceita só links https (a api já garante, aqui é a segunda barreira antes de renderizar um <a>). */
export function linkSeguro(link: string | null): string | null {
  return link && /^https:\/\//i.test(link) ? link : null
}
