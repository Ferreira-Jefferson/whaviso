// Regra do modulo contas a pagar. Sem acesso HTTP aqui; erros de dominio via shared/http_errors.
// Dinheiro em centavos. O telefone do fornecedor e PII: nunca vai a log nem a evento; a saida traz
// so a mascara (ultimos 4) e o claro so em `revelarTelefone` (dono/gerente). O nome do credor vem
// por read-model (join), nunca importando os modulos fornecedor/pessoas.
import { comTransacao, type Executor, type Pool } from '@whaviso/shared/db'
import { hojeSp } from '@whaviso/shared/datas'
import { ultimos4 } from '@whaviso/shared/pix_credencial'
import { conflito, naoEncontrado, regraNegocio } from '../../shared/http_errors'
import type { Cifra } from './cripto'
import * as repo from './repo'
import * as escrita from './repo_escrita'
import type {
  AcertoAjusteNovo, AcertoMotoboyLinhaDto, AcertoPagoDto, AcertoPeriodoDto, ContaPagarDto,
  ContaPagarNovo, ContaPagarPatch, FornecedorDto, FornecedorNovo, FornecedorPatch, PagarAcertoNovo,
} from './schemas'

export interface Ator {
  lojaId: string
  userId: string
}

/** Teto do periodo de consulta do acerto (a leitura materializa lancamentos). */
const MAX_DIAS_ACERTO = 93

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

  // --- Acerto do motoboy por periodo (aplica o regime de pagamento sobre o ledger) ---

  /** Meses-calendario (SP) distintos em [de,ate] inclusive. Ex.: 2026-01-20..2026-02-05 = 2. */
  function mesesNoPeriodo(de: string, ate: string): number {
    const [ay, am] = de.split('-').map(Number)
    const [by, bm] = ate.split('-').map(Number)
    return (by! * 12 + bm!) - (ay! * 12 + am!) + 1
  }

  /** Parcela fixa derivada e total do regime. fixo: 0 em por_entrega; por dia trabalhado ou por mes. */
  function calcularAcerto(g: repo.AcertoAgregadoDb, meses: number): { fixo: number; total: number } {
    const temFixo = g.regime_pagamento === 'fixo' || g.regime_pagamento === 'fixo_mais_entrega'
    const temEntrega = g.regime_pagamento === 'por_entrega' || g.regime_pagamento === 'fixo_mais_entrega'
    const fixo = !temFixo
      ? 0
      : g.periodicidade_fixo === 'dia'
        ? g.valor_fixo_centavos * g.dias_trabalhados
        : g.valor_fixo_centavos * meses
    const total = (temFixo ? fixo : 0) + (temEntrega ? g.entregas_centavos : 0) + g.ajustes_centavos
    return { fixo, total }
  }

  function montarLinhaAcerto(
    g: repo.AcertoAgregadoDb, meses: number, lancs: repo.AcertoLancamentoDb[],
  ): AcertoMotoboyLinhaDto {
    const { fixo, total } = calcularAcerto(g, meses)
    return {
      motoboy_id: g.motoboy_id,
      motoboy_nome: g.motoboy_nome,
      regime_pagamento: g.regime_pagamento,
      periodicidade_fixo: g.periodicidade_fixo,
      valor_fixo_centavos: g.valor_fixo_centavos,
      qtd_entregas: g.qtd_entregas,
      dias_trabalhados: g.dias_trabalhados,
      entregas_centavos: g.entregas_centavos,
      fixo_centavos: fixo,
      ajustes_centavos: g.ajustes_centavos,
      total_centavos: total,
      pago: g.pago,
      lancamentos: lancs
        .filter((x) => x.motoboy_id === g.motoboy_id)
        .map((x) => ({
          id: x.id, data: x.data, tipo: x.tipo, pedido_id: x.pedido_id,
          valor_centavos: x.valor_centavos, descricao: x.descricao, criado_em: x.criado_em,
        })),
    }
  }

  async function motoboyExistente(exec: Executor, a: Ator, id: string): Promise<void> {
    if (!(await repo.motoboyDaLoja(exec, a.lojaId, id))) throw naoEncontrado('Motoboy nao encontrado')
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

    // --- Acerto do motoboy por periodo ---

    /** Acerto de [de,ate]: materializa as entregas e devolve o breakdown por regime (total DERIVADO). */
    async acertoPeriodo(a: Ator, de: string, ate: string): Promise<AcertoPeriodoDto> {
      if (ate < de) {
        throw regraNegocio('periodo_invalido', 'A data final nao pode ser anterior a inicial')
      }
      const dias = Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000) + 1
      if (dias > MAX_DIAS_ACERTO) {
        throw regraNegocio('periodo_muito_longo', `O periodo maximo e de ${MAX_DIAS_ACERTO} dias`)
      }
      await comTransacao(pool, (tx) => escrita.materializarEntregasPeriodo(tx, a.lojaId, de, ate))
      const [agregados, lancs] = await Promise.all([
        repo.acertosDoPeriodo(pool, a.lojaId, de, ate),
        repo.lancamentosDoPeriodo(pool, a.lojaId, de, ate),
      ])
      const meses = mesesNoPeriodo(de, ate)
      const linhas = agregados.map((g) => montarLinhaAcerto(g, meses, lancs))
      return { de, ate, total_centavos: linhas.reduce((s, l) => s + l.total_centavos, 0), linhas }
    },

    /** Ajuste manual no acerto (append-only, valor com sinal). Dia em acerto pago = 409. */
    async lancarAjuste(a: Ator, e: AcertoAjusteNovo) {
      await motoboyExistente(pool, a, e.motoboy_id)
      const hoje = hojeSp()
      const data = e.data ?? hoje
      if (data > hoje) throw regraNegocio('data_futura', 'A data do lancamento nao pode ser futura')
      const lanc = await comTransacao(pool, async (tx) => {
        await escrita.travarAcertoMotoboy(tx, e.motoboy_id)
        if (await repo.acertoPagoCobre(tx, a.lojaId, e.motoboy_id, data)) {
          throw conflito('periodo_ja_pago', 'Periodo ja pago: lance em um periodo aberto')
        }
        const { lancamento, criado } = await escrita.inserirAjuste(tx, {
          lojaId: a.lojaId, motoboyId: e.motoboy_id, data, valorCentavos: e.valor_centavos,
          descricao: e.descricao, userId: a.userId, chaveIdempotencia: e.chave_idempotencia ?? null,
        })
        // Reenvio com a mesma chave (duplo-clique/retry): nada de novo gravado, nao registra evento.
        if (criado) {
          await evento(tx, a, 'acerto_motoboy.ajuste', 'motoboy', e.motoboy_id, {
            lancamento_id: lancamento.id, data, valor_centavos: e.valor_centavos,
          })
        }
        return lancamento
      })
      return {
        id: lanc.id, data: lanc.data, tipo: 'ajuste' as const, pedido_id: null,
        valor_centavos: lanc.valor_centavos, descricao: lanc.descricao, criado_em: lanc.criado_em,
      }
    },

    /** Paga [de,ate] de um motoboy: trava, recusa sobreposicao com pago, recomputa e congela o total. */
    async pagarAcerto(a: Ator, e: PagarAcertoNovo): Promise<AcertoPagoDto> {
      if (e.ate < e.de) {
        throw regraNegocio('periodo_invalido', 'A data final nao pode ser anterior a inicial')
      }
      const acerto = await comTransacao(pool, async (tx) => {
        await escrita.travarAcertoMotoboy(tx, e.motoboy_id)
        await motoboyExistente(tx, a, e.motoboy_id)
        if (await repo.acertoPagoSobrepoe(tx, a.lojaId, e.motoboy_id, e.de, e.ate)) {
          throw conflito('periodo_sobreposto', 'Ja existe acerto pago que sobrepoe este periodo')
        }
        await escrita.materializarEntregasPeriodo(tx, a.lojaId, e.de, e.ate)
        const g = await repo.acertoDoMotoboy(tx, a.lojaId, e.motoboy_id, e.de, e.ate)
        const total = g ? calcularAcerto(g, mesesNoPeriodo(e.de, e.ate)).total : 0
        if (total !== e.total_centavos) {
          throw conflito('total_divergente', 'O total do periodo mudou; revise antes de pagar')
        }
        const pago = await escrita.inserirAcertoPago(tx, {
          lojaId: a.lojaId, motoboyId: e.motoboy_id, de: e.de, ate: e.ate, totalCentavos: total,
          userId: a.userId,
        })
        await evento(tx, a, 'acerto_motoboy.pago', 'acerto_motoboy', pago.id, {
          de: e.de, ate: e.ate, total_centavos: total,
        })
        return pago
      })
      return {
        id: acerto.id,
        motoboy_id: e.motoboy_id,
        periodo_inicio: acerto.periodo_inicio,
        periodo_fim: acerto.periodo_fim,
        total_pago_centavos: acerto.total_pago_centavos,
        pago_em: acerto.pago_em,
      }
    },
  }
}

export type ServicoContasPagar = ReturnType<typeof criarServicoContasPagar>
