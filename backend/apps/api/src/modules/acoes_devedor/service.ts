import type { Pool } from '@whaviso/shared/db'
import { comTransacao } from '@whaviso/shared/db'
import type { AcaoDevedor } from '@whaviso/shared/contracts'
import { sha256Hex } from '../../shared/tokens'
import { naoEncontrado } from '../../shared/http_errors'
import { enfileirarNotificacao, grupoOptoutReativa } from '../../shared/notificacoes'
import { resolverReservaAoEncerrar } from '../../shared/planos'

/** Janela de 1min do opt-out (H10.5): a notificação ao cobrador só sai após esse adiamento. */
const OPTOUT_ADIAMENTO_SEG = 60

export interface ResultadoAcao {
  status: string
  aplicado: boolean // false = já estava em estado terminal (idempotente)
}

/**
 * Ação pública do devedor pelo link (ja_paguei / optout). Idempotente por estado:
 * se o aviso já está em estado terminal, responde educadamente sem reescrever histórico.
 */
export async function registrarAcao(
  pool: Pool,
  token: string,
  acao: AcaoDevedor,
): Promise<ResultadoAcao> {
  return comTransacao(pool, async (cli) => {
    const { rows } = await cli.query<{
      id: string
      status: string
      criador_papel: 'cobrador' | 'devedor'
      cobrador_id: string | null
      devedor_profile_id: string | null
      telefone_cobrador: string | null
      telefone_devedor: string | null
    }>(
      `select id, status, criador_papel, cobrador_id, devedor_profile_id,
              telefone_cobrador, telefone_devedor
       from public.avisos where acao_token_hash = $1 for update`,
      [sha256Hex(token)],
    )
    const aviso = rows[0]
    if (!aviso) throw naoEncontrado('Link inválido')

    // Só age sobre avisos ativos; terminal → idempotente.
    if (aviso.status !== 'programado') {
      return { status: aviso.status, aplicado: false }
    }

    if (acao === 'ja_paguei') {
      // Não vai direto para 'pago': fica em revisão até o cobrador confirmar.
      await cli.query(`update public.avisos set status = 'informado_pago' where id = $1`, [aviso.id])
      await cli.query(
        `insert into public.eventos_aviso (aviso_id, tipo, ator) values ($1, 'ja_paguei_devedor', 'devedor')`,
        [aviso.id],
      )
      // Enfileira ao CRIADOR (cobrador, ou devedor-criador no invertido), com conta ou
      // por telefone. Idempotente por dedupe_key (toque duplo = 1 notificação).
      await enfileirarNotificacao(cli, aviso, 'pagamento_informado')
      return { status: 'informado_pago', aplicado: true }
    }

    // optout (H7.4): opt-out vira o estado REVERSÍVEL `desregistrado` (não mais o terminal
    // `cancelado`), coerente com o webhook do zap. Zera o segundo reservado (libera para
    // outros combinados), preservando `_orig` para a reativação reusar. Enfileira o sinal
    // `optout` ao cobrador com ADIAMENTO de 1min (H10.5): se reativar dentro da janela, a
    // reativação anula a linha e o cobrador não recebe nada.
    await cli.query(
      `update public.avisos
          set status = 'desregistrado',
              horario_reservado_orig = coalesce(horario_reservado_orig, horario_reservado_seg),
              horario_reservado_seg = null
        where id = $1`,
      [aviso.id],
    )
    await cli.query(
      `insert into public.eventos_aviso (aviso_id, tipo, ator) values ($1, 'optout', 'devedor')`,
      [aviso.id],
    )
    await enfileirarNotificacao(cli, aviso, 'optout', {
      agendarAposSeg: OPTOUT_ADIAMENTO_SEG,
      coalesceGrupo: grupoOptoutReativa(aviso.id),
    })
    // E11 H11.6: opt-out põe os créditos reservados NÃO disparados em hold de 24h (ou
    // devolve direto, se nada disparou). Carteira do CRIADOR. Se reativar dentro de 24h
    // (desregistrado -> programado, no zap), o hold é cancelado e os créditos voltam.
    const criadorId = aviso.criador_papel === 'cobrador' ? aviso.cobrador_id : aviso.devedor_profile_id
    if (criadorId) await resolverReservaAoEncerrar(cli, criadorId, aviso.id)
    return { status: 'desregistrado', aplicado: true }
  })
}
