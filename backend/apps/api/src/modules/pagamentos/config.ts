// Fiação de PRODUCAO das dependências do módulo (cifra da chave Pix).
//
// A master key vem de `app.env` (`MASTER_KEY`, já no envApiSchema). A resolução é PREGUICOSA
// (só no primeiro uso real): o registro do módulo no boot nunca quebra por falta da var; quem
// não a configurou só falha ao chamar a rota que usa a cifra.
import type { EnvApiTipado as EnvApi } from '@whaviso/shared/config'
import { criarCripto } from './cripto'
import { criarAsaasDoAmbiente } from './psp_cliente'
import type { DepsPagamentos } from './service'

/** Monta as deps de produção a partir da env da api (lança se faltar config). */
export function depsDeProducao(env: EnvApi): DepsPagamentos {
  if (!env.MASTER_KEY) {
    throw new Error('MASTER_KEY ausente: cifra da chave Pix indisponivel')
  }
  // `criarAsaasDoAmbiente()` retorna null ate as chaves/doc do Asaas: o caminho intermediado
  // responde 501 ate la; o resto do fluxo (config, credencial, subconta, webhook) ja funciona.
  return { cripto: criarCripto(env.MASTER_KEY), clientePsp: criarAsaasDoAmbiente() }
}
