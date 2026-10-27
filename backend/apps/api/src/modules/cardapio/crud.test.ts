// CRUD de grupos/opcoes/categorias/itens + disponibilidade, contra o banco real (role whaviso_api).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chamar, encerrar, montarMundo, online, type Mundo } from './test/apoio'

const d = online ? describe : describe.skip
if (!online) console.warn('[cardapio] banco inacessivel: integracao PULADA.')

d('cardapio: CRUD', () => {
  let m: Mundo
  const dono = () => m.dono
  const A = () => m.lojaA
  beforeAll(async () => {
    m = await montarMundo()
  })
  afterAll(async () => {
    await encerrar(m)
  })

  describe('grupos e opcoes', () => {
    it('cria grupo com opcoes inline; obrigatorio sem min sobe para 1', async () => {
      const r = await chamar(m, dono(), A(), 'POST', '/grupos', {
        nome: 'Tamanho',
        tipo: 'tamanho',
        obrigatorio: true,
        max_escolhas: 1,
        opcoes: [
          { nome: 'Media', preco_centavos: 0, padrao: true },
          { nome: 'Grande', preco_centavos: 1000 },
        ],
      })
      expect(r.status).toBe(201)
      expect(r.corpo.min_escolhas).toBe(1)
      expect(r.corpo.opcoes.map((o: { nome: string }) => o.nome)).toEqual(['Media', 'Grande'])
      expect(r.corpo.opcoes[1].preco_centavos).toBe(1000)
      expect(r.corpo.impactos).toEqual([])
    })

    it('limites do banco viram erro amigavel 422 (codigos estaveis)', async () => {
      const semMin = await chamar(m, dono(), A(), 'POST', '/grupos', {
        nome: 'X',
        obrigatorio: true,
        min_escolhas: 0,
      })
      expect(semMin.status).toBe(422)
      expect(semMin.corpo.error.code).toBe('grupo_obrigatorio_sem_minimo')

      const maxMenor = await chamar(m, dono(), A(), 'POST', '/grupos', {
        nome: 'X',
        min_escolhas: 3,
        max_escolhas: 2,
      })
      expect(maxMenor.corpo.error.code).toBe('grupo_limites_invalidos')

      const minMaior = await chamar(m, dono(), A(), 'POST', '/grupos', {
        nome: 'X',
        min_escolhas: 3,
        opcoes: [{ nome: 'a' }, { nome: 'b' }],
      })
      expect(minMaior.corpo.error.code).toBe('grupo_minimo_maior_que_opcoes')

      const padraoDemais = await chamar(m, dono(), A(), 'POST', '/grupos', {
        nome: 'X',
        max_escolhas: 1,
        opcoes: [
          { nome: 'a', padrao: true },
          { nome: 'b', padrao: true },
        ],
      })
      expect(padraoDemais.corpo.error.code).toBe('padrao_excede_maximo')
    })

    it('preco negativo/fracionado e rejeitado na borda (centavos inteiros)', async () => {
      const g = await chamar(m, dono(), A(), 'POST', '/grupos', { nome: 'P' })
      for (const preco of [-1, 1.5, '10']) {
        const r = await chamar(m, dono(), A(), 'POST', `/grupos/${g.corpo.id}/opcoes`, {
          nome: 'o',
          preco_centavos: preco,
        })
        expect(r.status).toBe(400)
        expect(r.corpo.error.code).toBe('entrada_invalida')
      }
    })

    it('PATCH grupo e opcao; padrao respeita max_escolhas', async () => {
      const g = await chamar(m, dono(), A(), 'POST', '/grupos', { nome: 'Adicionais', tipo: 'adicional' })
      const o1 = await chamar(m, dono(), A(), 'POST', `/grupos/${g.corpo.id}/opcoes`, {
        nome: 'Bacon',
        preco_centavos: 500,
        padrao: true,
      })
      expect(o1.status).toBe(201)
      const o2 = await chamar(m, dono(), A(), 'POST', `/grupos/${g.corpo.id}/opcoes`, { nome: 'Queijo' })
      const lim = await chamar(m, dono(), A(), 'PATCH', `/grupos/${g.corpo.id}`, { max_escolhas: 1, nome: 'Extras' })
      expect(lim.status).toBe(200)
      expect(lim.corpo.nome).toBe('Extras')
      const dois = await chamar(m, dono(), A(), 'PATCH', `/opcoes/${o2.corpo.id}`, { padrao: true })
      expect(dois.status).toBe(422)
      expect(dois.corpo.error.code).toBe('padrao_excede_maximo')
      const preco = await chamar(m, dono(), A(), 'PATCH', `/opcoes/${o1.corpo.id}`, { preco_centavos: 650 })
      expect(preco.corpo.preco_centavos).toBe(650)
    })

    it('aplica_a_opcao_id so aceita opcao de grupo tamanho da mesma loja', async () => {
      const tam = await chamar(m, dono(), A(), 'POST', '/grupos', {
        nome: 'Tam',
        tipo: 'tamanho',
        opcoes: [{ nome: 'G' }],
      })
      const opTam = tam.corpo.opcoes[0].id
      const ok = await chamar(m, dono(), A(), 'POST', '/grupos', {
        nome: 'Borda G',
        tipo: 'adicional',
        aplica_a_opcao_id: opTam,
      })
      expect(ok.status).toBe(201)

      const adic = await chamar(m, dono(), A(), 'POST', '/grupos', { nome: 'Ad', opcoes: [{ nome: 'x' }] })
      const naoTam = await chamar(m, dono(), A(), 'POST', '/grupos', {
        nome: 'Dep',
        aplica_a_opcao_id: adic.corpo.opcoes[0].id,
      })
      expect(naoTam.status).toBe(422)
      expect(naoTam.corpo.error.code).toBe('aplica_a_opcao_invalida')

      const deB = await chamar(m, m.donoB, m.lojaB, 'POST', '/grupos', {
        nome: 'TamB',
        tipo: 'tamanho',
        opcoes: [{ nome: 'B' }],
      })
      const cruzada = await chamar(m, dono(), A(), 'POST', '/grupos', {
        nome: 'Dep',
        aplica_a_opcao_id: deB.corpo.opcoes[0].id,
      })
      expect(cruzada.status).toBe(422)
      expect(cruzada.corpo.error.code).toBe('aplica_a_opcao_invalida')
    })

    it('desativar tamanho/opcao referenciado como aplica_a avisa em `impactos`', async () => {
      const tam = await chamar(m, dono(), A(), 'POST', '/grupos', {
        nome: 'Tam2',
        tipo: 'tamanho',
        opcoes: [{ nome: 'P' }, { nome: 'G' }],
      })
      const dep = await chamar(m, dono(), A(), 'POST', '/grupos', {
        nome: 'Borda recheada',
        tipo: 'adicional',
        aplica_a_opcao_id: tam.corpo.opcoes[1].id,
      })
      const op = await chamar(m, dono(), A(), 'PATCH', `/opcoes/${tam.corpo.opcoes[1].id}`, { ativo: false })
      expect(op.status).toBe(200)
      expect(op.corpo.impactos).toEqual([{ grupo_id: dep.corpo.id, nome: 'Borda recheada' }])

      await chamar(m, dono(), A(), 'PATCH', `/opcoes/${tam.corpo.opcoes[1].id}`, { ativo: true })
      const gr = await chamar(m, dono(), A(), 'PATCH', `/grupos/${tam.corpo.id}`, { ativo: false })
      expect(gr.corpo.impactos.map((i: { grupo_id: string }) => i.grupo_id)).toEqual([dep.corpo.id])

      const tipo = await chamar(m, dono(), A(), 'PATCH', `/grupos/${tam.corpo.id}`, { tipo: 'customizado' })
      expect(tipo.corpo.error.code).toBe('grupo_tamanho_referenciado')
    })

    it('reordena grupos e opcoes; rejeita id de outra loja ou repetido', async () => {
      const lista = await chamar(m, dono(), A(), 'GET', '/grupos')
      const ids: string[] = lista.corpo.grupos.map((g: { id: string }) => g.id)
      const inv = [...ids].reverse()
      expect((await chamar(m, dono(), A(), 'PUT', '/grupos/ordem', { ids: inv })).status).toBe(200)
      const depois = await chamar(m, dono(), A(), 'GET', '/grupos')
      expect(depois.corpo.grupos.map((g: { id: string }) => g.id)).toEqual(inv)

      const gb = await chamar(m, m.donoB, m.lojaB, 'POST', '/grupos', { nome: 'GB' })
      const cruz = await chamar(m, dono(), A(), 'PUT', '/grupos/ordem', { ids: [gb.corpo.id] })
      expect(cruz.status).toBe(422)
      const dup = await chamar(m, dono(), A(), 'PUT', '/grupos/ordem', { ids: [ids[0], ids[0]] })
      expect(dup.corpo.error.code).toBe('ids_duplicados')

      const g = await chamar(m, dono(), A(), 'POST', '/grupos', {
        nome: 'Ord',
        opcoes: [{ nome: 'a' }, { nome: 'b' }, { nome: 'c' }],
      })
      const oids: string[] = g.corpo.opcoes.map((o: { id: string }) => o.id)
      const novo = [oids[2], oids[0], oids[1]]
      await chamar(m, dono(), A(), 'PUT', `/grupos/${g.corpo.id}/opcoes/ordem`, { ids: novo })
      const lido = await chamar(m, dono(), A(), 'GET', '/grupos')
      const achado = lido.corpo.grupos.find((x: { id: string }) => x.id === g.corpo.id)
      expect(achado.opcoes.map((o: { id: string }) => o.id)).toEqual(novo)
    })
  })

  describe('categorias e itens', () => {
    it('categoria: cria com programacao, edita, valida programacao', async () => {
      const c = await chamar(m, dono(), A(), 'POST', '/categorias', {
        nome: 'Almoco',
        programacao: { janelas: [{ dias: [1, 2, 3], inicio: '11:00', fim: '15:00' }] },
      })
      expect(c.status).toBe(201)
      expect(c.corpo.programacao.janelas[0].inicio).toBe('11:00')
      const upd = await chamar(m, dono(), A(), 'PATCH', `/categorias/${c.corpo.id}`, { programacao: null, nome: 'Dia' })
      expect(upd.corpo.programacao).toBeNull()
      expect(upd.corpo.nome).toBe('Dia')

      for (const prog of [
        { janelas: [] },
        { janelas: [{ dias: [7], inicio: '11:00', fim: '15:00' }] },
        { janelas: [{ dias: [1], inicio: '25:00', fim: '15:00' }] },
        { janelas: [{ dias: [1], inicio: '11:00', fim: '11:00' }] },
        { janelas: [{ dias: [1, 1], inicio: '11:00', fim: '12:00' }] },
        { janelas: [{ dias: [1], inicio: '11:00', fim: '12:00', extra: 1 }] },
      ]) {
        const r = await chamar(m, dono(), A(), 'POST', '/categorias', { nome: 'Z', programacao: prog })
        expect(r.status).toBe(400)
      }
    })

    it('item: cria, edita preco em centavos, imagem so por allowlist https', async () => {
      const c = await chamar(m, dono(), A(), 'POST', '/categorias', { nome: 'Pratos' })
      const i = await chamar(m, dono(), A(), 'POST', '/itens', {
        categoria_id: c.corpo.id,
        nome: 'Feijoada',
        preco_centavos: 4290,
        sugerivel: true,
        imagem_url: 'https://abc.supabase.co/storage/v1/object/public/img/f.jpg',
      })
      expect(i.status).toBe(201)
      expect(i.corpo.preco_centavos).toBe(4290)
      expect(i.corpo.excecoes).toEqual([])
      const upd = await chamar(m, dono(), A(), 'PATCH', `/itens/${i.corpo.id}`, { preco_centavos: 4590 })
      expect(upd.corpo.preco_centavos).toBe(4590)

      for (const url of [
        'http://abc.supabase.co/x.jpg',
        'https://evil.example.com/x.jpg',
        'https://supabase.co.evil.com/x.jpg',
        'https://user:pw@abc.supabase.co/x.jpg',
        'javascript:alert(1)',
      ]) {
        const r = await chamar(m, dono(), A(), 'PATCH', `/itens/${i.corpo.id}`, { imagem_url: url })
        expect(r.status === 422 || r.status === 400, url).toBe(true)
      }
    })

    it('nenhum item fica sem categoria ativa', async () => {
      const c = await chamar(m, dono(), A(), 'POST', '/categorias', { nome: 'Sazonal' })
      const i = await chamar(m, dono(), A(), 'POST', '/itens', { categoria_id: c.corpo.id, nome: 'Sopa' })
      const bloqueio = await chamar(m, dono(), A(), 'PATCH', `/categorias/${c.corpo.id}`, { ativo: false })
      expect(bloqueio.status).toBe(409)
      expect(bloqueio.corpo.error.code).toBe('categoria_com_itens_ativos')
      await chamar(m, dono(), A(), 'PATCH', `/itens/${i.corpo.id}`, { ativo: false })
      expect((await chamar(m, dono(), A(), 'PATCH', `/categorias/${c.corpo.id}`, { ativo: false })).status).toBe(200)
      const emInativa = await chamar(m, dono(), A(), 'POST', '/itens', { categoria_id: c.corpo.id, nome: 'Outro' })
      expect(emInativa.status).toBe(422)
      expect(emInativa.corpo.error.code).toBe('categoria_inativa')
      const reativar = await chamar(m, dono(), A(), 'PATCH', `/itens/${i.corpo.id}`, { ativo: true })
      expect(reativar.corpo.error.code).toBe('categoria_inativa')
    })

    it('reordena categorias', async () => {
      const a = await chamar(m, dono(), A(), 'POST', '/categorias', { nome: 'R1' })
      const b = await chamar(m, dono(), A(), 'POST', '/categorias', { nome: 'R2' })
      expect((await chamar(m, dono(), A(), 'PUT', '/categorias/ordem', { ids: [b.corpo.id, a.corpo.id] })).status).toBe(200)
      const arv = await chamar(m, dono(), A(), 'GET', '/')
      const nomes: string[] = arv.corpo.categorias.map((c: { nome: string }) => c.nome)
      expect(nomes.indexOf('R2')).toBeLessThan(nomes.indexOf('R1'))
    })
  })
})
