// Acesso ao perfil pela `api` REST (fonte de verdade do `role`).
// O backend cria o profile por trigger no signup (role default 'user',
// nome = ''); GET /v1/perfil NÃO cria, então pode não haver linha ainda numa
// corrida pós-signup. Aqui normalizamos: perfil válido, ausente ou incompleto.
import { ApiError, apiClient } from '../api_client'
import {
  perfilSchema,
  statusTelefoneResposta,
  verificarSessaoResposta,
  type AtualizarPerfilBody,
  type Perfil,
  type StatusTelefoneResposta,
  type VerificarSessaoResposta,
} from '../contracts'

/**
 * H1.2/H1.3: pergunta ao backend se o número já tem cadastro e qual o método de login.
 * 'phone': pode entrar por OTP. 'google': deve entrar pelo Google (bloqueia OTP).
 * null: número novo. Em falha retorna null e a UI segue com copy neutra.
 */
export async function statusTelefone(
  telefoneE164: string,
): Promise<{ existe: boolean; metodo: 'phone' | 'google' | null } | null> {
  try {
    const r = await apiClient.post<StatusTelefoneResposta>('/auth/status-telefone', {
      body: { telefone: telefoneE164 },
      schema: statusTelefoneResposta,
    })
    return { existe: r.existe, metodo: r.metodo }
  } catch {
    return null
  }
}

/**
 * Chamada logo após verificarCodigoWhatsapp. Detecta se a conta phone-only recém-criada
 * é um "split" de uma conta Google existente e retorna o magic_token para resolver.
 * Retorna null em falha de rede (o frontend trata como 'novo').
 */
export async function verificarSessao(): Promise<VerificarSessaoResposta | null> {
  try {
    return await apiClient.post<VerificarSessaoResposta>('/auth/verificar-sessao', {
      schema: verificarSessaoResposta,
    })
  } catch {
    return null
  }
}

/** Busca o perfil. Retorna null se ainda não existe linha (corrida pós-signup). */
export async function buscarPerfil(): Promise<Perfil | null> {
  try {
    return await apiClient.get<Perfil>('/perfil', { schema: perfilSchema })
  } catch (err) {
    // Sem linha de profile: a resposta vazia/0 não casa com o contrato →
    // tratamos como "ainda não existe" (onboarding decide o próximo passo).
    if (err instanceof ApiError && err.code === 'resposta_invalida') return null
    throw err
  }
}

/** Atualiza o perfil (onboarding e tela de conta). */
export async function atualizarPerfil(body: AtualizarPerfilBody): Promise<Perfil> {
  return apiClient.patch<Perfil>('/perfil', { body, schema: perfilSchema })
}

/**
 * Perfil "incompleto" = sem nome utilizável. O trigger nasce com nome = '',
 * então um usuário recém-criado cai em onboarding até preencher o nome.
 */
export function perfilIncompleto(perfil: Perfil | null): boolean {
  if (!perfil) return true
  return perfil.nome.trim().length === 0
}
