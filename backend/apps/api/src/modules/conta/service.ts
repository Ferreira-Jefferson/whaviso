// Regra do modulo: conta e membros. Sem acesso HTTP aqui; erros de dominio via shared/http_errors.
import { comTransacao, type Pool } from '@whaviso/shared/db'
import { Conflito, NaoEncontrado, Proibido, regraNegocio } from '../../shared/http_errors'
import { alcanca, exigirDono, exigirGestor, resolverAtor } from './contexto'
import {
  atualizarMembro,
  auditar,
  buscarConta,
  buscarMembro,
  contaDoDono,
  contarDonosAtivos,
  emailAprovado,
  emailDoUsuario,
  inserirConta,
  inserirMembro,
  listarMembros,
  renomearConta,
  travarConta,
  travarUsuario,
  vinculosAtivos,
  type ContaLinha,
  type MembroLinha,
} from './repo'
import type { MembroPapelAtualizarEntradaT } from './schemas'

export type ContaSaida = ContaLinha
export type MembroSaida = Omit<MembroLinha, 'conta_id'>

const paraMembroSaida = ({ conta_id: _c, ...resto }: MembroLinha): MembroSaida => resto

/** Bootstrap idempotente: devolve a conta existente do usuario ou cria conta + membro dono. */
export async function criarConta(
  pool: Pool,
  userId: string,
  nome: string,
): Promise<{ conta: ContaSaida; criada: boolean }> {
  return comTransacao(pool, async (tx) => {
    await travarUsuario(tx, userId)
    const existente = await contaDoDono(tx, userId)
    if (existente) return { conta: existente, criada: false }
    // Membro de outra conta (convidado) nao cria uma segunda conta por esta rota.
    if ((await vinculosAtivos(tx, userId)).length > 0) {
      throw new Conflito('Usuario ja pertence a uma conta', 'ja_possui_conta')
    }
    // Gate da allowlist de login (migration 0082): so cria a 1a conta quem o operador ja liberou.
    // O convidado ja saiu acima (ja_possui_conta), logo nao e afetado. E-mail resolvido pelo Auth.
    const email = await emailDoUsuario(tx, userId)
    if (!email || !(await emailAprovado(tx, email))) {
      throw new Proibido('Seu acesso ainda nao foi liberado', 'acesso_nao_aprovado')
    }
    const conta = await inserirConta(tx, userId, nome)
    const dono = await inserirMembro(tx, {
      contaId: conta.id,
      lojaId: null,
      userId,
      papel: 'dono',
    })
    await auditar(tx, { tipo: 'conta.criada', entidade: 'conta', entidadeId: conta.id })
    await auditar(tx, {
      tipo: 'membro.aceito',
      entidade: 'membro',
      entidadeId: dono.id,
      detalhes: { papel: 'dono', origem: 'bootstrap' },
    })
    return { conta, criada: true }
  })
}

export async function lerConta(pool: Pool, userId: string): Promise<ContaSaida> {
  const ator = await resolverAtor(pool, userId)
  exigirDono(ator)
  const conta = await buscarConta(pool, ator.contaId)
  if (!conta) throw new NaoEncontrado()
  return conta
}

export async function renomear(pool: Pool, userId: string, nome: string): Promise<ContaSaida> {
  const ator = await resolverAtor(pool, userId)
  exigirDono(ator)
  return renomearConta(pool, ator.contaId, nome)
}

export async function listar(pool: Pool, userId: string): Promise<MembroSaida[]> {
  const ator = await resolverAtor(pool, userId)
  exigirGestor(ator)
  const todos = await listarMembros(pool, ator.contaId)
  // Gerente restrito a lojas enxerga so quem esta nas suas lojas.
  return todos.filter((m) => alcanca(ator, m.loja_id)).map(paraMembroSaida)
}

export async function alterarMembro(
  pool: Pool,
  userId: string,
  membroId: string,
  entrada: MembroPapelAtualizarEntradaT,
): Promise<MembroSaida> {
  return comTransacao(pool, async (tx) => {
    const ator = await resolverAtor(tx, userId)
    exigirGestor(ator)
    await travarConta(tx, ator.contaId)
    // Filtra por conta do ator: id de outra conta e 404 (nao vaza existencia).
    const alvo = await buscarMembro(tx, membroId, ator.contaId)
    if (!alvo) throw new NaoEncontrado()

    const papel = entrada.papel ?? alvo.papel
    const ativo = entrada.ativo ?? alvo.ativo

    // Guarda do ultimo dono (antes da checagem de auto-alteracao: mensagem mais util).
    if (alvo.papel === 'dono' && alvo.ativo && (papel !== 'dono' || !ativo)) {
      if ((await contarDonosAtivos(tx, ator.contaId, alvo.id)) === 0) {
        throw new Conflito('A conta precisa de ao menos um dono', 'ultimo_dono')
      }
    }
    if (alvo.user_id === ator.userId) {
      throw new Proibido('Ninguem altera o proprio papel ou status', 'auto_alteracao')
    }
    if (!ator.ehDono) {
      if (alvo.papel === 'dono' || papel === 'dono') {
        throw new Proibido('Apenas dono altera ou promove dono', 'apenas_dono')
      }
      if (!alcanca(ator, alvo.loja_id)) throw new Proibido()
    }
    if (papel === 'dono' && alvo.loja_id !== null) {
      throw regraNegocio('dono_todas_lojas', 'Dono vale para todas as lojas da conta')
    }

    const novo = await atualizarMembro(tx, alvo.id, ator.contaId, papel, ativo)
    if (papel !== alvo.papel) {
      await auditar(tx, {
        tipo: 'membro.papel_alterado',
        entidade: 'membro',
        entidadeId: alvo.id,
        lojaId: alvo.loja_id,
        detalhes: { de: alvo.papel, para: papel },
      })
    }
    if (ativo !== alvo.ativo) {
      await auditar(tx, {
        tipo: ativo ? 'membro.papel_alterado' : 'membro.removido',
        entidade: 'membro',
        entidadeId: alvo.id,
        lojaId: alvo.loja_id,
        detalhes: { ativo },
      })
    }
    return paraMembroSaida(novo)
  })
}
