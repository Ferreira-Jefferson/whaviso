// Regra de convites: criar (token so em hash), listar pendentes, revogar e aceitar (uso unico).
import { comTransacao, type Pool } from '@whaviso/shared/db'
import type { PapelMembro } from '@whaviso/shared/contracts'
import { Conflito, HttpError, NaoEncontrado, Proibido, regraNegocio } from '../../shared/http_errors'
import { gerarToken, sha256Hex } from '../../shared/tokens'
import { alcanca, exigirGestor, resolverAtor } from './contexto'
import {
  auditar,
  buscarConvite,
  buscarConvitePorHash,
  consumirConvite,
  inserirConvite,
  inserirMembro,
  listarConvitesPendentes,
  lojaDaConta,
  membroExato,
  atualizarMembro,
  revogarConvite,
  vinculosAtivos,
  type ConviteLinha,
} from './repo'
import type { ConviteCriarEntradaT } from './schemas'

const VALIDADE_DIAS = 7

export type ConviteSaida = Omit<ConviteLinha, 'conta_id' | 'aceito_em' | 'revogado_em'> & {
  link?: string
}

const paraSaida = (c: ConviteLinha, link?: string): ConviteSaida => ({
  id: c.id,
  loja_id: c.loja_id,
  papel: c.papel,
  expira_em: c.expira_em,
  criado_em: c.criado_em,
  ...(link ? { link } : {}),
})

/** Cria o convite. O token claro so existe na resposta desta chamada (nada no banco, nada em log). */
export async function criarConvite(
  pool: Pool,
  userId: string,
  entrada: ConviteCriarEntradaT,
  appUrl: string,
): Promise<ConviteSaida> {
  const lojaId = entrada.loja_id ?? null
  const papel = entrada.papel
  const token = gerarToken()

  const convite = await comTransacao(pool, async (tx) => {
    const ator = await resolverAtor(tx, userId)
    exigirGestor(ator)
    if (!ator.ehDono) {
      if (papel === 'dono') throw new Proibido('Apenas dono convida dono', 'apenas_dono')
      if (!alcanca(ator, lojaId)) throw new Proibido('Loja fora do seu alcance', 'loja_fora_do_alcance')
    }
    if (papel === 'dono' && lojaId !== null) {
      throw regraNegocio('dono_todas_lojas', 'Dono vale para todas as lojas da conta')
    }
    // SEC-002: a unica coisa vinda do corpo e a loja_id, validada contra a conta do ator.
    if (lojaId !== null && !(await lojaDaConta(tx, lojaId, ator.contaId))) {
      throw new NaoEncontrado('Loja nao encontrada', 'loja_nao_encontrada')
    }
    const criado = await inserirConvite(tx, {
      contaId: ator.contaId,
      lojaId,
      papel,
      tokenHash: sha256Hex(token),
      criadoPor: (ator.vinculos.find((v) => v.papel !== 'atendente') ?? ator.vinculos[0]!).id,
      dias: VALIDADE_DIAS,
    })
    await auditar(tx, {
      tipo: 'membro.convidado',
      entidade: 'convite',
      entidadeId: criado.id,
      lojaId,
      detalhes: { papel },
    })
    return criado
  })
  return paraSaida(convite, `${appUrl.replace(/\/+$/, '')}/convite/${token}`)
}

export async function listarConvites(pool: Pool, userId: string): Promise<ConviteSaida[]> {
  const ator = await resolverAtor(pool, userId)
  exigirGestor(ator)
  const todos = await listarConvitesPendentes(pool, ator.contaId)
  return todos.filter((c) => alcanca(ator, c.loja_id)).map((c) => paraSaida(c))
}

export async function revogar(pool: Pool, userId: string, conviteId: string): Promise<void> {
  await comTransacao(pool, async (tx) => {
    const ator = await resolverAtor(tx, userId)
    exigirGestor(ator)
    const convite = await buscarConvite(tx, conviteId, ator.contaId)
    if (!convite || !alcanca(ator, convite.loja_id)) throw new NaoEncontrado()
    if (!(await revogarConvite(tx, convite.id))) {
      throw new Conflito('Convite ja aceito ou revogado', 'convite_encerrado')
    }
    await auditar(tx, {
      tipo: 'membro.convidado',
      entidade: 'convite',
      entidadeId: convite.id,
      lojaId: convite.loja_id,
      detalhes: { revogado: true },
    })
  })
}

export interface AceiteSaida {
  membro_id: string
  conta_id: string
  loja_id: string | null
  papel: PapelMembro
}

/** Aceite atomico: qualquer usuario autenticado, mesmo sem membership. */
export async function aceitar(pool: Pool, userId: string, token: string): Promise<AceiteSaida> {
  return comTransacao(pool, async (tx) => {
    const convite = await buscarConvitePorHash(tx, sha256Hex(token))
    if (!convite) throw new NaoEncontrado('Convite invalido', 'convite_invalido')
    if (convite.revogado_em) throw new HttpError(410, 'convite_revogado', 'Convite revogado')
    if (convite.aceito_em) throw new Conflito('Convite ja utilizado', 'convite_ja_aceito')
    if (convite.expirado) throw new HttpError(410, 'convite_expirado', 'Convite expirado')

    // Conta unica por usuario (o kernel de escopo nega conta ambigua).
    const outros = await vinculosAtivos(tx, userId)
    if (outros.some((v) => v.conta_id !== convite.conta_id)) {
      throw new Conflito('Usuario ja pertence a outra conta', 'membro_de_outra_conta')
    }

    // Ja e membro ativo daquele alcance? 409 sem consumir o token.
    const exato = await membroExato(tx, userId, convite.conta_id, convite.loja_id)
    const jaTodas = outros.some((v) => v.loja_id === null)
    if ((exato && exato.ativo) || (convite.loja_id !== null && jaTodas)) {
      throw new Conflito('Usuario ja e membro', 'ja_membro')
    }

    if (!(await consumirConvite(tx, convite.id, userId))) {
      throw new Conflito('Convite ja utilizado', 'convite_ja_aceito')
    }
    const membro = exato
      ? await atualizarMembro(tx, exato.id, convite.conta_id, convite.papel, true)
      : await inserirMembro(tx, {
          contaId: convite.conta_id,
          lojaId: convite.loja_id,
          userId,
          papel: convite.papel,
        })
    await auditar(tx, {
      tipo: 'membro.aceito',
      entidade: 'membro',
      entidadeId: membro.id,
      lojaId: membro.loja_id,
      detalhes: { papel: membro.papel, origem: 'convite' },
    })
    return {
      membro_id: membro.id,
      conta_id: membro.conta_id,
      loja_id: membro.loja_id,
      papel: membro.papel,
    }
  })
}
