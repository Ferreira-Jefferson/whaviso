import { describe, it, expect } from 'vitest'
import { CredencialResolvida, ErroProvedor } from '../erros'
import type { ClienteLLM, RequisicaoLlm } from '../llm'

export interface FabricaLlm {
  cliente: ClienteLLM
  /** Requisicoes montadas ate agora por `completar` (headers + body). */
  requisicoes: () => RequisicaoLlm[]
}

const SEGREDO = 'sk-segredo-unico-9f3a'

/** Suite de contrato: stub, fake e a implementacao real (AT-llm) devem passar. */
export function contratoClienteLLM(nome: string, fabrica: () => FabricaLlm): void {
  describe(`contrato ClienteLLM: ${nome}`, () => {
    it('completar devolve texto, uso e chamadas de ferramenta (ou erro tipado)', async () => {
      const { cliente } = fabrica()
      const r = await cliente.completar({
        credencial: new CredencialResolvida(SEGREDO),
        mensagens: [{ papel: 'user', conteudo: 'quero uma pizza' }],
      })
      if (r.ok) {
        expect(typeof r.valor.texto).toBe('string')
        expect(Array.isArray(r.valor.chamadasFerramenta)).toBe(true)
        expect(r.valor.uso.tokensIn).toBeGreaterThanOrEqual(0)
        expect(Number.isInteger(r.valor.uso.custoEstimadoCentavos)).toBe(true)
      } else expect(r.erro).toBeInstanceOf(ErroProvedor)
    })

    it('SEC-026: credencial so no header de auth, nunca no body nem nas mensagens', async () => {
      const { cliente, requisicoes } = fabrica()
      const mensagens = [
        { papel: 'system' as const, conteudo: 'voce atende pedidos' },
        { papel: 'user' as const, conteudo: 'oi' },
      ]
      await cliente.completar({
        credencial: new CredencialResolvida(SEGREDO),
        mensagens,
        ferramentas: [{ nome: 'x', descricao: 'd', parametros: { type: 'object' } }],
        formatoSaida: { tipo: 'json' },
      })
      const reqs = requisicoes()
      expect(reqs.length).toBeGreaterThan(0)
      for (const req of reqs) {
        expect(JSON.stringify(req.body)).not.toContain(SEGREDO)
        expect(JSON.stringify(mensagens)).not.toContain(SEGREDO)
        expect(req.headers['authorization']).toContain(SEGREDO)
      }
    })

    it('embutir devolve um vetor por texto, de mesma dimensao', async () => {
      const { cliente } = fabrica()
      const r = await cliente.embutir({ credencial: new CredencialResolvida(SEGREDO), textos: ['a', 'bb'] })
      if (r.ok) {
        expect(r.valor.vetores).toHaveLength(2)
        expect(r.valor.vetores[0]!.length).toBe(r.valor.vetores[1]!.length)
      }
    })

    it('transcrever e descreverImagem respondem texto', async () => {
      const { cliente } = fabrica()
      const credencial = new CredencialResolvida(SEGREDO)
      const bin = { bytes: new Uint8Array([1, 2]), mimeType: 'audio/ogg' }
      const t = await cliente.transcrever({ credencial, audio: bin })
      const d = await cliente.descreverImagem({ credencial, imagem: { ...bin, mimeType: 'image/png' } })
      if (t.ok) expect(typeof t.valor.texto).toBe('string')
      if (d.ok) expect(typeof d.valor.descricao).toBe('string')
    })
  })
}
