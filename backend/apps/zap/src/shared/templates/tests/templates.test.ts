// Núcleo do transporte genérico do zap (H12.8): render de {{n}}, montagem de botões
// e fallback de contexto revisao->padrao em carregarTemplateAtivo. Erros aqui são
// sistêmicos (alimentam TODA mensagem), por isso teste dedicado.
import { afterAll, describe, expect, it } from 'vitest'
import { carregarTemplateAtivo, renderMensagem } from '../index'
import { encerrarPools, poolSuper, poolZap } from '../../../../test/harness'

afterAll(async () => {
  await poolSuper.query(`delete from public.templates where chave like 'teste.%'`)
  await encerrarPools()
})

describe('renderMensagem (transporte genérico)', () => {
  const base = { variaveis: ['nome', 'motivo'] }

  it('substitui {{n}} na ordem; valor ausente vira string vazia (paridade com o preview)', () => {
    const m = renderMensagem(
      { conteudo: { texto: 'Oi {{1}}, sobre {{2}}' }, ...base },
      '+5511999998888',
      { valores: { motivo: 'mensalidade' } }, // 'nome' AUSENTE -> ''
    )
    expect(m.texto).toBe('Oi , sobre mensalidade')
    expect(m.para).toBe('+5511999998888')
  })

  it('token fora da faixa fica intacto', () => {
    const m = renderMensagem(
      { conteudo: { texto: 'Oi {{1}} {{9}}' }, variaveis: ['nome'] },
      '+55',
      { valores: { nome: 'Ana' } },
    )
    expect(m.texto).toBe('Oi Ana {{9}}')
  })

  it('botões: com refId viram id "acao:<refId>"; sem refId são omitidos', () => {
    const conteudo = { texto: 'Oi', botoes: [{ acao: 'ja_paguei', rotulo: 'Já paguei' }] }
    const comRef = renderMensagem({ conteudo, variaveis: [] }, '+55', { refId: 'aviso-123' })
    expect(comRef.botoes).toEqual([{ id: 'ja_paguei:aviso-123', rotulo: 'Já paguei' }])

    const semRef = renderMensagem({ conteudo, variaveis: [] }, '+55')
    expect(semRef.botoes).toBeUndefined() // não há a quem amarrar a ação
  })

  it('mídia é repassada como está', () => {
    const m = renderMensagem(
      { conteudo: { texto: 'x', midia: { tipo: 'imagem', url: 'https://x/a-b.png' } }, variaveis: [] },
      '+55',
    )
    expect(m.midia).toEqual({ tipo: 'imagem', url: 'https://x/a-b.png' })
  })
})

describe('carregarTemplateAtivo (fallback de contexto)', () => {
  it('contexto revisao sem variante ativa cai no padrao (nenhuma mensagem para por falta)', async () => {
    await poolSuper.query(
      `insert into public.templates (chave, contexto, nome_meta, conteudo, variaveis, status_meta, ativo)
       values ('teste.fallback','padrao','teste_fallback_padrao','{"texto":"PADRAO"}'::jsonb,'[]'::jsonb,'aprovado',true)`,
    )
    const t = await carregarTemplateAtivo(poolZap, 'teste.fallback', 'revisao')
    expect(t?.conteudo.texto).toBe('PADRAO')
  })

  it('quando há variante revisao ativa, ela vence o padrao', async () => {
    await poolSuper.query(
      `insert into public.templates (chave, contexto, nome_meta, conteudo, variaveis, status_meta, ativo)
       values ('teste.rev','padrao','teste_rev_padrao','{"texto":"PADRAO"}'::jsonb,'[]'::jsonb,'aprovado',true),
              ('teste.rev','revisao','teste_rev_revisao','{"texto":"REVISAO"}'::jsonb,'[]'::jsonb,'aprovado',true)`,
    )
    const rev = await carregarTemplateAtivo(poolZap, 'teste.rev', 'revisao')
    expect(rev?.conteudo.texto).toBe('REVISAO')
    const pad = await carregarTemplateAtivo(poolZap, 'teste.rev', 'padrao')
    expect(pad?.conteudo.texto).toBe('PADRAO')
  })

  it('chave sem template ativo retorna null (envio falha controlado, não manda quebrado)', async () => {
    const t = await carregarTemplateAtivo(poolZap, 'teste.inexistente')
    expect(t).toBeNull()
  })
})
