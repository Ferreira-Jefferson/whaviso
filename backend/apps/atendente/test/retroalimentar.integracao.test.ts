// Integracao do produtor retroalimentar_base com o kernel de RAG, no Postgres LOCAL sob o role
// whaviso_atendente (menor privilegio real, SEC-032). Prova o invariante central do loop:
//   - o rascunho nasce status='rascunho' (nunca aprovado);
//   - tentar INDEXAR o rascunho no rag NAO tem efeito (ingestor pula 'nao_aprovado', 0 chunks);
//   - so depois que o status vira 'aprovado' (acao do role da api, aqui simulada pelo superusuario) o
//     documento vira chunk.
// Sem banco acessivel, os testes se pulam.
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { ok, falha, type ErroProvedor } from '@whaviso/shared/clientes'
import { criarLogger } from '@whaviso/shared/logger'
import { SaidaInvalida, type ServicoLlm } from '../src/shared/llm_client'
import {
  criarClienteEmbeddingsPlataforma,
  ingerirDocumento,
  _resetVetorCache,
  type ClienteEmbeddings,
} from '../src/shared/rag'
import type { AdaptadorProvedor } from '../src/shared/llm_client'
import { coletarSinais, gerarRascunhos } from '../src/modules/retroalimentar_base'
import { bancoAcessivel, fecharPools, limpar, poolAtendente, poolSuper, semear, type Cenario } from './db'

const online = await bancoAcessivel()
const logger = criarLogger('retro-it', 'silent')
const uso = { tokensIn: 1, tokensOut: 1, custoEstimadoCentavos: 0 }
const RASCUNHO = { util: true, tipo: 'regra', titulo: 'Meia a meia', corpo: 'Fazemos pizza meia a meia sem custo extra na montagem.', confianca: 0.9 }

function fakeLlm(): ServicoLlm {
  return {
    async completar() {
      throw new Error('nao usado')
    },
    async transcrever() {
      throw new Error('nao usado')
    },
    async descreverImagem() {
      throw new Error('nao usado')
    },
    async completarEstruturado(_e, schema) {
      const p = schema.safeParse(RASCUNHO)
      if (!p.success) return falha(new SaidaInvalida() as ErroProvedor)
      return ok({ dados: p.data, resposta: { texto: '', chamadasFerramenta: [], modelo: 'm', uso } })
    },
  }
}

function embeddings(): ClienteEmbeddings {
  const ad = {
    provedor: 'openrouter',
    async embutir(e: { textos: string[] }) {
      return ok({ vetores: e.textos.map(() => [0.1, 0.2, 0.3]), uso: { tokensIn: 1, tokensOut: 0, custoEstimadoCentavos: 0 } })
    },
  } as unknown as AdaptadorProvedor
  return criarClienteEmbeddingsPlataforma({ adaptador: ad, logger, obterChave: () => 'chave-teste' })
}

const contas: string[] = []
async function cenario(): Promise<Cenario> {
  const c = await semear()
  contas.push(c.contaId)
  await poolSuper.query(
    `insert into public.credenciais_llm (loja_id, chave_cifrada, ativo) values ($1,$2,true)`,
    [c.lojaId, Buffer.from('fake')],
  )
  return c
}

async function rascunhoDaRealimentacao(c: Cenario): Promise<string> {
  await poolSuper.query(`insert into public.mensagens (loja_id, conversa_id, direcao, autor, tipo, conteudo)
    values ($1,$2,'entrada','cliente','texto','fazem pizza meia a meia?')`, [c.lojaId, c.conversaId])
  await poolSuper.query(`update public.conversas set status='humano', humano_desde=now() where id=$1`, [c.conversaId])
  const deps = { exec: poolAtendente, servico: fakeLlm(), logger }
  await coletarSinais(deps)
  await gerarRascunhos(deps)
  const { rows } = await poolSuper.query(
    `select id from public.documentos where loja_id=$1 and status='rascunho' and origem='realimentado'`,
    [c.lojaId],
  )
  return rows[0].id as string
}

afterEach(async () => {
  while (contas.length) await limpar(contas.pop()!)
})
afterAll(fecharPools)

describe.skipIf(!online)('retroalimentar_base x rag (producao de rascunho, promocao manual)', () => {
  it('o rascunho nasce rascunho; indexar o rascunho nao cria chunk; so o aprovado vira chunk', async () => {
    _resetVetorCache()
    const c = await cenario()
    const docId = await rascunhoDaRealimentacao(c)

    // nasce rascunho
    const st = await poolSuper.query('select status, origem from public.documentos where id=$1', [docId])
    expect(st.rows[0]).toMatchObject({ status: 'rascunho', origem: 'realimentado' })

    // tentar indexar o rascunho NAO tem efeito
    const r1 = await ingerirDocumento({ exec: poolAtendente, embeddings: embeddings(), logger }, docId)
    expect(r1.pulado).toBe('nao_aprovado')
    expect(r1.chunks).toBe(0)
    const c1 = await poolSuper.query('select count(*)::int as n from public.chunks where documento_id=$1', [docId])
    expect(c1.rows[0].n).toBe(0)

    // o dono aprova (acao do role da api; aqui via superusuario): agora vira chunk
    await poolSuper.query(`update public.documentos set status='aprovado', aprovado_em=now() where id=$1`, [docId])
    const r2 = await ingerirDocumento({ exec: poolAtendente, embeddings: embeddings(), logger }, docId)
    expect(r2.pulado).toBeUndefined()
    expect(r2.chunks).toBeGreaterThan(0)
    const c2 = await poolSuper.query('select count(*)::int as n from public.chunks where documento_id=$1', [docId])
    expect(c2.rows[0].n).toBeGreaterThan(0)
  })
})
