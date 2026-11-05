// Fiacao de PRODUCAO das dependencias do numero (cifra + porta Meta HTTP), compartilhada entre
// as rotas da loja e as do console.
//
// Nao depende de `env.ts`: a master key vem de `app.env` (`MASTER_KEY`, ja no envApiSchema) e as
// credenciais do app Meta sao lidas aqui, pontualmente, de `process.env` com validacao Zod local.
// PROPOSTA de promocao para `env.ts`/`envApiSchema`: `META_APP_ID`, `META_APP_SECRET`.
//
// Vars adicionais (opcionais) deste kernel:
//   META_API_VERSION   versao do Graph (DEFAULT `v23.0`, alinhada ao zap); validada na porta HTTP.
//   META_REGISTER_PIN  PIN (6 digitos) do passo `register` do Embedded Signup. Setado e valido =>
//                      a porta expoe `registrarNumero` e o service tenta registrar (best-effort);
//                      ausente ou invalido => passo pulado (comportamento atual preservado).
//
// A resolucao e PREGUICOSA (so no primeiro uso real): o registro do modulo no boot nunca
// quebra por falta dessas vars; quem nao as configurou so falha ao chamar a rota.
import { z } from 'zod'
import type { EnvApiTipado as EnvApi } from '@whaviso/shared/config'
import { criarCripto } from './cripto'
import { criarMetaOnboardingHttp } from './meta_onboarding'
import type { DepsNumeros } from './service'

const metaSchema = z.object({
  META_APP_ID: z.string().min(1),
  META_APP_SECRET: z.string().min(1),
})

const FORMATO_PIN = /^\d{6}$/

/** Monta as deps de producao a partir da env da api (lanca se faltar config). */
export function depsDeProducao(env: EnvApi): DepsNumeros {
  if (!env.MASTER_KEY) {
    throw new Error('MASTER_KEY ausente: cifra do token indisponivel')
  }
  const meta = metaSchema.safeParse(process.env)
  if (!meta.success) {
    throw new Error('credenciais do app Meta ausentes (META_APP_ID/META_APP_SECRET)')
  }
  // PIN opcional e best-effort: so e injetado quando valido (6 digitos); invalido => passo pulado.
  const pinBruto = process.env.META_REGISTER_PIN
  const registerPin = pinBruto && FORMATO_PIN.test(pinBruto) ? pinBruto : undefined
  return {
    cripto: criarCripto(env.MASTER_KEY),
    onboarding: criarMetaOnboardingHttp({
      appId: meta.data.META_APP_ID,
      appSecret: meta.data.META_APP_SECRET,
      versao: process.env.META_API_VERSION ?? 'v23.0',
      registerPin,
    }),
  }
}
