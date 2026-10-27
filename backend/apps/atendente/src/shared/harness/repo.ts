// Leituras de banco do harness (somente SELECT, role whaviso_atendente): estado da loja (suspensa),
// ultimas saidas da IA (contador de insistencia derivado) e janela de historico. Sempre por loja_id.
import { consultar, consultarUm, sql, type Executor } from '@whaviso/shared/db'
import type { MensagemRecente, RepoHarness } from './tipos'

export function criarRepoHarness(exec: Executor): RepoHarness {
  return {
    async lerLoja(lojaId) {
      const l = await consultarUm<{ suspensa: boolean; ativo: boolean }>(
        exec,
        sql`select suspensa, ativo from public.lojas where id = ${lojaId}`,
      )
      return l ? { suspensa: l.suspensa, ativo: l.ativo } : null
    },

    async ultimasSaidasIa(lojaId, conversaId, limite) {
      const rows = await consultar<{ conteudo: string | null }>(
        exec,
        sql`select conteudo from public.mensagens
            where loja_id = ${lojaId} and conversa_id = ${conversaId}
              and direcao = 'saida' and autor = 'ia'
            order by criado_em desc, id desc
            limit ${limite}`,
      )
      return rows.map((r) => r.conteudo ?? '')
    },

    async historicoRecente(lojaId, conversaId, limite, excluirMensagemId) {
      const rows = await consultar<{ direcao: 'entrada' | 'saida'; autor: MensagemRecente['autor']; conteudo: string | null; transcricao: string | null }>(
        exec,
        sql`select direcao, autor, conteudo, transcricao from public.mensagens
            where loja_id = ${lojaId} and conversa_id = ${conversaId}
              and (${excluirMensagemId ?? null}::uuid is null or id <> ${excluirMensagemId ?? null}::uuid)
            order by criado_em desc, id desc
            limit ${limite}`,
      )
      return rows
        .map((r) => ({ direcao: r.direcao, autor: r.autor, conteudo: (r.conteudo ?? r.transcricao ?? '').trim() }))
        .filter((m) => m.conteudo !== '')
        .reverse()
    },
  }
}
