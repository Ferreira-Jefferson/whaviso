// Link para o usuário ABRIR a conversa do WhatsApp do whaviso após confirmar a recarga
// (H11.10). A mensagem de compra (template + chave Pix da plataforma) é EMPURRADA pelo
// servidor (POST /billing/recarga -> outbox -> zap), então o usuário não precisa mais
// digitar nada: este link só leva à conversa onde a mensagem chega e onde ele responde
// com o comprovante. O número vem de VITE_WHATSAPP_VENDAS (config, nunca hardcode) e DEVE
// ser o mesmo número pareado pelo zap/Baileys (senão o comprovante cai noutra conversa).
// Sem número configurado, devolve null (a tela não mostra o botão de abrir conversa).
const NUMERO = import.meta.env.VITE_WHATSAPP_VENDAS

/** wa.me do número de vendas (só abre a conversa), ou null se não houver número. */
export function linkConversaWhatsApp(): string | null {
  if (!NUMERO) return null
  return `https://wa.me/${NUMERO}`
}
