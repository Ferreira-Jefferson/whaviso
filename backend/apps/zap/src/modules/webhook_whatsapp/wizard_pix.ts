// E14: wizard de cadastro da chave pix pelo COBRADOR (fluxo invertido sem chave).
// Primeira conversa multi-etapa do projeto: lê/grava a sessão em `sessao_cadastro_pix`,
// uma etapa por mensagem, com "corrigir anterior" e confirmação consolidada. Ao confirmar,
// grava a chave no perfil do cobrador (chaves_pix) + snapshot no aviso, registra o evento
// e enfileira a notificação ao devedor (outbox). Nunca loga chave/titular/banco/telefone.
//
// Disparadores (Gatilho A no aceite, Gatilho B a pedido do devedor) CRIAM a sessão de
// 'oferta' no repo.ts (mesma transação do botão); aqui tratamos a oferta em diante.
import type { Pool, PoolClient } from '@whaviso/shared/db'
import { comTransacao } from '@whaviso/shared/db'
import { detectarTipoChavePix, type TipoChavePix } from '@whaviso/shared/contracts'
import type { ClienteWhats } from '../../shared/whats'
import { carregarTemplateAtivo, renderMensagem } from '../../shared/templates'
import { enfileirarNotificacao, enfileirarNotificacaoDevedor, type AvisoAlvo } from '../../shared/notificacoes'

/** Inatividade até a sessão expirar (e, no Gatilho A, liberar o aceite segurado). */
const SESSAO_PIX_EXPIRA_MIN = 30

interface LogLike {
  info(obj: unknown, msg?: string): void
  warn(obj: unknown, msg?: string): void
  error(obj: unknown, msg?: string): void
}
export interface DepsWizard {
  pool: Pool
  logger: LogLike
  whats: ClienteWhats
}

/** Ações de botão do wizard (roteadas para cá, não para a máquina de estados do aviso). */
export const ACOES_WIZARD_PIX = [
  'informar_pix',
  'pix_pular',
  'pix_corrigir',
  'pix_confirma_tipo',
  'pix_corrige_tipo',
  'pix_confirmar',
] as const
export type AcaoWizardPix = (typeof ACOES_WIZARD_PIX)[number]

export function ehAcaoWizardPix(acao: string): acao is AcaoWizardPix {
  return (ACOES_WIZARD_PIX as readonly string[]).includes(acao)
}

type EtapaPix = 'oferta' | 'titular' | 'instituicao' | 'chave' | 'tipo' | 'confirmacao'

interface SessaoPix {
  id: string
  telefone: string
  aviso_id: string
  origem: 'aceite' | 'pedido_devedor'
  etapa: EtapaPix
  titular: string | null
  instituicao: string | null
  chave: string | null
  tipo: TipoChavePix | null
}

// Rótulo de exibição do tipo (auxílio de leitura no WhatsApp), e o mapa da resposta
// numerada do fallback (H14.5). Espelha a ordem do template pix.tipo_manual.
const ROTULO_TIPO: Record<TipoChavePix, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'E-mail',
  telefone: 'Telefone',
  aleatoria: 'Chave aleatória',
}
const TIPO_POR_NUMERO: Record<string, TipoChavePix> = {
  '1': 'cpf',
  '2': 'cnpj',
  '3': 'email',
  '4': 'telefone',
  '5': 'aleatoria',
}

// --- envio (best-effort, janela 24h) -----------------------------------------
async function enviar(
  deps: DepsWizard,
  para: string,
  chave: string,
  opcoes: { valores?: Record<string, string>; refId?: string } = {},
): Promise<void> {
  const template = await carregarTemplateAtivo(deps.pool, chave, 'padrao')
  if (!template) {
    deps.logger.warn({ chave }, 'template ausente; mensagem do wizard não enviada')
    return
  }
  const mensagem = renderMensagem(template, para, { valores: opcoes.valores, refId: opcoes.refId })
  await deps.whats.enviarMensagem(mensagem).catch((e) => {
    deps.logger.warn({ err: e }, 'falha ao enviar mensagem do wizard na janela 24h')
  })
}

// --- acesso à sessão ----------------------------------------------------------
const SEL_SESSAO = `id, telefone, aviso_id, origem, etapa, titular, instituicao, chave, tipo`

async function carregarSessaoAtiva(ex: Pool | PoolClient, telefone: string): Promise<SessaoPix | null> {
  const { rows } = await ex.query<SessaoPix>(
    `select ${SEL_SESSAO} from public.sessao_cadastro_pix where telefone=$1 and status='ativa' limit 1`,
    [telefone],
  )
  return rows[0] ?? null
}

type PatchSessao = Partial<Pick<SessaoPix, 'etapa' | 'titular' | 'instituicao' | 'chave' | 'tipo'>>

/** Atualiza campos parciais da sessão. Colunas são controladas (não vêm do usuário). */
async function atualizarSessao(ex: Pool | PoolClient, id: string, patch: PatchSessao): Promise<void> {
  const sets: string[] = []
  const params: unknown[] = [id]
  for (const [coluna, valor] of Object.entries(patch)) {
    params.push(valor)
    // tipo é enum: cast explícito (o driver manda o param como texto).
    sets.push(`${coluna}=$${params.length}${coluna === 'tipo' ? '::tipo_chave_pix' : ''}`)
  }
  if (!sets.length) return
  await ex.query(`update public.sessao_cadastro_pix set ${sets.join(', ')} where id=$1`, params)
}

/**
 * Cria a sessão de OFERTA para um telefone (cobrador), na transação do botão que dispara
 * o fluxo (aceite/solicitar_pix). Idempotente: uma sessão ativa por telefone (índice
 * único parcial); se já houver uma, devolve false e nada é criado.
 */
export async function criarSessaoOferta(
  cli: PoolClient,
  args: { telefone: string; avisoId: string; origem: 'aceite' | 'pedido_devedor' },
): Promise<boolean> {
  const { rowCount } = await cli.query(
    `insert into public.sessao_cadastro_pix (telefone, aviso_id, origem, etapa, status)
     values ($1,$2,$3,'oferta','ativa')
     on conflict (telefone) where status='ativa' do nothing`,
    [args.telefone, args.avisoId, args.origem],
  )
  return (rowCount ?? 0) > 0
}

type AvisoAlvoNome = AvisoAlvo & { nome_devedor: string }

async function carregarAvisoAlvo(cli: PoolClient, avisoId: string): Promise<AvisoAlvoNome | null> {
  const { rows } = await cli.query<AvisoAlvoNome>(
    `select id, criador_papel, cobrador_id, devedor_profile_id, telefone_cobrador, telefone_devedor, nome_devedor
       from public.avisos where id=$1`,
    [avisoId],
  )
  return rows[0] ?? null
}

async function profilePorTelefone(cli: PoolClient, telefone: string): Promise<string | null> {
  const { rows } = await cli.query<{ id: string }>(
    `select id from public.profiles where telefone=$1 limit 1`,
    [telefone],
  )
  return rows[0]?.id ?? null
}

// --- mensagens por etapa ------------------------------------------------------
async function reapresentarOferta(deps: DepsWizard, telefone: string, avisoId: string): Promise<void> {
  const { rows } = await deps.pool.query<{ nome_devedor: string }>(
    `select nome_devedor from public.avisos where id=$1`,
    [avisoId],
  )
  await enviar(deps, telefone, 'resposta.pix_oferecer', {
    valores: { nome_devedor: rows[0]?.nome_devedor ?? '' },
    refId: avisoId,
  })
}

async function pedirTipo(deps: DepsWizard, telefone: string, avisoId: string, tipo: TipoChavePix | null): Promise<void> {
  if (tipo) {
    await enviar(deps, telefone, 'pix.confirmar_tipo', { valores: { tipo: ROTULO_TIPO[tipo] }, refId: avisoId })
  } else {
    // ambíguo: pede por resposta numerada (sem lista interativa, H14.5).
    await enviar(deps, telefone, 'pix.tipo_manual', { refId: avisoId })
  }
}

async function enviarResumo(deps: DepsWizard, telefone: string, s: SessaoPix): Promise<void> {
  await enviar(deps, telefone, 'pix.confirmar', {
    valores: {
      titular: s.titular ?? '',
      banco: s.instituicao ?? '',
      tipo: s.tipo ? ROTULO_TIPO[s.tipo] : '',
      chave: s.chave ?? '',
    },
    refId: s.aviso_id,
  })
}

// --- texto livre durante o wizard --------------------------------------------
/**
 * Se há sessão de wizard ATIVA para o telefone, interpreta o texto como dado da etapa
 * atual e avança. Precede a detecção de número de convite/menu (H14.4). Retorna true se
 * consumiu o texto (sessão ativa), false se não há sessão (segue o fluxo normal).
 */
export async function tratarTextoWizard(deps: DepsWizard, telefone: string, textoBruto: string): Promise<boolean> {
  const sessao = await carregarSessaoAtiva(deps.pool, telefone)
  if (!sessao) return false
  const texto = textoBruto.trim()

  switch (sessao.etapa) {
    case 'oferta':
      // Espera um toque de botão; reapresenta a oferta para guiar.
      await reapresentarOferta(deps, telefone, sessao.aviso_id)
      return true
    case 'titular':
      await atualizarSessao(deps.pool, sessao.id, { titular: texto, etapa: 'instituicao' })
      await enviar(deps, telefone, 'pix.instituicao', { refId: sessao.aviso_id })
      return true
    case 'instituicao':
      await atualizarSessao(deps.pool, sessao.id, { instituicao: texto, etapa: 'chave' })
      await enviar(deps, telefone, 'pix.chave', { refId: sessao.aviso_id })
      return true
    case 'chave': {
      const tipo = detectarTipoChavePix(texto)
      await atualizarSessao(deps.pool, sessao.id, { chave: texto, tipo, etapa: 'tipo' })
      await pedirTipo(deps, telefone, sessao.aviso_id, tipo)
      return true
    }
    case 'tipo': {
      // Aceita a resposta numerada (fallback ou correção de tipo). Inválido -> repete.
      const escolhido = TIPO_POR_NUMERO[texto]
      if (escolhido) {
        await atualizarSessao(deps.pool, sessao.id, { tipo: escolhido, etapa: 'confirmacao' })
        await enviarResumo(deps, telefone, { ...sessao, tipo: escolhido, etapa: 'confirmacao' })
      } else {
        await pedirTipo(deps, telefone, sessao.aviso_id, sessao.tipo)
      }
      return true
    }
    case 'confirmacao':
      // Espera um toque; reapresenta o resumo.
      await enviarResumo(deps, telefone, sessao)
      return true
  }
  return true
}

// --- botões do wizard ---------------------------------------------------------
/** Trata os botões do wizard (informar/pular/corrigir/confirmar). Idempotente. */
export async function tratarBotaoWizard(
  deps: DepsWizard,
  telefone: string | null,
  acao: AcaoWizardPix,
  avisoId: string,
): Promise<void> {
  if (!telefone) return

  if (acao === 'informar_pix') {
    await iniciarWizard(deps, telefone, avisoId)
    return
  }
  if (acao === 'pix_pular') {
    await pularOferta(deps, telefone, avisoId)
    return
  }

  // As demais ações operam sobre a sessão ativa do telefone (amarrada ao mesmo aviso).
  const sessao = await carregarSessaoAtiva(deps.pool, telefone)
  if (!sessao || sessao.aviso_id !== avisoId) return

  if (acao === 'pix_corrigir') {
    await corrigirAnterior(deps, telefone, sessao)
    return
  }
  if (acao === 'pix_confirma_tipo') {
    if (!sessao.tipo) {
      // Sem tipo (corrigido antes): pede por resposta numerada.
      await pedirTipo(deps, telefone, avisoId, null)
      return
    }
    await atualizarSessao(deps.pool, sessao.id, { etapa: 'confirmacao' })
    await enviarResumo(deps, telefone, { ...sessao, etapa: 'confirmacao' })
    return
  }
  if (acao === 'pix_corrige_tipo') {
    await atualizarSessao(deps.pool, sessao.id, { tipo: null })
    await enviar(deps, telefone, 'pix.tipo_manual', { refId: avisoId })
    return
  }
  if (acao === 'pix_confirmar') {
    await finalizar(deps, telefone, sessao)
    return
  }
}

async function iniciarWizard(deps: DepsWizard, telefone: string, avisoId: string): Promise<void> {
  const sessao = await carregarSessaoAtiva(deps.pool, telefone)
  // Só inicia a partir da oferta (sessão criada no aceite/pedido). Toque duplo: ignora.
  if (!sessao || sessao.aviso_id !== avisoId || sessao.etapa !== 'oferta') return
  await atualizarSessao(deps.pool, sessao.id, { etapa: 'titular' })
  await enviar(deps, telefone, 'pix.titular', { refId: avisoId })
}

/**
 * "Agora não": cancela a sessão. Se veio do aceite (Gatilho A), o aceite estava SEGURADO,
 * então enfileira agora a notificação de aceite ao devedor (fallback). Idempotente.
 */
async function pularOferta(deps: DepsWizard, telefone: string, avisoId: string): Promise<void> {
  const cancelada = await comTransacao(deps.pool, async (cli) => {
    const { rows } = await cli.query<{ origem: string }>(
      `update public.sessao_cadastro_pix set status='cancelada'
        where telefone=$1 and aviso_id=$2 and status='ativa'
        returning origem`,
      [telefone, avisoId],
    )
    const origem = rows[0]?.origem
    if (!origem) return false
    if (origem === 'aceite') {
      const alvo = await carregarAvisoAlvo(cli, avisoId)
      if (alvo) await enfileirarNotificacao(cli, alvo, 'convite_aceito')
    }
    return true
  })
  if (cancelada) await enviar(deps, telefone, 'resposta.pix_pulado', { refId: avisoId })
}

async function corrigirAnterior(deps: DepsWizard, telefone: string, sessao: SessaoPix): Promise<void> {
  switch (sessao.etapa) {
    case 'instituicao':
      await atualizarSessao(deps.pool, sessao.id, { etapa: 'titular' })
      await enviar(deps, telefone, 'pix.titular', { refId: sessao.aviso_id })
      break
    case 'chave':
      await atualizarSessao(deps.pool, sessao.id, { etapa: 'instituicao' })
      await enviar(deps, telefone, 'pix.instituicao', { refId: sessao.aviso_id })
      break
    case 'tipo':
      await atualizarSessao(deps.pool, sessao.id, { etapa: 'chave' })
      await enviar(deps, telefone, 'pix.chave', { refId: sessao.aviso_id })
      break
    case 'confirmacao': {
      // Volta ao tipo, re-detectando a partir da chave guardada.
      const tipo = sessao.chave ? detectarTipoChavePix(sessao.chave) : null
      await atualizarSessao(deps.pool, sessao.id, { etapa: 'tipo', tipo })
      await pedirTipo(deps, telefone, sessao.aviso_id, tipo)
      break
    }
    default:
      // 'oferta'/'titular': nada a corrigir.
      break
  }
}

/**
 * H14.7: grava a chave no perfil do cobrador (chaves_pix) + snapshot no aviso, registra
 * `pix_cadastrada`, conclui a sessão e enfileira a notificação ao devedor, tudo numa
 * transação. Idempotente (clique duplo): só finaliza se a sessão ainda está ativa.
 */
async function finalizar(deps: DepsWizard, telefone: string, sessao: SessaoPix): Promise<void> {
  if (sessao.etapa !== 'confirmacao' || !sessao.chave || !sessao.tipo) return

  let nomeDevedor = ''
  const ok = await comTransacao(deps.pool, async (cli) => {
    const { rows: sr } = await cli.query<{ status: string }>(
      `select status from public.sessao_cadastro_pix where id=$1 for update`,
      [sessao.id],
    )
    if (sr[0]?.status !== 'ativa') return false
    const alvo = await carregarAvisoAlvo(cli, sessao.aviso_id)
    if (!alvo) return false
    nomeDevedor = alvo.nome_devedor ?? ''

    // Perfil do cobrador: vínculo do aviso (cobrador_id) ou lookup por telefone (conta
    // criada no aceite, H5.3). Sem perfil, ainda salvamos o snapshot no aviso (a chave
    // chega ao devedor); só não vai para o cadastro de chaves do cobrador.
    const profileId = alvo.cobrador_id ?? (await profilePorTelefone(cli, telefone))
    if (profileId) {
      await cli.query(
        `insert into public.chaves_pix (profile_id, chave, tipo, titular, banco)
         values ($1,$2,$3::tipo_chave_pix,$4,$5)
         on conflict (profile_id, chave) where not arquivada
         do update set tipo=excluded.tipo, titular=excluded.titular, banco=excluded.banco, atualizado_em=now()`,
        [profileId, sessao.chave, sessao.tipo, sessao.titular, sessao.instituicao],
      )
    }
    await cli.query(
      `update public.avisos set pix_chave=$2, pix_titular=$3, pix_banco=$4 where id=$1`,
      [sessao.aviso_id, sessao.chave, sessao.titular, sessao.instituicao],
    )
    await cli.query(
      `insert into public.eventos_aviso (aviso_id, tipo, ator) values ($1,'pix_cadastrada','cobrador')`,
      [sessao.aviso_id],
    )
    await cli.query(`update public.sessao_cadastro_pix set status='concluida' where id=$1`, [sessao.id])
    await enfileirarNotificacaoDevedor(cli, alvo, 'pix_chave_recebida')
    return true
  })

  if (ok) await enviar(deps, telefone, 'resposta.pix_salva', { valores: { nome_devedor: nomeDevedor }, refId: sessao.aviso_id })
}

/**
 * Expira sessões inativas (abandono, H14.8). Para as de origem 'aceite', o aceite estava
 * SEGURADO: enfileira a notificação de aceite ao devedor (fallback) para o aceite nunca
 * ficar sem aviso. Chamado pelo scheduler. Retorna quantas foram expiradas.
 */
export async function expirarSessoesPix(deps: { pool: Pool; logger: LogLike }): Promise<number> {
  return comTransacao(deps.pool, async (cli) => {
    const { rows } = await cli.query<{ aviso_id: string; origem: string }>(
      `update public.sessao_cadastro_pix set status='cancelada'
        where id in (
          select id from public.sessao_cadastro_pix
          where status='ativa' and atualizado_em < now() - interval '${SESSAO_PIX_EXPIRA_MIN} minutes'
          for update skip locked
        )
        returning aviso_id, origem`,
    )
    for (const r of rows) {
      if (r.origem === 'aceite') {
        const alvo = await carregarAvisoAlvo(cli, r.aviso_id)
        if (alvo) await enfileirarNotificacao(cli, alvo, 'convite_aceito')
      }
    }
    return rows.length
  })
}
