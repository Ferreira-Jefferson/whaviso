import { pino, type DestinationStream, type Logger } from 'pino'

export type { Logger }

// Config de redaction de dados sensíveis (H13.8 / AGENTS.md): telefone, Pix
// (+titular/banco), token, OTP, código. RECOMENDAÇÃO: logue só IDs/códigos de erro,
// nunca o objeto cru de aviso/perfil. O pino redige por PATH explícito, então shape
// aninhado profundo (ex.: aviso.dados.telefone_devedor) só some se o path bater; por
// isso a regra é "não passar o objeto cru". Os `*.x` cobrem 1 nível; `*.*.x` cobre 2.
// Exportado para o teste de segurança verificar exatamente estes paths.
export const REDACT = {
  paths: [
    'telefone', '*.telefone', '*.*.telefone',
    'telefone_devedor', '*.telefone_devedor', '*.*.telefone_devedor',
    'telefone_cobrador', '*.telefone_cobrador', '*.*.telefone_cobrador',
    'pix_chave', '*.pix_chave', '*.*.pix_chave',
    'pix_titular', '*.pix_titular', '*.*.pix_titular',
    'pix_banco', '*.pix_banco', '*.*.pix_banco',
    'titular', '*.titular', '*.*.titular',
    'banco', '*.banco', '*.*.banco',
    'chave', '*.chave', '*.*.chave',
    'token', '*.token', '*.*.token',
    'otp', '*.otp', '*.*.otp',
    'codigo', '*.codigo', '*.*.codigo',
  ],
  censor: '[oculto]',
}

export function criarLogger(
  nome: string,
  nivel = process.env.LOG_LEVEL ?? 'info',
  destino?: DestinationStream,
): Logger {
  return pino({ name: nome, level: nivel, redact: REDACT }, destino as DestinationStream)
}
