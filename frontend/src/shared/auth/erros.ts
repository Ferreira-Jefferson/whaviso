// Traduz erros do Supabase Auth em mensagens amigáveis pt-BR. Login único por Google
// (signInWithIdToken): a tela mostra só uma mensagem genérica; o detalhe técnico do erro
// fica no console do navegador, não na interface.
import type { AuthError } from '@supabase/supabase-js'

export function mensagemDeErroAuth(erro: AuthError | null | undefined): string {
  if (!erro) return 'Algo deu errado. Tente novamente.'
  return 'Não foi possível concluir. Tente novamente em instantes.'
}
