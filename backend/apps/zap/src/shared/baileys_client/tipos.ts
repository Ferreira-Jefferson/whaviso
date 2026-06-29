// O contrato do transporte agora é neutro de provedor e vive em shared/whats. Este
// arquivo re-exporta o contrato e define só o que é específico do Baileys (OpcoesWhats).
export * from '../whats'

/** Opções de inicialização do cliente Baileys (socket, pareamento, ritmo anti-bloqueio). */
export interface OpcoesWhats {
  authDir: string
  phone?: string
  usePairing: boolean
  browser: string
  humanize: boolean
  dryRun: boolean
  gapMin: number
  gapMax: number
  batchSize: number
  batchPauseMin: number
  batchPauseMax: number
  maxPorHora: number
}
