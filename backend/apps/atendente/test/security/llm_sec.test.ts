// Testes de seguranca do cliente de LLM (AT-llm), o ativo mais caro do banco.
//
// Parte roda SEM banco (redaction, pico puro); a parte de integracao roda no Postgres LOCAL sob o
// role whaviso_atendente (o unico que le `credenciais_llm.chave_cifrada`), e se pula se o banco nao
// estiver acessivel. Semeia duas lojas com chaves SENTINELA distintas e prova:
//   - cada chamada usa a chave da propria loja (isolamento);
//   - loja sem credencial falha fechada (llm_indisponivel), sem cair em outra chave;
//   - a decifra com master key errada falha fechada (separacao de dominio por chave mestra);
//   - `uso_llm` e gravado na loja certa (SEC-062) e e append-only (SEC-033);
//   - a matriz de privilegio por SET ROLE: so whaviso_atendente le chave_cifrada (SEC-021/022);
//   - a sentinela nunca aparece em log nem em erro (SEC-020/024).
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { criarCifra } from '@whaviso/shared/cifra'
import { criarLogger, redigir } from '@whaviso/shared/logger'
import { ok, falha, type ClienteLLM } from '@whaviso/shared/clientes'
import {
  criarDecifraLlm,
  criarServicoLlm,
  detectarPico,
  LlmIndisponivel,
  resolverPorRegistro,
  seriePorDiaCentavos,
  type AdaptadorProvedor,
} from '../../src/shared/llm_client'
import { bancoAcessivel, fecharPools, limpar, poolAtendente, poolSuper, semear } from '../db'
import { escopoLoja } from '../../src/shared/escopo'

const online = await bancoAcessivel()
const logger = criarLogger('llm-sec', 'silent')

// Master key PROPRIA da cifra de LLM no teste (>= 32 chars). A api cifraria com ela; aqui o
// atendente decifra com a MESMA (interop). Uma master key distinta prova a falha fechada.
const LLM_MASTER_KEY = 'llm-master-key-de-teste-32-chars-ok!!'
const LLM_MASTER_KEY_ERRADA = 'OUTRA-master-key-de-teste-32-chars-xx'

const SENTINELA_A = 'sk-or-chave-da-loja-A-sentinela-001'

/** Adaptador falso: sem rede; ecoa a chave recebida para verificar o isolamento. */
function fakeAdaptador(): AdaptadorProvedor & { credVistas: string[] } {
  const credVistas: string[] = []
  const ad = {
    provedor: 'openrouter' as const,
    credVistas,
    async completar(e: Parameters<ClienteLLM['completar']>[0]) {
      credVistas.push(e.credencial.revelar())
      return ok({ texto: 'ok', chamadasFerramenta: [], modelo: 'm-1', uso: { tokensIn: 10, tokensOut: 5, custoEstimadoCentavos: 7 } })
    },
    async transcrever() {
      return falha(new LlmIndisponivel())
    },
    async descreverImagem() {
      return falha(new LlmIndisponivel())
    },
    async embutir() {
      return ok({ vetores: [[1]], uso: { tokensIn: 1, tokensOut: 0, custoEstimadoCentavos: 0 } })
    },
  }
  return ad
}

function servicoCom(ad: AdaptadorProvedor, masterKey = LLM_MASTER_KEY) {
  return criarServicoLlm({
    obterDecifra: () => criarDecifraLlm(masterKey),
    resolverAdaptador: resolverPorRegistro({ openrouter: ad }),
    logger,
    precos: {},
    tetoDiarioCentavos: 0,
  })
}

/** Semeia uma credencial de LLM ativa para a loja, cifrada com a master key de teste. */
async function semearCredencial(lojaId: string, chave: string, masterKey = LLM_MASTER_KEY): Promise<void> {
  const cifrada = criarCifra(masterKey).cifrar(Buffer.from(chave, 'utf8'))
  const ultimos4 = chave.replace(/[^0-9A-Za-z]/g, '').slice(-4) // so alfanumericos (check do banco)
  await poolSuper.query(
    `insert into public.credenciais_llm (loja_id, provedor, chave_cifrada, ultimos4, ativo)
     values ($1, 'openrouter', $2, $3, true)`,
    [lojaId, cifrada, ultimos4],
  )
}

async function usoDaLoja(lojaId: string): Promise<Array<{ origem: string; custo: number; tin: number }>> {
  const { rows } = await poolSuper.query(
    `select origem, custo_estimado_centavos as custo, tokens_entrada as tin
       from public.uso_llm where loja_id = $1 order by criado_em`,
    [lojaId],
  )
  return rows as Array<{ origem: string; custo: number; tin: number }>
}

const contas: string[] = []
afterEach(async () => {
  while (contas.length) await limpar(contas.pop()!)
})
afterAll(fecharPools)

// --- Sem banco ---------------------------------------------------------------------------------

describe('SEC-024: redaction recursiva cobre a chave/authorization', () => {
  it('nenhum campo sensivel aninhado escapa', () => {
    const obj = { req: { headers: { authorization: `Bearer ${SENTINELA_A}` } }, chave: SENTINELA_A, nested: { token: SENTINELA_A } }
    const saida = JSON.stringify(redigir(obj))
    expect(saida).not.toContain(SENTINELA_A)
    expect(saida).toContain('[oculto]')
  })
})

describe('SEC-100: pico de consumo detectavel a partir da serie de uso', () => {
  it('ultimo dia muito acima da media dispara pico', () => {
    const serie = [100, 120, 90, 110, 1000].map((c, i) => ({ dia: `d${i}`, custo: c }))
    expect(detectarPico(serie)).toBe(true)
    expect(detectarPico(serie.slice(0, 2))).toBe(false) // poucos dias: nao afirma pico
  })
})

// --- Integracao (Postgres local, role whaviso_atendente) --------------------------------------

describe.skipIf(!online)('AT-llm (integracao, role whaviso_atendente)', () => {
  it('isolamento: cada loja usa a propria chave; loja sem credencial falha fechada; uso na loja certa', async () => {
    const a = await semear()
    const b = await semear()
    contas.push(a.contaId, b.contaId)
    await semearCredencial(a.lojaId, SENTINELA_A)
    // loja B fica SEM credencial de proposito.

    const ad = fakeAdaptador()
    const servico = servicoCom(ad)

    const rA = await servico.completar({ exec: poolAtendente, escopo: escopoLoja(a.lojaId), origem: 'atendente', mensagens: [{ papel: 'user', conteudo: 'oi' }] })
    expect(rA.ok).toBe(true)
    expect(ad.credVistas).toEqual([SENTINELA_A]) // usou a chave da loja A

    const rB = await servico.completar({ exec: poolAtendente, escopo: escopoLoja(b.lojaId), origem: 'atendente', mensagens: [{ papel: 'user', conteudo: 'oi' }] })
    expect(rB.ok).toBe(false)
    if (!rB.ok) expect(rB.erro.codigo).toBe('llm_indisponivel') // falha fechada, nao caiu na chave de A
    expect(ad.credVistas).toEqual([SENTINELA_A]) // B nao chamou o adaptador

    // uso_llm gravado so na loja A, com os tokens/custo/origem corretos.
    expect(await usoDaLoja(a.lojaId)).toEqual([{ origem: 'atendente', custo: 7, tin: 10 }])
    expect(await usoDaLoja(b.lojaId)).toEqual([])
  })

  it('credencial inativa resolve como ausente (falha fechada)', async () => {
    const a = await semear()
    contas.push(a.contaId)
    await semearCredencial(a.lojaId, SENTINELA_A)
    await poolSuper.query('update public.credenciais_llm set ativo = false where loja_id = $1', [a.lojaId])

    const ad = fakeAdaptador()
    const r = await servicoCom(ad).completar({ exec: poolAtendente, escopo: escopoLoja(a.lojaId), origem: 'atendente', mensagens: [{ papel: 'user', conteudo: 'oi' }] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro.codigo).toBe('llm_indisponivel')
    expect(ad.credVistas).toEqual([])
  })

  it('decifra com master key errada falha fechada (separacao de dominio por chave mestra)', async () => {
    const a = await semear()
    contas.push(a.contaId)
    await semearCredencial(a.lojaId, SENTINELA_A, LLM_MASTER_KEY) // cifrada com a chave certa
    const ad = fakeAdaptador()
    const servico = servicoCom(ad, LLM_MASTER_KEY_ERRADA) // decifra com a ERRADA
    const r = await servico.completar({ exec: poolAtendente, escopo: escopoLoja(a.lojaId), origem: 'atendente', mensagens: [{ papel: 'user', conteudo: 'oi' }] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro.codigo).toBe('llm_indisponivel')
    expect(JSON.stringify(r)).not.toContain(SENTINELA_A)
    expect(ad.credVistas).toEqual([])
  })

  it('SEC-033: uso_llm rejeita UPDATE e nao tem DELETE para o atendente', async () => {
    const a = await semear()
    contas.push(a.contaId)
    await poolAtendente.query(
      `insert into public.uso_llm (loja_id, provedor, origem, tokens_entrada, tokens_saida, custo_estimado_centavos)
       values ($1, 'openrouter', 'atendente', 1, 1, 1)`,
      [a.lojaId],
    )
    await expect(poolAtendente.query('update public.uso_llm set custo_estimado_centavos = 0 where loja_id = $1', [a.lojaId])).rejects.toThrow()
    await expect(poolAtendente.query('delete from public.uso_llm where loja_id = $1', [a.lojaId])).rejects.toThrow()
  })

  it('SEC-100: consulta de apoio de serie diaria funciona sob o role atendente', async () => {
    const a = await semear()
    contas.push(a.contaId)
    await poolAtendente.query(
      `insert into public.uso_llm (loja_id, provedor, origem, tokens_entrada, tokens_saida, custo_estimado_centavos)
       values ($1, 'openrouter', 'atendente', 10, 5, 42)`,
      [a.lojaId],
    )
    const serie = await seriePorDiaCentavos(poolAtendente, a.lojaId, 7)
    expect(serie.reduce((s, d) => s + d.custo, 0)).toBe(42)
  })

  it('SEC-021/022: matriz por SET ROLE: so whaviso_atendente le chave_cifrada', async () => {
    const c = await poolSuper.connect()
    try {
      await c.query('set role whaviso_zap')
      await expect(c.query('select chave_cifrada from public.credenciais_llm limit 1')).rejects.toThrow()
      await c.query('reset role')
      await c.query('set role whaviso_api')
      await expect(c.query('select chave_cifrada from public.credenciais_llm limit 1')).rejects.toThrow()
      await c.query('reset role')
      await c.query('set role whaviso_atendente')
      // atendente consegue (nao lanca por privilegio; pode voltar 0 linhas).
      await c.query('select chave_cifrada from public.credenciais_llm limit 1')
    } finally {
      await c.query('reset role').catch(() => {})
      c.release()
    }
  })
})
