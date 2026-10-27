// Rotulos do modulo llm (so apresentacao; a regra e do backend).
import type { ProvedorLlm } from '@/shared/contracts/_generated/enums'
import type { ResultadoValidacaoLlm } from '@/shared/contracts/_generated/configuracoes_llm'

export const ROTULO_PROVEDOR: Record<ProvedorLlm, string> = {
  openrouter: 'OpenRouter',
  anthropic: 'Anthropic',
  outro: 'Outro',
}

export const OPCOES_PROVEDOR = (Object.keys(ROTULO_PROVEDOR) as ProvedorLlm[]).map((value) => ({
  value,
  label: ROTULO_PROVEDOR[value],
}))

export const MENSAGEM_TESTE: Record<ResultadoValidacaoLlm, { tom: 'sucesso' | 'erro' | 'info'; texto: string }> = {
  valida: { tom: 'sucesso', texto: 'A chave é válida. Nada foi salvo: use o botão de salvar para gravar.' },
  invalida: { tom: 'erro', texto: 'O provedor recusou a chave. Confira se copiou inteira e se está ativa.' },
  indisponivel: { tom: 'info', texto: 'O provedor não respondeu agora. Tente de novo em instantes.' },
}
