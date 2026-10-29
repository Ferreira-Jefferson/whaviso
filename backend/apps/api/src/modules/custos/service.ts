// Regra do modulo. Sem HTTP aqui; erros de dominio via shared/http_errors. O razao nao tem
// conteudo nem PII; mesmo assim nada de custo individual vai para log alem de ids.
import { z } from 'zod'
import type { Executor, Pool } from '@whaviso/shared/db'
import type { Consulta } from '@whaviso/shared/db'
import { HttpError } from '../../shared/http_errors'
import * as repo from './repo'
import { EventoCustoNovo } from './schemas'
import type {
  CustosEventosBusca, CustosPeriodoQuery, CustosResumoLoja, CustosResumoPlataforma, TarifasMetaBusca,
} from './schemas'

const CursorSchema = z.tuple([z.string().min(1).max(40), z.uuid()])

function codificarCursor(ts: string, id: string): string {
  return Buffer.from(JSON.stringify([ts, id])).toString('base64url')
}
function decodificarCursor(c: string): { ts: string; id: string } {
  try {
    const [ts, id] = CursorSchema.parse(JSON.parse(Buffer.from(c, 'base64url').toString('utf8')))
    if (Number.isNaN(Date.parse(ts))) throw new Error('ts')
    return { ts, id }
  } catch {
    throw new HttpError(400, 'cursor_invalido', 'Cursor invalido')
  }
}

export function criarServicoCustos(pool: Pool) {
  /** Parte comum das duas visoes (loja e operador). */
  async function resumoBase(escopo: Consulta, q: CustosPeriodoQuery) {
    const p = repo.resolverPeriodo(q.de, q.ate)
    const [totalC, categorias, origens, dias] = await Promise.all([
      repo.total(pool, escopo, p),
      repo.porCategoria(pool, escopo, p),
      repo.porOrigem(pool, escopo, p),
      repo.porDia(pool, escopo, p),
    ])
    const pico = dias.reduce<(typeof dias)[number] | null>(
      (m, d) => (m === null || d.total_centavos > m.total_centavos ? d : m),
      null,
    )
    return {
      p,
      base: {
        de: p.de,
        ate: p.ate,
        total_centavos: totalC,
        por_categoria: categorias,
        por_origem: origens,
        por_dia: dias,
        pico_dia: pico && pico.total_centavos > 0 ? pico : null,
        media_dia_centavos: Math.round(totalC / p.dias),
      },
    }
  }

  return {
    /** Visao da loja: so a loja do escopo (SEC-002). */
    async resumoLoja(lojaId: string, q: CustosPeriodoQuery): Promise<CustosResumoLoja> {
      return (await resumoBase(repo.escopoLoja(lojaId), q)).base
    },

    /** Visao do operador: agregado da base inteira, sem linha individual nem loja_id. */
    async resumoPlataforma(q: CustosPeriodoQuery): Promise<CustosResumoPlataforma> {
      const { p, base } = await resumoBase(repo.ESCOPO_PLATAFORMA, q)
      return { ...base, ...(await repo.metricasPlataforma(pool, p)) }
    },

    async eventosLoja(lojaId: string, q: CustosEventosBusca) {
      const p = repo.resolverPeriodo(q.de, q.ate)
      const linhas = await repo.listarEventos(pool, lojaId, p, {
        categoria: q.categoria,
        cursor: q.cursor ? decodificarCursor(q.cursor) : undefined,
        limite: q.limite,
      })
      const pagina = linhas.slice(0, q.limite)
      const ultima = pagina[pagina.length - 1]
      const itens = pagina.map(({ criado_em_ts: _ts, ...resto }) => resto)
      return {
        itens,
        proximoCursor:
          linhas.length > q.limite && ultima ? codificarCursor(ultima.criado_em_ts, ultima.id) : null,
      }
    },

    async tarifas(q: TarifasMetaBusca) {
      return { itens: await repo.listarTarifas(pool, q) }
    },
  }
}

/**
 * Ponto de ingestao para PRODUTORES (api; zap/atendente usam o mesmo SQL com o proprio pool).
 * Valida o contrato e faz append idempotente. Nao ha rota HTTP de escrita: o custo nasce no
 * servidor, nunca do cliente.
 */
export async function registrarEventoCusto(
  exec: Executor,
  entrada: z.input<typeof EventoCustoNovo>,
): Promise<void> {
  const e = EventoCustoNovo.parse(entrada)
  await repo.inserir(exec, {
    lojaId: e.loja_id,
    categoria: e.categoria,
    origem: e.origem,
    valorCentavos: e.valor_centavos,
    quantidade: e.quantidade,
    referencia: e.referencia ?? null,
    chaveIdempotencia: e.chave_idempotencia ?? null,
  })
}
