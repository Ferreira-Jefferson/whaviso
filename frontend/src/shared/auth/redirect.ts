// Validação do parâmetro `next` usado para redirecionar após o login.
// Aceita SOMENTE caminho interno absoluto (começa com "/"), rejeitando URLs
// externas e tentativas de escape de origem: "//host" (protocol-relative),
// "/\\host" (que alguns browsers normalizam para "//") e qualquer coisa que
// não comece com "/". Defense-in-depth contra open redirect e phishing: numa
// SPA pura o pushState cross-origin já lança SecurityError, mas cair no default
// quando o `next` é inválido evita erro de navegação e UX confusa.
export function nextSeguro(next: string | null): string | null {
  if (!next) return null
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return null
  }
  return next
}
