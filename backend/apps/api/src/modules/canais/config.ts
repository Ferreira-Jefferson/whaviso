// Fiacao de PRODUCAO das dependencias do modulo (cifra da credencial + clientes de canal).
//
// `CANAIS_MASTER_KEY` e a master key PROPRIA da cifra de credenciais de canal (separacao de
// dominio, como LLM_MASTER_KEY). Lida pontualmente de process.env e de forma PREGUICOSA: o boot
// nunca quebra por falta da var. PROPOSTA: promover para `envApiSchema`.
// Os clientes de producao sao STUBS (provedor nao escolhido): ver StubClienteCanal.
import { criarCifra, type Cifra } from '@whaviso/shared/cifra'
import { z } from 'zod'
import { StubClienteCanal, type ClienteCanal } from './cliente'
import type { CanalTipo } from './schemas'

export interface DepsCanais {
  cifra: Pick<Cifra, 'cifrar' | 'decifrar'>
  clientes: Record<CanalTipo, ClienteCanal>
}

const schema = z.object({ CANAIS_MASTER_KEY: z.string().min(32, 'minimo 32 caracteres') })

export function depsDeProducao(): DepsCanais {
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) throw new Error('CANAIS_MASTER_KEY ausente ou invalida (minimo 32 caracteres)')
  const stub = new StubClienteCanal()
  return { cifra: criarCifra(parsed.data.CANAIS_MASTER_KEY), clientes: { ifood: stub, outro: stub } }
}
