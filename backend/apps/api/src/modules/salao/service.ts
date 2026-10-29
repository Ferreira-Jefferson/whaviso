// Regra do modulo salao. Sem acesso HTTP aqui; erros de dominio via shared/http_errors.
// Nenhum dado pessoal vai para log/evento. Dinheiro em centavos; preco vem SO do cardapio.
import { comTransacao, ErroBanco, type Executor, type Pool } from '@whaviso/shared/db'
import { conflito, naoEncontrado, regraNegocio } from '../../shared/http_errors'
import * as repo from './repo'
import * as escrita from './repo_escrita'
import type {
  ComandaAbrirEntrada, ComandaFecharEntrada, ComandaItemEntrada, ComandaSaida, MesaCriarEntrada,
  MesaAtualizarEntrada, MesaSaida,
} from './schemas'

export interface Ator {
  lojaId: string
  userId: string
}

function mapaMesa(l: repo.MesaLinha): MesaSaida {
  return {
    id: l.id,
    nome: l.nome,
    capacidade: l.capacidade,
    ativo: l.ativo,
    comanda_aberta_id: l.comanda_aberta_id,
    comanda_aberta_total_centavos: l.comanda_aberta_total_centavos,
    criado_em: l.criado_em,
  }
}

export function criarServicoSalao(pool: Pool) {
  const evento = (
    exec: Executor,
    a: Ator,
    tipo: string,
    entidade: string,
    entidadeId: string,
    detalhes: Record<string, unknown> = {},
  ) =>
    escrita.registrarEvento(exec, {
      lojaId: a.lojaId, tipo, entidade, entidadeId, detalhes: { user_id: a.userId, ...detalhes },
    })

  async function montarComanda(a: Ator, id: string): Promise<ComandaSaida> {
    const c = await repo.obterComanda(pool, a.lojaId, id)
    if (!c) throw naoEncontrado('Comanda nao encontrada')
    const itens = await repo.itensDaComanda(pool, a.lojaId, id)
    return {
      id: c.id,
      mesa_id: c.mesa_id,
      mesa_nome: c.mesa_nome,
      status: c.status,
      total_centavos: c.total_centavos,
      observacoes: c.observacoes,
      aberta_em: c.aberta_em,
      fechada_em: c.fechada_em,
      itens: itens.map((i) => ({
        id: i.id,
        item_id: i.item_id,
        nome_item: i.nome_item,
        quantidade: i.quantidade,
        preco_unitario_centavos: i.preco_unitario_centavos,
        total_centavos: i.total_centavos,
        criado_em: i.criado_em,
      })),
    }
  }

  return {
    // ----------------------------------------------------------------- mesas (cadastro)
    async listarMesas(a: Ator) {
      const linhas = await repo.listarMesas(pool, a.lojaId)
      return { itens: linhas.map(mapaMesa) }
    },

    async criarMesa(a: Ator, entrada: MesaCriarEntrada): Promise<MesaSaida> {
      let id: string
      try {
        const r = await escrita.inserirMesa(pool, a.lojaId, {
          nome: entrada.nome, capacidade: entrada.capacidade ?? null,
        })
        id = r.id
      } catch (e) {
        if (e instanceof ErroBanco && e.tipo === 'unique') {
          throw conflito('mesa_nome_em_uso', 'Ja existe uma mesa ativa com este nome')
        }
        throw e
      }
      await evento(pool, a, 'salao.mesa_criada', 'mesa', id)
      const m = await repo.obterMesa(pool, a.lojaId, id)
      return mapaMesa(m!)
    },

    async atualizarMesa(a: Ator, id: string, patch: MesaAtualizarEntrada): Promise<MesaSaida> {
      if (!(await repo.mesaBasica(pool, a.lojaId, id))) throw naoEncontrado('Mesa nao encontrada')
      try {
        const r = await escrita.atualizarMesa(pool, a.lojaId, id, {
          ...(patch.nome !== undefined ? { nome: patch.nome } : {}),
          ...(patch.capacidade !== undefined ? { capacidade: patch.capacidade } : {}),
          ...(patch.ativo !== undefined ? { ativo: patch.ativo } : {}),
        })
        if (!r) throw naoEncontrado('Mesa nao encontrada')
      } catch (e) {
        if (e instanceof ErroBanco && e.tipo === 'unique') {
          throw conflito('mesa_nome_em_uso', 'Ja existe uma mesa ativa com este nome')
        }
        throw e
      }
      await evento(pool, a, 'salao.mesa_atualizada', 'mesa', id)
      const m = await repo.obterMesa(pool, a.lojaId, id)
      return mapaMesa(m!)
    },

    // -------------------------------------------------------------- comandas (operacao)
    async detalheComanda(a: Ator, id: string): Promise<ComandaSaida> {
      return montarComanda(a, id)
    },

    async abrirComanda(a: Ator, b: ComandaAbrirEntrada): Promise<ComandaSaida> {
      const mesa = await repo.mesaBasica(pool, a.lojaId, b.mesa_id)
      if (!mesa) throw naoEncontrado('Mesa nao encontrada')
      if (!mesa.ativo) throw regraNegocio('mesa_inativa', 'Mesa desativada nao pode receber comanda')
      let id: string
      try {
        const r = await escrita.abrirComanda(pool, {
          lojaId: a.lojaId, mesaId: b.mesa_id, userId: a.userId, observacoes: b.observacoes ?? null,
        })
        id = r.id
      } catch (e) {
        if (e instanceof ErroBanco && e.tipo === 'unique') {
          throw conflito('mesa_ocupada', 'Esta mesa ja tem uma comanda aberta')
        }
        throw e
      }
      await evento(pool, a, 'salao.comanda_aberta', 'comanda', id, { mesa_id: b.mesa_id })
      return montarComanda(a, id)
    },

    async lancarItem(a: Ator, comandaId: string, b: ComandaItemEntrada): Promise<ComandaSaida> {
      const item = await repo.itemDoCardapio(pool, a.lojaId, b.item_id)
      if (!item) throw naoEncontrado('Item nao encontrado')
      if (!item.ativo) throw regraNegocio('item_inativo', 'Item desativado nao pode ser lancado')
      // Item esgotado nao e lancado (historia 07, regra 3): por horario (esgotado_ate no futuro) ou
      // por contador de estoque zerado (historia 03). Contagem ilimitada/sem controle nao esgota.
      const agora = new Date()
      const esgotadoPorHorario = item.esgotado_ate != null && item.esgotado_ate.getTime() > agora.getTime()
      const esgotadoPorSaldo = item.controla_estoque && item.quantidade_disponivel != null && item.quantidade_disponivel <= 0
      if (esgotadoPorHorario || esgotadoPorSaldo) {
        throw regraNegocio('item_esgotado', 'Item esgotado nao pode ser lancado')
      }
      await comTransacao(pool, async (tx) => {
        const atual = await escrita.travarComanda(tx, a.lojaId, comandaId)
        if (!atual) throw naoEncontrado('Comanda nao encontrada')
        if (atual.status !== 'aberta') throw conflito('comanda_fechada', 'Comanda ja fechada')
        const { id } = await escrita.inserirItem(tx, {
          lojaId: a.lojaId, comandaId, itemId: item.id, nomeItem: item.nome,
          quantidade: b.quantidade, precoUnitarioCentavos: item.preco_centavos,
        })
        await escrita.recalcularTotal(tx, a.lojaId, comandaId)
        await evento(tx, a, 'salao.item_lancado', 'comanda', comandaId, {
          comanda_item_id: id, item_id: item.id, quantidade: b.quantidade,
        })
      })
      return montarComanda(a, comandaId)
    },

    async fecharComanda(a: Ator, comandaId: string, b: ComandaFecharEntrada): Promise<ComandaSaida> {
      await comTransacao(pool, async (tx) => {
        const atual = await escrita.travarComanda(tx, a.lojaId, comandaId)
        if (!atual) throw naoEncontrado('Comanda nao encontrada')
        if (atual.status !== 'aberta') throw conflito('comanda_fechada', 'Comanda ja fechada')
        // O recebimento da comanda entra no caixa aberto (historia 07, regra 6): exige um caixa
        // aberto. Trava o caixa aqui para serializar com o fechamento do caixa.
        const caixa = await escrita.caixaAbertoId(tx, a.lojaId)
        if (!caixa) throw conflito('caixa_fechado', 'Abra um caixa antes de fechar a comanda')
        // Fecha (dispara a baixa de estoque de item e insumo na mesma transacao, via trigger 0080).
        const r = await escrita.fecharComanda(tx, a.lojaId, comandaId)
        if (!r) throw conflito('comanda_fechada', 'Comanda ja fechada')
        // Lanca o recebimento no caixa, idempotente por comanda (reprocessar o fechamento nao duplica).
        const lancado = await escrita.lancarVendaNoCaixa(tx, {
          lojaId: a.lojaId, caixaId: caixa.id, formaPagamento: b.forma_pagamento,
          valor: r.total_centavos, userId: a.userId, chave: `comanda:${comandaId}`,
        })
        await evento(tx, a, 'salao.comanda_fechada', 'comanda', comandaId, {
          caixa_id: caixa.id, forma_pagamento: b.forma_pagamento, lancado_no_caixa: lancado,
        })
      })
      return montarComanda(a, comandaId)
    },
  }
}

export type ServicoSalao = ReturnType<typeof criarServicoSalao>
