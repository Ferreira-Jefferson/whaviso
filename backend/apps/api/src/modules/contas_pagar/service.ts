// Regra do modulo contas a pagar. Sem acesso HTTP aqui; erros de dominio via shared/http_errors.
// Dinheiro em centavos. O telefone do fornecedor e PII: nunca vai a log nem a evento; a saida traz
// so a mascara (ultimos 4) e o claro so em `revelarTelefone` (dono/gerente). O nome do credor vem
// por read-model (join), nunca importando os modulos fornecedor/pessoas.
import { comTransacao, type Executor, type Pool } from '@whaviso/shared/db'
import { ultimos4 } from '@whaviso/shared/pix_credencial'
import { conflito, naoEncontrado, regraNegocio } from '../../shared/http_errors'
import type { Cifra } from './cripto'
import * as repo from './repo'
import * as escrita from './repo_escrita'
import type {
  ContaPagarDto, ContaPagarNovo, ContaPagarPatch, FornecedorDto, FornecedorNovo, FornecedorPatch,
} from './schemas'

export interface Ator {
  lojaId: string
  userId: string
}

export function criarServicoContasPagar(pool: Pool, cifra: Cifra) {
  /** Ultimos 4 digitos do telefone decifrado; nunca o numero completo. */
  const mascara = (cifrado: Buffer | null): string | null => {
    if (!cifrado) return null
    try {
      return ultimos4(cifra.decifrar(cifrado).toString('utf8'))
    } catch {
      return null
    }
  }

  const fornecedorSaida = (f: repo.FornecedorLinha): FornecedorDto => ({
    id: f.id,
    nome: f.nome,
    documento: f.documento,
    telefone_ultimos4: mascara(f.telefone_cifrado),
    observacoes: f.observacoes,
    ativo: f.ativo,
    criado_em: f.criado_em,
    atualizado_em: f.atualizado_em,
  })

  const contaSaida = (c: repo.ContaPagarLinha): ContaPagarDto => ({
    id: c.id,
    credor_tipo: c.credor_tipo,
    credor_id: c.credor_id,
    credor_nome: c.credor_nome,
    descricao: c.descricao,
    valor_centavos: c.valor_centavos,
    vencimento: c.vencimento,
    competencia: c.competencia,
    status: c.status,
    pago_em: c.pago_em,
    criado_em: c.criado_em,
  })

  function evento(
    exec: Executor, a: Ator, tipo: string, entidade: string, entidadeId: string,
    detalhes: Record<string, unknown> = {},
  ) {
    return escrita.registrarEvento(exec, {
      lojaId: a.lojaId, tipo, entidade, entidadeId, detalhes: { user_id: a.userId, ...detalhes },
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

  async function fornecedorExistente(a: Ator, id: string): Promise<repo.FornecedorLinha> {
    const f = await repo.obterFornecedor(pool, a.lojaId, id)
    if (!f) throw naoEncontrado('Fornecedor nao encontrado')
    return f
  }

  async function contaPorId(a: Ator, id: string): Promise<ContaPagarDto> {
    const c = await repo.obterConta(pool, a.lojaId, id)
    if (!c) throw naoEncontrado('Conta nao encontrada')
    return contaSaida(c)
  }

  return {
    // --- Fornecedores ---
    async listarFornecedores(a: Ator, incluirInativos: boolean) {
      const linhas = await repo.listarFornecedores(pool, a.lojaId, incluirInativos)
      return { itens: linhas.map(fornecedorSaida) }
    },

    async obterFornecedor(a: Ator, id: string) {
      return fornecedorSaida(await fornecedorExistente(a, id))
    },

    async criarFornecedor(a: Ator, e: FornecedorNovo): Promise<FornecedorDto> {
      const telefoneCifrado = cifrarTelefone(e.telefone) ?? null
      const criado = await comTransacao(pool, async (tx) => {
        const f = await escrita.inserirFornecedor(tx, a.lojaId, {
          nome: e.nome,
          documento: e.documento ?? null,
          telefoneCifrado,
          observacoes: e.observacoes ?? null,
        })
        if (!f) throw regraNegocio('fornecedor_nao_criado', 'Nao foi possivel criar o fornecedor')
        await evento(tx, a, 'fornecedor.criado', 'fornecedor', f.id)
        return f
      })
      return fornecedorSaida(criado)
    },

    async atualizarFornecedor(a: Ator, id: string, p: FornecedorPatch): Promise<FornecedorDto> {
      await fornecedorExistente(a, id)
      const atualizado = await comTransacao(pool, async (tx) => {
        const f = await escrita.atualizarFornecedor(tx, a.lojaId, id, {
          nome: p.nome,
          documento: p.documento,
          telefoneCifrado: cifrarTelefone(p.telefone),
          observacoes: p.observacoes,
          ativo: p.ativo,
        })
        if (!f) throw naoEncontrado('Fornecedor nao encontrado')
        await evento(tx, a, 'fornecedor.atualizado', 'fornecedor', id)
        return f
      })
      return fornecedorSaida(atualizado)
    },

    async alterarAtivoFornecedor(a: Ator, id: string, ativar: boolean): Promise<FornecedorDto> {
      const f = await fornecedorExistente(a, id)
      if (f.ativo === ativar) {
        throw conflito(
          ativar ? 'fornecedor_ja_ativo' : 'fornecedor_ja_inativo',
          ativar ? 'Fornecedor ja esta ativo' : 'Fornecedor ja esta arquivado',
        )
      }
      const atualizado = await comTransacao(pool, async (tx) => {
        const r = await escrita.atualizarFornecedor(tx, a.lojaId, id, { ativo: ativar })
        if (!r) throw naoEncontrado('Fornecedor nao encontrado')
        await evento(tx, a, ativar ? 'fornecedor.ativado' : 'fornecedor.desativado', 'fornecedor', id)
        return r
      })
      return fornecedorSaida(atualizado)
    },

    /** Telefone decifrado do fornecedor (dono/gerente na rota). Auditado SEM o valor. */
    async revelarTelefone(a: Ator, id: string) {
      const f = await fornecedorExistente(a, id)
      if (!f.telefone_cifrado) throw naoEncontrado('Telefone nao disponivel')
      const telefone = cifra.decifrar(f.telefone_cifrado).toString('utf8')
      await evento(pool, a, 'fornecedor.telefone_revelado', 'fornecedor', id)
      return { telefone }
    },

    // --- Contas a pagar (lancamentos manuais) ---
    async listarContas(a: Ator, f: repo.ContasFiltro) {
      const linhas = await repo.listarContas(pool, a.lojaId, f)
      return { itens: linhas.map(contaSaida) }
    },

    async criarConta(a: Ator, e: ContaPagarNovo): Promise<ContaPagarDto> {
      // O credor precisa existir e ser da loja; o credor_tipo casa com a FK certa.
      if (e.credor_tipo === 'fornecedor') {
        const f = await repo.fornecedorDaLoja(pool, a.lojaId, e.credor_id)
        if (!f) throw naoEncontrado('Fornecedor nao encontrado')
        if (!f.ativo) throw regraNegocio('fornecedor_inativo', 'Fornecedor arquivado; reative-o para lancar')
      } else {
        const p = await repo.pessoaDaLoja(pool, a.lojaId, e.credor_id)
        if (!p) throw naoEncontrado('Pessoa nao encontrada')
      }
      const id = await comTransacao(pool, async (tx) => {
        const { id, criado } = await escrita.inserirConta(tx, {
          lojaId: a.lojaId,
          credorTipo: e.credor_tipo,
          credorId: e.credor_id,
          descricao: e.descricao,
          valorCentavos: e.valor_centavos,
          vencimento: e.vencimento ?? null,
          competencia: e.competencia ?? null,
          userId: a.userId,
          chaveIdempotencia: e.chave_idempotencia ?? null,
        })
        // Reenvio com a mesma chave (duplo-clique/retry): nada de novo gravado, nao registra evento.
        if (criado) {
          await evento(tx, a, 'conta_pagar.criada', 'conta_pagar', id, {
            credor_tipo: e.credor_tipo, valor_centavos: e.valor_centavos,
          })
        }
        return id
      })
      return contaPorId(a, id)
    },

    /** Edita a conta so enquanto `a_pagar`; depois de paga, 409. Serializa com o pagar por FOR UPDATE. */
    async atualizarConta(a: Ator, id: string, p: ContaPagarPatch): Promise<ContaPagarDto> {
      await comTransacao(pool, async (tx) => {
        const c = await escrita.travarConta(tx, a.lojaId, id)
        if (!c) throw naoEncontrado('Conta nao encontrada')
        if (c.status === 'pago') throw conflito('conta_ja_paga', 'Conta ja paga; nao e mais editavel')
        await escrita.atualizarConta(tx, a.lojaId, id, {
          descricao: p.descricao,
          valorCentavos: p.valor_centavos,
          vencimento: p.vencimento,
          competencia: p.competencia,
        })
        await evento(tx, a, 'conta_pagar.atualizada', 'conta_pagar', id)
      })
      return contaPorId(a, id)
    },

    /** Marca como paga. Idempotente; recusa (409) se o valor mudou desde o que o dono viu. */
    async pagarConta(a: Ator, id: string, valorVisto: number): Promise<ContaPagarDto> {
      await comTransacao(pool, async (tx) => {
        const c = await escrita.travarConta(tx, a.lojaId, id)
        if (!c) throw naoEncontrado('Conta nao encontrada')
        if (c.status === 'pago') return
        if (c.valor_centavos !== valorVisto) {
          throw conflito('total_divergente', 'O valor da conta mudou; revise antes de pagar')
        }
        await escrita.marcarContaPaga(tx, a.lojaId, id, a.userId)
        await evento(tx, a, 'conta_pagar.paga', 'conta_pagar', id, { valor_centavos: valorVisto })
      })
      return contaPorId(a, id)
    },
  }
}

export type ServicoContasPagar = ReturnType<typeof criarServicoContasPagar>
