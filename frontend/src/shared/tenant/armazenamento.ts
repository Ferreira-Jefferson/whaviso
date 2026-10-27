// Loja ativa por usuario em localStorage: so conveniencia (SEC-020: nenhum segredo aqui).
// Sempre em try/catch; o app funciona sem armazenamento.
const chave = (userId: string) => `whaviso:loja-ativa:${userId}`

export function lerLojaSalva(userId: string): string | null {
  try {
    return localStorage.getItem(chave(userId))
  } catch {
    return null
  }
}

export function salvarLoja(userId: string, lojaId: string): void {
  try {
    localStorage.setItem(chave(userId), lojaId)
  } catch {
    // indisponivel (modo privado, quota): ignora.
  }
}
