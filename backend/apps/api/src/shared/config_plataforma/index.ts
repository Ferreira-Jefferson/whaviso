// Leitura compartilhada da CONFIG DA PLATAFORMA (chave Pix do whaviso, singleton 0059).
// Vive em shared/ porque módulo nunca importa módulo: admin (edita) e billing (lê para
// decidir se dá para empurrar a recarga) chamam daqui. Espelha lerCatalogo (shared/planos).
// A chave NUNCA é logada nem volta ao usuário final no HTTP (H13.8): só o zap a usa para
// montar a mensagem de compra (template billing.recarga).
import type { Pool, PoolClient } from '@whaviso/shared/db'

type Executor = Pool | PoolClient

/** Tipo da chave Pix (espelha o enum tipo_chave_pix do banco / contracts). */
export type TipoChavePixDb = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria'

/** Chave Pix da plataforma (linha única, id=1). Campos NULLABLE: a config nasce vazia. */
export interface ConfigPlataforma {
  pix_tipo: TipoChavePixDb | null
  pix_chave: string | null
  pix_titular: string | null
  pix_banco: string | null
  pix_comentario: string | null
}

const VAZIA: ConfigPlataforma = {
  pix_tipo: null,
  pix_chave: null,
  pix_titular: null,
  pix_banco: null,
  pix_comentario: null,
}

/** Lê a config da plataforma (1 linha, id=1). Devolve a config vazia se a linha faltar. */
export async function lerConfigPlataforma(ex: Executor): Promise<ConfigPlataforma> {
  const { rows } = await ex.query<ConfigPlataforma>(
    `select pix_tipo, pix_chave, pix_titular, pix_banco, pix_comentario
       from public.config_plataforma where id = 1`,
  )
  return rows[0] ?? VAZIA
}

/** A config tem uma chave Pix utilizável? (precisa ao menos da chave preenchida). */
export function temChavePix(c: ConfigPlataforma): boolean {
  return !!c.pix_chave && c.pix_chave.trim().length > 0
}
