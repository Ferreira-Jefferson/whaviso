// SEC-024: a chave (e todo segredo) nunca entra em log. Exercita a redaction recursiva do logger
// do F4 com segredos sentinela em campos sensiveis rasos E aninhados, em log de erro (stack/cause)
// e confirma: nenhuma sentinela na saida, e o campo vira o marcador de redaction.
//
// Em falha, o teste reporta o NOME logico do campo que vazou, nunca o valor da sentinela.
import { describe, it, expect } from 'vitest'
import { criarCapturaLog, CENSOR } from '../helpers/captura_log'
import { SENTINELAS, VALORES_SENTINELA } from '../fixtures/segredos'

describe('SEC-024: redaction de log (logger do F4)', () => {
  it('redige campos sensiveis rasos e aninhados; nenhuma sentinela na saida', () => {
    const cap = criarCapturaLog()
    cap.logger.info(
      {
        // raso
        chave: SENTINELAS.chaveLlm,
        token: SENTINELAS.tokenMeta,
        authorization: `Bearer ${SENTINELAS.tokenMeta}`,
        telefone: SENTINELAS.telefone,
        pix: SENTINELAS.pix,
        // aninhado
        credencial: { chave_cifrada: SENTINELAS.chaveLlm, meta: { token: SENTINELAS.tokenMeta } },
        req: { headers: { authorization: `Bearer ${SENTINELAS.tokenMeta}` } },
        cliente: { telefone_hash: SENTINELAS.telefone, pix_chave: SENTINELAS.pix },
      },
      'evento com segredos',
    )

    const mapa = {
      chaveLlm: SENTINELAS.chaveLlm,
      tokenMeta: SENTINELAS.tokenMeta,
      telefone: SENTINELAS.telefone,
      pix: SENTINELAS.pix,
    }
    expect(cap.nomesVazados(mapa), `campos que vazaram no log: ${cap.nomesVazados(mapa).join(', ')}`).toEqual([])
    expect(cap.semSentinelas(VALORES_SENTINELA)).toBe(true)
    // E o campo de fato aparece como marcador de redaction (prova que redigiu, nao sumiu).
    expect(cap.texto()).toContain(CENSOR)
  })

  it('log de erro com contexto sensivel: stack limpa e campos sensiveis redigidos', () => {
    const cap = criarCapturaLog()
    const causa = new Error('falha na chamada ao provedor')
    // Formato tipico de erro de cliente HTTP: o segredo no header de auth, aninhado em config.
    ;(causa as unknown as { config: unknown }).config = {
      url: 'https://provedor.example/v1',
      headers: { authorization: `Bearer ${SENTINELAS.chaveLlm}` },
    }
    const erro = new Error('500 ao decifrar e chamar o provedor', { cause: causa })
    // Log realista: o erro mais o contexto da operacao (onde um segredo poderia escorregar).
    cap.logger.error(
      {
        err: erro,
        contexto: {
          authorization: `Bearer ${SENTINELAS.tokenMeta}`,
          credencial: { chave_cifrada: SENTINELAS.chaveLlm },
          cliente: { telefone: SENTINELAS.telefone, pix: SENTINELAS.pix },
        },
      },
      'erro no fluxo de credencial',
    )

    // Propriedade central (SEC-024): nenhuma sentinela na saida, inclusive stack/err.
    expect(cap.semSentinelas(VALORES_SENTINELA), 'segredo vazou no log de erro').toBe(true)
    // E os campos sensiveis do contexto viraram marcador de redaction.
    expect(cap.texto()).toContain(CENSOR)
  })
})
