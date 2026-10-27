// Entrada de telefone brasileiro para E.164 (so para o login por OTP; nunca logar o valor).
/** "(12) 99999-8888", "12999998888" ou "+55 12 99999-8888" -> "+5512999998888"; null se invalido. */
export function telefoneBrParaE164(entrada: string): string | null {
  const d = entrada.replace(/\D/g, '')
  const nacional = d.startsWith('55') && (d.length === 12 || d.length === 13) ? d.slice(2) : d
  // DDD (2) + fixo (8) ou celular (9, comeca em 9).
  if (!/^[1-9]\d(?:[2-5]\d{7}|9\d{8})$/.test(nacional)) return null
  return `+55${nacional}`
}
