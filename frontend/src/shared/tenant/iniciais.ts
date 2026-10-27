export function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean)
  if (p.length === 0) return '?'
  const a = p[0]?.[0] ?? ''
  const b = p.length > 1 ? (p[p.length - 1]?.[0] ?? '') : (p[0]?.[1] ?? '')
  return (a + b).toUpperCase()
}
