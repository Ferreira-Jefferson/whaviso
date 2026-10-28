// Regra de pessoas e escalas. Sem acesso HTTP aqui; erros de dominio via shared/http_errors.
// Nenhum dado pessoal (telefone, nome) e passado a log. Telefone da pessoa e PII: cifrado no banco
// (kernel de cifra), mascarado na saida e revelado so sob permissao elevada.
import { comTransacao, type Executor, type Pool } from '@whaviso/shared/db'
import { hashPix, normalizarPix, normalizarPlaca, ultimos4 } from '@whaviso/shared/pix_credencial'
import { naoEncontrado, regraNegocio } from '../../shared/http_errors'
import type { Cifra } from './cripto'
import {
  listarEscalas as listarEscalasRepo,
  listarPessoas,
  obterCargoVisivel,
  obterEntrega,
  obterEscala,
  obterPessoa,
  type EntregaLinha,
  type EscalaLinha,
  type PessoaLinha,
} from './repo'
import {
  atualizarEscala as atualizarEscalaRepo,
  atualizarPessoa,
  desativarEscala as desativarEscalaRepo,
  atualizarEntrega,
  inserirEntrega,
  inserirEscala,
  inserirPessoa,
  registrarEvento,
} from './repo_escrita'
import type {
  EscalaDto, EscalaNova, EscalaPatch, PessoaDto, PessoaEntregaDto, PessoaEntregaNova, PessoaNova,
  PessoaPatch,
} from './schemas'

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

  function entregaSaida(e: EntregaLinha): PessoaEntregaDto {
    return {
      veiculo: e.veiculo,
      placa: e.placa,
      pix_tipo: e.pix_tipo,
      pix_ultimos4: e.pix_cifrado ? ultimos4(cifra.decifrar(e.pix_cifrado).toString('utf8')) : null,
      regime_pagamento: e.regime_pagamento,
      periodicidade_fixo: e.periodicidade_fixo,
      valor_fixo_centavos: e.valor_fixo_centavos,
    }
  }

  /** Chave Pix valida do tipo informado -> campos prontos para gravar (hash + cifra). */
  function protegerPix(tipo: Parameters<typeof normalizarPix>[0], bruto: string) {
    const norm = normalizarPix(tipo, bruto, cifra)
    if (!norm) throw regraNegocio('pix_invalido', 'Chave Pix invalida para o tipo informado')
    return { tipo, hash: hashPix(tipo, norm), cifrado: cifra.cifrar(Buffer.from(norm, 'utf8')) }
  }

  function placaValida(bruto: string): string {
    const p = normalizarPlaca(bruto)
    if (!p) throw regraNegocio('placa_invalida', 'Placa invalida (formato antigo ou Mercosul)')
    return p
  }

  function evento(
    exec: Executor, a: Ator, tipo: string, entidadeId: string, detalhes: Record<string, unknown> = {},
  ) {
    return registrarEvento(exec, {
      lojaId: a.lojaId, tipo, entidade: 'pessoa', entidadeId, detalhes: { user_id: a.userId, ...detalhes },
    })
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
      const entrega = await obterEntrega(pool, a.lojaId, id)
      return {
        ...pessoaSaida(p),
        escalas: escalas.map(escalaSaida),
        entrega: entrega ? entregaSaida(entrega) : null,
      }
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

    /**
     * Define os dados de entrega (veiculo/placa/Pix/regime). So para a pessoa de cargo motoboy.
     * INSERT se a pessoa ainda nao tem linha; UPDATE caso ja tenha. placa/Pix: ausente mantem, null
     * limpa, presente troca (o Pix so sai mascarado, por isso edicao sem reenviar o claro mantem).
     */
    async definirEntrega(a: Ator, id: string, e: PessoaEntregaNova): Promise<PessoaEntregaDto> {
      const p = await existente(a, id)
      if (p.cargo_chave !== 'motoboy') {
        throw regraNegocio('cargo_nao_motoboy', 'Dados de entrega so para pessoa de cargo motoboy')
      }
      // 'por_entrega' nao tem parcela fixa: o valor e ignorado (gravado 0). Com parcela fixa, exige > 0.
      if (e.regime_pagamento !== 'por_entrega' && e.valor_fixo_centavos <= 0) {
        throw regraNegocio('valor_fixo_obrigatorio', 'Informe o valor fixo (> 0) para esse regime')
      }
      const valorFixo = e.regime_pagamento === 'por_entrega' ? 0 : e.valor_fixo_centavos
      // placa: undefined mantem (so no update), null limpa, string valida troca.
      const placa = e.placa === undefined ? undefined : e.placa === null ? null : placaValida(e.placa)
      // Pix: undefined mantem, null limpa, par (tipo+chave) troca.
      const pix =
        e.pix_tipo === undefined || e.pix === undefined
          ? undefined
          : e.pix_tipo === null || e.pix === null
            ? null
            : protegerPix(e.pix_tipo, e.pix)
      const existe = (await obterEntrega(pool, a.lojaId, id)) !== null
      await comTransacao(pool, async (tx) => {
        if (existe) {
          await atualizarEntrega(tx, a.lojaId, id, {
            veiculo: e.veiculo,
            regimePagamento: e.regime_pagamento,
            periodicidadeFixo: e.periodicidade_fixo,
            valorFixoCentavos: valorFixo,
            placa,
            pix,
          })
        } else {
          await inserirEntrega(tx, a.lojaId, {
            pessoaId: p.id,
            nome: p.nome,
            veiculo: e.veiculo,
            placa: placa ?? null,
            pixTipo: pix?.tipo ?? null,
            pixHash: pix?.hash ?? null,
            pixCifrado: pix?.cifrado ?? null,
            regimePagamento: e.regime_pagamento,
            periodicidadeFixo: e.periodicidade_fixo,
            valorFixoCentavos: valorFixo,
          })
        }
        await evento(tx, a, 'pessoa.entrega_definida', p.id, { regime_pagamento: e.regime_pagamento })
      })
      const atual = await obterEntrega(pool, a.lojaId, id)
      return entregaSaida(atual!)
    },

    /** Chave Pix decifrada da entrega (dono/gerente na rota). Auditado SEM o valor. */
    async revelarPixEntrega(a: Ator, id: string) {
      await existente(a, id)
      const e = await obterEntrega(pool, a.lojaId, id)
      if (!e?.pix_cifrado || !e.pix_tipo) {
        throw regraNegocio('pix_nao_cadastrado', 'Pessoa sem chave Pix cadastrada')
      }
      const pix = cifra.decifrar(e.pix_cifrado).toString('utf8')
      await evento(pool, a, 'pessoa.pix_revelado', id)
      return { pix_tipo: e.pix_tipo, pix }
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
