// Fiacao de PRODUCAO das dependencias do modulo (cifra da credencial + clientes de canal).
//
// `CANAIS_MASTER_KEY` e a master key PROPRIA da cifra de credenciais de canal (separacao de
// dominio, como LLM_MASTER_KEY). Lida pontualmente de process.env e de forma PREGUICOSA: o boot
// nunca quebra por falta da var. PROPOSTA: promover para `envApiSchema`.
//
// PROVEDOR PADRAO (decisao de engenharia, 2026-10-27): iFood como canal default, pela API oficial
// de parceiro, atras de `ClienteCanal` (`criarCanalIfoodDoAmbiente`). GATED por credencial de app:
// so entra com o par `API_CANAL_IFOOD_CLIENT_ID`/`API_CANAL_IFOOD_CLIENT_SECRET` (a credencial por
// loja, o merchantId, e cifrada no banco). Sem isso, o canal cai no `StubClienteCanal` (501
// `canal_nao_integrado`). O canal generico 'outro' segue sempre no stub.
import { criarCifra, type Cifra } from '@whaviso/shared/cifra'
import { criarCanalIfoodDoAmbiente } from '@whaviso/shared/clientes'
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
  // iFood real quando ativado por credencial de app; senao, stub. 'outro' nunca tem provedor.
  const ifood = criarCanalIfoodDoAmbiente() ?? stub
  return { cifra: criarCifra(parsed.data.CANAIS_MASTER_KEY), clientes: { ifood, outro: stub } }
}
