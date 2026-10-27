// GERADO POR scripts/gen_contracts a partir de backend/packages/shared/src/contracts/configuracoes_llm.ts.
// NAO EDITAR A MAO: rode `npm run gen:contracts` no backend. Ver historias/00-fundacao/kernel-contratos.md.

// Contratos de borda do modulo configuracoes_llm (BYO key de LLM da loja). Fonte unica;
// o codegen reemite para o front. Schemas estritos (SEC-081): z.strictObject, tamanhos e
// enums fechados.
//
// SEGREDO (SEC-020): a chave da LLM e WRITE-ONLY. So os contratos de ENTRADA carregam
// `chave`; nenhum contrato de SAIDA tem campo de chave. O estado devolvido ao front e so
// metadado ("configurada, termina em 1234, validada em ..."). A loja efetiva vem do ESCOPO
// (header x-loja-id resolvido pelo kernel), nunca do corpo (SEC-002): por isso `loja_id` nao
// entra em nenhuma entrada e o strictObject rejeita a chave se o cliente tentar injeta-la.
import { z } from 'zod'
import { provedorLlm } from './enums'
import { Centavos, DataHoraIso } from './primitivos'

/**
 * Chave do provedor (write-only). Tamanho plausivel, sem espacos e com trim. Nao validamos o
 * formato especifico aqui (isso e por provedor, no servidor): a borda so barra lixo obvio.
 */
export const ChaveLlm = z
  .string()
  .trim()
  .min(16, 'chave curta demais')
  .max(512, 'chave longa demais')
  .refine((s) => !/\s/.test(s), { message: 'chave nao pode conter espaco' })

/** Modelo preferido (ex.: "anthropic/claude-sonnet-4"): texto curto, opcional. */
export const ModeloPreferido = z.string().trim().min(1).max(120)

// ---- Entradas -------------------------------------------------------------------------------

/** Corpo de PUT /llm/credencial: set (primeiro cadastro) e rotate (troca da chave). */
export const CredencialLlmEntrada = z.strictObject({
  provedor: provedorLlm,
  chave: ChaveLlm, // nunca devolvida, nunca logada, nunca persistida em claro
  modelo_preferido: ModeloPreferido.optional(),
})
export type CredencialLlmEntrada = z.infer<typeof CredencialLlmEntrada>

/**
 * Corpo de PATCH /llm/credencial: ativar/desativar e/ou trocar o modelo, SEM reenviar a chave.
 * `modelo_preferido` nulo limpa o modelo; ausente nao mexe nele.
 */
export const CredencialLlmPatch = z
  .strictObject({
    ativo: z.boolean().optional(),
    modelo_preferido: ModeloPreferido.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'nenhum campo informado' })
export type CredencialLlmPatch = z.infer<typeof CredencialLlmPatch>

/** Corpo de POST /llm/credencial/testar: revalida uma chave do corpo (NUNCA a gravada). */
export const CredencialLlmTestarEntrada = z.strictObject({
  provedor: provedorLlm,
  chave: ChaveLlm,
})
export type CredencialLlmTestarEntrada = z.infer<typeof CredencialLlmTestarEntrada>

// ---- Saidas (sem campo de chave) ------------------------------------------------------------

/** Resultado de uma chamada de teste ao provedor. Nunca ecoa o erro cru do provedor. */
export const resultadoValidacaoLlm = z.enum(['valida', 'invalida', 'indisponivel'])
export type ResultadoValidacaoLlm = z.infer<typeof resultadoValidacaoLlm>

export const CredencialLlmTesteSaida = z.strictObject({ resultado: resultadoValidacaoLlm })
export type CredencialLlmTesteSaida = z.infer<typeof CredencialLlmTesteSaida>

/**
 * Estado da credencial da loja. SEM campo de chave (SEC-020). `configurada` deriva de
 * existencia + `ativo`: a loja so tem IA ligada quando ha credencial ativa. Quando nao ha
 * credencial, provedor/ultimos4/modelo/timestamps vem nulos e `ativo` = false.
 */
export const CredencialLlmEstado = z.strictObject({
  configurada: z.boolean(),
  provedor: provedorLlm.nullable(),
  ultimos4: z.string().nullable(),
  modelo_preferido: z.string().nullable(),
  ativo: z.boolean(),
  validada_em: DataHoraIso.nullable(),
  criado_em: DataHoraIso.nullable(),
  atualizado_em: DataHoraIso.nullable(),
})
export type CredencialLlmEstado = z.infer<typeof CredencialLlmEstado>

// ---- Consumo (read-model de uso_llm) --------------------------------------------------------

/** Consumo de um dia (fuso America/Sao_Paulo). Custo em centavos (int). */
export const UsoLlmDia = z.strictObject({
  dia: z.iso.date(),
  custo_estimado_centavos: Centavos,
  tokens_entrada: z.number().int().nonnegative(),
  tokens_saida: z.number().int().nonnegative(),
})
export type UsoLlmDia = z.infer<typeof UsoLlmDia>

/** Agregado por um rotulo (origem ou modelo), com o custo somado no mes. */
export const UsoLlmAgregado = z.strictObject({
  rotulo: z.string(),
  custo_estimado_centavos: Centavos,
})
export type UsoLlmAgregado = z.infer<typeof UsoLlmAgregado>

/**
 * Resumo de consumo para o painel de gasto da loja. `pico` sinaliza consumo anomalo no dia
 * mais recente (media movel simples), alimentando o alerta SEC-100.
 */
export const UsoLlmResumo = z.strictObject({
  total_mes_centavos: Centavos,
  tokens_entrada_mes: z.number().int().nonnegative(),
  tokens_saida_mes: z.number().int().nonnegative(),
  por_dia: z.array(UsoLlmDia),
  por_origem: z.array(UsoLlmAgregado),
  por_modelo: z.array(UsoLlmAgregado),
  pico: z.boolean(),
})
export type UsoLlmResumo = z.infer<typeof UsoLlmResumo>
