// Regra do módulo. Sem acesso HTTP aqui; erros de domínio via shared/http_errors.
//
// Fluxo de segredo: a chave Pix em claro existe SÓ dentro destas funções, o tempo mínimo para
// ser cifrada (no cadastro) ou para montar o BR Code (na cobrança). Nunca é devolvida, logada
// nem persistida em claro. Em repouso só ficam `chave_hash` (sha256) e `chave_cifrada` (cifra).
import { comTransacao, ErroBanco, type Executor, type Pool } from '@whaviso/shared/db'
import { gerarPayloadPixCopiaCola } from '@whaviso/shared/pix'
import type {
  ConciliarEntrada,
  CriarCobrancaEntrada,
  LojaPixEntrada,
  LojaPixEstado,
  PagamentosFiltro,
  PagamentoSaida,
} from '@whaviso/shared/contracts'
import { Conflito, NaoEncontrado, regraNegocio } from '../../shared/http_errors'
import { sha256Hex } from '../../shared/tokens'
import type { Cripto } from './cripto'
import * as repo from './repo'
import { candidatoTxid, MAX_TENTATIVAS_TXID } from './txid'

export interface DepsPagamentos {
  cripto: Cripto
}

/** Set/rotate da chave Pix da loja. Cifra a chave, guarda hash + últimos 4; devolve só metadado. */
export async function definirPix(
  exec: Executor,
  deps: DepsPagamentos,
  lojaId: string,
  entrada: LojaPixEntrada,
): Promise<LojaPixEstado> {
  const chave = entrada.chave.trim()
  const chaveCifrada = deps.cripto.cifrar(chave)
  const chaveHash = sha256Hex(chave)
  const ultimos4 = chave.slice(-4)
  // A chave (claro) sai de escopo aqui; só a cifra e o hash seguem adiante.
  return repo.upsertPix(exec, {
    lojaId,
    tipo: entrada.tipo,
    chaveHash,
    chaveCifrada,
    ultimos4,
    titular: entrada.titular.trim(),
    cidade: entrada.cidade?.trim() ?? null,
  })
}

/** Estado (metadado) da chave Pix da loja, ou null se ainda não cadastrada. */
export async function estadoPix(exec: Executor, lojaId: string): Promise<LojaPixEstado | null> {
  return repo.buscarPixEstado(exec, lojaId)
}

/**
 * Cria a cobrança Pix de um pedido: valida o pedido (da loja, com total > 0), reusa uma pendente
 * ativa (idempotência), decifra a chave só em memória, gera o BR Code e grava `pagamentos`.
 * Tudo numa transação que trava o pedido (`for update`) para serializar criadores concorrentes.
 */
export async function criarCobranca(
  pool: Pool,
  deps: DepsPagamentos,
  lojaId: string,
  pedidoId: string,
  entrada: CriarCobrancaEntrada,
): Promise<PagamentoSaida> {
  return comTransacao(pool, async (client) => {
    const pedido = await repo.buscarPedido(client, pedidoId, lojaId, true)
    if (!pedido) throw new NaoEncontrado('Pedido nao encontrado')
    // Nao faz sentido cobrar pedido que ainda nao entrou no fluxo (rascunho) ou que saiu dele
    // por problema/cancelamento (problema). Barra a geracao de um Pix para esses estados.
    if (pedido.status === 'rascunho' || pedido.status === 'problema') {
      throw regraNegocio('pedido_status_invalido', 'Pedido neste status nao pode ser cobrado')
    }
    if (pedido.total_centavos <= 0) {
      throw regraNegocio('pedido_sem_total', 'Pedido sem valor a cobrar')
    }

    // Idempotência: já existe cobrança pendente e não vencida -> reusa (não duplica).
    const pendente = await repo.buscarPendenteAtiva(client, pedidoId, lojaId)
    if (pendente) return pendente

    const chave = await repo.lerChaveParaBrCode(client, lojaId)
    if (!chave) throw regraNegocio('pix_nao_configurado', 'A loja ainda nao cadastrou a chave Pix')

    const chaveClara = deps.cripto.decifrar(chave.chaveCifrada)
    const expiraEm = new Date(Date.now() + entrada.expira_em_minutos * 60_000).toISOString()

    // txid determinístico a partir do código do pedido; sufixo só em colisão do unique.
    for (let tentativa = 0; tentativa < MAX_TENTATIVAS_TXID; tentativa++) {
      const txid = candidatoTxid(pedido.codigo, tentativa)
      const brCode = gerarPayloadPixCopiaCola({
        chave: chaveClara,
        tipo: chave.tipo,
        nomeTitular: chave.titular,
        cidade: chave.cidade,
        valorCentavos: pedido.total_centavos,
        identificador: txid,
      })
      try {
        return await repo.inserirCobranca(client, {
          lojaId,
          pedidoId,
          valorCentavos: pedido.total_centavos,
          txid,
          brCode,
          expiraEm,
        })
      } catch (err) {
        // Colisão do unique (loja_id, txid): tenta o próximo sufixo. Qualquer outro erro sobe.
        if (err instanceof ErroBanco && err.tipo === 'unique') continue
        throw err
      }
    }
    throw new Conflito('Nao foi possivel gerar um txid unico para a cobranca', 'txid_esgotado')
  })
}

/** Detalhe de uma cobrança da loja ativa; expira preguiçosamente antes de ler. 404 fora do escopo. */
export async function detalhar(
  pool: Pool,
  lojaId: string,
  id: string,
): Promise<PagamentoSaida> {
  await repo.expirarVencidas(pool, lojaId)
  const pag = await repo.buscarPagamento(pool, id, lojaId)
  if (!pag) throw new NaoEncontrado('Cobranca nao encontrada')
  return pag
}

/** Lista as cobranças da loja (expira vencidas antes, para o painel refletir o status real). */
export async function listar(
  pool: Pool,
  lojaId: string,
  filtro: PagamentosFiltro,
): Promise<PagamentoSaida[]> {
  await repo.expirarVencidas(pool, lojaId)
  return repo.listar(pool, lojaId, filtro)
}

/**
 * Conciliação manual (marca pago). Idempotente: conciliar de novo um já pago é no-op. Expira
 * vencidas antes, então uma pendente já vencida vira `expirado` e NÃO pode ser paga. Transições
 * válidas: pendente -> pago; nada sai de pago/expirado/cancelado.
 */
export async function conciliar(
  pool: Pool,
  lojaId: string,
  id: string,
  entrada: ConciliarEntrada,
): Promise<PagamentoSaida> {
  await repo.expirarVencidas(pool, lojaId)
  const atual = await repo.buscarPagamento(pool, id, lojaId)
  if (!atual) throw new NaoEncontrado('Cobranca nao encontrada')
  if (atual.status === 'pago') return atual // idempotente
  if (atual.status !== 'pendente') {
    throw new Conflito(`Cobranca ${atual.status} nao pode ser conciliada`, 'transicao_invalida')
  }
  const pagoEm = entrada.pago_em ?? new Date().toISOString()
  // `pago_em` e um instante absoluto (ISO com offset): comparar com agora independe do fuso.
  // Um carimbo no futuro nao faz sentido para "quando foi pago".
  if (new Date(pagoEm).getTime() > Date.now()) {
    throw regraNegocio('pago_em_futuro', 'A data do pagamento nao pode estar no futuro')
  }
  const pago = await repo.marcarPago(pool, id, lojaId, pagoEm)
  if (!pago) {
    // Corrida rara: outra requisição mudou o estado entre a leitura e o update.
    const depois = await repo.buscarPagamento(pool, id, lojaId)
    if (depois?.status === 'pago') return depois
    throw new Conflito('Cobranca mudou de estado; tente de novo', 'transicao_invalida')
  }
  return pago
}

/**
 * Cancela uma cobrança pendente. Idempotente: cancelar de novo é no-op. Nada sai de pago (409);
 * uma expirada também não é cancelável (estado terminal).
 */
export async function cancelar(pool: Pool, lojaId: string, id: string): Promise<PagamentoSaida> {
  await repo.expirarVencidas(pool, lojaId)
  const atual = await repo.buscarPagamento(pool, id, lojaId)
  if (!atual) throw new NaoEncontrado('Cobranca nao encontrada')
  if (atual.status === 'cancelado') return atual // idempotente
  if (atual.status !== 'pendente') {
    throw new Conflito(`Cobranca ${atual.status} nao pode ser cancelada`, 'transicao_invalida')
  }
  const cancelada = await repo.cancelar(pool, id, lojaId)
  if (!cancelada) {
    const depois = await repo.buscarPagamento(pool, id, lojaId)
    if (depois?.status === 'cancelado') return depois
    throw new Conflito('Cobranca mudou de estado; tente de novo', 'transicao_invalida')
  }
  return cancelada
}
