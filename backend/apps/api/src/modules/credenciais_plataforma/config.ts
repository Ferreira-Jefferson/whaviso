// Fiacao de PRODUCAO das dependencias do modulo (cifra das credenciais de plataforma).
//
// A master key vem de `app.env` (`MASTER_KEY`, ja no envApiSchema, mesma do token da Meta/chave
// Pix). Resolucao PREGUICOSA (so no primeiro uso real): o registro do modulo no boot nunca quebra
// por falta da var; quem nao a configurou so falha ao chamar a rota que usa a cifra.
import type { EnvApiTipado as EnvApi } from '@whaviso/shared/config'
import { criarCifraCredenciaisPlataforma } from './cripto'
import type { DepsCredenciaisPlataforma } from './service'

export function depsDeProducao(env: EnvApi): DepsCredenciaisPlataforma {
  if (!env.MASTER_KEY) {
    throw new Error('MASTER_KEY ausente: cifra das credenciais de plataforma indisponivel')
  }
  return { cifra: criarCifraCredenciaisPlataforma(env.MASTER_KEY) }
}
