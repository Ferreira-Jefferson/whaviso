import { z } from 'zod'
import { PedidoExterno } from '../contracts/canais'
import type { CredencialResolvida, ErroProvedor, HostPermitido, PoliticaCliente, Resultado } from './erros'

// Fronteira ClienteCanal (usada pela api): puxa pedidos de um canal externo de vendas (iFood e
// outros), confirma o recebimento e entrega cada pedido ja no formato canonico `PedidoExterno`
// (a traducao do payload do provedor para o modelo interno e responsabilidade da implementacao).
// Dinheiro em centavos. A credencial chega opaca (CredencialResolvida): nunca em log.
//
// DECISAO DO DONO PENDENTE: o provedor real (iFood Merchant API e/ou agregador) NAO esta definido.
// Ate la, `StubClienteCanal` responde erro Permanente `canal_nao_integrado` e a api devolve 501.

export const BuscarPedidosEntrada = z
  .object({
    /** Marca de tempo da ultima sincronizacao (ISO); sem ela, o provedor decide a janela. */
    desde: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()
export type BuscarPedidosEntrada = z.infer<typeof BuscarPedidosEntrada>

export { PedidoExterno }

type R<T> = Promise<Resultado<T, ErroProvedor>>

export interface ClienteCanal {
  /** Puxa pedidos novos do canal ja mapeados para o formato canonico. */
  buscarPedidos(cred: CredencialResolvida, entrada: BuscarPedidosEntrada): R<PedidoExterno[]>
  /** Confirma ao canal que o pedido foi recebido (idempotente; evita reentrega). */
  confirmar(cred: CredencialResolvida, idExterno: string): R<void>
}

export const POLITICA_CANAL: PoliticaCliente = {
  timeoutMs: 10_000,
  retry: { maxTentativas: 3, baseMs: 1_000, fator: 2, maxMs: 15_000, jitter: 0.2 },
}

/**
 * Allowlist de hosts por canal para fetchSeguro. PLACEHOLDER NAO VERIFICADO: confirmar com a
 * documentacao do provedor escolhido antes de qualquer chamada real.
 */
export const HOSTS_CANAL: Record<'ifood' | 'outro', readonly HostPermitido[]> = {
  ifood: ['merchant-api.ifood.com.br'],
  outro: [],
}
