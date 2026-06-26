// Drena a outbox de BILLING (notificacoes_billing 0060) e empurra a mensagem de COMPRA DE
// CRÉDITO (recarga) ao WhatsApp do próprio usuário: quantidade, valor e a chave Pix DA
// PLATAFORMA (config_plataforma 0059), pelo template unificado 'billing.recarga'. O usuário
// paga e manda o comprovante na conversa; o owner credita depois (H11.11). Transporte
// genérico (carregarTemplateAtivo + renderMensagem); sem string de negócio aqui.
//
// GATED: sem template ativo OU sem chave Pix configurada, NÃO envia quebrado; devolve a
// linha a 'agendado' com motivo recuperável VISÍVEL (volta a drenar quando configurar).
// A chave Pix NUNCA é logada (só vai à mensagem do WhatsApp).
import type { Pool } from '@whaviso/shared/db'
import type { Logger } from '@whaviso/shared/logger'
import { formatarValorBr } from '@whaviso/shared/datas'
import { ErroEnvio, type ClienteWhats } from '../../shared/baileys_client'
import { carregarTemplateAtivo, renderMensagem } from '../../shared/templates'
import { lerConfigPlataforma, temChavePix, type ConfigPlataforma } from '../../shared/config_plataforma'
import * as repo from './repo'
import type { RecargaClaim } from './repo'

const CHAVE_TEMPLATE = 'billing.recarga'
const MOTIVO_SEM_TEMPLATE = 'sem_template_ativo'
const MOTIVO_SEM_PIX = 'pix_nao_configurado'

export interface DepsNotificarBilling {
  pool: Pool
  logger: Logger
  whats: ClienteWhats
}

// Rótulo amigável do tipo de chave para a mensagem ({{3}} = pix_tipo).
const ROTULO_TIPO: Record<string, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'E-mail',
  telefone: 'Telefone',
  aleatoria: 'Chave aleatória',
}

/** Mapa nome -> valor das variáveis do template billing.recarga. NUNCA logado. */
function valoresRecarga(c: ConfigPlataforma, r: RecargaClaim): Record<string, string> {
  return {
    quantidade: String(r.quantidade),
    valor: formatarValorBr(r.valor_centavos),
    pix_tipo: c.pix_tipo ? (ROTULO_TIPO[c.pix_tipo] ?? c.pix_tipo) : '',
    pix_chave: c.pix_chave ?? '',
    pix_titular: c.pix_titular ?? '',
    pix_banco: c.pix_banco ?? '',
    pix_comentario: c.pix_comentario ?? '',
  }
}

/** Processa um lote de recargas. Retorna quantas mensagens foram enviadas. */
export async function processarNotificacoesBilling(deps: DepsNotificarBilling): Promise<number> {
  const { pool, logger } = deps

  await repo.ressuscitarTravados(pool)
  const lote = await repo.reivindicar(pool)
  let enviadas = 0

  for (const r of lote) {
    try {
      if (await processarUma(deps, r)) enviadas++
    } catch (erro) {
      if (erro instanceof ErroEnvio && erro.permanente) {
        await repo.marcarFalhou(pool, r.id, `envio_${erro.codigo}: ${erro.message}`)
        logger.warn({ recargaId: r.id, codigo: erro.codigo }, 'erro permanente no envio da recarga')
      } else {
        const msg = erro instanceof Error ? erro.message : String(erro)
        const res = await repo.reagendarOuFalhar(pool, r.id, r.tentativas, msg)
        logger.warn({ recargaId: r.id, resultado: res }, 'falha transitória na recarga')
      }
    }
  }

  return enviadas
}

async function processarUma(deps: DepsNotificarBilling, r: RecargaClaim): Promise<boolean> {
  const { pool, logger } = deps

  // Chave Pix lida NO ENVIO (recibo sai sempre com a chave vigente; menos PII na outbox).
  const config = await lerConfigPlataforma(pool)
  if (!temChavePix(config)) {
    await repo.devolverAguardando(pool, r.id, MOTIVO_SEM_PIX)
    logger.error({ recargaId: r.id }, 'recarga aguardando: chave Pix da plataforma não configurada')
    return false
  }

  const template = await carregarTemplateAtivo(pool, CHAVE_TEMPLATE, 'padrao')
  if (!template) {
    // GATED: sem template ativo, não envia quebrado. Devolve recuperável (volta ao ativar).
    await repo.devolverAguardando(pool, r.id, MOTIVO_SEM_TEMPLATE)
    logger.error({ recargaId: r.id, chave: CHAVE_TEMPLATE }, 'recarga aguardando: sem template ativo')
    return false
  }

  // Sem botões (refId omitido): o usuário responde com o comprovante em texto livre/imagem.
  const mensagem = renderMensagem(template, r.telefone_alvo, { valores: valoresRecarga(config, r) })
  const { wamid } = await deps.whats.enviarMensagem(mensagem)
  await repo.marcarEnviado(pool, r.id, wamid)
  return true
}
