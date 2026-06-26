// CTA de compra de créditos por WhatsApp (compra MANUAL do MVP, H11.10/H11.3): em vez de
// um gateway, o popup da tela de Créditos abre uma conversa no WhatsApp do whaviso, onde o
// pagamento via Pix é tratado a mão e o owner credita os envios após a confirmação. O
// número vem de VITE_WHATSAPP_VENDAS (config, nunca hardcode); a chave Pix nunca entra no
// front (H13.8): ela é enviada na própria conversa. Sem número configurado, o link é null.
import { brl } from '@/shared/format'

const NUMERO = import.meta.env.VITE_WHATSAPP_VENDAS

interface Args {
  /** Quantidade de envios escolhida no slider. */
  envios: number
  /** Preço total (centavos) calculado pela curva (espelho do backend). */
  precoCentavos: number
  /** E-mail da conta logada, só para o whaviso saber quem creditar. */
  email?: string | null
}

/** Monta o link wa.me com a intenção de compra já preenchida, ou null se não houver
 *  número de vendas configurado (VITE_WHATSAPP_VENDAS). */
export function linkComprarCreditosWhatsApp({ envios, precoCentavos, email }: Args): string | null {
  if (!NUMERO) return null
  const quem = email ? ` Minha conta: ${email}.` : ''
  const texto = `Olá! Quero comprar ${envios} créditos (${brl(precoCentavos)}) no whaviso.${quem}`
  return `https://wa.me/${NUMERO}?text=${encodeURIComponent(texto)}`
}
