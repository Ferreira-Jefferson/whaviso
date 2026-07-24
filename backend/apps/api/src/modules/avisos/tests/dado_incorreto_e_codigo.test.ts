// Item 7 (aprovação/recusa de dado reportado como incorreto) + item 21 (código do
// combinado). O ESCREVER do reporte (zap-side, webhook) fica com o grupo 1E (wave 2);
// aqui simulamos o reporte já pendente diretamente no banco (poolSuper), como o zap
// faria, para exercitar só a decisão do cobrador (aprovar/recusar).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  aceitarAvisoDireto,
  criarAppTeste,
  definirPlano,
  criarUsuario,
  encerrarPools,
  limparAvisos,
  limparUsuario,
  poolSuper,
} from '../../../../test/harness'

const AUTH = { authorization: 'Bearer fake' }

function corpoAviso(over: Record<string, unknown> = {}) {
  return {
    direcao: 'receber',
    nome_devedor: 'Maria',
    telefone_devedor: '+5511999998888',
    motivo: 'mensalidade',
    itens: [{ descricao: 'Item', qtd: 1, valor_unit_centavos: 9900 }],
    data_combinada: '2026-12-15',
    pix_chave: 'maria@pix.com',
    pix_titular: 'Maria Silva',
    pix_banco: 'Banco Exemplo',
    ...over,
  }
}

describe('item 21: código do combinado', () => {
  let uid: string

  beforeAll(async () => {
    uid = await criarUsuario('Cobrador Codigo')
    await definirPlano(uid, 'profissional')
  })
  beforeEach(async () => {
    await limparAvisos(uid)
  })
  afterAll(async () => {
    await limparUsuario(uid)
  })

  it('criarAviso gera um codigo de 6 chars, maiusculo, sem 0/O/1/I/L', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
    await app.close()
    expect(r.statusCode).toBe(201)
    const avisoId = r.json().aviso.id
    const { rows } = await poolSuper.query<{ codigo: string }>(
      `select codigo from public.avisos where id = $1`,
      [avisoId],
    )
    const codigo = rows[0]!.codigo
    expect(codigo).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/)
  })

  it('GET /avisos/:id/codigo devolve o mesmo código gravado no banco', async () => {
    const app = await criarAppTeste(uid)
    const criado = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
    const avisoId = criado.json().aviso.id
    const r = await app.inject({ method: 'GET', url: `/v1/avisos/${avisoId}/codigo`, headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(200)
    const { rows } = await poolSuper.query<{ codigo: string }>(
      `select codigo from public.avisos where id = $1`,
      [avisoId],
    )
    expect(r.json().codigo).toBe(rows[0]!.codigo)
  })

  it('dois avisos seguidos recebem códigos diferentes', async () => {
    const app = await criarAppTeste(uid)
    const r1 = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
    const r2 = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
    await app.close()
    const { rows } = await poolSuper.query<{ codigo: string }>(
      `select codigo from public.avisos where id = any($1::uuid[])`,
      [[r1.json().aviso.id, r2.json().aviso.id]],
    )
    expect(rows[0]!.codigo).not.toBe(rows[1]!.codigo)
  })
})

describe('item 7: aprovar/recusar dado reportado como incorreto', () => {
  let cobrador: string
  let devedor: string

  async function criarAceito(): Promise<string> {
    const app = await criarAppTeste(cobrador)
    const criado = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
    await app.close()
    const avisoId = criado.json().aviso.id
    await aceitarAvisoDireto(avisoId, devedor)
    return avisoId
  }

  // Simula o que o webhook do zap (grupo 1E) fará: grava o reporte pendente e move o
  // aviso para aguardando_aprovacao_dado_incorreto (trigger já permite a transição).
  async function reportarDadoIncorreto(
    avisoId: string,
    campo: 'valor' | 'data' | 'nome' | 'motivo',
    dados: Record<string, unknown>,
  ): Promise<void> {
    await poolSuper.query(
      `insert into public.avisos_reportes (aviso_id, campo, dados_corretos) values ($1, $2, $3::jsonb)`,
      [avisoId, campo, JSON.stringify(dados)],
    )
    await poolSuper.query(
      `update public.avisos set status = 'aguardando_aprovacao_dado_incorreto' where id = $1`,
      [avisoId],
    )
  }

  beforeAll(async () => {
    cobrador = await criarUsuario('Cobrador Reporte')
    await definirPlano(cobrador, 'profissional')
    devedor = await criarUsuario('Devedor Reporte')
  })
  beforeEach(async () => {
    await limparAvisos(cobrador)
  })
  afterAll(async () => {
    await limparUsuario(cobrador)
    await limparUsuario(devedor)
    await encerrarPools()
  })

  it('aprovar devolve o aviso programado de novo + o reporte (campo e dados corretos)', async () => {
    const avisoId = await criarAceito()
    await reportarDadoIncorreto(avisoId, 'data', { data_combinada: '2027-01-10' })

    const app = await criarAppTeste(cobrador)
    const r = await app.inject({ method: 'POST', url: `/v1/avisos/${avisoId}/aprovar-dado-incorreto`, headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(200)
    const body = r.json()
    expect(body.aviso.status).toBe('programado')
    expect(body.reporte.campo).toBe('data')
    expect(body.reporte.dados.data_combinada).toBe('2027-01-10')

    const evt = await poolSuper.query<{ tipo: string }>(
      `select tipo from public.eventos_aviso where aviso_id = $1 and tipo = 'dado_incorreto_aprovado'`,
      [avisoId],
    )
    expect(evt.rows).toHaveLength(1)
    const reporte = await poolSuper.query<{ resolucao: string }>(
      `select resolucao from public.avisos_reportes where aviso_id = $1`,
      [avisoId],
    )
    expect(reporte.rows[0]!.resolucao).toBe('aprovado')
  })

  it('recusar volta o aviso a programado sem aplicar nada', async () => {
    const avisoId = await criarAceito()
    await reportarDadoIncorreto(avisoId, 'valor', { valor_centavos: 5000 })

    const app = await criarAppTeste(cobrador)
    const r = await app.inject({ method: 'POST', url: `/v1/avisos/${avisoId}/recusar-dado-incorreto`, headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(200)
    expect(r.json().status).toBe('programado')

    const aviso = await poolSuper.query<{ valor_centavos: string }>(
      `select valor_centavos from public.avisos where id = $1`,
      [avisoId],
    )
    expect(Number(aviso.rows[0]!.valor_centavos)).toBe(9900) // inalterado

    const reporte = await poolSuper.query<{ resolucao: string }>(
      `select resolucao from public.avisos_reportes where aviso_id = $1`,
      [avisoId],
    )
    expect(reporte.rows[0]!.resolucao).toBe('recusado')
  })

  it('sem reporte pendente -> 409 sem_reporte_pendente', async () => {
    const avisoId = await criarAceito()
    const app = await criarAppTeste(cobrador)
    const r = await app.inject({ method: 'POST', url: `/v1/avisos/${avisoId}/aprovar-dado-incorreto`, headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(409)
    expect(r.json().error.code).toBe('sem_reporte_pendente')
  })

  it('GET reporte-aprovado-pendente: null quando não há reporte aprovado recente', async () => {
    const avisoId = await criarAceito()
    const app = await criarAppTeste(cobrador)
    const r = await app.inject({ method: 'GET', url: `/v1/avisos/${avisoId}/reporte-aprovado-pendente`, headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(200)
    expect(r.json().reporte).toBeNull()
  })

  it('GET reporte-aprovado-pendente: devolve o reporte depois de aprovar pelo painel (POST síncrono)', async () => {
    const avisoId = await criarAceito()
    await reportarDadoIncorreto(avisoId, 'valor', { valor_centavos: 12000 })
    const app1 = await criarAppTeste(cobrador)
    await app1.inject({ method: 'POST', url: `/v1/avisos/${avisoId}/aprovar-dado-incorreto`, headers: AUTH })
    await app1.close()

    const app2 = await criarAppTeste(cobrador)
    const r = await app2.inject({ method: 'GET', url: `/v1/avisos/${avisoId}/reporte-aprovado-pendente`, headers: AUTH })
    await app2.close()
    expect(r.json().reporte).toEqual({ campo: 'valor', dados: { valor_centavos: 12000 } })
  })

  it('GET reporte-aprovado-pendente: devolve o reporte quando a aprovação veio direto do banco (simula o zap/WhatsApp)', async () => {
    const avisoId = await criarAceito()
    await reportarDadoIncorreto(avisoId, 'motivo', { motivo: 'aluguel de setembro' })
    // Mesma sequência que o zap faz ao aprovar por WhatsApp (grupo 1E, wave 2): resolve o
    // reporte e registra o evento direto no banco, sem passar pelo POST síncrono acima.
    const rep = await poolSuper.query<{ id: string }>(
      `select id::text as id from public.avisos_reportes where aviso_id = $1`,
      [avisoId],
    )
    await poolSuper.query(
      `update public.avisos_reportes set resolucao = 'aprovado', resolvido_em = now() where id = $1`,
      [rep.rows[0]!.id],
    )
    await poolSuper.query(`update public.avisos set status = 'programado' where id = $1`, [avisoId])
    await poolSuper.query(
      `insert into public.eventos_aviso (aviso_id, tipo, ator, detalhes)
       values ($1, 'dado_incorreto_aprovado', 'cobrador', jsonb_build_object('reporte_id', $2::text, 'campo', 'motivo'))`,
      [avisoId, rep.rows[0]!.id],
    )

    const app = await criarAppTeste(cobrador)
    const r = await app.inject({ method: 'GET', url: `/v1/avisos/${avisoId}/reporte-aprovado-pendente`, headers: AUTH })
    await app.close()
    expect(r.json().reporte).toEqual({ campo: 'motivo', dados: { motivo: 'aluguel de setembro' } })
  })

  it('GET reporte-aprovado-pendente: some depois que o cobrador edita (a correção já foi tratada)', async () => {
    const avisoId = await criarAceito()
    await reportarDadoIncorreto(avisoId, 'valor', { valor_centavos: 8000 })
    const app1 = await criarAppTeste(cobrador)
    await app1.inject({ method: 'POST', url: `/v1/avisos/${avisoId}/aprovar-dado-incorreto`, headers: AUTH })
    await app1.inject({
      method: 'PATCH',
      url: `/v1/avisos/${avisoId}`,
      headers: AUTH,
      payload: { itens: [{ descricao: 'Item', qtd: 1, valor_unit_centavos: 8000 }] },
    })
    await app1.close()

    const app2 = await criarAppTeste(cobrador)
    const r = await app2.inject({ method: 'GET', url: `/v1/avisos/${avisoId}/reporte-aprovado-pendente`, headers: AUTH })
    await app2.close()
    expect(r.json().reporte).toBeNull()
  })

  it('editar direto enquanto há reporte pendente -> 409 reporte_em_aprovacao', async () => {
    const avisoId = await criarAceito()
    await reportarDadoIncorreto(avisoId, 'motivo', { motivo: 'aluguel' })
    const app = await criarAppTeste(cobrador)
    const r = await app.inject({
      method: 'PATCH',
      url: `/v1/avisos/${avisoId}`,
      headers: AUTH,
      payload: { motivo: 'outra coisa' },
    })
    await app.close()
    expect(r.statusCode).toBe(409)
    expect(r.json().error.code).toBe('reporte_em_aprovacao')
  })
})
