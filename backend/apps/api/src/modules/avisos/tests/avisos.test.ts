import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  aceitarAvisoDireto,
  criarAppTeste,
  criarUsuario,
  definirPlano,
  encerrarPools,
  limparAvisos,
  limparUsuario,
  poolSuper,
} from '../../../../test/harness'

const AUTH = { authorization: 'Bearer fake' }
const AUTH_DEVEDOR = { authorization: 'Bearer devedor' }

function corpoAviso(over: Record<string, unknown> = {}) {
  return {
    direcao: 'receber',
    nome_devedor: 'Maria',
    telefone_devedor: '+5511999998888',
    motivo: 'mensalidade',
    valor_centavos: 9900,
    data_combinada: '2026-12-15',
    // H2.1: Pix obrigatório no receber, com titular e banco.
    pix_chave: 'maria@pix.com',
    pix_titular: 'Maria Silva',
    pix_banco: 'Banco Exemplo',
    ...over,
  }
}

describe('avisos (integração com whaviso_dev)', () => {
  let uid: string

  beforeAll(async () => {
    uid = await criarUsuario('Cobrador Teste')
    // A conta nasce free (somente leitura). Para criar avisos, sobe ao profissional.
    await definirPlano(uid, 'profissional')
  })
  beforeEach(async () => {
    await limparAvisos(uid) // isolamento: cada teste começa sem avisos
  })
  afterAll(async () => {
    await limparUsuario(uid)
  })

  it('sem token → 401', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({ method: 'POST', url: '/v1/avisos', payload: corpoAviso() })
    expect(r.statusCode).toBe(401)
    expect(r.json().error.code).toBe('nao_autorizado')
    await app.close()
  })

  it('cria aviso (receber) → 201 com número de convite e link wa.me, status aguardando_aceite', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
    expect(r.statusCode).toBe(201)
    const body = r.json()
    expect(body.aviso.status).toBe('aguardando_aceite')
    // E5: aceite 100% WhatsApp. Sai o número de 6 dígitos (xxx-xxx) e o link wa.me do
    // Whaviso (não mais o link de site /aceite/:token).
    expect(body.numero_convite).toMatch(/^\d{3}-\d{3}$/)
    expect(body.link_whatsapp).toContain('wa.me/')
    expect(JSON.stringify(body)).not.toContain('/aceite/')
    await app.close()
  })

  it('payload inválido (valor 0) → 400', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({
      method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso({ valor_centavos: 0 }),
    })
    expect(r.statusCode).toBe(400)
    await app.close()
  })

  it('agenda cheia → 422 agenda_cheia (balde único, sem apagar nada)', async () => {
    // Plus com 1 unidade = agenda 10 (balde único). O 11º item deve falhar.
    const cheio = await criarUsuario('AgendaCheia')
    await definirPlano(cheio, 'plus', 1)
    const app = await criarAppTeste(cheio)
    for (let i = 0; i < 10; i++) {
      const r = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
      expect(r.statusCode).toBe(201)
    }
    const r11 = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
    expect(r11.statusCode).toBe(422)
    expect(r11.json().error.code).toBe('agenda_cheia')
    await app.close()
    await limparUsuario(cheio)
  })

  it('FREE não cria aviso que envia → 422 plano_somente_leitura (guard antes do limite)', async () => {
    // Conta nasce free; não muda o plano.
    const free = await criarUsuario('Free')
    const app = await criarAppTeste(free)
    const r = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
    await app.close()
    expect(r.statusCode).toBe(422)
    // Código próprio do free, NUNCA "limite atingido com 0 vagas".
    expect(r.json().error.code).toBe('plano_somente_leitura')
    await limparUsuario(free)
  })

  it('agenda conta certo no fluxo INVERTIDO (devedor-criador) — C1', async () => {
    const inv = await criarUsuario('Invertido')
    await definirPlano(inv, 'plus', 1) // agenda 10
    const app = await criarAppTeste(inv)
    // Cria 10 avisos invertidos (criador = devedor). A contagem usa a dupla condição
    // por papel; se contasse só cobrador_id, o invertido escaparia do limite.
    for (let i = 0; i < 10; i++) {
      const r = await app.inject({
        method: 'POST',
        url: '/v1/avisos',
        headers: AUTH,
        payload: corpoAviso({
          direcao: 'pagar',
          nome_devedor: 'Eu Mesmo',
          telefone_devedor: null,
          nome_cobrador: 'João',
          telefone_cobrador: '+5511988887777',
          // Pix obrigatório no invertido (H3.1): o devedor-criador informa a chave de
          // quem vai receber (cobrador); titular/banco ficam para o cobrador confirmar.
          pix_chave: 'joao@pix.com',
        }),
      })
      expect(r.statusCode).toBe(201)
    }
    // 11º invertido deve bater no limite (a contagem viu os 10 do devedor-criador).
    const r11 = await app.inject({
      method: 'POST',
      url: '/v1/avisos',
      headers: AUTH,
      payload: corpoAviso({
        direcao: 'pagar',
        nome_devedor: 'Eu Mesmo',
        telefone_devedor: null,
        nome_cobrador: 'João',
        telefone_cobrador: '+5511988887777',
        pix_chave: 'joao@pix.com',
      }),
    })
    expect(r11.statusCode).toBe(422)
    expect(r11.json().error.code).toBe('agenda_cheia')
    await app.close()
    await limparUsuario(inv)
  })

  it('arquivar libera a vaga da agenda (soft-delete, sem DELETE físico)', async () => {
    const arq = await criarUsuario('Arquivar')
    await definirPlano(arq, 'plus', 1) // agenda 10
    const app = await criarAppTeste(arq)
    let ultimoId = ''
    for (let i = 0; i < 10; i++) {
      const r = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
      expect(r.statusCode).toBe(201)
      ultimoId = r.json().aviso.id
    }
    // Cheia: o 11º falha.
    const cheio = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
    expect(cheio.statusCode).toBe(422)
    // Arquiva um item → libera vaga.
    const arquivar = await app.inject({ method: 'POST', url: `/v1/avisos/${ultimoId}/arquivar`, headers: AUTH })
    expect(arquivar.statusCode).toBe(200)
    expect(arquivar.json().arquivado_em).not.toBeNull()
    // Agora cria de novo (vaga liberada).
    const ok = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
    expect(ok.statusCode).toBe(201)
    // O registro arquivado NÃO foi apagado (regra de não-DELETE).
    const ainda = await poolSuper.query<{ n: string }>(
      `select count(*) as n from public.avisos where id = $1`,
      [ultimoId],
    )
    expect(Number(ainda.rows[0]!.n)).toBe(1)
    await app.close()
    await limparUsuario(arq)
  })

  it('corrida: dois POST simultâneos na última vaga, só um passa (H11.8)', async () => {
    const corrida = await criarUsuario('Corrida')
    await definirPlano(corrida, 'plus', 1) // agenda 10
    const app = await criarAppTeste(corrida)
    // Preenche 9 das 10 vagas.
    for (let i = 0; i < 9; i++) {
      const r = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
      expect(r.statusCode).toBe(201)
    }
    // Dois requests concorrentes pela 10ª (última) vaga: o lock por conta serializa,
    // ambos cabem? Não: só 1 fica na vaga 10; o outro tenta a 11 → recusado.
    const [a, b] = await Promise.all([
      app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() }),
      app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() }),
    ])
    const status = [a.statusCode, b.statusCode].sort()
    expect(status).toEqual([201, 422])
    // Nunca ultrapassa a capacidade.
    const total = await poolSuper.query<{ n: string }>(
      `select count(*) as n from public.avisos where cobrador_id = $1 and arquivado_em is null`,
      [corrida],
    )
    expect(Number(total.rows[0]!.n)).toBe(10)
    await app.close()
    await limparUsuario(corrida)
  })

  it('cancelar é idempotente', async () => {
    const app = await criarAppTeste(uid)
    // pagar invertido: o criador é o devedor e convida um cobrador (nome/telefone_cobrador).
    const criado = await app.inject({
      method: 'POST',
      url: '/v1/avisos',
      headers: AUTH,
      payload: corpoAviso({
        direcao: 'pagar',
        nome_devedor: 'Eu Mesmo',
        telefone_devedor: null,
        nome_cobrador: 'João',
        telefone_cobrador: '+5511988887777',
        pix_chave: 'joao@pix.com',
      }),
    })
    const id = criado.json().aviso.id
    const c1 = await app.inject({ method: 'POST', url: `/v1/avisos/${id}/cancelar`, headers: AUTH })
    expect(c1.statusCode).toBe(200)
    expect(c1.json().status).toBe('cancelado')
    const c2 = await app.inject({ method: 'POST', url: `/v1/avisos/${id}/cancelar`, headers: AUTH })
    expect(c2.statusCode).toBe(200)
    expect(c2.json().status).toBe('cancelado')
    await app.close()
  })
})

describe('avisos: envios e eventos por aviso (integração)', () => {
  let cobrador: string
  let devedor: string
  let estranho: string

  // Cria aviso 'receber' e aceita como devedor → vira 'programado', cria 4 envios + eventos.
  // E5: aceite por site removido; ativa direto no banco (espelho do aceite WhatsApp).
  async function criarAceito(): Promise<string> {
    const appC = await criarAppTeste(cobrador)
    const criado = await appC.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
    await appC.close()
    const body = criado.json()
    await aceitarAvisoDireto(body.aviso.id, devedor)
    return body.aviso.id
  }

  beforeAll(async () => {
    cobrador = await criarUsuario('Cobrador Envios')
    await definirPlano(cobrador, 'profissional')
    devedor = await criarUsuario('Devedor Envios')
    estranho = await criarUsuario('Estranho')
  })
  beforeEach(async () => {
    await limparAvisos(cobrador)
  })
  afterAll(async () => {
    await limparUsuario(cobrador)
    await limparUsuario(devedor)
    await limparUsuario(estranho)
    await encerrarPools()
  })

  it('GET /avisos/:id/envios sem token → 401', async () => {
    const id = await criarAceito()
    const app = await criarAppTeste(cobrador)
    const r = await app.inject({ method: 'GET', url: `/v1/avisos/${id}/envios` })
    await app.close()
    expect(r.statusCode).toBe(401)
  })

  it('cobrador dono lista os 4 envios em ordem cronológica', async () => {
    const id = await criarAceito()
    const app = await criarAppTeste(cobrador)
    const r = await app.inject({ method: 'GET', url: `/v1/avisos/${id}/envios`, headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(200)
    const itens = r.json()
    expect(itens).toHaveLength(4)
    expect(itens.map((e: { etapa: string }) => e.etapa)).toEqual(['d_menos_2', 'd_menos_1', 'd', 'd_mais_1'])
  })

  it('devedor vinculado também enxerga os envios', async () => {
    const id = await criarAceito()
    const app = await criarAppTeste(devedor)
    const r = await app.inject({ method: 'GET', url: `/v1/avisos/${id}/envios`, headers: AUTH_DEVEDOR })
    await app.close()
    expect(r.statusCode).toBe(200)
    expect(r.json()).toHaveLength(4)
  })

  it('terceiro não-vinculado → 404 (não vaza existência)', async () => {
    const id = await criarAceito()
    const app = await criarAppTeste(estranho)
    const r = await app.inject({ method: 'GET', url: `/v1/avisos/${id}/envios`, headers: { authorization: 'Bearer estranho' } })
    await app.close()
    expect(r.statusCode).toBe(404)
  })

  it('GET /avisos/:id/eventos lista a auditoria em ordem cronológica (criado, aceite)', async () => {
    const id = await criarAceito()
    const app = await criarAppTeste(cobrador)
    const r = await app.inject({ method: 'GET', url: `/v1/avisos/${id}/eventos`, headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(200)
    const tipos = r.json().map((e: { tipo: string }) => e.tipo)
    expect(tipos[0]).toBe('criado')
    expect(tipos).toContain('aceite')
  })

  it('eventos de aviso inexistente → 404', async () => {
    const app = await criarAppTeste(cobrador)
    const r = await app.inject({
      method: 'GET',
      url: `/v1/avisos/00000000-0000-0000-0000-000000000000/eventos`,
      headers: AUTH,
    })
    await app.close()
    expect(r.statusCode).toBe(404)
  })
})
