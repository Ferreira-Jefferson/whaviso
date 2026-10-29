// Testes do produtor retroalimentar_base: Postgres LOCAL sob o role whaviso_atendente (grants reais,
// SEC-032) com ServicoLlm FALSO (sem rede). Cobre cada tipo de sinal, geracao valida e invalida, dedup,
// supressao de rejeitado, TTL e ausencia de credencial. Sem banco acessivel, os testes se pulam. Nunca
// asserta contadores globais do resumo (o whaviso_dev e compartilhado): asserta o estado por loja.
import { createHash, randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { ok, falha, type ErroProvedor } from '@whaviso/shared/clientes'
import { criarLogger } from '@whaviso/shared/logger'
import { LlmIndisponivel, SaidaInvalida, type ServicoLlm } from '../../shared/llm_client'
import { bancoAcessivel, fecharPools, limpar, poolAtendente, poolSuper, semear, type Cenario } from '../../../test/db'
import { EVENTO } from './tipos'
import { coletarSinais, expirarRascunhos, gerarRascunhos, retroalimentar } from './service'

const online = await bancoAcessivel()
const logger = criarLogger('retro-teste', 'silent')
const uso = { tokensIn: 1, tokensOut: 1, custoEstimadoCentavos: 0 }

const RASCUNHO_OK = { util: true, tipo: 'faq', titulo: 'Entrega aos domingos', corpo: 'Fazemos entrega aos domingos das 18h as 23h.', confianca: 0.9 }

type Saida = Record<string, unknown> | ErroProvedor | ((m: string) => Record<string, unknown> | ErroProvedor)

function fake(saida: Saida = RASCUNHO_OK): { servico: ServicoLlm; prompts: string[]; lojas: string[] } {
  const prompts: string[] = []
  const lojas: string[] = []
  const servico: ServicoLlm = {
    async completar() {
      throw new Error('nao usado')
    },
    async transcrever() {
      throw new Error('nao usado')
    },
    async descreverImagem() {
      throw new Error('nao usado')
    },
    async completarEstruturado(e, schema) {
      const texto = e.mensagens.map((m) => m.conteudo).join('\n')
      prompts.push(texto)
      lojas.push(e.escopo.id)
      const s = typeof saida === 'function' ? saida(texto) : saida
      if (s instanceof Error) return falha(s as ErroProvedor)
      const p = schema.safeParse(s)
      if (!p.success) return falha(new SaidaInvalida())
      return ok({ dados: p.data, resposta: { texto: '', chamadasFerramenta: [], modelo: 'm', uso } })
    },
  }
  return { servico, prompts, lojas }
}

function deps(servico: ServicoLlm, over: Record<string, unknown> = {}) {
  return { exec: poolAtendente, servico, logger, ...over }
}

// ---------------------------------------------------------------- helpers de cenario (via superusuario)

const contas: string[] = []
async function cenario(): Promise<Cenario> {
  const c = await semear()
  contas.push(c.contaId)
  return c
}

/** Da credencial de LLM ATIVA a loja (o fake ignora o conteudo; o gate do SQL exige a linha). */
async function credencial(lojaId: string): Promise<void> {
  await poolSuper.query(
    `insert into public.credenciais_llm (loja_id, chave_cifrada, ativo) values ($1, $2, true)
       on conflict (loja_id) do update set ativo = true`,
    [lojaId, Buffer.from('cifra-fake')],
  )
}

async function msg(conversaId: string, lojaId: string, autor: string, direcao: string, conteudo: string): Promise<string> {
  const r = await poolSuper.query(
    `insert into public.mensagens (loja_id, conversa_id, direcao, autor, tipo, conteudo)
     values ($1,$2,$3::direcao_mensagem,$4::autor_mensagem,'texto',$5) returning id`,
    [lojaId, conversaId, direcao, autor, conteudo],
  )
  return r.rows[0].id as string
}

/** Marca a conversa como handoff (humano) depois de uma pergunta do cliente. Retorna a msg da pergunta. */
async function handoff(c: Cenario, pergunta: string): Promise<string> {
  const id = await msg(c.conversaId, c.lojaId, 'cliente', 'entrada', pergunta)
  await poolSuper.query(`update public.conversas set status='humano', humano_desde=now() where id=$1`, [c.conversaId])
  return id
}

/** Cria uma NOVA conversa (novo cliente) na mesma loja/numero, para cenarios de recorrencia. */
async function novaConversa(c: Cenario): Promise<string> {
  const cli = await poolSuper.query(
    `insert into public.clientes (loja_id, telefone_hash) values ($1,$2) returning id`,
    [c.lojaId, createHash('sha256').update(randomUUID()).digest('hex')],
  )
  const conv = await poolSuper.query(
    `insert into public.conversas (loja_id, numero_whatsapp_id, cliente_id, status, ultima_entrada_em)
     values ($1,$2,$3,'ia', now()) returning id`,
    [c.lojaId, c.numeroId, cli.rows[0].id],
  )
  return conv.rows[0].id as string
}

async function feedback(lojaId: string): Promise<Array<{ tipo: string; texto: string; ocorrencias: number; conversa_id: string | null }>> {
  const { rows } = await poolSuper.query(
    `select tipo, texto, ocorrencias, conversa_id from public.rag_feedback where loja_id=$1 order by criado_em`,
    [lojaId],
  )
  return rows
}

async function documentos(lojaId: string): Promise<Array<{ status: string; origem: string; titulo: string; conteudo: string; tipo: string; fonte_conversa_id: string | null; hash_conteudo: string | null }>> {
  const { rows } = await poolSuper.query(
    `select status, origem, titulo, conteudo, tipo, fonte_conversa_id, hash_conteudo from public.documentos where loja_id=$1 order by criado_em`,
    [lojaId],
  )
  return rows
}

async function eventos(lojaId: string, tipo: string): Promise<Array<{ detalhes: Record<string, unknown> }>> {
  const { rows } = await poolSuper.query(`select detalhes from public.eventos where loja_id=$1 and tipo=$2`, [lojaId, tipo])
  return rows
}

afterEach(async () => {
  while (contas.length) await limpar(contas.pop()!)
})
afterAll(fecharPools)

// ---------------------------------------------------------------- coleta de sinais

describe.skipIf(!online)('retroalimentar_base: coleta de sinais', () => {
  it('handoff vira sinal de lacuna com a ultima pergunta do cliente', async () => {
    const c = await cenario()
    await handoff(c, 'voces entregam no bairro Jardim?')
    await coletarSinais(deps(fake().servico))
    const fs = await feedback(c.lojaId)
    expect(fs.filter((f) => f.tipo === 'lacuna')).toHaveLength(1)
    expect(fs[0]!.texto).toContain('entregam')
  })

  it('resposta do atendente humano vira correcao com o par pergunta+resposta', async () => {
    const c = await cenario()
    await msg(c.conversaId, c.lojaId, 'cliente', 'entrada', 'tem opcao vegana?')
    await poolSuper.query(`update public.conversas set status='humano', humano_desde=now() where id=$1`, [c.conversaId])
    await msg(c.conversaId, c.lojaId, 'humano', 'saida', 'Sim, temos o burger de grao de bico.')
    await coletarSinais(deps(fake().servico))
    const cor = (await feedback(c.lojaId)).find((f) => f.tipo === 'correcao_humana')
    expect(cor).toBeDefined()
    expect(cor!.texto).toContain('Pergunta do cliente: tem opcao vegana?')
    expect(cor!.texto).toContain('grao de bico')
  })

  it('mesma duvida em N conversas distintas vira sinal recorrente com ocorrencias', async () => {
    const c = await cenario()
    // a propria conversa semeada + 2 novas = 3 conversas distintas (N_RECORRENCIA=3)
    await msg(c.conversaId, c.lojaId, 'cliente', 'entrada', 'tem estacionamento?')
    for (let i = 0; i < 2; i++) {
      const conv = await novaConversa(c)
      await msg(conv, c.lojaId, 'cliente', 'entrada', 'Tem estacionamento!')
    }
    await coletarSinais(deps(fake().servico))
    const rec = (await feedback(c.lojaId)).find((f) => f.tipo === 'recorrente')
    expect(rec).toBeDefined()
    expect(rec!.ocorrencias).toBe(3)
  })

  it('nao duplica o sinal de lacuna da mesma conversa em duas coletas', async () => {
    const c = await cenario()
    await handoff(c, 'qual o horario de funcionamento?')
    await coletarSinais(deps(fake().servico))
    await coletarSinais(deps(fake().servico))
    expect((await feedback(c.lojaId)).filter((f) => f.tipo === 'lacuna')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------- geracao de rascunhos

describe.skipIf(!online)('retroalimentar_base: geracao de rascunhos', () => {
  it('geracao valida nasce documento rascunho/realimentado apontando a conversa de origem', async () => {
    const c = await cenario()
    await credencial(c.lojaId)
    const perguntaId = await handoff(c, 'voces entregam aos domingos?')
    await coletarSinais(deps(fake().servico))
    await gerarRascunhos(deps(fake().servico))

    const docs = await documentos(c.lojaId)
    expect(docs).toHaveLength(1)
    expect(docs[0]).toMatchObject({ status: 'rascunho', origem: 'realimentado', tipo: 'faq' })
    expect(docs[0]!.fonte_conversa_id).toBe(c.conversaId)
    expect(docs[0]!.hash_conteudo).toMatch(/^[0-9a-f]{64}$/)
    expect(perguntaId).toBeTruthy()
    // evento de sugestoes pendentes para o painel, sem PII
    const ev = await eventos(c.lojaId, EVENTO.sugestoesPendentes)
    expect(ev).toHaveLength(1)
    expect(ev[0]!.detalhes.pendentes).toBe(1)
  })

  it('sem credencial de LLM a loja fica inativa: nenhum rascunho', async () => {
    const c = await cenario()
    await handoff(c, 'voces entregam aos domingos?')
    await coletarSinais(deps(fake().servico))
    await gerarRascunhos(deps(fake().servico)) // sem credencial()
    expect(await documentos(c.lojaId)).toHaveLength(0)
    // sinal continua novo (sem marca de tentativa): retoma quando houver chave
    expect(await eventos(c.lojaId, EVENTO.rascunhoTentado)).toHaveLength(0)
  })

  it('LLM indisponivel na hora da chamada: sem rascunho e sem marca (retoma depois)', async () => {
    const c = await cenario()
    await credencial(c.lojaId)
    await handoff(c, 'voces entregam?')
    await coletarSinais(deps(fake().servico))
    await gerarRascunhos(deps(fake(new LlmIndisponivel()).servico))
    expect(await documentos(c.lojaId)).toHaveLength(0)
    expect(await eventos(c.lojaId, EVENTO.rascunhoTentado)).toHaveLength(0)
  })

  it('saida invalida do modelo nao vira rascunho e marca a tentativa (nao reprocessa)', async () => {
    const c = await cenario()
    await credencial(c.lojaId)
    await handoff(c, 'qual o endereco?')
    await coletarSinais(deps(fake().servico))
    // saida que nao bate o schema Zod -> SaidaInvalida (uma reparacao no ServicoLlm nao salva)
    await gerarRascunhos(deps(fake({ util: 'nao-bool', titulo: 1 }).servico))
    expect(await documentos(c.lojaId)).toHaveLength(0)
    expect(await eventos(c.lojaId, EVENTO.rascunhoTentado)).toHaveLength(1)
  })

  it('util=false (antilixo) nao vira rascunho mas marca a tentativa', async () => {
    const c = await cenario()
    await credencial(c.lojaId)
    await handoff(c, 'blablabla sem sentido')
    await coletarSinais(deps(fake().servico))
    const inutil = { util: false, tipo: 'faq', titulo: '', corpo: '', confianca: 0 }
    await gerarRascunhos(deps(fake(inutil).servico))
    expect(await documentos(c.lojaId)).toHaveLength(0)
    expect(await eventos(c.lojaId, EVENTO.rascunhoTentado)).toHaveLength(1)
  })

  it('rascunho que cheira a dado vivo e barrado pelo validador (nunca promovido)', async () => {
    const c = await cenario()
    await credencial(c.lojaId)
    await handoff(c, 'quanto custa o combo?')
    await coletarSinais(deps(fake().servico))
    const comPreco = { util: true, tipo: 'descricao', titulo: 'Combo', corpo: 'O combo custa R$ 32 hoje.', confianca: 0.9 }
    await gerarRascunhos(deps(fake(comPreco).servico))
    expect(await documentos(c.lojaId)).toHaveLength(0)
    const ev = await eventos(c.lojaId, EVENTO.rascunhoTentado)
    expect(ev[0]!.detalhes.motivo).toBe('dado_vivo')
  })

  it('dedup: corpo igual a documento ja existente nao cria novo rascunho', async () => {
    const c = await cenario()
    await credencial(c.lojaId)
    // documento aprovado pre-existente com o mesmo corpo que o modelo vai gerar
    await poolSuper.query(
      `insert into public.documentos (loja_id, tipo, titulo, conteudo, status, origem)
       values ($1,'faq','Entrega','Fazemos entrega aos domingos das 18h as 23h.','aprovado','manual')`,
      [c.lojaId],
    )
    await handoff(c, 'entregam domingo?')
    await coletarSinais(deps(fake().servico))
    await gerarRascunhos(deps(fake().servico))
    // segue so o documento aprovado pre-existente, sem rascunho novo
    const docs = await documentos(c.lojaId)
    expect(docs.filter((d) => d.status === 'rascunho')).toHaveLength(0)
    const ev = await eventos(c.lojaId, EVENTO.rascunhoTentado)
    expect(ev[0]!.detalhes.motivo).toBe('duplicado')
  })

  it('supressao de rejeitado: sinal ja tentado nao e reprocessado (nao gasta a chave de novo)', async () => {
    const c = await cenario()
    await credencial(c.lojaId)
    await handoff(c, 'tem wifi?')
    await coletarSinais(deps(fake().servico))
    const f1 = fake()
    await gerarRascunhos(deps(f1.servico))
    expect(f1.lojas.filter((l) => l === c.lojaId)).toHaveLength(1)
    const f2 = fake()
    await gerarRascunhos(deps(f2.servico))
    expect(f2.lojas.filter((l) => l === c.lojaId)).toHaveLength(0) // ja marcado: nao chama o LLM
  })
})

// ---------------------------------------------------------------- TTL

describe.skipIf(!online)('retroalimentar_base: TTL', () => {
  it('rascunho realimentado vencido e sinalizado como expirado (uma vez)', async () => {
    const c = await cenario()
    await poolSuper.query(
      `insert into public.documentos (loja_id, tipo, titulo, conteudo, status, origem, criado_em)
       values ($1,'faq','Velho','Conteudo antigo que ninguem aprovou.','rascunho','realimentado', now() - interval '30 days')`,
      [c.lojaId],
    )
    expect(await expirarRascunhos(deps(fake().servico, { ttlDias: 14 }))).toBeGreaterThanOrEqual(1)
    expect(await eventos(c.lojaId, EVENTO.rascunhoExpirado)).toHaveLength(1)
    // segunda passada nao re-sinaliza
    await expirarRascunhos(deps(fake().servico, { ttlDias: 14 }))
    expect(await eventos(c.lojaId, EVENTO.rascunhoExpirado)).toHaveLength(1)
  })

  it('rascunho dentro do TTL nao e sinalizado', async () => {
    const c = await cenario()
    await poolSuper.query(
      `insert into public.documentos (loja_id, tipo, titulo, conteudo, status, origem)
       values ($1,'faq','Novo','Conteudo recente.','rascunho','realimentado')`,
      [c.lojaId],
    )
    await expirarRascunhos(deps(fake().servico, { ttlDias: 14 }))
    expect(await eventos(c.lojaId, EVENTO.rascunhoExpirado)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------- ciclo completo

describe.skipIf(!online)('retroalimentar_base: ciclo completo', () => {
  it('retroalimentar() coleta, gera e nao lanca', async () => {
    const c = await cenario()
    await credencial(c.lojaId)
    await handoff(c, 'voces entregam aos domingos?')
    const r = await retroalimentar(deps(fake().servico))
    expect(r.geracao.rascunhos).toBeGreaterThanOrEqual(1)
    expect((await documentos(c.lojaId)).some((d) => d.status === 'rascunho')).toBe(true)
  })
})
