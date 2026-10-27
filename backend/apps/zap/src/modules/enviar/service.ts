// Orquestra o dreno: recupera orfaos, reivindica um lote e processa cada envio (resolve
// credencial e destino, guarda a janela de 24h, despacha e grava o desfecho). Decide retry
// lendo o erro tipado do ClienteWhats (`retentavel`/`tipo`), nunca o texto da Meta.
import { z } from 'zod'
import { MensagemProposta } from '@whaviso/shared/contracts'
import {
  JanelaExpirada,
  Permanente,
  proximoRetry,
  type ErroProvedor,
} from '@whaviso/shared/clientes'
import { resolverDestino, resolverNumero } from './credencial'
import { despachar, type TemplateResolvido } from './despacho'
import * as repo from './repo'
import { CONFIG_PADRAO, type ConfigDreno, type DepsDreno, type ResumoDreno } from './tipos'

const JANELA_MS = 24 * 60 * 60 * 1000
const Variaveis = z.array(z.string())

type Desfecho = 'enviado' | 'reagendado' | 'falhou'

/** Codigo curto e estavel para a coluna `erro` (sem telefone, sem corpo, sem token). */
function codigoErro(e: ErroProvedor): string {
  return `${e.tipo}:${e.codigo}`
}

/** Resolve o template ativo da chave e mapeia as variaveis para parametros em ordem. */
async function resolverTemplate(
  deps: DepsDreno,
  lojaId: string,
  chave: string,
  variaveis: Record<string, string> | undefined,
): Promise<TemplateResolvido | null> {
  const linha = await repo.lerTemplateAtivo(deps.pool, lojaId, chave)
  if (!linha) return null
  const nomes = Variaveis.safeParse(linha.variaveis)
  const ordem = nomes.success ? nomes.data : []
  const parametros = ordem.map((nome) => variaveis?.[nome] ?? '')
  return { nomeMeta: linha.nome_meta, idioma: linha.idioma, parametros }
}

/** Processa um envio ja reivindicado (status `processando`) e grava o desfecho terminal. */
async function processarEnvio(
  deps: DepsDreno,
  cfg: ConfigDreno,
  envio: repo.EnvioReivindicado,
): Promise<Desfecho> {
  const { pool } = deps

  // Idempotencia: uma tentativa anterior ja obteve wamid mas a gravacao falhou. Nao reenvia.
  if (envio.wamid) {
    await repo.marcarEnviado(pool, envio.id, envio.wamid)
    return 'enviado'
  }

  const tentativa = envio.tentativas + 1
  const falhar = async (e: ErroProvedor): Promise<Desfecho> => {
    const decisao = proximoRetry(
      { ...cfg.retry, maxTentativas: cfg.maxTentativas },
      e,
      tentativa,
      deps.aleatorio,
    )
    if (decisao.tentar) {
      await repo.reagendar(pool, envio.id, tentativa, decisao.atrasoMs, codigoErro(e))
      return 'reagendado'
    }
    await repo.marcarFalhou(pool, envio.id, tentativa, codigoErro(e))
    return 'falhou'
  }

  const msg = MensagemProposta.safeParse(envio.payload)
  if (!msg.success) {
    return falhar(new Permanente('payload invalido', { codigo: 'payload_invalido' }))
  }

  // Credencial do numero remetente (SEC-001/002: o item sai pelo numero da propria linha).
  const linhaNumero = await repo.lerNumero(pool, envio.numero_whatsapp_id)
  if (!linhaNumero) {
    return falhar(new Permanente('numero ausente', { codigo: 'credencial_invalida' }))
  }
  const numero = resolverNumero(linhaNumero, deps.cifra)
  if (!numero) {
    await repo.pausarNumero(pool, envio.numero_whatsapp_id)
    return falhar(new Permanente('sem token', { codigo: 'credencial_invalida' }))
  }

  // Destino: telefone do cliente, decifrado so aqui.
  if (!envio.cliente_id) return falhar(new Permanente('sem destino', { codigo: 'sem_destino' }))
  const cifrado = await repo.lerTelefoneCliente(pool, envio.cliente_id)
  const para = resolverDestino(cifrado, deps.cifra)
  if (!para) return falhar(new Permanente('sem destino', { codigo: 'sem_destino' }))

  // Guarda da janela de 24h: fora dela, so template (a escolha do template e de quem enfileira).
  const ehTemplate = msg.data.tipo === 'template' || envio.template_chave !== null
  if (!ehTemplate) {
    const ultima = envio.conversa_id ? await repo.lerUltimaEntrada(pool, envio.conversa_id) : null
    if (!ultima || Date.now() - ultima.getTime() > JANELA_MS) {
      return falhar(new JanelaExpirada(undefined, { codigo: 'fora_da_janela' }))
    }
  }

  // Template: resolve nome aprovado + parametros em ordem.
  let template: TemplateResolvido | undefined
  if (msg.data.tipo === 'template') {
    const chave = envio.template_chave ?? msg.data.template
    const resolvido = await resolverTemplate(deps, envio.loja_id, chave, msg.data.variaveis)
    if (!resolvido) {
      return falhar(new Permanente('template indisponivel', { codigo: 'template_indisponivel' }))
    }
    template = resolvido
  }

  const r = await despachar(deps.whats, { numero, para, mensagem: msg.data, template })
  if (r.ok) {
    await repo.marcarEnviado(pool, envio.id, r.valor.wamid)
    return 'enviado'
  }
  // Token morto: pausa o numero para nao martelar a Meta (os demais numeros seguem).
  if (r.erro.codigo === 'credencial_invalida') await repo.pausarNumero(pool, envio.numero_whatsapp_id)
  return falhar(r.erro)
}

/** Um tick do dreno: recupera orfaos, reivindica um lote e processa cada envio. */
export async function drenarEnvios(deps: DepsDreno): Promise<ResumoDreno> {
  const cfg: ConfigDreno = { ...CONFIG_PADRAO, ...deps.config }
  const resumo: ResumoDreno = { orfaos: 0, reivindicados: 0, enviados: 0, reagendados: 0, falhas: 0 }

  resumo.orfaos = await repo.recuperarOrfaos(deps.pool, cfg.orfaoAposMs)
  const lote = await repo.reivindicar(deps.pool, cfg.tamanhoLote)
  resumo.reivindicados = lote.length

  for (const envio of lote) {
    try {
      const desfecho = await processarEnvio(deps, cfg, envio)
      if (desfecho === 'enviado') resumo.enviados += 1
      else if (desfecho === 'reagendado') resumo.reagendados += 1
      else resumo.falhas += 1
    } catch (erro) {
      // Erro inesperado no processamento (ex.: cifra/banco): reagenda sem perder o item e
      // segue o lote. So id e mensagem no log; o payload/credencial nunca entram.
      resumo.falhas += 1
      deps.logger.error({ err: erro, envio_id: envio.id }, 'falha ao processar envio')
      await repo
        .reagendar(deps.pool, envio.id, envio.tentativas + 1, cfg.retry.baseMs, 'Interno:processamento')
        .catch(() => undefined)
    }
  }

  return resumo
}
