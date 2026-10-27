// Geração do txid da cobrança Pix. Função PURA (sem I/O): o repo tenta inserir e, em colisão
// do unique (loja_id, txid), pede o próximo candidato.
//
// Formato do txid no Pix estático (Reference Label, subcampo 05 do campo 62 do EMV): só
// `A-Za-z0-9`, 1 a 25 caracteres. O txid é DETERMINÍSTICO a partir do código do pedido (para
// o dono reconhecer a cobrança no extrato) e ganha um sufixo curto só quando há colisão (ex.:
// recriar a cobrança de um pedido cujo código se repete depois de cancelar/expirar).

const NAO_ALFANUM = /[^A-Za-z0-9]/g
const TAM_MAX = 25

/** Normaliza um texto para o charset do txid Pix (alfanumérico maiúsculo, <= 25). */
export function sanitizarTxid(bruto: string): string {
  return bruto.replace(NAO_ALFANUM, '').toUpperCase().slice(0, TAM_MAX)
}

/**
 * Candidato de txid para a enésima tentativa (0 = base derivada do código do pedido; 1+ =
 * base com sufixo em base36 para contornar colisão). Nunca passa de 25 caracteres nem sai do
 * charset. Base vazia (código sem alfanumérico) cai em "PIX".
 */
export function candidatoTxid(codigoPedido: string, tentativa: number): string {
  const base = sanitizarTxid(codigoPedido) || 'PIX'
  if (tentativa <= 0) return base
  const sufixo = tentativa.toString(36).toUpperCase()
  return (base.slice(0, TAM_MAX - sufixo.length) + sufixo).slice(0, TAM_MAX)
}

/** Teto de tentativas de txid antes de desistir (colisão improvável; evita loop infinito). */
export const MAX_TENTATIVAS_TXID = 50
