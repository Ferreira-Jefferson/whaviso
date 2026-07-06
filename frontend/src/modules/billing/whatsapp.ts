// Link para o usuário ABRIR a conversa do WhatsApp do whaviso após confirmar a recarga
// (H11.10). A mensagem de compra (template + chave Pix da plataforma) é EMPURRADA pelo
// servidor (POST /billing/recarga -> outbox -> zap), então o usuário não precisa digitar
// nada: este link só leva à conversa onde a mensagem chega e onde ele responde com o
// comprovante. O número vem da PRÓPRIA resposta da recarga (telefone_vendas), que é o
// número conectado pelo zap via Meta Cloud API (whats_sessao) -> sempre o mesmo que envia e recebe, sem
// env nem configuração. Sem número (sessão desconectada), devolve null e a tela esconde o botão.

/** wa.me do número pareado (só abre a conversa), ou null se não houver número. */
export function linkConversaWhatsApp(numero: string | null | undefined): string | null {
  if (!numero) return null
  return `https://wa.me/${numero}`
}
