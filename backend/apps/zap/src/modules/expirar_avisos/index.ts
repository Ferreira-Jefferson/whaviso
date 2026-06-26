import type { Pool } from '@whaviso/shared/db'
import { comTransacao } from '@whaviso/shared/db'
import type { Logger } from '@whaviso/shared/logger'
import { hojeSp } from '@whaviso/shared/datas'
import { devolverReservaNaoAceito } from '../../shared/creditos'

export interface DepsExpirar {
  pool: Pool
  logger: Logger
}

/**
 * Sweep de expiração:
 * - `programado` com data_combinada + 2 dias <= hoje (SP) → `expirado` (ciclo encerrou sem confirmação)
 * - `aguardando_aceite` com `convite_expira_em` vencido → `expirado` (E5/H5.7: 7 dias
 *   fixos a partir da criação/ativação, igual p/ todos os planos). G10: a guarda de status
 *   garante que SÓ o convite pendente expira por este prazo (programado/pausado têm prazo
 *   próprio, E6).
 * O trigger de encerramento cancela os envios restantes; aqui inserimos o evento.
 */
export async function expirarAvisos(deps: DepsExpirar): Promise<number> {
  const hoje = hojeSp()
  return comTransacao(deps.pool, async (cli) => {
    const { rows } = await cli.query<{ id: string; status: string }>(
      `select id, status from public.avisos
       where (status = 'programado' and data_combinada + 2 <= $1::date)
          or (status = 'aguardando_aceite' and convite_expira_em is not null
              and convite_expira_em < now())
       for update skip locked`,
      [hoje],
    )
    for (const { id, status } of rows) {
      await cli.query(`update public.avisos set status='expirado' where id=$1`, [id])
      await cli.query(
        `insert into public.eventos_aviso (aviso_id, tipo, ator) values ($1,'expirado','sistema')`,
        [id],
      )
      // E11 H11.5: convite NÃO ACEITO que expira (aguardando_aceite) DEVOLVE a reserva (nada
      // disparou). O `programado` que expira (já foi aceito; os envios saíram e consumiram)
      // NÃO devolve: enviou, foi.
      if (status === 'aguardando_aceite') await devolverReservaNaoAceito(cli, id)
    }
    if (rows.length > 0) deps.logger.info({ expirados: rows.length }, 'avisos expirados no sweep')
    return rows.length
  })
}
