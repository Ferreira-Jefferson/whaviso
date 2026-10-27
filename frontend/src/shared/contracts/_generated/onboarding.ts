// GERADO POR scripts/gen_contracts a partir de backend/packages/shared/src/contracts/onboarding.ts.
// NAO EDITAR A MAO: rode `npm run gen:contracts` no backend. Ver historias/00-fundacao/kernel-contratos.md.

// Contratos de borda do modulo onboarding (fonte unica; o codegen reemite para o front).
// Read-model calculado de dados existentes: nenhuma etapa e gravada, nada de PII aqui.
import { z } from 'zod'
import { DataHoraIso } from './primitivos'

/** Etapas do checklist, na ordem em que o painel as exibe. */
export const etapaOnboarding = z.enum(['perfil', 'numero', 'cardapio', 'primeiro_pedido'])
export type EtapaOnboarding = z.infer<typeof etapaOnboarding>

export const OnboardingEtapa = z.strictObject({
  chave: etapaOnboarding,
  concluida: z.boolean(),
  /** Quando a etapa foi cumprida (primeiro registro que a satisfaz); null se pendente ou sem marco. */
  concluida_em: DataHoraIso.nullable(),
})
export type OnboardingEtapa = z.infer<typeof OnboardingEtapa>

export const OnboardingSaida = z.strictObject({
  loja_id: z.uuid(),
  etapas: z.array(OnboardingEtapa),
  concluidas: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  /** 0 a 100, inteiro. */
  percentual: z.number().int().min(0).max(100),
  completo: z.boolean(),
  /** Inicio do onboarding = criacao da loja. */
  iniciado_em: DataHoraIso,
  primeiro_pedido_em: DataHoraIso.nullable(),
  /** Minutos entre a criacao da loja e o 1o pedido real; null enquanto nao houver pedido. */
  tempo_ate_primeiro_pedido_min: z.number().int().nonnegative().nullable(),
})
export type OnboardingSaida = z.infer<typeof OnboardingSaida>
