// Orquestra o dreno de e-mail: recupera orfaos, reivindica um lote e processa cada e-mail (renderiza
// o template em codigo, envia pelo ClienteEmail e grava o desfecho). Sem cliente, o dreno fica idle
// (deixa a fila intacta). Backoff simples por tentativa; teto -> `falhou`. Nunca loga e-mail/payload.
import { renderizar } from './template'
import * as repo from './repo'
import { CONFIG_PADRAO, type ConfigDrenoEmail, type DepsDrenoEmail, type ResumoDrenoEmail } from './tipos'

type Desfecho = 'enviado' | 'reagendado' | 'falhou'

function atraso(cfg: ConfigDrenoEmail, tentativa: number): number {
  return Math.min(cfg.maxMs, cfg.baseMs * cfg.fator ** (tentativa - 1))
}

/** Processa um e-mail ja reivindicado (status `processando`) e grava o desfecho terminal. */
async function processarEmail(
  deps: Required<Pick<DepsDrenoEmail, 'pool' | 'cliente'>> & DepsDrenoEmail,
  cfg: ConfigDrenoEmail,
  email: repo.EmailReivindicado,
): Promise<Desfecho> {
  const { pool, cliente } = deps
  const tentativa = email.tentativas + 1

  const falhar = async (codigo: string, retentavel: boolean): Promise<Desfecho> => {
    if (retentavel && tentativa < cfg.maxTentativas) {
      await repo.reagendar(pool, email.id, tentativa, atraso(cfg, tentativa), codigo)
      return 'reagendado'
    }
    await repo.marcarFalhou(pool, email.id, tentativa, codigo)
    return 'falhou'
  }

  // Template desconhecido = payload veneno: permanente (nao fica em loop).
  const msg = renderizar(email.template, email.para, email.payload)
  if (!msg) return falhar('template_desconhecido', false)

  const r = await cliente.enviar(msg)
  if (r.ok) {
    await repo.marcarEnviado(pool, email.id, r.providerId)
    return 'enviado'
  }
  return falhar(r.erro.codigo, r.erro.retentavel)
}

/** Um tick do dreno de e-mail. Sem cliente, devolve `idle: true` sem tocar na fila. */
export async function drenarEmails(deps: DepsDrenoEmail): Promise<ResumoDrenoEmail> {
  const cfg: ConfigDrenoEmail = { ...CONFIG_PADRAO, ...deps.config }
  const resumo: ResumoDrenoEmail = {
    idle: false, orfaos: 0, reivindicados: 0, enviados: 0, reagendados: 0, falhas: 0,
  }
  if (!deps.cliente) return { ...resumo, idle: true }
  const comCliente = deps as Required<Pick<DepsDrenoEmail, 'pool' | 'cliente'>> & DepsDrenoEmail

  resumo.orfaos = await repo.recuperarOrfaos(deps.pool, cfg.orfaoAposMs)
  const lote = await repo.reivindicar(deps.pool, cfg.tamanhoLote)
  resumo.reivindicados = lote.length

  for (const email of lote) {
    try {
      const desfecho = await processarEmail(comCliente, cfg, email)
      if (desfecho === 'enviado') resumo.enviados += 1
      else if (desfecho === 'reagendado') resumo.reagendados += 1
      else resumo.falhas += 1
    } catch (erro) {
      // Erro inesperado: aplica o MESMO teto de tentativas (senao um item veneno reagendaria em
      // loop). So id e mensagem no log; payload/e-mail nunca entram.
      resumo.falhas += 1
      deps.logger.error({ err: erro, email_id: email.id }, 'falha ao processar e-mail')
      const tentativa = email.tentativas + 1
      const acao =
        tentativa >= cfg.maxTentativas
          ? repo.marcarFalhou(deps.pool, email.id, tentativa, 'interno')
          : repo.reagendar(deps.pool, email.id, tentativa, cfg.baseMs, 'interno')
      await acao.catch(() => undefined)
    }
  }

  return resumo
}
