import type { Pool } from '@whaviso/shared/db'

// TODO(pivo): consulta tabelas de cobrança (avisos, aviso_ocorrencias, envios, eventos_aviso); reapontar p/ pedidos.
/**
 * Carimbo de versão do estado do usuário logado: o maior `atualizado_em`/`criado_em` entre
 * avisos, aviso_ocorrencias, envios e eventos_aviso do escopo dele (mesmo escopo do painel,
 * ver painel/repo.ts). Envios entra porque o zap toca `entrega_status` (sent -> delivered ->
 * read) fora de qualquer mudança em avisos/ocorrências; eventos_aviso entra porque a tabela é
 * append-only (sem UPDATE, logo sem `atualizado_em`) e cada INSERT novo (ex.: `solicitou_pix`)
 * já é, por si, uma mudança de estado que o painel expõe. Só cresce (nunca há DELETE em
 * tabela de negócio), então comparar com o valor anterior basta para saber se algo mudou de
 * verdade no servidor.
 */
export async function versao(pool: Pool, uid: string): Promise<Date> {
  const { rows } = await pool.query<{ versao: Date }>(
    `select greatest(
       (select coalesce(max(atualizado_em), 'epoch') from public.avisos
          where cobrador_id = $1 or devedor_profile_id = $1),
       (select coalesce(max(o.atualizado_em), 'epoch') from public.aviso_ocorrencias o
          join public.avisos a on a.id = o.aviso_id
          where a.cobrador_id = $1 or a.devedor_profile_id = $1),
       (select coalesce(max(en.atualizado_em), 'epoch') from public.envios en
          join public.avisos a on a.id = en.aviso_id
          where a.cobrador_id = $1 or a.devedor_profile_id = $1),
       (select coalesce(max(e.criado_em), 'epoch') from public.eventos_aviso e
          join public.avisos a on a.id = e.aviso_id
          where a.cobrador_id = $1 or a.devedor_profile_id = $1)
     ) as versao`,
    [uid],
  )
  return rows[0]!.versao
}
