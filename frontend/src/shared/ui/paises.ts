// Países + códigos de discagem (E.164) para o seletor do PhoneInput. Brasil é o
// padrão: o usuário BR só digita o número (nem vê o +55); quem é de fora escolhe
// o país pelo nome e o código entra sozinho (ninguém precisa saber o +XX).
// A bandeira é derivada do ISO (regional indicators), não hardcodada.

export interface Pais {
  /** ISO 3166-1 alpha-2 (chave estável; vira a bandeira). */
  iso: string
  nome: string
  /** Código de discagem sem o '+'. */
  dial: string
}

export const PAIS_PADRAO = 'BR'

// Brasil primeiro; o resto em ordem alfabética (pt-BR) para achar na lista.
export const PAISES: readonly Pais[] = [
  { iso: 'BR', nome: 'Brasil', dial: '55' },
  { iso: 'ZA', nome: 'África do Sul', dial: '27' },
  { iso: 'DE', nome: 'Alemanha', dial: '49' },
  { iso: 'AO', nome: 'Angola', dial: '244' },
  { iso: 'AR', nome: 'Argentina', dial: '54' },
  { iso: 'AU', nome: 'Austrália', dial: '61' },
  { iso: 'AT', nome: 'Áustria', dial: '43' },
  { iso: 'BE', nome: 'Bélgica', dial: '32' },
  { iso: 'BO', nome: 'Bolívia', dial: '591' },
  { iso: 'CA', nome: 'Canadá', dial: '1' },
  { iso: 'CL', nome: 'Chile', dial: '56' },
  { iso: 'CN', nome: 'China', dial: '86' },
  { iso: 'CO', nome: 'Colômbia', dial: '57' },
  { iso: 'KR', nome: 'Coreia do Sul', dial: '82' },
  { iso: 'CR', nome: 'Costa Rica', dial: '506' },
  { iso: 'DK', nome: 'Dinamarca', dial: '45' },
  { iso: 'EG', nome: 'Egito', dial: '20' },
  { iso: 'AE', nome: 'Emirados Árabes Unidos', dial: '971' },
  { iso: 'EC', nome: 'Equador', dial: '593' },
  { iso: 'ES', nome: 'Espanha', dial: '34' },
  { iso: 'US', nome: 'Estados Unidos', dial: '1' },
  { iso: 'PH', nome: 'Filipinas', dial: '63' },
  { iso: 'FI', nome: 'Finlândia', dial: '358' },
  { iso: 'FR', nome: 'França', dial: '33' },
  { iso: 'GR', nome: 'Grécia', dial: '30' },
  { iso: 'GT', nome: 'Guatemala', dial: '502' },
  { iso: 'NL', nome: 'Holanda', dial: '31' },
  { iso: 'IN', nome: 'Índia', dial: '91' },
  { iso: 'ID', nome: 'Indonésia', dial: '62' },
  { iso: 'IE', nome: 'Irlanda', dial: '353' },
  { iso: 'IT', nome: 'Itália', dial: '39' },
  { iso: 'JP', nome: 'Japão', dial: '81' },
  { iso: 'LU', nome: 'Luxemburgo', dial: '352' },
  { iso: 'MY', nome: 'Malásia', dial: '60' },
  { iso: 'MX', nome: 'México', dial: '52' },
  { iso: 'MZ', nome: 'Moçambique', dial: '258' },
  { iso: 'NO', nome: 'Noruega', dial: '47' },
  { iso: 'NZ', nome: 'Nova Zelândia', dial: '64' },
  { iso: 'PA', nome: 'Panamá', dial: '507' },
  { iso: 'PY', nome: 'Paraguai', dial: '595' },
  { iso: 'PE', nome: 'Peru', dial: '51' },
  { iso: 'PL', nome: 'Polônia', dial: '48' },
  { iso: 'PT', nome: 'Portugal', dial: '351' },
  { iso: 'GB', nome: 'Reino Unido', dial: '44' },
  { iso: 'CZ', nome: 'República Tcheca', dial: '420' },
  { iso: 'RO', nome: 'Romênia', dial: '40' },
  { iso: 'RU', nome: 'Rússia', dial: '7' },
  { iso: 'SG', nome: 'Singapura', dial: '65' },
  { iso: 'SE', nome: 'Suécia', dial: '46' },
  { iso: 'CH', nome: 'Suíça', dial: '41' },
  { iso: 'TH', nome: 'Tailândia', dial: '66' },
  { iso: 'TR', nome: 'Turquia', dial: '90' },
  { iso: 'UA', nome: 'Ucrânia', dial: '380' },
  { iso: 'UY', nome: 'Uruguai', dial: '598' },
  { iso: 'VE', nome: 'Venezuela', dial: '58' },
]

const POR_ISO = new Map(PAISES.map((p) => [p.iso, p]))
// Para detectar o país de um E.164, casa o código mais longo primeiro.
const POR_DIAL_DESC = [...PAISES].sort((a, b) => b.dial.length - a.dial.length)

export function paisPorIso(iso: string): Pais {
  return POR_ISO.get(iso) ?? POR_ISO.get(PAIS_PADRAO)!
}

/** Bandeira emoji a partir do ISO (regional indicators). Degrada p/ letras. */
export function bandeira(iso: string): string {
  return String.fromCodePoint(
    ...iso
      .toUpperCase()
      .split('')
      .map((c) => 0x1f1e6 - 65 + c.charCodeAt(0)),
  )
}

/** Quebra um E.164 no país + número nacional; cai no Brasil se não casar. */
export function separarPais(e164: string | null): { iso: string; nacional: string } {
  if (!e164) return { iso: PAIS_PADRAO, nacional: '' }
  const d = e164.replace(/\D/g, '')
  for (const p of POR_DIAL_DESC) {
    if (d.startsWith(p.dial)) return { iso: p.iso, nacional: d.slice(p.dial.length) }
  }
  return { iso: PAIS_PADRAO, nacional: d }
}
