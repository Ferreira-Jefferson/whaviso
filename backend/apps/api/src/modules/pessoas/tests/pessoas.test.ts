// E15: Combinados por pessoa (visão de contato). Cobre:
//  - identidade pelo TELEFONE (mesmo número, nomes diferentes = mesma pessoa; H15.1);
//  - quatro totais por pessoa, excluindo terminais não pagos (H15.2);
//  - lista de todos os combinados do número AGRUPADA POR NOME (H15.3);
//  - referência por id de COMBINADO (telefone resolvido no servidor); 404 quando o
//    combinado não é visível ou não tem telefone da outra ponta (H15.1/H15.7);
//  - autocomplete por prefixo de telefone (H15.6), só combinados que EU criei;
//  - isolamento por usuário.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  criarAppTeste,
  criarUsuario,
  encerrarPools,
  limparUsuario,
  poolSuper,
} from '../../../../test/harness'

const AUTH = { authorization: 'Bearer x' }
const TEL = '+5511900000001' // o número da "pessoa" sob teste (identidade)
const OUTRO = '+5511900000009' // outra pessoa (não deve entrar na visão do número TEL)

afterAll(async () => {
  await encerrarPools()
})

// receber: sou o COBRADOR (cobrador_id=uid); a outra ponta é o devedor (telefone_devedor).
async function insReceber(
  uid: string,
  nome: string,
  telefone: string,
  status: string,
  valor: number,
  data: string,
): Promise<string> {
  const { rows } = await poolSuper.query<{ id: string }>(
    `insert into public.avisos
       (cobrador_id, pix_chave, direcao, criador_papel, status, nome_devedor, telefone_devedor, motivo, valor_centavos, data_combinada)
     values ($1,'c@pix.com','receber','cobrador',$2,$3,$4,'motivo',$5,$6) returning id`,
    [uid, status, nome, telefone, valor, data],
  )
  return rows[0]!.id
}

// pagar invertido: sou o DEVEDOR-criador (devedor_profile_id=uid); a outra ponta é o
// cobrador (telefone_cobrador/nome_cobrador).
async function insPagar(
  uid: string,
  nomeCobrador: string,
  telefone: string,
  status: string,
  valor: number,
  data: string,
): Promise<string> {
  const { rows } = await poolSuper.query<{ id: string }>(
    `insert into public.avisos
       (devedor_profile_id, pix_chave, direcao, criador_papel, status, nome_devedor, telefone_cobrador, nome_cobrador, motivo, valor_centavos, data_combinada)
     values ($1,'r@pix.com','pagar','devedor',$2,'Eu',$3,$4,'motivo',$5,$6) returning id`,
    [uid, status, telefone, nomeCobrador, valor, data],
  )
  return rows[0]!.id
}

describe('pessoas: visão por número (integração)', () => {
  let uid: string
  let idAna: string

  beforeAll(async () => {
    uid = await criarUsuario('Dono')
    // Mesmo número TEL, dois nomes diferentes, papel cobrador (a receber/recebido):
    idAna = await insReceber(uid, 'Ana', TEL, 'programado', 10000, '2026-06-10')
    await insReceber(uid, 'Ana', TEL, 'pago', 7000, '2026-06-11')
    await insReceber(uid, 'Ana', TEL, 'cancelado', 5000, '2026-06-12') // terminal: fora dos totais
    await insReceber(uid, 'Ana Paula', TEL, 'aguardando_aceite', 3000, '2026-06-13')
    // Mesmo número TEL, papel devedor (a pagar/pago): nome cobrador "Ana" (junta no grupo Ana).
    await insPagar(uid, 'Ana', TEL, 'programado', 2000, '2026-06-14')
    await insPagar(uid, 'Ana', TEL, 'pago', 4000, '2026-06-15')
    // Outra pessoa (número diferente): NÃO deve aparecer na visão de TEL.
    await insReceber(uid, 'Bruno', OUTRO, 'programado', 9999, '2026-06-16')
  })
  afterAll(async () => {
    await limparUsuario(uid)
  })

  it('resumo: identidade pelo número, quatro totais, terminais fora', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({ method: 'GET', url: `/v1/pessoas/${idAna}/resumo`, headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(200)
    const b = r.json()
    expect(b.telefone).toBe(TEL)
    expect(b.nome_entrada).toBe('Ana')
    // a receber = cobrador + ativos: 10000 (programado) + 3000 (aguardando_aceite) = 13000. Cancelado FORA.
    expect(b.a_receber_centavos).toBe(13000)
    expect(b.a_receber_qtd).toBe(2)
    expect(b.recebido_centavos).toBe(7000)
    expect(b.recebido_qtd).toBe(1)
    expect(b.a_pagar_centavos).toBe(2000)
    expect(b.a_pagar_qtd).toBe(1)
    expect(b.pago_centavos).toBe(4000)
    expect(b.pago_qtd).toBe(1)
  })

  it('combinados: todos do número, agrupados por nome', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({ method: 'GET', url: `/v1/pessoas/${idAna}/combinados`, headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(200)
    const b = r.json()
    // total = todos os combinados do número TEL (inclui pago e cancelado): 4 (cobrador) + 2 (devedor) = 6.
    expect(b.total).toBe(6)
    const nomes = b.grupos.map((g: { nome: string }) => g.nome).sort()
    expect(nomes).toEqual(['Ana', 'Ana Paula'])
    const ana = b.grupos.find((g: { nome: string }) => g.nome === 'Ana')
    const anaPaula = b.grupos.find((g: { nome: string }) => g.nome === 'Ana Paula')
    // "Ana" reúne cobrador (programado/pago/cancelado) + devedor (programado/pago) = 5.
    expect(ana.itens.length).toBe(5)
    expect(anaPaula.itens.length).toBe(1)
    // Nenhum item do OUTRO número vazou.
    const todos = b.grupos.flatMap((g: { itens: { telefone_devedor: string | null; telefone_cobrador: string | null }[] }) => g.itens)
    for (const it of todos) {
      expect([it.telefone_devedor, it.telefone_cobrador]).toContain(TEL)
    }
  })

  it('autocomplete: sugere nome/número por prefixo, só do que eu criei', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({
      method: 'POST',
      url: '/v1/pessoas/buscar-por-telefone',
      headers: AUTH,
      payload: { prefixo: '+551190000000' },
    })
    await app.close()
    expect(r.statusCode).toBe(200)
    const itens: { nome: string; telefone: string }[] = r.json().itens
    // distinct (nome, telefone): Ana e Ana Paula no número TEL.
    const nomes = itens.filter((i) => i.telefone === TEL).map((i) => i.nome).sort()
    expect(nomes).toEqual(['Ana', 'Ana Paula'])
    expect(itens.every((i) => i.telefone.startsWith('+551190000000'))).toBe(true)
  })

  it('404 quando o combinado não é visível ao usuário', async () => {
    const outro = await criarUsuario('Estranho')
    try {
      const app = await criarAppTeste(outro)
      const r = await app.inject({ method: 'GET', url: `/v1/pessoas/${idAna}/resumo`, headers: AUTH })
      await app.close()
      expect(r.statusCode).toBe(404)
    } finally {
      await limparUsuario(outro)
    }
  })

  it('404 quando o combinado não tem telefone da outra ponta (agenda)', async () => {
    const semTel = await poolSuper.query<{ id: string }>(
      `insert into public.avisos
         (cobrador_id, direcao, criador_papel, status, nome_devedor, motivo, valor_centavos, data_combinada)
       values ($1,'receber','cobrador','sem_aviso','Sem Zap','motivo',1000,'2026-06-20') returning id`,
      [uid],
    )
    const app = await criarAppTeste(uid)
    const r = await app.inject({ method: 'GET', url: `/v1/pessoas/${semTel.rows[0]!.id}/resumo`, headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(404)
  })

  it('isolamento: combinados de outro usuário no mesmo número não somam', async () => {
    const outro = await criarUsuario('Concorrente')
    try {
      await insReceber(outro, 'Ana', TEL, 'programado', 99999, '2026-06-21')
      const app = await criarAppTeste(uid)
      const r = await app.inject({ method: 'GET', url: `/v1/pessoas/${idAna}/resumo`, headers: AUTH })
      await app.close()
      // Inalterado: o combinado do outro usuário no mesmo número não entra na minha visão.
      expect(r.json().a_receber_centavos).toBe(13000)
    } finally {
      await limparUsuario(outro)
    }
  })
})

// Fase A (A4): última venda + sinal de inatividade na visão por pessoa. Cada teste usa um
// número próprio (dados autocontidos) para não depender da ordem de execução.
describe('pessoas: última compra e inatividade (A4)', () => {
  let uid: string
  let idAntigo: string
  const TEL_ANTIGO = '+5511900000055'

  beforeAll(async () => {
    uid = await criarUsuario('Vendedora')
    // Uma venda paga ANTIGA (bem além do limiar de 60d) e nada ativo → cliente inativo.
    idAntigo = await insReceber(uid, 'Rita', TEL_ANTIGO, 'pago', 5000, '2026-01-05')
  })
  afterAll(async () => {
    await limparUsuario(uid)
  })

  it('marca inativo: última venda passou do limiar e nada ativo a receber', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({ method: 'GET', url: `/v1/pessoas/${idAntigo}/resumo`, headers: AUTH })
    await app.close()
    const b = r.json()
    expect(b.ultima_compra).toBe('2026-01-05')
    expect(b.dias_desde_ultima_compra).toBeGreaterThanOrEqual(60)
    expect(b.a_receber_qtd).toBe(0)
    expect(b.inativo).toBe(true)
  })

  it('NÃO marca inativo quando há combinado ativo a receber', async () => {
    const tel = '+5511900000056'
    const idBia = await insReceber(uid, 'Bia', tel, 'pago', 5000, '2026-01-05')
    await insReceber(uid, 'Bia', tel, 'programado', 8000, '2026-07-01')
    const app = await criarAppTeste(uid)
    const r = await app.inject({ method: 'GET', url: `/v1/pessoas/${idBia}/resumo`, headers: AUTH })
    await app.close()
    const b = r.json()
    expect(b.inativo).toBe(false)
    // Última compra = a venda mais recente em que sou cobrador daquele número.
    expect(b.ultima_compra).toBe('2026-07-01')
  })

  it('sem venda como cobrador (só relação de pagar) → ultima_compra null, não inativo', async () => {
    const tel = '+5511900000057'
    const idPago = await insPagar(uid, 'Fornecedor', tel, 'programado', 3000, '2026-01-02')
    const app = await criarAppTeste(uid)
    const r = await app.inject({ method: 'GET', url: `/v1/pessoas/${idPago}/resumo`, headers: AUTH })
    await app.close()
    const b = r.json()
    expect(b.ultima_compra).toBeNull()
    expect(b.dias_desde_ultima_compra).toBeNull()
    expect(b.inativo).toBe(false)
  })
})

// E18 H18.4 / E15 H15.8: lista central de clientes (agregada por telefone) + renomear.
describe('pessoas: lista de clientes e renomear (integração)', () => {
  let uid: string
  const CL = '+5511900000401'

  beforeAll(async () => {
    uid = await criarUsuario('Dono clientes')
  })
  afterAll(async () => {
    await limparUsuario(uid)
  })

  it('GET /pessoas agrega por telefone com os quatro totais e a lista de nomes', async () => {
    // Dois combinados do mesmo número, nomes diferentes; a lista traz os dois (recente primeiro).
    await insReceber(uid, 'Ana', CL, 'pago', 5000, '2026-06-01')
    await insReceber(uid, 'Ana Paula', CL, 'programado', 3000, '2026-06-10')

    const app = await criarAppTeste(uid)
    const r = await app.inject({ method: 'GET', url: '/v1/pessoas', headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(200)
    const cliente = r.json().itens.find((c: { telefone: string }) => c.telefone === CL)
    expect(cliente).toBeTruthy()
    expect(cliente.nomes).toEqual(['Ana Paula', 'Ana']) // mais recente primeiro, deduplicado
    expect(cliente.recebido_centavos).toBe(5000)
    expect(cliente.a_receber_centavos).toBe(3000)
    expect(cliente.ref_aviso_id).toBeTruthy() // referência por avisoId (telefone nunca em rota)
  })

  it('PATCH /pessoas/:avisoId renomeia todos os combinados do telefone (só como cobrador)', async () => {
    const ref = await insReceber(uid, 'Ana Paula', CL, 'programado', 3000, '2026-06-20')
    const app = await criarAppTeste(uid)
    const r = await app.inject({
      method: 'PATCH',
      url: `/v1/pessoas/${ref}`,
      headers: AUTH,
      payload: { nome: 'Ana Paula Souza' },
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().telefone).toBe(CL)
    expect(r.json().afetados).toBeGreaterThanOrEqual(3) // todos os combinados receber do número

    // Todos os combinados daquele número passam a exibir o novo nome.
    const lista = await app.inject({ method: 'GET', url: '/v1/pessoas', headers: AUTH })
    await app.close()
    const cliente = lista.json().itens.find((c: { telefone: string }) => c.telefone === CL)
    // Sem nome_atual, renomeou o número inteiro: todos os combinados de CL viram um nome só.
    expect(cliente.nomes).toEqual(['Ana Paula Souza'])
  })

  it('PATCH com nome_atual renomeia SÓ o grupo daquele nome (H15.8)', async () => {
    const tel = '+5511900000402'
    const refA = await insReceber(uid, 'Grupo A', tel, 'programado', 1000, '2026-06-20')
    const refB = await insReceber(uid, 'Grupo B', tel, 'programado', 2000, '2026-06-21')
    const app = await criarAppTeste(uid)
    const r = await app.inject({
      method: 'PATCH',
      url: `/v1/pessoas/${refA}`,
      headers: AUTH,
      payload: { nome: 'Grupo A Novo', nome_atual: 'Grupo A' },
    })
    await app.close()
    expect(r.statusCode).toBe(200)
    expect(r.json().afetados).toBe(1) // só o combinado do grupo "Grupo A"

    const { rows } = await poolSuper.query<{ id: string; nome_devedor: string }>(
      `select id, nome_devedor from public.avisos where id = any($1)`,
      [[refA, refB]],
    )
    const porId = new Map(rows.map((x) => [x.id, x.nome_devedor]))
    expect(porId.get(refA)).toBe('Grupo A Novo')
    expect(porId.get(refB)).toBe('Grupo B') // o outro grupo do mesmo número fica intocado
  })

  it('renomear isola por dono: não toca combinados de outra conta com o mesmo telefone', async () => {
    const outro = await criarUsuario('Outro dono')
    const refOutro = await insReceber(outro, 'Cliente do outro', CL, 'programado', 1000, '2026-06-05')

    const app = await criarAppTeste(uid)
    const meuRef = await insReceber(uid, 'Meu nome', CL, 'programado', 1000, '2026-06-06')
    await app.inject({ method: 'PATCH', url: `/v1/pessoas/${meuRef}`, headers: AUTH, payload: { nome: 'Renomeado por mim' } })
    await app.close()

    // O combinado do OUTRO dono (mesmo telefone) permanece intocado.
    const { rows } = await poolSuper.query<{ nome_devedor: string }>(
      `select nome_devedor from public.avisos where id = $1`,
      [refOutro],
    )
    await limparUsuario(outro)
    expect(rows[0]!.nome_devedor).toBe('Cliente do outro')
  })
})
