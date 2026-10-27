// Fiacao de PRODUCAO das dependencias do modulo (cifra + porta Meta HTTP).
//
// Nao depende de `env.ts` (fora do escopo desta tarefa): a master key vem de `app.env`
// (`MASTER_KEY`, ja existente no envApiSchema) e as credenciais do app Meta sao lidas
// aqui, pontualmente, de `process.env` com validacao Zod local. PROPOSTA de promocao para
// `env.ts`/`envApiSchema` registrada no relatorio: `META_APP_ID`, `META_APP_SECRET`.
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

/** Monta as deps de producao a partir da env da api (lanca se faltar config). */
export function depsDeProducao(env: EnvApi): DepsNumeros {
  if (!env.MASTER_KEY) {
    throw new Error('MASTER_KEY ausente: cifra do token indisponivel')
  }
  const meta = metaSchema.safeParse(process.env)
  if (!meta.success) {
    throw new Error('credenciais do app Meta ausentes (META_APP_ID/META_APP_SECRET)')
  }
  return {
    cripto: criarCripto(env.MASTER_KEY),
    onboarding: criarMetaOnboardingHttp({
      appId: meta.data.META_APP_ID,
      appSecret: meta.data.META_APP_SECRET,
    }),
  }
}
