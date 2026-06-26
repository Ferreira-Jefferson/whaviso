// Leitura da CONFIG DA PLATAFORMA (chave Pix do whaviso, singleton 0059) no lado do zap.
// O zap LÊ a chave no momento do envio para montar a mensagem de compra (billing.recarga),
// então o recibo sai sempre com a chave vigente. A chave nunca é logada. Espelha o leitor
// da api (api e zap não se importam: cada app tem seu próprio shared de leitura).
import type { Pool } from '@whaviso/shared/db'

/** Tipo da chave Pix (espelha o enum tipo_chave_pix do banco / contracts). */
export type TipoChavePixDb = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria'

/** Chave Pix da plataforma (linha única, id=1). Campos NULLABLE: a config pode estar vazia. */
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
export async function lerConfigPlataforma(pool: Pool): Promise<ConfigPlataforma> {
  const { rows } = await pool.query<ConfigPlataforma>(
    `select pix_tipo, pix_chave, pix_titular, pix_banco, pix_comentario
       from public.config_plataforma where id = 1`,
  )
  return rows[0] ?? VAZIA
}

/** Tem chave Pix utilizável? (precisa ao menos da chave preenchida.) */
export function temChavePix(c: ConfigPlataforma): boolean {
  return !!c.pix_chave && c.pix_chave.trim().length > 0
}
