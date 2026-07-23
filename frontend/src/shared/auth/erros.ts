// Traduz erros do Supabase Auth em mensagens amigáveis pt-BR.
// Login sem e-mail/senha (2026-06-17): só Google OAuth e WhatsApp OTP, então as
// mensagens cobrem código inválido/expirado, limite de tentativas e número inválido.
// Consumido por auth E aceite (módulo nunca importa módulo, por isso vive em shared/).
import type { AuthError } from '@supabase/supabase-js'

export function mensagemDeErroAuth(erro: AuthError | null | undefined): string {
  if (!erro) return 'Algo deu errado. Tente novamente.'
  const msg = erro.message.toLowerCase()
  const code = (erro as { code?: string }).code ?? ''

  if (code === 'hook_timeout' || msg.includes('hook')) {
    return 'Não conseguimos enviar o código agora. Aguarde alguns segundos e tente de novo.'
  }
  if (
    msg.includes('expired') ||
    msg.includes('invalid') ||
    msg.includes('otp')
  ) {
    return 'Código inválido ou expirado. Peça um novo e tente de novo.'
  }
  if (
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('you can only request this after')
  ) {
    return 'Muitas tentativas. Aguarde 1 minuto e peça o código de novo.'
  }
  // Item 4a (leva 2026-07-22 1D): `phone_exists` é o Supabase recusando um número que já
  // pertence a OUTRA conta (troca de telefone na Conta, ou onboarding). Precisa vir ANTES do
  // fallback genérico de "phone/number" abaixo: aquele fallback casava com "phone_exists"
  // também (a mensagem de erro contém "phone") e mostrava "DDD errado", que é enganoso quando
  // o DDD está certo e o problema é o número já estar em uso por outra conta.
  if (code === 'phone_exists' || msg.includes('phone_exists') || msg.includes('already been registered')) {
    return 'Este número de WhatsApp já está em uso por outra conta.'
  }
  if (msg.includes('phone') || msg.includes('number')) {
    return 'Número de WhatsApp inválido. Confira o DDD e tente de novo.'
  }
  return 'Não foi possível concluir. Tente novamente em instantes.'
}
