// Tipos e constantes do consumidor de importacao de cardapio (AT-importar). Tudo que o modelo devolve
// e DADO validado por Zod (SEC-061); o codigo de erro gravado em `importacoes_cardapio.erro` e um
// CODIGO curto fixo (a api so mostra mensagem fixa por codigo, nunca texto cru do provedor).

/** Modulo chamador gravado em `uso_llm.origem` (tipo_uso fica no default 'geracao'). */
export const ORIGEM_LLM = 'importar_cardapio'

/** Tentativas maximas por job (espelha o teto da api: `cardapio_importacao`). */
export const MAX_TENTATIVAS = 3

/** Teto de jobs por drenagem; cada job e tocado no maximo uma vez por drenagem (sem rajada de retry). */
export const MAX_JOBS_POR_DRENAGEM = 5

/** Codigos de erro gravados (a api mapeia llm_sem_visao, llm_nao_configurada e extracao_invalida; o resto cai na mensagem generica). */
export const CODIGO_ERRO = {
  semVisao: 'llm_sem_visao',
  naoConfigurada: 'llm_nao_configurada',
  extracaoInvalida: 'extracao_invalida',
  limiteExcedido: 'limite_excedido',
  provedorIndisponivel: 'provedor_indisponivel',
  arquivoInvalido: 'arquivo_invalido',
  erroInterno: 'erro_interno',
} as const
export type CodigoErro = (typeof CODIGO_ERRO)[keyof typeof CODIGO_ERRO]

export const MIMES_SUPORTADOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const

/** Job reivindicado (so o necessario; o binario vive so em memoria e e descartado ao concluir). */
export interface JobImportacao {
  id: string
  lojaId: string
  tipoArquivo: 'imagem' | 'pdf'
  mime: string
  arquivoBytes: Uint8Array | null
  tentativas: number
}

export type Desfecho = 'vazio' | 'rascunho_pronto' | 'erro' | 'reenfileirado'

export interface ResumoDrenagem {
  rascunhos: number
  erros: number
  reenfileirados: number
}
