// Kernel compartilhado NOVO (item 19, leva 2026-07-22 1D): valida o comprovante de recarga
// com um modelo de visão via OpenRouter (decisão já tomada: OpenRouter, não Gemini). Vive em
// shared/ porque módulo nunca importa módulo (billing consome, não o contrário).
//
// Só decide DUAS coisas: (a) confiança de que o documento É um comprovante de pagamento
// válido e (b) se o VALOR bate com o esperado. Confiança baixa OU valor não confirmado OU a
// IA indisponível: NUNCA credita nem rejeita sozinho (o chamador decide "aguardando revisão
// manual", H11.14/H11.11). O falso positivo é mitigado exigindo confiança alta *e* valor
// batendo, não só "parece um comprovante".
//
// REGRA DE OURO: nunca logar o conteúdo do documento nem a resposta bruta da IA (podem
// carregar dado bancário do próprio usuário ou de terceiro). Em qualquer falha (rede, JSON
// inválido, sem chave configurada) devolve o resultado de baixa confiança, sem lançar exceção
// e sem logar detalhe (o chamador nunca deve travar por causa de uma IA fora do ar).
//
// TODO(infra): OPENROUTER_API_KEY/OPENROUTER_MODEL ainda não estão no schema tipado de env
// (apps/api/src/env.ts, fora do escopo desta leva): lidos direto de `process.env` aqui. Quem
// tocar em env.ts numa leva futura pode promovê-los a campos tipados sem mudar este módulo.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
/** Modelo com visão padrão; NÃO Gemini (decisão já tomada). Trocável via env sem deploy de código. */
const MODELO_PADRAO = 'openai/gpt-4o-mini'
/** Confiança mínima para creditar automaticamente (junto com valor batendo). */
export const LIMIAR_CONFIANCA = 0.85

export interface ValidarComprovanteArgs {
  /** Conteúdo do arquivo em base64 (mesmo payload recebido no endpoint). */
  bytesBase64: string
  mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'
  quantidade: number
  valorCentavosEsperado: number
}

export interface ResultadoValidacaoComprovante {
  /** 0..1. 0 quando a IA não respondeu ou a resposta não pôde ser interpretada. */
  confianca: number
  /** A IA confirma que o valor pago bate com o esperado? null = não deu para avaliar. */
  valorBate: boolean | null
  /** Frase curta de classificação (ex.: "valor não confere"). NUNCA dado bancário extraído. */
  motivo: string
}

/** Alta confiança E valor confirmado: só assim credita sem revisão manual (H11.14). */
export function comprovanteConfiavel(r: ResultadoValidacaoComprovante): boolean {
  return r.confianca >= LIMIAR_CONFIANCA && r.valorBate === true
}

function resultadoIndisponivel(motivo: string): ResultadoValidacaoComprovante {
  return { confianca: 0, valorBate: null, motivo }
}

/** Monta o bloco de conteúdo multimodal (imagem via data URL; PDF via bloco de arquivo). */
function blocoArquivo(mime: string, bytesBase64: string) {
  const dataUrl = `data:${mime};base64,${bytesBase64}`
  if (mime === 'application/pdf') {
    return { type: 'file', file: { filename: 'comprovante.pdf', file_data: dataUrl } }
  }
  return { type: 'image_url', image_url: { url: dataUrl } }
}

/**
 * Chama o OpenRouter com um modelo de visão para classificar o comprovante. Nunca lança:
 * qualquer problema (sem chave, rede, resposta fora do formato) devolve confiança 0, que o
 * chamador trata como "aguardando revisão manual" (nunca credita, nunca rejeita sozinho).
 */
export async function validarComprovante(
  args: ValidarComprovanteArgs,
): Promise<ResultadoValidacaoComprovante> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return resultadoIndisponivel('ia_indisponivel')

  const modelo = process.env.OPENROUTER_MODEL || MODELO_PADRAO
  const valorReais = (args.valorCentavosEsperado / 100).toFixed(2)
  const prompt =
    `Você audita comprovantes de pagamento Pix para um sistema de créditos pré-pagos. ` +
    `A recarga esperada é de ${args.quantidade} créditos no valor de R$ ${valorReais}. ` +
    `Analise o documento anexado e responda ESTRITAMENTE em JSON, sem nenhum texto fora do ` +
    `JSON, no formato: {"confianca": <número 0 a 1>, "valor_bate": <true|false>, "motivo": ` +
    `"<frase curta, sem citar números de conta/agência/CPF/chave Pix>"}. "confianca" é o ` +
    `quão certo você está de que é um comprovante de pagamento genuíno; "valor_bate" é se o ` +
    `valor pago corresponde ao esperado (com tolerância de centavos por arredondamento).`

  try {
    const resp = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: modelo,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              blocoArquivo(args.mime, args.bytesBase64),
            ],
          },
        ],
        temperature: 0,
      }),
    })
    if (!resp.ok) return resultadoIndisponivel('ia_indisponivel')

    const corpo = (await resp.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const texto = corpo.choices?.[0]?.message?.content
    if (!texto) return resultadoIndisponivel('ia_sem_resposta')

    // O modelo pode envolver o JSON em texto/crase mesmo pedindo para não fazer isso;
    // extrai o primeiro bloco {...} antes de parsear (defensivo, sem logar `texto`).
    const match = texto.match(/\{[\s\S]*\}/)
    if (!match) return resultadoIndisponivel('ia_formato_invalido')
    const json = JSON.parse(match[0]) as { confianca?: unknown; valor_bate?: unknown; motivo?: unknown }

    const confianca =
      typeof json.confianca === 'number' && Number.isFinite(json.confianca)
        ? Math.min(1, Math.max(0, json.confianca))
        : 0
    const valorBate = typeof json.valor_bate === 'boolean' ? json.valor_bate : null
    const motivo = typeof json.motivo === 'string' && json.motivo.trim() ? json.motivo.trim().slice(0, 200) : 'sem motivo informado'

    return { confianca, valorBate, motivo }
  } catch {
    return resultadoIndisponivel('ia_indisponivel')
  }
}
