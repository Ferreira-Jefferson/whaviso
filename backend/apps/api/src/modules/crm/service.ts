// Regra do modulo crm. Sem acesso HTTP aqui; erros de dominio via shared/http_errors.
// Nenhum dado pessoal (nome, telefone) e passado a log; o telefone nem e lido neste modulo.
import { z } from 'zod'
import type { Pool } from '@whaviso/shared/db'
import { HttpError, naoEncontrado } from '../../shared/http_errors'
import * as repo from './repo'
import { crmSegmentos, type CrmClientesBusca, type CrmConsentimentoNovo } from './schemas'

export interface Ator {
  lojaId: string
  userId: string
}

const CursorSchema = z.tuple([z.number().int().nonnegative(), z.uuid()])

function codificarCursor(gasto: number, id: string): string {
  return Buffer.from(JSON.stringify([gasto, id])).toString('base64url')
}
function decodificarCursor(c: string): { gasto: number; id: string } {
  try {
    const [gasto, id] = CursorSchema.parse(JSON.parse(Buffer.from(c, 'base64url').toString('utf8')))
    return { gasto, id }
  } catch {
    throw new HttpError(400, 'cursor_invalido', 'Cursor invalido')
  }
}

type Linha = repo.MetricasLinha

const metricas = (l: Linha) => ({
  pedidos_total: l.pedidos_total,
  gasto_total_centavos: l.gasto_total_centavos,
  ticket_medio_centavos: l.ticket_medio_centavos,
  primeiro_pedido_em: l.primeiro_pedido_em,
  ultimo_pedido_em: l.ultimo_pedido_em,
  recencia_dias: l.recencia_dias,
  pedidos_180d: l.pedidos_180d,
  gasto_180d_centavos: l.gasto_180d_centavos,
  nota_r: l.nota_r,
  nota_f: l.nota_f,
  nota_m: l.nota_m,
  segmento: l.segmento as (typeof crmSegmentos)[number],
})

export function criarServicoCrm(pool: Pool) {
  return {
    /** Lista clientes com RFM, por gasto total desc. Filtros: segmento e contactavel (sem opt-out). */
    async listar(a: Ator, q: CrmClientesBusca) {
      const linhas = await repo.listar(pool, a.lojaId, {
        segmento: q.segmento,
        contactavel: q.contactavel,
        cursor: q.cursor ? decodificarCursor(q.cursor) : undefined,
        limite: q.limite,
      })
      const itens = linhas.slice(0, q.limite)
      const ultima = itens[itens.length - 1]
      return {
        itens: itens.map((l) => ({
          cliente_id: l.cliente_id,
          nome: l.nome,
          opt_out_marketing: l.opt_out_marketing,
          ...metricas(l),
        })),
        proximoCursor:
          linhas.length > q.limite && ultima ? codificarCursor(ultima.gasto_total_centavos, ultima.cliente_id) : null,
      }
    },

    /** Contagem por segmento (todos os segmentos aparecem, mesmo zerados) + total de opt-outs. */
    async resumo(a: Ator) {
      const linhas = await repo.resumo(pool, a.lojaId)
      const por = new Map(linhas.map((l) => [l.segmento, l]))
      return {
        clientes_total: linhas.reduce((s, l) => s + l.clientes, 0),
        opt_out_total: linhas.reduce((s, l) => s + l.opt_outs, 0),
        segmentos: crmSegmentos.map((segmento) => ({
          segmento,
          clientes: por.get(segmento)?.clientes ?? 0,
          gasto_180d_centavos: por.get(segmento)?.gasto_180d ?? 0,
        })),
      }
    },

    /** O que a loja mais vende na janela (pedidos entregues). */
    async itens(a: Ator, q: { dias: number; limite: number }) {
      const linhas = await repo.itensMaisVendidos(pool, a.lojaId, q.dias, q.limite)
      return {
        dias: q.dias,
        itens: linhas.map((l) => ({
          item_id: l.item_id,
          nome: l.nome,
          quantidade: l.quantidade,
          clientes: l.clientes,
          faturamento_centavos: l.faturamento,
        })),
      }
    },

    /** Ficha de CRM: RFM, consentimento, itens favoritos e ultimos pedidos. */
    async detalhe(a: Ator, clienteId: string) {
      const m = await repo.metricasDoCliente(pool, a.lojaId, clienteId)
      if (!m) throw naoEncontrado('Cliente nao encontrado')
      const [consent, favoritos, pedidos] = await Promise.all([
        repo.obterConsentimento(pool, a.lojaId, clienteId),
        repo.itensFavoritos(pool, a.lojaId, clienteId, 5),
        repo.ultimosPedidos(pool, a.lojaId, clienteId, 10),
      ])
      return {
        cliente_id: m.cliente_id,
        nome: m.nome,
        metricas: metricas(m),
        consentimento: consent
          ? {
              opt_out_marketing: consent.opt_out_marketing,
              opt_out_em: consent.opt_out_em,
              opt_in_em: consent.opt_in_em,
              origem: consent.origem as 'painel' | 'cliente_whatsapp' | 'importacao',
              motivo: consent.motivo,
            }
          : { opt_out_marketing: false, opt_out_em: null, opt_in_em: null, origem: null, motivo: null },
        itens_favoritos: favoritos,
        ultimos_pedidos: pedidos,
      }
    },

    /** Registra ou reverte o opt-out de marketing (idempotente). Audita sem PII. */
    async definirConsentimento(a: Ator, clienteId: string, e: CrmConsentimentoNovo) {
      if (!(await repo.clienteExiste(pool, a.lojaId, clienteId))) {
        throw naoEncontrado('Cliente nao encontrado')
      }
      const c = await repo.definirConsentimento(pool, a.lojaId, clienteId, {
        optOut: e.opt_out_marketing,
        origem: e.origem,
        motivo: e.motivo ?? null,
        userId: a.userId,
      })
      await repo.registrarEvento(pool, {
        lojaId: a.lojaId,
        tipo: 'cliente.consentimento_alterado',
        entidadeId: clienteId,
        userId: a.userId,
        optOut: e.opt_out_marketing,
      })
      return {
        opt_out_marketing: c.opt_out_marketing,
        opt_out_em: c.opt_out_em,
        opt_in_em: c.opt_in_em,
        origem: c.origem as 'painel' | 'cliente_whatsapp' | 'importacao',
        motivo: c.motivo,
      }
    },
  }
}

export type ServicoCrm = ReturnType<typeof criarServicoCrm>
