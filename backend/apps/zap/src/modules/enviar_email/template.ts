// Renderizacao dos templates de e-mail EM CODIGO (o zap e so o transporte). Linguagem neutra quanto
// a genero, sem travessao, sem emoji. Uma chave por ora: boas-vindas de acesso liberado.
import type { EmailParaEnviar } from './cliente_resend'

/** Templates conhecidos. Um payload desconhecido cai como permanente no drainer. */
export type TemplateEmail = 'boas_vindas'

export function renderizar(
  template: string,
  para: string,
  _payload: unknown,
): EmailParaEnviar | null {
  if (template === 'boas_vindas') return boasVindas(para)
  return null
}

function boasVindas(para: string): EmailParaEnviar {
  const texto = [
    'Ola,',
    '',
    'Seu acesso ao Whaviso foi liberado. Ja da para entrar e criar a sua conta para',
    'comecar a automatizar o atendimento do seu restaurante pelo WhatsApp.',
    '',
    'Acesse o Whaviso com o mesmo e-mail que recebeu esta mensagem.',
    '',
    'Se precisar de ajuda, basta responder este e-mail.',
    '',
    'Equipe Whaviso',
  ].join('\n')
  return { para, assunto: 'Seu acesso ao Whaviso foi liberado', texto }
}
