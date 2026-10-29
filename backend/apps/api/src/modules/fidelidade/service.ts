// Regra do modulo. Sem acesso HTTP aqui; erros de dominio via shared/http_errors.
// Dinheiro em centavos (int). Nenhum dado pessoal vai a log ou evento.
import { z } from 'zod'
import { comTransacao, type Pool } from '@whaviso/shared/db'
import { HttpError, naoEncontrado, regraNegocio } from '../../shared/http_errors'
import * as repo from './repo'
import type {
  AcumularNovo, MovimentosBusca, ProgramaDto, ProgramaNovo, ResgatarNovo,
} from './schemas'

export interface Ator {
  lojaId: string
  userId: string
}

/** Programa ainda nao configurado: valores padrao, sempre inativo. */
const PADRAO: ProgramaNovo = {
  ativo: false, modo: 'cashback', cashback_bps: 500, pontos_por_real: 1,
  valor_ponto_centavos: 1, minimo_resgate: 0, max_resgate_bps: 5000,
}

/** Pedido ainda aberto para receber desconto (resgate); entregue e problema ja encerraram. */
const STATUS_RESGATAVEL = new Set(['rascunho', 'novo', 'em_preparo', 'saiu_entrega'])

/** Quanto o valor (na unidade do programa) vale em centavos no resgate. */
export function valorEmCentavos(p: Pick<ProgramaNovo, 'modo' | 'valor_ponto_centavos'>, valor: number): number {
  return p.modo === 'cashback' ? valor : valor * p.valor_ponto_centavos
}

/** Acumulo sobre a base paga (subtotal sem entrega, ja abatido o desconto de resgate). */
export function calcularAcumulo(p: ProgramaNovo, baseCentavos: number): number {
  if (baseCentavos <= 0) return 0
  return p.modo === 'cashback'
    ? Math.floor((baseCentavos * p.cashback_bps) / 10000)
    : Math.floor((baseCentavos * p.pontos_por_real) / 100)
}

const CursorSchema = z.number().int().positive()

function codificarCursor(seq: string): string {
  return Buffer.from(JSON.stringify(Number(seq))).toString('base64url')
}
function decodificarCursor(c: string): number {
  try {
    return CursorSchema.parse(JSON.parse(Buffer.from(c, 'base64url').toString('utf8')))
  } catch {
    throw new HttpError(400, 'cursor_invalido', 'Cursor invalido')
  }
}

async function programaAtivo(pool: Pool, lojaId: string) {
  const p = await repo.obterPrograma(pool, lojaId)
  if (!p) throw regraNegocio('programa_nao_configurado', 'A loja ainda nao configurou o programa de fidelidade')
  if (!p.ativo) throw regraNegocio('programa_inativo', 'O programa de fidelidade esta desativado')
  return p
}

export function criarServicoFidelidade(pool: Pool) {
  return {
    async programa(a: Ator): Promise<ProgramaDto> {
      const p = await repo.obterPrograma(pool, a.lojaId)
      if (!p) return { ...PADRAO, configurado: false, atualizado_em: null }
      return { ...p, configurado: true }
    },

    async salvarPrograma(a: Ator, entrada: ProgramaNovo): Promise<ProgramaDto> {
      const atual = await repo.obterPrograma(pool, a.lojaId)
      // A unidade do saldo muda com o modo: com livro existente o modo fica travado.
      if (atual && atual.modo !== entrada.modo && (await repo.lojaTemMovimentos(pool, a.lojaId))) {
        throw regraNegocio('modo_travado', 'O modo nao pode mudar depois que ha saldo ou movimentos')
      }
      await repo.salvarPrograma(pool, a.lojaId, entrada)
      await repo.registrarEvento(pool, {
        lojaId: a.lojaId, tipo: 'fidelidade.programa_atualizado', entidadeId: a.lojaId, userId: a.userId,
        detalhes: { ativo: entrada.ativo, modo: entrada.modo },
      })
      return this.programa(a)
    },

    /** Acumulo ao entregar o pedido (disparo explicito; uma vez por pedido). */
    async acumular(a: Ator, entrada: AcumularNovo) {
      const programa = await programaAtivo(pool, a.lojaId)
      const pedido = await repo.obterPedido(pool, a.lojaId, entrada.pedido_id)
      if (!pedido) throw naoEncontrado('Pedido nao encontrado')
      if (pedido.status !== 'entregue') {
        throw regraNegocio('pedido_nao_entregue', 'So pedido entregue acumula fidelidade')
      }
      if (!pedido.cliente_id) {
        throw regraNegocio('pedido_sem_cliente', 'Pedido sem cliente nao acumula fidelidade')
      }
      const clienteId = pedido.cliente_id
      return comTransacao(pool, async (tx) => {
        await repo.travarCliente(tx, clienteId)
        const desconto = await repo.descontoDoResgate(tx, a.lojaId, pedido.id)
        const valor = calcularAcumulo(programa, pedido.subtotal_centavos - desconto)
        if (valor <= 0) throw regraNegocio('sem_valor_a_acumular', 'Este pedido nao gera acumulo')
        const saldo = await repo.saldoDe(tx, a.lojaId, clienteId)
        const id = await repo.inserirMovimento(tx, {
          lojaId: a.lojaId, clienteId, pedidoId: pedido.id, tipo: 'acumulo', valor,
          descontoCentavos: null, saldoApos: saldo + valor, userId: a.userId,
        })
        if (!id) throw regraNegocio('acumulo_ja_registrado', 'Este pedido ja acumulou fidelidade')
        await repo.registrarEvento(tx, {
          lojaId: a.lojaId, tipo: 'fidelidade.acumulo', entidadeId: id, userId: a.userId,
          detalhes: { valor, modo: programa.modo },
        })
        return { movimento: (await repo.obterMovimento(tx, a.lojaId, id))!, saldo: saldo + valor }
      })
    },

    /** Resgate de saldo num pedido aberto: debita o livro e devolve o desconto em centavos. */
    async resgatar(a: Ator, entrada: ResgatarNovo) {
      const programa = await programaAtivo(pool, a.lojaId)
      const pedido = await repo.obterPedido(pool, a.lojaId, entrada.pedido_id)
      if (!pedido) throw naoEncontrado('Pedido nao encontrado')
      if (!pedido.cliente_id) {
        throw regraNegocio('pedido_sem_cliente', 'Pedido sem cliente nao resgata fidelidade')
      }
      if (!STATUS_RESGATAVEL.has(pedido.status)) {
        throw regraNegocio('pedido_encerrado', 'So pedido em andamento recebe resgate')
      }
      if (entrada.valor < programa.minimo_resgate) {
        throw regraNegocio('resgate_abaixo_do_minimo', 'Valor abaixo do resgate minimo do programa')
      }
      const desconto = valorEmCentavos(programa, entrada.valor)
      const clienteId = pedido.cliente_id
      return comTransacao(pool, async (tx) => {
        await repo.travarCliente(tx, clienteId)
        // Teto conferido dentro da transacao com o subtotal fresco (pedido travado FOR UPDATE):
        // se as linhas cairem em paralelo (cancelar linha), o teto acompanha e nao vaza desconto.
        const subtotalAtual = await repo.travarSubtotalPedido(tx, a.lojaId, pedido.id)
        if (subtotalAtual === null) throw naoEncontrado('Pedido nao encontrado')
        const teto = Math.floor((subtotalAtual * programa.max_resgate_bps) / 10000)
        if (desconto > teto) {
          throw regraNegocio('resgate_acima_do_limite', 'Resgate acima do limite do programa para este pedido')
        }
        const saldo = await repo.saldoDe(tx, a.lojaId, clienteId)
        if (saldo < entrada.valor) throw regraNegocio('saldo_insuficiente', 'Saldo de fidelidade insuficiente')
        const id = await repo.inserirMovimento(tx, {
          lojaId: a.lojaId, clienteId, pedidoId: pedido.id, tipo: 'resgate', valor: entrada.valor,
          descontoCentavos: desconto, saldoApos: saldo - entrada.valor, userId: a.userId,
        })
        if (!id) throw regraNegocio('resgate_ja_registrado', 'Este pedido ja recebeu um resgate')
        await repo.registrarEvento(tx, {
          lojaId: a.lojaId, tipo: 'fidelidade.resgate', entidadeId: id, userId: a.userId,
          detalhes: { valor: entrada.valor, desconto_centavos: desconto, modo: programa.modo },
        })
        return {
          movimento: (await repo.obterMovimento(tx, a.lojaId, id))!,
          saldo: saldo - entrada.valor,
          desconto_centavos: desconto,
        }
      })
    },

    async saldo(a: Ator, clienteId: string) {
      if (!(await repo.clienteExiste(pool, a.lojaId, clienteId))) throw naoEncontrado('Cliente nao encontrado')
      const p = (await repo.obterPrograma(pool, a.lojaId)) ?? PADRAO
      const saldo = await repo.saldoDe(pool, a.lojaId, clienteId)
      return { cliente_id: clienteId, modo: p.modo, saldo, saldo_centavos: valorEmCentavos(p, saldo) }
    },

    async movimentos(a: Ator, clienteId: string, q: MovimentosBusca) {
      if (!(await repo.clienteExiste(pool, a.lojaId, clienteId))) throw naoEncontrado('Cliente nao encontrado')
      const linhas = await repo.listarMovimentos(pool, a.lojaId, clienteId, {
        cursor: q.cursor ? decodificarCursor(q.cursor) : undefined,
        limite: q.limite,
      })
      const pagina = linhas.slice(0, q.limite)
      const ultima = pagina[pagina.length - 1]
      const itens = pagina.map(({ seq: _seq, ...m }) => m)
      return {
        itens,
        proximoCursor: linhas.length > q.limite && ultima ? codificarCursor(ultima.seq) : null,
      }
    },
  }
}

export type ServicoFidelidade = ReturnType<typeof criarServicoFidelidade>
