// GERADO POR scripts/gen_contracts a partir de backend/packages/shared/src/contracts/numeros_whatsapp.ts.
// NAO EDITAR A MAO: rode `npm run gen:contracts` no backend. Ver historias/00-fundacao/kernel-contratos.md.

// Contratos de borda do modulo numeros_whatsapp (fonte unica; o codegen reemite para o front).
// Schemas Zod estritos da borda (SEC-081): z.strictObject, tamanhos e enums fechados.
//
// IMPORTANTE (segredo): nenhum schema de SAIDA carrega `token` nem o numero em claro.
// `numeroSaida` so expoe metadados nao sensiveis (SEC-020).
//
// A loja efetiva vem do ESCOPO (header `x-loja-id` resolvido pelo kernel), nunca do corpo
// (SEC-002). Por isso `loja_id` NAO entra no corpo de entrada: `strictObject` rejeita a
// chave se o cliente tentar injeta-la.
import { z } from 'zod'
import { statusNumero } from './enums'

const TEXTO_META = z.string().min(1).max(200)

/** Corpo de POST /numeros: conclusao do Embedded Signup. Sem `loja_id` (vem do escopo). */
export const numeroConectarEntrada = z.strictObject({
  codigo: z.string().min(1).max(2048), // code do Embedded Signup; nunca logado
  waba_id: TEXTO_META,
  phone_number_id: TEXTO_META,
})
export type NumeroConectarEntrada = z.infer<typeof numeroConectarEntrada>

/** Corpo de POST /numeros/:id/reconectar: novo code para rotacionar o token. */
export const numeroReconectarEntrada = z.strictObject({
  codigo: z.string().min(1).max(2048),
})
export type NumeroReconectarEntrada = z.infer<typeof numeroReconectarEntrada>

/** Corpo de PATCH /numeros/:id/status. */
export const numeroStatusEntrada = z.strictObject({
  acao: z.enum(['pausar', 'reativar', 'remover']),
})
export type NumeroStatusEntrada = z.infer<typeof numeroStatusEntrada>

/** SAIDA publica: metadados do numero. SEM token e SEM numero em claro. */
export const numeroSaida = z.strictObject({
  id: z.uuid(),
  loja_id: z.uuid(),
  phone_number_id: z.string(),
  waba_id: z.string(),
  status: statusNumero,
  verificado: z.boolean(),
  criado_em: z.string(), // ISO (timestamptz serializado)
})
export type NumeroSaida = z.infer<typeof numeroSaida>

/** Lista de numeros da loja ativa. */
export const listaNumerosSaida = z.strictObject({
  numeros: z.array(numeroSaida),
})
export type ListaNumerosSaida = z.infer<typeof listaNumerosSaida>
