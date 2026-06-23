// Número de convite de 6 dígitos (Épico 2 H2.2; consumido pela validação do Épico 5).
//
// O devedor recebe um NÚMERO de 6 dígitos, exibido como xxx-xxx (o hífen é só visual,
// para leitura). No banco fica APENAS o hash sha256 do número; o claro nunca persiste/
// loga. A api hasheia ao CRIAR; o zap hasheia ao LOCALIZAR no aceite (E5): os dois
// precisam do MESMO hash, então o `sha256ConviteHex` mora aqui (kernel compartilhado),
// não no shared/tokens de um app. Geração com retry de unicidade por telefone fica no
// service da api.
import { createHash, randomInt } from 'node:crypto'

/** sha256 hex do número de convite (mesma fonte para api criar e zap localizar). */
export function sha256ConviteHex(numero: string): string {
  return createHash('sha256').update(numero).digest('hex')
}
//
// Validação no aceite (E5): o devedor pode digitar com hífen (xxx-xxx) OU os 6 dígitos
// corridos (xxxxxx); `normalizarNumeroConvite` aceita os dois e devolve a forma canônica
// (6 dígitos corridos) para hashear e comparar.

/** Quantidade de dígitos do número de convite. */
export const DIGITOS_CONVITE = 6

/**
 * Gera um número de convite de 6 dígitos (string de 6 caracteres "000000".."999999").
 * Por padrão usa CSPRNG (`crypto.randomInt`), sem viés de módulo, conforme as invariantes
 * de segurança do projeto. A segurança real é o par número+telefone + anti-brute-force do
 * E5 + unicidade por telefone no banco, mas geramos com CSPRNG mesmo assim (custo zero).
 * O parâmetro `aleatorio` (gerador estilo Math.random em [0,1)) é injetável SÓ para teste
 * determinístico; quando ausente, a fonte é o CSPRNG.
 */
export function gerarNumeroConvite(aleatorio?: () => number): string {
  const n = aleatorio ? Math.floor(aleatorio() * 1_000_000) : randomInt(0, 1_000_000)
  return n.toString().padStart(DIGITOS_CONVITE, '0')
}

/** Formata 6 dígitos corridos para exibição xxx-xxx (hífen só visual). */
export function formatarNumeroConvite(numero: string): string {
  const canon = normalizarNumeroConvite(numero)
  if (!canon) return numero
  return `${canon.slice(0, 3)}-${canon.slice(3)}`
}

/**
 * Normaliza a entrada do usuário para a forma canônica (6 dígitos corridos) ou null se
 * não for um número de convite válido. Aceita "xxx-xxx", "xxxxxx", com espaços ao redor.
 */
export function normalizarNumeroConvite(entrada: string): string | null {
  const so = entrada.replace(/\D/g, '')
  return so.length === DIGITOS_CONVITE ? so : null
}

/**
 * EXTRAI o número de convite de uma FRASE (E5/H5.1): a 1ª mensagem do convidado vem como
 * "Oi, aqui é fulano, meu convite é o xxx-xxx" (ou os 6 dígitos corridos). Devolve a forma
 * canônica (6 dígitos corridos) ou null se a mensagem não traz um número de 6 dígitos
 * (-> fallback "pedir número"). Procura o PRIMEIRO grupo de exatamente 3+3 (com hífen/
 * espaço) ou 6 dígitos isolados, evitando casar números maiores (ex.: telefones de 11
 * dígitos não devem ser confundidos com convite). O claro nunca é logado.
 */
export function extrairNumeroConvite(texto: string): string | null {
  // 3 dígitos + separador opcional (hífen/espaço) + 3 dígitos, com fronteira de dígito
  // dos dois lados para não recortar 6 de dentro de um número maior (ex.: telefone).
  const m = texto.match(/(?<!\d)(\d{3})[\s-]?(\d{3})(?!\d)/)
  return m ? `${m[1]}${m[2]}` : null
}
