// Contratos de borda do modulo configuracoes_llm. Fonte unica: os schemas vivem em
// @whaviso/shared/contracts/configuracoes_llm (o codegen reemite para o front). Schemas
// estritos (SEC-081). Nenhum schema de SAIDA carrega a chave (SEC-020): o estado so expoe
// metadados. O enum `provedorLlm` e transversal (enums.ts), importado da barra geral.
//
// O pool de chaves da plataforma (abaixo) e novo e NAO tem pacote compartilhado ainda: schemas
// locais deste modulo (o front mantem Zod proprio, igual aos demais modulos de plataforma).
import { z } from 'zod'
import { provedorLlm } from '@whaviso/shared/contracts'

export {
  CredencialLlmEntrada,
  CredencialLlmPatch,
  CredencialLlmTestarEntrada,
  CredencialLlmEstado,
  CredencialLlmTesteSaida,
  UsoLlmResumo,
  resultadoValidacaoLlm,
  type ResultadoValidacaoLlm,
} from '@whaviso/shared/contracts'
export { provedorLlm, type ProvedorLlm } from '@whaviso/shared/contracts'

// ---- Pool de chaves de LLM da plataforma (admin) ----------------------------------------------

/** Item do pool (metadado; NUNCA a chave). */
export const PoolLlmItem = z.strictObject({
  id: z.uuid(),
  nome: z.string(),
  provedor: provedorLlm,
  ultimos4: z.string().nullable(),
  ativo: z.boolean(),
  criado_em: z.string().nullable(),
  atualizado_em: z.string().nullable(),
})
export type PoolLlmItem = z.infer<typeof PoolLlmItem>
export const PoolLlmLista = z.array(PoolLlmItem)

export const PoolLlmCriar = z.strictObject({
  nome: z.string().trim().min(1).max(80),
  provedor: provedorLlm.default('openrouter'),
  chave: z.string().trim().min(1).max(500),
})
export type PoolLlmCriar = z.infer<typeof PoolLlmCriar>

export const PoolLlmPatch = z
  .strictObject({
    nome: z.string().trim().min(1).max(80).optional(),
    ativo: z.boolean().optional(),
    /** Presente = rotaciona a chave; ausente = nao mexe. */
    chave: z.string().trim().min(1).max(500).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'informe ao menos um campo para alterar' })
export type PoolLlmPatch = z.infer<typeof PoolLlmPatch>

/** Atribuicao pelo operador: a loja passa a usar esta chave do pool em vez da propria. */
export const PoolLlmAtribuicao = z.strictObject({ pool_chave_id: z.uuid() })
export type PoolLlmAtribuicao = z.infer<typeof PoolLlmAtribuicao>

export const PoolIdParam = z.strictObject({ id: z.uuid() })
export const LojaIdParam = z.strictObject({ lojaId: z.uuid() })
