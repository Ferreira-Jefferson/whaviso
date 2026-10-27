// Regra de pessoas e escalas. Sem acesso HTTP aqui; erros de dominio via shared/http_errors.
// Nenhum dado pessoal (telefone, nome) e passado a log. Telefone da pessoa e PII: cifrado no banco
// (kernel de cifra), mascarado na saida e revelado so sob permissao elevada.
import type { Pool } from '@whaviso/shared/db'
import { naoEncontrado, regraNegocio } from '../../shared/http_errors'
import type { Cifra } from './cripto'
import {
  listarEscalas as listarEscalasRepo,
  listarPessoas,
  obterCargoVisivel,
  obterEscala,
  obterPessoa,
  type EscalaLinha,
  type PessoaLinha,
} from './repo'
import {
  atualizarEscala as atualizarEscalaRepo,
  atualizarPessoa,
  desativarEscala as desativarEscalaRepo,
  inserirEscala,
  inserirPessoa,
} from './repo_escrita'
import type { EscalaDto, EscalaNova, EscalaPatch, PessoaDto, PessoaNova, PessoaPatch } from './schemas'

export interface Ator {
  lojaId: string
  userId: string
}

function escalaSaida(e: EscalaLinha): EscalaDto {
  return {
    id: e.id,
    pessoa_id: e.pessoa_id,
    dia_semana: e.dia_semana,
    entrada: e.entrada,
    saida: e.saida,
    ativo: e.ativo,
    criado_em: e.criado_em,
  }
}

export function criarServicoPessoas(pool: Pool, cifra: Cifra) {
  const mascarar = (cifrado: Buffer | null): string | null =>
    cifrado ? cifra.mascararTelefone(cifra.decifrar(cifrado).toString('utf8')) : null

  function pessoaSaida(p: PessoaLinha): PessoaDto {
    return {
      id: p.id,
      nome: p.nome,
      cargo_id: p.cargo_id,
      cargo_nome: p.cargo_nome,
      cargo_chave: p.cargo_chave,
      telefone_mascarado: mascarar(p.telefone_cifrado),
      observacoes: p.observacoes,
      ativo: p.ativo,
      criado_em: p.criado_em,
      atualizado_em: p.atualizado_em,
    }
  }

  /** Telefone -> cifra (E.164). null limpa; undefined mantem. Invalido vira 422. */
  function cifrarTelefone(telefone: string | null | undefined): Buffer | null | undefined {
    if (telefone === undefined) return undefined
    if (telefone === null) return null
    const e164 = cifra.normalizarTelefoneBR(telefone)
    if (!e164) throw regraNegocio('telefone_invalido', 'Telefone invalido')
    return cifra.cifrar(Buffer.from(e164, 'utf8'))
  }

  /** Cargo utilizavel pela loja: preset ativo ou cargo proprio ativo. */
  async function exigirCargoUsavel(lojaId: string, cargoId: string) {
    const c = await obterCargoVisivel(pool, lojaId, cargoId)
    if (!c || !c.ativo) throw regraNegocio('cargo_invalido', 'Cargo inexistente, inativo ou de outra loja')
  }

  async function existente(a: Ator, id: string) {
    const p = await obterPessoa(pool, a.lojaId, id)
    if (!p) throw naoEncontrado('Pessoa nao encontrada')
    return p
  }

  async function escalaDaLoja(a: Ator, id: string) {
    const e = await obterEscala(pool, a.lojaId, id)
    if (!e) throw naoEncontrado('Escala nao encontrada')
    return e
  }

  return {
    async listar(a: Ator, incluirInativos: boolean) {
      const linhas = await listarPessoas(pool, a.lojaId, incluirInativos)
      return { itens: linhas.map(pessoaSaida) }
    },

    async detalhe(a: Ator, id: string) {
      const p = await existente(a, id)
      const escalas = await listarEscalasRepo(pool, a.lojaId, id)
      return { ...pessoaSaida(p), escalas: escalas.map(escalaSaida) }
    },

    async criar(a: Ator, entrada: PessoaNova) {
      await exigirCargoUsavel(a.lojaId, entrada.cargo_id)
      const cifrado = cifrarTelefone(entrada.telefone) ?? null
      const nova = await inserirPessoa(pool, a.lojaId, {
        nome: entrada.nome,
        cargoId: entrada.cargo_id,
        cifrado,
        observacoes: entrada.observacoes ?? null,
      })
      if (!nova) throw regraNegocio('pessoa_nao_criada', 'Nao foi possivel criar a pessoa')
      return pessoaSaida(await existente(a, nova.id))
    },

    async atualizar(a: Ator, id: string, p: PessoaPatch) {
      await existente(a, id)
      if (p.cargo_id !== undefined) await exigirCargoUsavel(a.lojaId, p.cargo_id)
      const r = await atualizarPessoa(pool, a.lojaId, id, {
        nome: p.nome,
        cargoId: p.cargo_id,
        cifrado: cifrarTelefone(p.telefone),
        observacoes: p.observacoes,
        ativo: p.ativo,
      })
      if (!r.afetou) throw naoEncontrado('Pessoa nao encontrada')
      return pessoaSaida(await existente(a, id))
    },

    async revelarTelefone(a: Ator, id: string) {
      const p = await existente(a, id)
      if (!p.telefone_cifrado) throw naoEncontrado('Telefone nao disponivel')
      return { telefone: cifra.decifrar(p.telefone_cifrado).toString('utf8') }
    },

    async listarEscalas(a: Ator, pessoaId: string) {
      await existente(a, pessoaId)
      return { itens: (await listarEscalasRepo(pool, a.lojaId, pessoaId)).map(escalaSaida) }
    },

    async criarEscala(a: Ator, pessoaId: string, d: EscalaNova) {
      await existente(a, pessoaId)
      const e = await inserirEscala(pool, a.lojaId, pessoaId, d)
      if (!e) throw regraNegocio('escala_nao_criada', 'Nao foi possivel criar a escala')
      return escalaSaida(e)
    },

    async atualizarEscala(a: Ator, id: string, p: EscalaPatch) {
      await escalaDaLoja(a, id)
      const e = await atualizarEscalaRepo(pool, a.lojaId, id, p)
      if (!e) throw naoEncontrado('Escala nao encontrada')
      return escalaSaida(e)
    },

    async desativarEscala(a: Ator, id: string) {
      await escalaDaLoja(a, id)
      const e = await desativarEscalaRepo(pool, a.lojaId, id)
      if (!e) throw naoEncontrado('Escala nao encontrada')
      return escalaSaida(e)
    },
  }
}

export type ServicoPessoas = ReturnType<typeof criarServicoPessoas>
