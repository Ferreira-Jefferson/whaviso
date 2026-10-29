// Contratos de borda do modulo chaves_api (locais: ainda nao promovidos ao pacote shared).
// Nunca ha loja_id/conta_id no corpo: a conta vem so do parametro de rota.
import { z } from 'zod'

export const ContaParams = z.strictObject({ contaId: z.uuid() })
export const ChaveParams = z.strictObject({ contaId: z.uuid(), id: z.uuid() })

const DataHoraIso = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'data invalida')

export const NovaChave = z.strictObject({
  nome: z.string().trim().min(1).max(80),
  /** Sem validade quando ausente/null. Se informada, precisa estar no futuro. */
  expira_em: DataHoraIso.nullish(),
})
export type NovaChave = z.infer<typeof NovaChave>

export const SituacaoChave = z.enum(['ativa', 'expirada', 'revogada'])
export type SituacaoChave = z.infer<typeof SituacaoChave>

/** Visao publica de uma chave: so mascara. Nunca o valor nem o hash. */
export const ChaveApiDTO = z.strictObject({
  id: z.uuid(),
  nome: z.string(),
  prefixo: z.string(),
  ultimos4: z.string(),
  mascara: z.string(),
  criado_em: z.string(),
  expira_em: z.string().nullable(),
  revogada_em: z.string().nullable(),
  situacao: SituacaoChave,
})
export type ChaveApiDTO = z.infer<typeof ChaveApiDTO>

export const ChaveApiLista = z.strictObject({ itens: z.array(ChaveApiDTO) })

/** Unica resposta que carrega o valor completo: so na criacao. */
export const ChaveApiCriada = z.strictObject({ chave: ChaveApiDTO, valor: z.string() })
