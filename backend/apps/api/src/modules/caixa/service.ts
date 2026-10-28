// Regra do modulo caixa (PDV). Sem acesso HTTP aqui; erros de dominio via shared/http_errors.
// Nenhum dado pessoal vai para log, evento ou auditoria. Dinheiro sempre em centavos (int).
import { comTransacao, ErroBanco, type Pool } from '@whaviso/shared/db'
import { conflito, naoEncontrado, regraNegocio } from '../../shared/http_errors'
import * as repo from './repo'
import type { CaixaLinha, MovimentoLinha, TotaisLinha } from './repo'
import type {
  CaixaAbrirEntrada, CaixaFecharEntrada, CaixaRelatorioSaida, CaixaSaida, MovimentoEntrada, MovimentoSaida,
} from './schemas'

export interface Ator {
  lojaId: string
  userId: string
}

function paraCaixa(l: CaixaLinha): CaixaSaida {
  return {
    id: l.id,
    status: l.status,
    aberto_por_user_id: l.aberto_por_user_id,
    aberto_em: l.aberto_em,
    saldo_inicial_centavos: l.saldo_inicial_centavos,
    fechado_por_user_id: l.fechado_por_user_id,
    fechado_em: l.fechado_em,
    saldo_informado_centavos: l.saldo_informado_centavos,
    saldo_calculado_centavos: l.saldo_calculado_centavos,
    diferenca_centavos: l.diferenca_centavos,
    observacoes: l.observacoes,
  }
}

function paraMovimento(m: MovimentoLinha): MovimentoSaida {
  return {
    id: m.id,
    caixa_id: m.caixa_id,
    tipo: m.tipo,
    forma_pagamento: m.forma_pagamento,
    valor_centavos: m.valor_centavos,
    pedido_id: m.pedido_id,
    motivo: m.motivo,
    criado_por_user_id: m.criado_por_user_id,
    criado_em: m.criado_em,
  }
}

/** Dinheiro esperado na gaveta: saldo_inicial + suprimentos + vendas_em_dinheiro - sangrias. */
function saldoEsperadoDinheiro(saldoInicial: number, t: TotaisLinha): number {
  return saldoInicial + t.total_suprimentos + t.venda_dinheiro - t.total_sangrias
}

export function criarServicoCaixa(pool: Pool) {
  async function sessaoAbertaOuNula(a: Ator): Promise<{ caixa: CaixaSaida | null }> {
    const c = await repo.obterSessaoAberta(pool, a.lojaId)
    return { caixa: c ? paraCaixa(c) : null }
  }

  async function caixaDaLoja(a: Ator, id: string): Promise<CaixaLinha> {
    const c = await repo.obterCaixa(pool, a.lojaId, id)
    if (!c) throw naoEncontrado('Caixa nao encontrado')
    return c
  }

  async function abrir(a: Ator, b: CaixaAbrirEntrada): Promise<CaixaSaida> {
    // Pre-checagem amigavel; o indice parcial unico garante a corrida (so UMA sessao aberta).
    if (await repo.obterSessaoAberta(pool, a.lojaId)) {
      throw conflito('caixa_ja_aberto', 'Ja existe um caixa aberto nesta loja; feche-o antes de abrir outro')
    }
    try {
      const c = await comTransacao(pool, async (tx) => {
        const novo = await repo.abrir(tx, a.lojaId, { abertoPor: a.userId, saldoInicial: b.saldo_inicial_centavos })
        await repo.registrarEvento(tx, {
          lojaId: a.lojaId, tipo: 'caixa.aberto', entidade: 'caixa', entidadeId: novo!.id,
          detalhes: { user_id: a.userId, saldo_inicial_centavos: b.saldo_inicial_centavos },
        })
        return novo!
      })
      return paraCaixa(c)
    } catch (e) {
      if (e instanceof ErroBanco && e.tipo === 'unique') {
        throw conflito('caixa_ja_aberto', 'Ja existe um caixa aberto nesta loja; feche-o antes de abrir outro')
      }
      throw e
    }
  }

  async function registrar(a: Ator, caixaId: string, b: MovimentoEntrada): Promise<MovimentoSaida> {
    const caixa = await caixaDaLoja(a, caixaId)
    if (caixa.status !== 'aberto') throw conflito('caixa_fechado', 'O caixa esta fechado; abra um novo para lancar')

    const positivo = b.tipo === 'venda' || b.tipo === 'sangria' || b.tipo === 'suprimento'
    if (positivo && b.valor_centavos <= 0) {
      throw regraNegocio('valor_invalido', 'Valor deve ser maior que zero')
    }
    if (b.tipo === 'ajuste' && b.valor_centavos === 0) {
      throw regraNegocio('valor_invalido', 'Ajuste nao pode ser zero')
    }
    // forma_pagamento so faz sentido na venda (o check do banco tambem obriga).
    if (b.tipo === 'venda' && !b.forma_pagamento) {
      throw regraNegocio('forma_obrigatoria', 'Venda exige a forma de pagamento')
    }
    if (b.tipo !== 'venda' && b.forma_pagamento) {
      throw regraNegocio('forma_nao_aplicavel', 'Forma de pagamento so se aplica a venda')
    }
    if (b.tipo === 'ajuste' && !b.motivo) {
      throw regraNegocio('motivo_obrigatorio', 'Ajuste exige um motivo')
    }
    // pedido_id so se vincula a venda e tem que ser da loja.
    const pedidoId = b.tipo === 'venda' ? (b.pedido_id ?? null) : null
    if (pedidoId && !(await repo.pedidoDaLoja(pool, a.lojaId, pedidoId))) {
      throw naoEncontrado('Pedido nao encontrado')
    }

    const m = await comTransacao(pool, async (tx) => {
      // Re-trava e reconfere o status DENTRO da tx: a checagem acima foi fora dela, e o caixa pode
      // ter sido fechado em concorrencia. Serializa com `fechar` pelo row lock do caixa.
      const travado = await repo.travarCaixa(tx, a.lojaId, caixaId)
      if (!travado || travado.status !== 'aberto') {
        throw conflito('caixa_fechado', 'O caixa esta fechado; abra um novo para lancar')
      }
      const { movimento, criado } = await repo.inserirMovimento(tx, a.lojaId, caixaId, {
        tipo: b.tipo,
        formaPagamento: b.tipo === 'venda' ? b.forma_pagamento! : null,
        valor: b.valor_centavos,
        pedidoId,
        motivo: b.motivo ?? null,
        criadoPor: a.userId,
        chaveIdempotencia: b.chave_idempotencia ?? null,
      })
      // Reenvio com a mesma chave (duplo-clique/retry): nada de novo gravado, nao registra evento.
      if (criado) {
        await repo.registrarEvento(tx, {
          lojaId: a.lojaId, tipo: 'caixa.movimento', entidade: 'movimento_caixa', entidadeId: movimento.id,
          detalhes: { user_id: a.userId, caixa_id: caixaId, tipo: b.tipo, valor_centavos: b.valor_centavos },
        })
      }
      return movimento
    })
    return paraMovimento(m)
  }

  async function fechar(a: Ator, caixaId: string, b: CaixaFecharEntrada): Promise<CaixaSaida> {
    const caixa = await caixaDaLoja(a, caixaId)
    if (caixa.status !== 'aberto') throw conflito('caixa_fechado', 'Este caixa ja foi fechado')
    const t = await repo.totais(pool, a.lojaId, caixaId)
    const calculado = saldoEsperadoDinheiro(caixa.saldo_inicial_centavos, t)
    const diferenca = b.saldo_informado_centavos - calculado

    const fechado = await comTransacao(pool, async (tx) => {
      const r = await repo.fechar(tx, a.lojaId, caixaId, {
        fechadoPor: a.userId,
        saldoInformado: b.saldo_informado_centavos,
        saldoCalculado: calculado,
        diferenca,
        observacoes: b.observacoes ?? null,
      })
      if (!r) throw conflito('caixa_fechado', 'O caixa mudou de status, atualize a tela')
      await repo.registrarEvento(tx, {
        lojaId: a.lojaId, tipo: 'caixa.fechado', entidade: 'caixa', entidadeId: caixaId,
        detalhes: { user_id: a.userId, diferenca_centavos: diferenca },
      })
      return r
    })
    return paraCaixa(fechado)
  }

  async function relatorio(a: Ator, caixaId: string): Promise<CaixaRelatorioSaida> {
    const caixa = await caixaDaLoja(a, caixaId)
    const [t, movimentos] = await Promise.all([
      repo.totais(pool, a.lojaId, caixaId),
      repo.listarMovimentos(pool, a.lojaId, caixaId),
    ])
    return {
      caixa: paraCaixa(caixa),
      totais_por_forma: {
        dinheiro: t.venda_dinheiro,
        credito: t.venda_credito,
        debito: t.venda_debito,
        pix: t.venda_pix,
        outro: t.venda_outro,
      },
      total_vendas_centavos: t.total_vendas,
      total_suprimentos_centavos: t.total_suprimentos,
      total_sangrias_centavos: t.total_sangrias,
      total_ajustes_centavos: t.total_ajustes,
      saldo_esperado_dinheiro_centavos: saldoEsperadoDinheiro(caixa.saldo_inicial_centavos, t),
      qtd_movimentos: t.qtd,
      movimentos: movimentos.map(paraMovimento),
    }
  }

  return { sessaoAberta: sessaoAbertaOuNula, abrir, registrar, fechar, relatorio }
}

export type ServicoCaixa = ReturnType<typeof criarServicoCaixa>
