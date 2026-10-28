// Geracao do BR Code do Pix DENTRO da conversa (nó de pagamento = pix), de forma DETERMINISTICA (o
// motor efetiva, nunca o LLM: SEC-061, gerar um BR Code NAO confirma pagamento). O motor le a chave
// cifrada da loja (grant 0058), decifra em memoria com a MESMA master key da api (MASTER_KEY, cifra
// de `@whaviso/shared/cifra`), monta o "copia e cola" com a MESMA funcao pura da api
// (`@whaviso/shared/pix`) e enfileira na outbox. A chave em claro vive so dentro de `montarCobrancaPix`,
// o tempo minimo: NUNCA e logada, devolvida nem persistida (SEC-024).
import { criarCifra } from '@whaviso/shared/cifra'
import { gerarPayloadPixCopiaCola } from '@whaviso/shared/pix'
import type { MensagemProposta } from '@whaviso/shared/contracts'
import type { Executor } from '@whaviso/shared/db'
import { texto } from './acoes'
import { formatarPreco } from './comum'
import { lerPixLoja, lerTotalPedido } from './repo_leitura'
import type { EstadoFluxo } from './tipos'

/** Decifra da chave Pix da loja. SO decifra (a api cifra; o atendente so le, grant 0058). */
export type PixDecifra = (cifrado: Buffer) => string

/**
 * Cria a decifra a partir da `MASTER_KEY` (min 32 chars, a MESMA que a api usa para cifrar a chave
 * Pix em `loja_pix`; ver apps/api/.../pagamentos/config.ts). Injetavel em teste sem env. Usa o
 * mesmo kernel/dominio da api (`whaviso/cifra/v1`), ou a autenticacao GCM falha.
 */
export function criarPixDecifra(masterKey: string): PixDecifra {
  const cifra = criarCifra(masterKey)
  return (cifrado: Buffer): string => cifra.decifrar(cifrado).toString('utf8')
}

/** Mensagem de degradacao elegante quando a loja nao configurou (ou nao da para gerar) o Pix. */
export const MSG_PIX_INDISPONIVEL =
  'Nao consegui gerar o Pix agora. Voce pode pagar na entrega (dinheiro ou cartao) ou, se preferir, ' +
  'peca para falar com um atendente que a gente resolve.'

/**
 * Efetiva a cobranca Pix do pedido recem-criado: le a chave cifrada da loja, decifra em memoria,
 * gera o BR Code e empurra as mensagens (aviso + copia e cola) para a fila de saida. Degrada SEM
 * lancar (como o resto do effetivador): loja sem chave, decifra indisponivel ou valor invalido
 * viram um aviso ao cliente, nunca um turno quebrado. So roda quando o pedido FOI criado neste
 * turno (tem id e codigo); sem pedido, nao ha o que cobrar.
 */
export async function montarCobrancaPix(
  tx: Executor,
  lojaId: string,
  decifra: PixDecifra | undefined,
  estado: EstadoFluxo,
  mensagensExtra: MensagemProposta[],
): Promise<void> {
  if (!estado.pedido_id || !estado.codigo) return // pedido nao criado (ex.: degradacao do carrinho)

  const pix = await lerPixLoja(tx, lojaId)
  if (!pix || !decifra) {
    mensagensExtra.push(texto(MSG_PIX_INDISPONIVEL))
    return
  }
  const total = await lerTotalPedido(tx, lojaId, estado.pedido_id)
  if (total == null || total <= 0) {
    mensagensExtra.push(texto(MSG_PIX_INDISPONIVEL))
    return
  }

  // A chave em claro so existe nestas duas linhas; sai de escopo logo em seguida. Nunca logada.
  const chaveClara = decifra(pix.chaveCifrada)
  const brCode = gerarPayloadPixCopiaCola({
    chave: chaveClara,
    tipo: pix.tipo,
    nomeTitular: pix.titular,
    cidade: pix.cidade,
    valorCentavos: total,
    identificador: estado.codigo,
  })

  mensagensExtra.push(texto(`Pague no Pix (copia e cola) o total de ${formatarPreco(total)}:`))
  mensagensExtra.push(texto(brCode))
}
