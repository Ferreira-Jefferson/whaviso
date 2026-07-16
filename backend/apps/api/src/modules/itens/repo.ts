import type { Pool } from '@whaviso/shared/db'

/**
 * Autocomplete do nome do item: descrições DISTINTAS já usadas em combinados que EU CRIEI,
 * casando com o prefixo digitado (LIKE, case-insensitive). Faz unnest do jsonb `avisos.itens`.
 * Escopo do criador igual ao autocomplete de pessoa: (cobrador e cobrador_id) ou (devedor e
 * devedor_profile_id). distinct; teto de 8 sugestões. Isolamento por uid.
 */
export async function buscarDescricaoPorPrefixo(
  pool: Pool,
  uid: string,
  prefixo: string,
): Promise<string[]> {
  const { rows } = await pool.query<{ descricao: string }>(
    `select distinct descricao from (
       select trim(jsonb_array_elements(itens) ->> 'descricao') as descricao
         from public.avisos
        where itens is not null
          and ((criador_papel = 'cobrador' and cobrador_id = $1)
            or (criador_papel = 'devedor' and devedor_profile_id = $1))
     ) s
     where descricao is not null and descricao <> '' and descricao ilike $2
     order by descricao
     limit 8`,
    [uid, `${prefixo}%`],
  )
  return rows.map((r) => r.descricao)
}
