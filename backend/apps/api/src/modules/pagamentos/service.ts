// Regra do módulo. Sem acesso HTTP aqui; erros de domínio via shared/http_errors.
//
// Fluxo de segredo: a chave Pix em claro existe SÓ dentro destas funções, o tempo mínimo para
// ser cifrada (no cadastro) ou para montar o BR Code (na cobrança). Nunca é devolvida, logada
// nem persistida em claro. Em repouso só ficam `chave_hash` (sha256) e `chave_cifrada` (cifra).
import { comTransacao, ErroBanco, type Executor, type Pool } from '@whaviso/shared/db'
import { gerarPayloadPixCopiaCola } from '@whaviso/shared/pix'
import { resolverTaxaIntermediacao } from '@whaviso/shared/taxas'
import type {
  ConciliarEntrada,
  CriarCobrancaEntrada,
  LojaPixEntrada,
  LojaPixEstado,
  PagamentosFiltro,
  PagamentoSaida,
} from '@whaviso/shared/contracts'
import { Conflito, NaoEncontrado, naoAutorizado, regraNegocio } from '../../shared/http_errors'
import { sha256Hex } from '../../shared/tokens'
import { comporCobranca } from './composicao'
import type { Cripto } from './cripto'
import { erroPspNaoIntegrado, type ClientePagamento } from './psp_cliente'
import * as repo from './repo'
import type {
  CredencialPspStatus, PagamentoConfigDTO, PagamentoConfigPatch, SubcontaStatus,
} from './schemas'
import { candidatoTxid, MAX_TENTATIVAS_TXID } from './txid'

const CONFIG_PAGAMENTO_PADRAO: PagamentoConfigDTO = {
  pix_modo: 'chave_propria',
  encargo_modo: 'absorve',
  cartao_habilitado: false,
  atualizado_em: null,
}

function isoData(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : String(v)
}

export interface DepsPagamentos {
  cripto: Cripto
  /** PSP do pagamento intermediado; null = nao integrado (caminho intermediado responde 501). */
  clientePsp?: ClientePagamento | null
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

// ---- Config de pagamento da loja (modo do Pix + quem paga a taxa) ----------------------------

/** Config atual da loja; devolve o default (Pix chave propria, loja absorve, sem cartao) se nao salva. */
export async function obterConfigPagamento(exec: Executor, lojaId: string): Promise<PagamentoConfigDTO> {
  const l = await repo.obterPagamentoConfig(exec, lojaId)
  if (!l) return CONFIG_PAGAMENTO_PADRAO
  return {
    pix_modo: l.pix_modo,
    encargo_modo: l.encargo_modo,
    cartao_habilitado: l.cartao_habilitado,
    atualizado_em: isoData(l.atualizado_em),
  }
}

/** Salva (upsert parcial) a config de pagamento da loja. */
export async function definirConfigPagamento(
  exec: Executor,
  lojaId: string,
  patch: PagamentoConfigPatch,
): Promise<PagamentoConfigDTO> {
  const l = await repo.upsertPagamentoConfig(exec, lojaId, {
    pixModo: patch.pix_modo ?? null,
    encargoModo: patch.encargo_modo ?? null,
    cartaoHabilitado: patch.cartao_habilitado ?? null,
  })
  return {
    pix_modo: l.pix_modo,
    encargo_modo: l.encargo_modo,
    cartao_habilitado: l.cartao_habilitado,
    atualizado_em: isoData(l.atualizado_em),
  }
}

// ---- PSP: credencial (operador), subconta (loja), cobranca intermediada e webhook -----------

const PROVIDER_PSP = 'asaas'

/** Set/rotate da credencial do PSP (cifra em repouso; a chave em claro nunca volta nem e logada). */
export async function definirCredencialPsp(
  exec: Executor,
  deps: DepsPagamentos,
  chave: string,
): Promise<CredencialPspStatus> {
  const cifrada = deps.cripto.cifrar(chave)
  const { atualizado_em } = await repo.upsertCredencialPsp(exec, PROVIDER_PSP, cifrada)
  return { configurada: true, atualizado_em }
}

/** Metadado da credencial do PSP (nunca a chave). */
export async function statusCredencialPsp(exec: Executor): Promise<CredencialPspStatus> {
  return repo.statusCredencialPsp(exec, PROVIDER_PSP)
}

/**
 * Inicia o onboarding da subconta (recebedor) da loja no PSP. Sem PSP integrado, cria/retorna uma
 * subconta 'pendente'. Com o cliente real, aqui se chamaria o PSP para criar o recebedor e guardar
 * a referencia; a aprovacao (KYC) vem do PSP (onboarding/webhook), nunca e assumida pelo whaviso.
 */
export async function iniciarSubconta(exec: Executor, lojaId: string): Promise<SubcontaStatus> {
  const existente = await repo.obterSubconta(exec, lojaId, PROVIDER_PSP)
  if (existente) return existente
  return repo.upsertSubconta(exec, lojaId, PROVIDER_PSP, { subcontaRef: null, statusKyc: 'pendente' })
}

/** Status da subconta da loja, ou null se o onboarding ainda nao comecou. */
export async function obterSubconta(exec: Executor, lojaId: string): Promise<SubcontaStatus | null> {
  return repo.obterSubconta(exec, lojaId, PROVIDER_PSP)
}

/**
 * Cria a cobranca INTERMEDIADA (via PSP) de um pedido. Exige: config coerente (Pix intermediado, ou
 * cartao habilitado), PSP integrado (senao 501), subconta aprovada e credencial presente. Resolve a
 * taxa do whaviso, compoe o valor por absorve/repassa, chama o PSP com split e persiste a cobranca.
 */
export async function criarCobrancaIntermediada(
  pool: Pool,
  deps: DepsPagamentos,
  lojaId: string,
  contaId: string,
  pedidoId: string,
  meio: 'pix' | 'cartao',
): Promise<PagamentoSaida> {
  const cfg = await repo.obterPagamentoConfig(pool, lojaId)
  const pixModo = cfg?.pix_modo ?? 'chave_propria'
  const encargoModo = cfg?.encargo_modo ?? 'absorve'
  const cartaoHabilitado = cfg?.cartao_habilitado ?? false

  if (meio === 'pix' && pixModo !== 'intermediado') {
    throw regraNegocio('pix_nao_intermediado', 'A loja nao esta em Pix intermediado')
  }
  if (meio === 'cartao' && !cartaoHabilitado) {
    throw regraNegocio('cartao_desabilitado', 'Cartao nao esta habilitado para esta loja')
  }

  // Sem PSP integrado (sem as chaves do Asaas), o caminho intermediado nao esta disponivel (501).
  if (!deps.clientePsp) throw erroPspNaoIntegrado()

  const subconta = await repo.obterSubconta(pool, lojaId, PROVIDER_PSP)
  if (!subconta || subconta.status_kyc !== 'aprovada' || !subconta.subconta_ref) {
    throw regraNegocio('subconta_nao_aprovada', 'A subconta de recebimento da loja ainda nao esta aprovada')
  }

  const cifrada = await repo.lerCredencialPspCifrada(pool, PROVIDER_PSP)
  if (!cifrada) throw regraNegocio('psp_sem_credencial', 'Credencial do PSP nao configurada')
  const chavePsp = deps.cripto.decifrar(cifrada) // em memoria, nao logada

  return comTransacao(pool, async (client) => {
    const pedido = await repo.buscarPedido(client, pedidoId, lojaId, true)
    if (!pedido) throw new NaoEncontrado('Pedido nao encontrado')
    if (pedido.status === 'rascunho' || pedido.status === 'problema') {
      throw regraNegocio('pedido_status_invalido', 'Pedido neste status nao pode ser cobrado')
    }
    if (pedido.total_centavos <= 0) throw regraNegocio('pedido_sem_total', 'Pedido sem valor a cobrar')

    const pendente = await repo.buscarPendenteAtiva(client, pedidoId, lojaId)
    if (pendente) return pendente // idempotencia: reusa a pendente

    const taxa = await resolverTaxaIntermediacao(client, contaId)
    // Em 'absorve' a taxa sai do repasse do restaurante: barra taxa >= total (repasse nunca <= 0).
    if (encargoModo === 'absorve' && taxa >= pedido.total_centavos) {
      throw regraNegocio('taxa_excede_total', 'A taxa de intermediacao e maior ou igual ao total do pedido')
    }
    const comp = comporCobranca(pedido.total_centavos, taxa, encargoModo)

    const cobranca = await deps.clientePsp!.criarCobranca(
      { chave: chavePsp },
      {
        meio,
        valorCobradoCentavos: comp.valorCobradoCentavos,
        encargoWhavisoCentavos: comp.encargoWhavisoCentavos,
        subcontaRef: subconta.subconta_ref!,
        referencia: pedido.codigo,
      },
    )

    try {
      return await repo.inserirCobrancaIntermediada(client, {
        lojaId,
        pedidoId,
        valorCobradoCentavos: comp.valorCobradoCentavos,
        encargoCentavos: comp.encargoWhavisoCentavos,
        meio,
        chargeRef: cobranca.chargeRef,
        payload: cobranca.payload,
        expiraEm: null,
      })
    } catch (err) {
      // Mesmo charge_ref ja persistido (retry): reusa em vez de duplicar.
      if (err instanceof ErroBanco && err.tipo === 'unique') {
        const existente = await repo.buscarPorCharge(client, PROVIDER_PSP, cobranca.chargeRef)
        if (existente) return existente
      }
      throw err
    }
  })
}

/**
 * Processa um webhook do PSP: verifica a assinatura (via o cliente, com a credencial como segredo) e,
 * se o evento for de pagamento, concilia a cobranca por (provider, charge_ref) de forma idempotente.
 * Assinatura invalida => 401 e nada e conciliado. Charge desconhecida => no-op (ok).
 */
export async function processarWebhookPsp(
  pool: Pool,
  deps: DepsPagamentos,
  assinatura: string | undefined,
  corpoBruto: string,
): Promise<void> {
  if (!deps.clientePsp) throw erroPspNaoIntegrado()
  // Rejeicao barata ANTES de decifrar a credencial: flood sem assinatura nao custa decifra.
  if (!assinatura) throw naoAutorizado('Webhook sem assinatura')
  const cifrada = await repo.lerCredencialPspCifrada(pool, PROVIDER_PSP)
  if (!cifrada) throw naoAutorizado('Webhook sem credencial configurada')
  const segredo = deps.cripto.decifrar(cifrada)

  const evento = deps.clientePsp.interpretarWebhook(segredo, assinatura, corpoBruto)
  if (!evento) throw naoAutorizado('Assinatura de webhook invalida')

  if (evento.pago) {
    // Idempotente: so afeta linha pendente; repeticao do mesmo evento e no-op.
    await repo.marcarPagoPorCharge(pool, PROVIDER_PSP, evento.chargeRef, evento.taxaPspCentavos)
  }
}
