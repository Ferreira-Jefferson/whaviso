// Branding por loja: converte `cores` da loja ativa em variaveis CSS do <html>.
// Entrada nunca confiavel: so aceita hex #RRGGBB (o valor vai para style, nao para HTML).
const HEX = /^#[0-9a-fA-F]{6}$/

export interface BrandingLoja {
  primaria: string
  primariaSuave: string
  sobrePrimaria: string
}

function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

function paraHex(c: [number, number, number]): string {
  return `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

function luminancia([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/** Mistura a cor com branco (fracao 0..1 de branco). */
function clarear(hex: string, fracaoBranco: number): string {
  const [r, g, b] = rgb(hex)
  return paraHex([r + (255 - r) * fracaoBranco, g + (255 - g) * fracaoBranco, b + (255 - b) * fracaoBranco])
}

/** Escolhe texto claro ou escuro com melhor contraste sobre a primaria. */
function corSobre(hex: string): string {
  return luminancia(rgb(hex)) > 0.4 ? '#20322a' : '#faf7f0'
}

/** Le a cor primaria de `cores` (aceita `primaria`/`primary`); null se ausente ou invalida. */
export function primariaDe(cores: Record<string, unknown> | null | undefined): string | null {
  if (!cores) return null
  const v = cores.primaria ?? cores.primary
  return typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : null
}

export function calcularBranding(cores: Record<string, unknown> | null | undefined): BrandingLoja | null {
  const primaria = primariaDe(cores)
  if (!primaria) return null
  return { primaria, primariaSuave: clarear(primaria, 0.85), sobrePrimaria: corSobre(primaria) }
}

/** Aplica (ou limpa, com null) o branding no elemento raiz. */
export function aplicarBranding(b: BrandingLoja | null, alvo: HTMLElement = document.documentElement): void {
  const vars = ['--cor-primaria', '--cor-primaria-suave', '--cor-sobre-primaria'] as const
  if (!b) {
    for (const v of vars) alvo.style.removeProperty(v)
    return
  }
  alvo.style.setProperty('--cor-primaria', b.primaria)
  alvo.style.setProperty('--cor-primaria-suave', b.primariaSuave)
  alvo.style.setProperty('--cor-sobre-primaria', b.sobrePrimaria)
}
