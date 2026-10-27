import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { criarLogger } from '@whaviso/shared/logger'
import type { Executor } from '@whaviso/shared/db'
import { ok, falha, type ClienteLLM } from '@whaviso/shared/clientes'
import { criarServicoLlm } from './servico'
import type { AdaptadorProvedor } from './provedores/porta'
import type { DecifraLlm } from './cifra'
import { ChaveInvalida } from './erros'

const SENTINELA = 'sk-or-chave-decifrada-sentinela'
const logger = criarLogger('llm-teste', 'silent')

// --- Fakes -------------------------------------------------------------------------------------

interface OpExec {
  cred?: { id: string; provedor: string; chave_cifrada: Buffer; modelo_preferido: string | null } | null
  gasto?: number
  falharInsert?: boolean
}

function fakeExec(op: OpExec): Executor & { inserts: unknown[][] } {
  const inserts: unknown[][] = []
  const exec = {
    inserts,
    async query(text: string, values: unknown[]) {
      if (text.includes('from public.credenciais_llm')) return { rows: op.cred ? [op.cred] : [] }
      if (text.includes('sum(custo_estimado_centavos)')) return { rows: [{ total: op.gasto ?? 0 }] }
      if (text.includes('insert into public.uso_llm')) {
        if (op.falharInsert) throw new Error('insert bloqueado')
        inserts.push(values)
        return { rows: [] }
      }
      return { rows: [] }
    },
  }
  return exec as unknown as Executor & { inserts: unknown[][] }
}

const credRow = (provedor = 'openrouter', modelo: string | null = null) => ({
  id: 'cred-1',
  provedor,
  chave_cifrada: Buffer.from('bytes-cifrados'),
  modelo_preferido: modelo,
})

function fakeDecifra(valor = SENTINELA): DecifraLlm & { chamadas: number } {
  const d = {
    chamadas: 0,
    decifrarParaTexto() {
      d.chamadas++
      return valor
    },
  }
  return d
}

interface OpAdaptador {
  respostas?: Array<ReturnType<ClienteLLM['completar']> extends Promise<infer R> ? R : never>
  erro?: import('@whaviso/shared/clientes').ErroProvedor
}

function fakeAdaptador(op: OpAdaptador = {}): AdaptadorProvedor & { credVistas: string[]; chamadas: number } {
  const credVistas: string[] = []
  let i = 0
  const ad = {
    provedor: 'openrouter' as const,
    credVistas,
    chamadas: 0,
    async completar(entrada: Parameters<ClienteLLM['completar']>[0]) {
      ad.chamadas++
      credVistas.push(entrada.credencial.revelar())
      if (op.erro) return falha(op.erro)
      const r = op.respostas?.[i] ?? op.respostas?.[op.respostas.length - 1]
      i++
      if (r) return r
      return ok({ texto: 'ok', chamadasFerramenta: [], modelo: 'm-1', uso: { tokensIn: 10, tokensOut: 5, custoEstimadoCentavos: 7 } })
    },
    async transcrever(entrada: Parameters<ClienteLLM['transcrever']>[0]) {
      credVistas.push(entrada.credencial.revelar())
      return ok({ texto: 't', uso: { tokensIn: 1, tokensOut: 1, custoEstimadoCentavos: 1 } })
    },
    async descreverImagem(entrada: Parameters<ClienteLLM['descreverImagem']>[0]) {
      credVistas.push(entrada.credencial.revelar())
      return ok({ descricao: 'd', uso: { tokensIn: 1, tokensOut: 1, custoEstimadoCentavos: 1 } })
    },
    async embutir() {
      return ok({ vetores: [[1]], uso: { tokensIn: 1, tokensOut: 0, custoEstimadoCentavos: 0 } })
    },
  }
  return ad
}

function montar(opExec: OpExec, ad: AdaptadorProvedor, decifra: DecifraLlm, teto?: number) {
  const servico = criarServicoLlm({
    obterDecifra: () => decifra,
    resolverAdaptador: (p) => (p === ad.provedor ? ad : undefined),
    logger,
    precos: {},
    ...(teto !== undefined ? { tetoDiarioCentavos: teto } : {}),
  })
  const exec = fakeExec(opExec)
  return { servico, exec }
}

const base = { lojaId: 'loja-A', origem: 'atendente' }
const msgs = [{ papel: 'user' as const, conteudo: 'oi' }]

// --- Testes ------------------------------------------------------------------------------------

describe('ServicoLlm (orquestrador)', () => {
  it('FALHA FECHADA: sem credencial ativa => llm_indisponivel (provedor nao chamado)', async () => {
    const ad = fakeAdaptador()
    const { servico, exec } = montar({ cred: null }, ad, fakeDecifra())
    const r = await servico.completar({ exec, ...base, mensagens: msgs })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro.codigo).toBe('llm_indisponivel')
    expect(ad.chamadas).toBe(0)
  })

  it('FALHA FECHADA: provedor sem adaptador => llm_indisponivel', async () => {
    const ad = fakeAdaptador()
    const { servico, exec } = montar({ cred: credRow('anthropic') }, ad, fakeDecifra())
    const r = await servico.completar({ exec, ...base, mensagens: msgs })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro.codigo).toBe('llm_indisponivel')
  })

  it('FALHA FECHADA: decifra falha => llm_indisponivel, sem a chave no erro', async () => {
    const ad = fakeAdaptador()
    const decifra: DecifraLlm = {
      decifrarParaTexto() {
        throw new Error('autenticacao da cifra falhou')
      },
    }
    const { servico, exec } = montar({ cred: credRow() }, ad, decifra)
    const r = await servico.completar({ exec, ...base, mensagens: msgs })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro.codigo).toBe('llm_indisponivel')
    expect(ad.chamadas).toBe(0)
    expect(JSON.stringify(r)).not.toContain(SENTINELA)
  })

  it('teto de gasto: gasto do dia >= teto => limite_excedido (provedor nao chamado, nem decifra)', async () => {
    const ad = fakeAdaptador()
    const decifra = fakeDecifra()
    const { servico, exec } = montar({ cred: credRow(), gasto: 5_000 }, ad, decifra, 5_000)
    const r = await servico.completar({ exec, ...base, mensagens: msgs })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro.codigo).toBe('limite_excedido')
    expect(ad.chamadas).toBe(0)
    expect(decifra.chamadas).toBe(0) // nao decifra se ja estourou
  })

  it('caminho feliz: usa a chave da loja e grava uso_llm com tokens/custo/modelo/origem', async () => {
    const ad = fakeAdaptador()
    const { servico, exec } = montar({ cred: credRow('openrouter', 'm-pref') }, ad, fakeDecifra(), 0)
    const r = await servico.completar({ exec, ...base, mensagens: msgs })
    expect(r.ok).toBe(true)
    expect(ad.credVistas).toEqual([SENTINELA]) // a chave decifrada da loja foi ao adaptador
    expect(exec.inserts).toHaveLength(1)
    // insert: (loja_id, provedor, modelo, origem, tokens_entrada, tokens_saida, custo)
    expect(exec.inserts[0]).toEqual(['loja-A', 'openrouter', 'm-1', 'atendente', 10, 5, 7])
  })

  it('falha ao gravar uso NAO derruba a chamada nem vaza segredo', async () => {
    const ad = fakeAdaptador()
    const { servico, exec } = montar({ cred: credRow(), falharInsert: true }, ad, fakeDecifra(), 0)
    const r = await servico.completar({ exec, ...base, mensagens: msgs })
    expect(r.ok).toBe(true) // o consumo foi logado, nao propagado
    expect(JSON.stringify(r)).not.toContain(SENTINELA)
  })

  it('decifra por chamada (nunca em cache): duas chamadas => duas decifras', async () => {
    const ad = fakeAdaptador()
    const decifra = fakeDecifra()
    const { servico, exec } = montar({ cred: credRow() }, ad, decifra, 0)
    await servico.completar({ exec, ...base, mensagens: msgs })
    await servico.completar({ exec, ...base, mensagens: msgs })
    expect(decifra.chamadas).toBe(2)
  })

  it('erro do provedor (chave_invalida) propaga tipado, sem a chave', async () => {
    const ad = fakeAdaptador({ erro: new ChaveInvalida() })
    const { servico, exec } = montar({ cred: credRow() }, ad, fakeDecifra(), 0)
    const r = await servico.completar({ exec, ...base, mensagens: msgs })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro.codigo).toBe('chave_invalida')
    expect(JSON.stringify(r)).not.toContain(SENTINELA)
  })

  describe('completarEstruturado', () => {
    const schema = z.object({ item: z.string() })

    it('valida o JSON pelo schema do chamador', async () => {
      const ad = fakeAdaptador({
        respostas: [ok({ texto: '{"item":"pizza"}', chamadasFerramenta: [], modelo: 'm', uso: { tokensIn: 1, tokensOut: 1, custoEstimadoCentavos: 0 } })],
      })
      const { servico, exec } = montar({ cred: credRow() }, ad, fakeDecifra(), 0)
      const r = await servico.completarEstruturado({ exec, ...base, mensagens: msgs }, schema)
      expect(r.ok && r.valor.dados).toEqual({ item: 'pizza' })
    })

    it('uma retentativa de reparo: invalido depois valido => ok', async () => {
      const resp = (t: string) => ok({ texto: t, chamadasFerramenta: [], modelo: 'm', uso: { tokensIn: 1, tokensOut: 1, custoEstimadoCentavos: 0 } })
      const ad = fakeAdaptador({ respostas: [resp('nao sou json'), resp('{"item":"x"}')] })
      const { servico, exec } = montar({ cred: credRow() }, ad, fakeDecifra(), 0)
      const r = await servico.completarEstruturado({ exec, ...base, mensagens: msgs }, schema)
      expect(r.ok && r.valor.dados).toEqual({ item: 'x' })
      expect(ad.chamadas).toBe(2) // original + reparo
      expect(exec.inserts).toHaveLength(2) // contabiliza as duas chamadas
    })

    it('persistindo invalido apos o reparo => saida_invalida', async () => {
      const resp = ok({ texto: '{"errado":true}', chamadasFerramenta: [], modelo: 'm', uso: { tokensIn: 1, tokensOut: 1, custoEstimadoCentavos: 0 } })
      const ad = fakeAdaptador({ respostas: [resp, resp] })
      const { servico, exec } = montar({ cred: credRow() }, ad, fakeDecifra(), 0)
      const r = await servico.completarEstruturado({ exec, ...base, mensagens: msgs }, schema)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.erro.codigo).toBe('saida_invalida')
      expect(ad.chamadas).toBe(2)
    })
  })

  it('transcrever e descreverImagem usam a chave da loja e contabilizam', async () => {
    const ad = fakeAdaptador()
    const { servico, exec } = montar({ cred: credRow() }, ad, fakeDecifra(), 0)
    const t = await servico.transcrever({ exec, ...base, audio: { bytes: new Uint8Array([1, 2]), mimeType: 'audio/ogg' } })
    const d = await servico.descreverImagem({ exec, ...base, imagem: { bytes: new Uint8Array([3]), mimeType: 'image/png' } })
    expect(t.ok && d.ok).toBe(true)
    expect(ad.credVistas).toEqual([SENTINELA, SENTINELA])
    expect(exec.inserts).toHaveLength(2)
  })
})
