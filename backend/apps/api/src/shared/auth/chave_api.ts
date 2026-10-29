// Credencial alternativa: chave de API da conta (emitida pela Whaviso). So o hash sha256 existe
// no banco; aqui o segredo recebido e hasheado e resolvido por hash. O valor claro nunca e logado.
import { timingSafeEqual } from 'node:crypto'
import type { Pool } from '@whaviso/shared/db'
import { sha256Hex } from '../tokens'

/** Prefixo de todo segredo emitido; JWT do Supabase nunca comeca assim. */
export const PREFIXO_CHAVE_API = 'whv_'

export interface ChaveApiResolvida {
  chave_id: string
  conta_id: string
  /** Principal usado para resolver o escopo de loja (dono da conta, com vinculo ativo nela). */
  dono_user_id: string
}

interface Linha {
  id: string
  conta_id: string
  hash_sha256: string
  dono_user_id: string
}

// Ativa = nao revogada e nao vencida (expira_em NULL = sem validade). O principal e o dono da
// conta, exigindo vinculo ativo dele em `membros` DESSA conta (nunca resolve para outra conta).
const SQL = `
  select k.id, k.conta_id, k.hash_sha256, c.dono_user_id
    from public.chaves_api k
    join public.contas c on c.id = k.conta_id
   where k.hash_sha256 = $1
     and k.revogada_em is null
     and (k.expira_em is null or k.expira_em > now())
     and exists (select 1 from public.membros m
                  where m.conta_id = k.conta_id and m.user_id = c.dono_user_id and m.ativo)
   limit 1
`

export async function resolverChaveApi(
  pool: Pick<Pool, 'query'>,
  segredo: string,
): Promise<ChaveApiResolvida | null> {
  const hash = sha256Hex(segredo)
  const { rows } = await pool.query<Linha>(SQL, [hash])
  const l = rows[0]
  if (!l) return null
  // Defesa extra: confere o hash devolvido em tempo constante.
  const a = Buffer.from(l.hash_sha256, 'utf8')
  const b = Buffer.from(hash, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return { chave_id: l.id, conta_id: l.conta_id, dono_user_id: l.dono_user_id }
}
