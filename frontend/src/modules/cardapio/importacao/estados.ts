// Rotulos, tons e utilitarios de arquivo da importacao de cardapio.
import {
  IMPORTACAO_ARQUIVO_MAX_BYTES,
  type ImportacaoCardapioStatus,
} from '@/shared/contracts/_generated/cardapio_importacao'

export const ROTULO_STATUS: Record<ImportacaoCardapioStatus, string> = {
  fila: 'Na fila',
  processando: 'Lendo o cardápio',
  rascunho_pronto: 'Pronto para revisar',
  erro: 'Não foi possível ler',
  aprovada: 'Aprovada',
  descartada: 'Descartada',
}

export const TOM_STATUS: Record<ImportacaoCardapioStatus, 'neutro' | 'atencao' | 'marca' | 'erro' | 'sucesso'> = {
  fila: 'neutro',
  processando: 'atencao',
  rascunho_pronto: 'marca',
  erro: 'erro',
  aprovada: 'sucesso',
  descartada: 'neutro',
}

/** Status em que o servidor ainda trabalha: a tela faz polling enquanto houver algum. */
export const STATUS_EM_ANDAMENTO: ReadonlyArray<ImportacaoCardapioStatus> = ['fila', 'processando']

export const TIPOS_ACEITOS = 'image/jpeg,image/png,image/webp,application/pdf'
const MIMES = TIPOS_ACEITOS.split(',')

/** Confianca abaixo disto marca o campo como "revisar" no editor. */
export const LIMIAR_CONFIANCA = 0.7

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

/** Valida tipo e tamanho antes de ler o arquivo. Devolve a mensagem de erro ou null. */
export function validarArquivo(arquivo: File): string | null {
  if (!MIMES.includes(arquivo.type)) return 'Use uma foto (JPG, PNG ou WebP) ou um PDF.'
  if (arquivo.size > IMPORTACAO_ARQUIVO_MAX_BYTES) return 'O arquivo passa de 10 MB. Envie uma versão menor.'
  if (arquivo.size === 0) return 'O arquivo está vazio.'
  return null
}

/** Le o arquivo e devolve so o base64 (sem o prefixo "data:...;base64,"). */
export function arquivoParaBase64(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'))
    leitor.onload = () => {
      const texto = typeof leitor.result === 'string' ? leitor.result : ''
      const i = texto.indexOf(',')
      if (i < 0) reject(new Error('Não foi possível ler o arquivo.'))
      else resolve(texto.slice(i + 1))
    }
    leitor.readAsDataURL(arquivo)
  })
}
