// Servico do modulo acessos_login (allowlist de login). Sem acesso HTTP aqui; erros de dominio
// via shared/http_errors. Aprovar um e-mail ENFILEIRA o boas-vindas na outbox de e-mail (migration
// 0082), uma vez (guarda boas_vindas_enviado_em + dedupe no banco). Nenhum e-mail vai para log.
import { comTransacao, type Pool } from '@whaviso/shared/db'
import { conflito, naoEncontrado } from '../../shared/http_errors'
import { enfileirarBoasVindas } from '../../shared/emails_outbox'
import * as repo from './repo'
import type { AcessoLinha } from './repo'
import type { AcessoAdicionar, AcessoDTO, AcessoStatus, MinhaElegibilidade } from './schemas'

/** Ator = operador autenticado (equipe Whaviso). Nunca recebe o e-mail do corpo como identidade. */
export interface Ator {
  userId: string
}

function paraDTO(l: AcessoLinha): AcessoDTO {
  return {
    id: l.id,
    email: l.email,
    status: l.status,
    origem: l.origem,
    conta_id: l.conta_id,
    observacao: l.observacao,
    aprovado_em: l.aprovado_em,
    boas_vindas_enviado_em: l.boas_vindas_enviado_em,
    criado_em: l.criado_em,
    atualizado_em: l.atualizado_em,
  }
}

export function criarServicoAcessosLogin(pool: Pool) {
  async function listar(_a: Ator, status?: AcessoStatus): Promise<AcessoDTO[]> {
    return (await repo.listar(pool, status)).map(paraDTO)
  }

  async function adicionar(a: Ator, b: AcessoAdicionar): Promise<AcessoDTO> {
    try {
      const linha = await repo.inserir(pool, {
        email: b.email,
        observacao: b.observacao ?? null,
        criadoPor: a.userId,
      })
      return paraDTO(linha!)
    } catch (e) {
      if ((e as { code?: string } | null)?.code === '23505') {
        throw conflito('email_duplicado', 'Este e-mail ja esta na lista de acessos')
      }
      throw e
    }
  }

  async function aprovar(a: Ator, id: string): Promise<AcessoDTO> {
    const atualizado = await comTransacao(pool, async (tx) => {
      const linha = await repo.aprovar(tx, id, a.userId)
      if (!linha) throw naoEncontrado('Acesso nao encontrado')
      // Enfileira o boas-vindas uma unica vez: so quando ainda nao foi tratado. O dedupe no banco
      // (indice unico parcial em emails_outbox.dedupe_chave) e a rede de seguranca contra corrida.
      if (!linha.boas_vindas_enviado_em) {
        await enfileirarBoasVindas(tx, linha.email)
        await repo.marcarBoasVindas(tx, linha.id)
        return (await repo.obter(tx, linha.id)) ?? linha // reflete boas_vindas_enviado_em no DTO
      }
      return linha
    })
    return paraDTO(atualizado)
  }

  async function revogar(_a: Ator, id: string): Promise<AcessoDTO> {
    const linha = await repo.revogar(pool, id)
    if (!linha) throw naoEncontrado('Acesso nao encontrado')
    return paraDTO(linha)
  }

  /**
   * Elegibilidade do proprio usuario autenticado: resolve o e-mail e mapeia o status da allowlist.
   * Serve a sonda da porta de entrada do painel (nao vaza status de terceiros: so o do caller).
   */
  async function minhaElegibilidade(userId: string): Promise<MinhaElegibilidade> {
    const email = await repo.emailDoUsuario(pool, userId)
    if (!email) return { estado: 'nao_cadastrado' }
    const status = await repo.statusDoEmail(pool, email)
    if (status === 'aprovado') return { estado: 'ativo' }
    if (status === 'pendente') return { estado: 'pendente' }
    if (status === 'revogado') return { estado: 'revogado' }
    return { estado: 'nao_cadastrado' }
  }

  return { listar, adicionar, aprovar, revogar, minhaElegibilidade }
}

export type ServicoAcessosLogin = ReturnType<typeof criarServicoAcessosLogin>
