// Regras do modulo disponibilidade. Sem Fastify aqui: recebe pool e dados ja validados na borda.
// O estado "aceitando agora" / "atendente pode responder" e SEMPRE derivado (nunca persistido).
import { comTransacao, type Pool } from '@whaviso/shared/db'
import {
  faixasSobrepoem,
  lojaAceitandoAgora,
  modoAtendente,
  momentoSp,
  type Agendamento,
  type DadosDisponibilidade,
} from '@whaviso/shared/disponibilidade'
import { naoEncontrado, regraNegocio } from '../../shared/http_errors'
import * as repo from './repo'
import type {
  THorarioEntrada,
  THorarioPatch,
  TAgendamentoEntrada,
  TExcecaoEntrada,
} from './schemas'

/** Default desligado para o kernel quando a loja ainda nao configurou agendamento. */
const AGENDAMENTO_DESLIGADO: Agendamento = { modo: 'desligado', dias: [], inicio: '00:00', fim: '00:00' }

export interface Ator {
  lojaId: string
  userId: string
}

export function criarServicoDisponibilidade(pool: Pool) {
  const evento = (a: Ator, tipo: string, entidade: string, entidadeId: string) =>
    repo.registrarEvento(pool, { lojaId: a.lojaId, tipo, entidade, entidadeId, userId: a.userId })

  async function checarSobreposicao(lojaId: string, dia: number, faixa: { abre: string; fecha: string }, exceto: string | null) {
    const ativos = await repo.ativosDoDia(pool, lojaId, dia, exceto)
    if (ativos.some((f) => faixasSobrepoem(f, faixa))) {
      throw regraNegocio('horario_sobreposto', 'A faixa se sobrepoe a outra do mesmo dia')
    }
  }

  return {
    // --- Horarios de funcionamento ---
    async listarHorarios(a: Ator) {
      return { itens: await repo.listarHorarios(pool, a.lojaId) }
    },

    async criarHorario(a: Ator, e: THorarioEntrada) {
      const ativo = e.ativo ?? true
      if (ativo) await checarSobreposicao(a.lojaId, e.dia_semana, e, null)
      const h = await comTransacao(pool, async (tx) => {
        const novo = await repo.inserirHorario(tx, a.lojaId, {
          dia_semana: e.dia_semana, abre: e.abre, fecha: e.fecha, ativo,
        })
        await repo.registrarEvento(tx, {
          lojaId: a.lojaId, tipo: 'disponibilidade.horario_alterado',
          entidade: 'horario_funcionamento', entidadeId: novo!.id, userId: a.userId,
        })
        return novo!
      })
      return h
    },

    async atualizarHorario(a: Ator, id: string, p: THorarioPatch) {
      const atual = await repo.obterHorario(pool, a.lojaId, id)
      if (!atual) throw naoEncontrado('Horario nao encontrado')
      const ficaraAtivo = p.ativo ?? atual.ativo
      if (ficaraAtivo) {
        await checarSobreposicao(
          a.lojaId, atual.dia_semana,
          { abre: p.abre ?? atual.abre, fecha: p.fecha ?? atual.fecha }, id,
        )
      }
      const h = await repo.atualizarHorario(pool, a.lojaId, id, p)
      await evento(a, 'disponibilidade.horario_alterado', 'horario_funcionamento', id)
      return h!
    },

    async desativarHorario(a: Ator, id: string) {
      const h = await repo.desativarHorario(pool, a.lojaId, id)
      if (!h) throw naoEncontrado('Horario nao encontrado')
      await evento(a, 'disponibilidade.horario_alterado', 'horario_funcionamento', id)
      return h
    },

    // --- Janela de agendamento da loja ---
    async obterAgendamento(a: Ator) {
      const atual = await repo.obterAgendamento(pool, a.lojaId)
      // Sem linha: default desligado (nunca ha null). atualizado_em sintetico = agora.
      return {
        agendamento: atual ?? {
          modo: 'desligado' as const, inicio: null, fim: null, dias: [],
          atualizado_em: new Date().toISOString(),
        },
      }
    },

    async definirAgendamento(a: Ator, e: TAgendamentoEntrada) {
      const faixa = e.modo === 'faixa'
      const agendamento = await repo.upsertAgendamento(pool, a.lojaId, {
        modo: e.modo,
        inicio: faixa ? e.inicio ?? null : null,
        fim: faixa ? e.fim ?? null : null,
        dias: faixa ? e.dias ?? null : null,
      })
      await evento(a, 'disponibilidade.agendamento_alterado', 'agendamento_config', a.lojaId)
      return agendamento
    },

    // --- Excecoes / feriados ---
    async listarExcecoes(a: Ator) {
      return { itens: await repo.listarExcecoes(pool, a.lojaId) }
    },

    async criarExcecao(a: Ator, e: TExcecaoEntrada) {
      const abre = e.fechado ? null : e.abre ?? null
      const fecha = e.fechado ? null : e.fecha ?? null
      const exc = await comTransacao(pool, async (tx) => {
        const novo = await repo.inserirExcecao(tx, a.lojaId, {
          data: e.data, fechado: e.fechado, abre, fecha, motivo: e.motivo ?? null,
        })
        await repo.registrarEvento(tx, {
          lojaId: a.lojaId, tipo: 'disponibilidade.excecao_alterada',
          entidade: 'excecao_disponibilidade', entidadeId: novo!.id, userId: a.userId,
        })
        return novo!
      })
      return exc
    },

    async desativarExcecao(a: Ator, id: string) {
      const exc = await repo.desativarExcecao(pool, a.lojaId, id)
      if (!exc) throw naoEncontrado('Excecao nao encontrada')
      await evento(a, 'disponibilidade.excecao_alterada', 'excecao_disponibilidade', id)
      return exc
    },

    // --- Estado derivado (nunca persistido): calculado a partir do fuso America/Sao_Paulo ---
    async agora(a: Ator, agora = new Date()) {
      const { data } = momentoSp(agora)
      const [horarios, excecaoHoje, agendamento] = await Promise.all([
        repo.carregarHorariosAtivos(pool, a.lojaId),
        repo.excecaoAtivaNaData(pool, a.lojaId, data),
        repo.obterAgendamento(pool, a.lojaId),
      ])
      const dados: DadosDisponibilidade = { horarios, excecoes: excecaoHoje ? [excecaoHoje] : [] }
      const ag: Agendamento = agendamento
        ? {
            modo: agendamento.modo,
            dias: agendamento.dias,
            inicio: agendamento.inicio ?? '00:00',
            fim: agendamento.fim ?? '00:00',
          }
        : AGENDAMENTO_DESLIGADO
      return {
        agora: agora.toISOString(),
        aceitando_agora: lojaAceitandoAgora(dados, agora),
        modo_atendente: modoAtendente(dados, ag, agora),
      }
    },
  }
}

export type ServicoDisponibilidade = ReturnType<typeof criarServicoDisponibilidade>
