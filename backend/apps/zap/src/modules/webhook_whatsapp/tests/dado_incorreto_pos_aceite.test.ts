import { afterAll, describe, expect, it, vi } from 'vitest'
import { processarTexto } from '../service'
import {
  clienteWhatsFake,
  criarAvisoInvertido,
  criarAvisoPendente,
  encerrarPools,
  limpar,
  poolSuper,
} from '../../../../test/harness'

// Item 7 (wave 2, migration 0100): o devedor reporta um dado do combinado ATIVO
// (`programado`) como incorreto por texto ("<opção> <informação correta>"); o cobrador
// aprova/recusa por texto ("aprovar"/"recusar"), roteado por telefone (H8.5/M4).
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
const TEL_DEVEDOR = '+5511999998888'
const TEL_COBRADOR = '+5511777776666'

afterAll(async () => {
  await encerrarPools()
})

function texto(telefone: string, t: string) {
  return { wamid: 'w_' + Math.random(), telefone, texto: t }
}

async function statusDe(id: string): Promise<string> {
  const { rows } = await poolSuper.query(`select status from public.avisos where id=$1`, [id])
  return rows[0].status
}

async function reportePendente(id: string): Promise<{ campo: string; dados_corretos: unknown } | null> {
  const { rows } = await poolSuper.query(
    `select campo, dados_corretos from public.avisos_reportes where aviso_id=$1 and resolucao='pendente'`,
    [id],
  )
  return rows[0] ?? null
}

async function contarEvento(id: string, tipo: string): Promise<number> {
  const { rows } = await poolSuper.query(
    `select count(*)::int as n from public.eventos_aviso where aviso_id=$1 and tipo=$2`,
    [id, tipo],
  )
  return rows[0].n
}

describe('Item 7 (wave 2): reporte de dado incorreto pós-aceite', () => {
  it('"1 250,00" (valor): registra reporte, suspende (aguardando_aprovacao_dado_incorreto), notifica cobrador', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    const whats = clienteWhatsFake()
    await processarTexto({ pool: poolSuper, logger, whats }, texto(TEL_DEVEDOR, '1 250,00'))
    expect(await statusDe(avisoId)).toBe('aguardando_aprovacao_dado_incorreto')
    const rep = await reportePendente(avisoId)
    expect(rep?.campo).toBe('valor')
    expect(rep?.dados_corretos).toEqual({ valor_centavos: 25000 })
    expect(await contarEvento(avisoId, 'dado_incorreto_reportado')).toBe(1)
    const notif = await poolSuper.query(
      `select count(*)::int as n from public.notificacoes_cobrador where aviso_id=$1 and tipo='combinado_dado_incorreto'`,
      [avisoId],
    )
    expect(notif.rows[0].n).toBe(1)
    expect(whats.enviadas.some((t) => t.para === TEL_DEVEDOR)).toBe(true)
    await limpar(cobradorId)
  })

  it('"1 250.00" (valor, ponto decimal): interpreta como 250,00, não como 25000 (regressão)', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    const whats = clienteWhatsFake()
    await processarTexto({ pool: poolSuper, logger, whats }, texto(TEL_DEVEDOR, '1 250.00'))
    const rep = await reportePendente(avisoId)
    expect(rep?.dados_corretos).toEqual({ valor_centavos: 25000 })
    await limpar(cobradorId)
  })

  it('"2 20/08/2026" (data): dados_corretos com data_combinada ISO', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    const whats = clienteWhatsFake()
    await processarTexto({ pool: poolSuper, logger, whats }, texto(TEL_DEVEDOR, '2 20/08/2026'))
    const rep = await reportePendente(avisoId)
    expect(rep?.campo).toBe('data')
    expect(rep?.dados_corretos).toEqual({ data_combinada: '2026-08-20' })
    await limpar(cobradorId)
  })

  it('"3 Aluguel de agosto" (nome ou motivo, texto simples): vai para `motivo`', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    const whats = clienteWhatsFake()
    await processarTexto({ pool: poolSuper, logger, whats }, texto(TEL_DEVEDOR, '3 Aluguel de agosto'))
    const rep = await reportePendente(avisoId)
    expect(rep?.campo).toBe('nome_motivo')
    expect(rep?.dados_corretos).toEqual({ motivo: 'Aluguel de agosto' })
    await limpar(cobradorId)
  })

  it('"3 Maria | Aluguel de agosto" (nome ou motivo, formato com pipe): nome + motivo', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    const whats = clienteWhatsFake()
    await processarTexto({ pool: poolSuper, logger, whats }, texto(TEL_DEVEDOR, '3 Maria | Aluguel de agosto'))
    const rep = await reportePendente(avisoId)
    expect(rep?.dados_corretos).toEqual({ nome_devedor: 'Maria', motivo: 'Aluguel de agosto' })
    await limpar(cobradorId)
  })

  it('formato inválido ("1 abc"): não registra reporte, não muda status, pede para tentar de novo', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    const whats = clienteWhatsFake()
    await processarTexto({ pool: poolSuper, logger, whats }, texto(TEL_DEVEDOR, '1 abc'))
    expect(await statusDe(avisoId)).toBe('programado')
    expect(await reportePendente(avisoId)).toBeNull()
    expect(whats.enviadas.some((t) => t.para === TEL_DEVEDOR)).toBe(true)
    await limpar(cobradorId)
  })

  it('data inválida ("2 31/02/2026"): formato reconhecido no regex mas calendário inválido -> rejeita', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    const whats = clienteWhatsFake()
    await processarTexto({ pool: poolSuper, logger, whats }, texto(TEL_DEVEDOR, '2 31/02/2026'))
    expect(await reportePendente(avisoId)).toBeNull()
    await limpar(cobradorId)
  })

  it('idempotente: um 2º reporte enquanto o 1º está pendente não duplica (silêncio)', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    const whats = clienteWhatsFake()
    await processarTexto({ pool: poolSuper, logger, whats }, texto(TEL_DEVEDOR, '1 250,00'))
    expect(await statusDe(avisoId)).toBe('aguardando_aprovacao_dado_incorreto')
    await processarTexto({ pool: poolSuper, logger, whats }, texto(TEL_DEVEDOR, '1 300,00'))
    const { rows } = await poolSuper.query(
      `select count(*)::int as n from public.avisos_reportes where aviso_id=$1`,
      [avisoId],
    )
    expect(rows[0].n).toBe(1) // ainda só o primeiro reporte.
    await limpar(cobradorId)
  })

  it('telefone divergente: sem combinado ativo para esse número, texto ignorado (silêncio)', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    const whats = clienteWhatsFake()
    await processarTexto({ pool: poolSuper, logger, whats }, texto('+5511000000000', '1 250,00'))
    expect(await statusDe(avisoId)).toBe('programado')
    expect(await reportePendente(avisoId)).toBeNull()
    expect(whats.enviadas).toHaveLength(0)
    await limpar(cobradorId)
  })
})

describe('Item 7 (wave 2): cobrador aprova/recusa por texto ("aprovar"/"recusar")', () => {
  async function reportar(): Promise<void> {
    const whats = clienteWhatsFake()
    await processarTexto({ pool: poolSuper, logger, whats }, texto(TEL_DEVEDOR, '1 250,00'))
  }

  it('"aprovar" (cobrador com conta): resolucao=aprovado, volta a programado, evento auditado', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    await poolSuper.query(`update public.profiles set telefone=$2 where id=$1`, [cobradorId, TEL_COBRADOR])
    await reportar()
    const whats = clienteWhatsFake()
    await processarTexto({ pool: poolSuper, logger, whats }, texto(TEL_COBRADOR, 'aprovar'))
    expect(await statusDe(avisoId)).toBe('programado')
    const { rows } = await poolSuper.query(
      `select resolucao from public.avisos_reportes where aviso_id=$1`,
      [avisoId],
    )
    expect(rows[0].resolucao).toBe('aprovado')
    expect(await contarEvento(avisoId, 'dado_incorreto_aprovado')).toBe(1)
    expect(whats.enviadas.some((t) => t.para === TEL_COBRADOR)).toBe(true)
    await limpar(cobradorId)
  })

  it('"recusar" (cobrador com conta): resolucao=recusado, volta a programado', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    await poolSuper.query(`update public.profiles set telefone=$2 where id=$1`, [cobradorId, TEL_COBRADOR])
    await reportar()
    const whats = clienteWhatsFake()
    await processarTexto({ pool: poolSuper, logger, whats }, texto(TEL_COBRADOR, 'recusar'))
    expect(await statusDe(avisoId)).toBe('programado')
    const { rows } = await poolSuper.query(
      `select resolucao from public.avisos_reportes where aviso_id=$1`,
      [avisoId],
    )
    expect(rows[0].resolucao).toBe('recusado')
    expect(await contarEvento(avisoId, 'dado_incorreto_recusado')).toBe(1)
    await limpar(cobradorId)
  })

  it('"aprovar" (cobrador SEM conta, invertido): roteia por telefone_cobrador', async () => {
    const { devedorId, avisoId } = await criarAvisoInvertido({ dataCombinada: '2026-12-15' })
    const whats0 = clienteWhatsFake()
    await processarTexto({ pool: poolSuper, logger, whats: whats0 }, texto('+5511970001111', '1 250,00'))
    expect(await statusDe(avisoId)).toBe('aguardando_aprovacao_dado_incorreto')
    const whats = clienteWhatsFake()
    await processarTexto({ pool: poolSuper, logger, whats }, texto('+5511960002222', 'aprovar'))
    expect(await statusDe(avisoId)).toBe('programado')
    await limpar(devedorId)
  })

  it('M4-like: o DEVEDOR digitando "aprovar" não resolve (telefone não é do cobrador)', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    await poolSuper.query(`update public.profiles set telefone=$2 where id=$1`, [cobradorId, TEL_COBRADOR])
    await reportar()
    const whats = clienteWhatsFake()
    // O devedor tenta "aprovar": não há reporte pendente PARA O TELEFONE DELE (a busca é
    // por telefone do cobrador), então cai no fluxo normal (sem combinado ativo -> silêncio).
    await processarTexto({ pool: poolSuper, logger, whats }, texto(TEL_DEVEDOR, 'aprovar'))
    expect(await statusDe(avisoId)).toBe('aguardando_aprovacao_dado_incorreto')
    await limpar(cobradorId)
  })

  it('C4-like: cobrador com conta mas sem telefone verificado não resolve por texto', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    // profile.telefone fica NULL (default): não roteável.
    await reportar()
    const whats = clienteWhatsFake()
    await processarTexto({ pool: poolSuper, logger, whats }, texto(TEL_COBRADOR, 'aprovar'))
    expect(await statusDe(avisoId)).toBe('aguardando_aprovacao_dado_incorreto')
    await limpar(cobradorId)
  })

  it('idempotente: "aprovar" de novo (já resolvido) não duplica evento', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    await poolSuper.query(`update public.profiles set telefone=$2 where id=$1`, [cobradorId, TEL_COBRADOR])
    await reportar()
    const whats = clienteWhatsFake()
    await processarTexto({ pool: poolSuper, logger, whats }, texto(TEL_COBRADOR, 'aprovar'))
    await processarTexto({ pool: poolSuper, logger, whats }, texto(TEL_COBRADOR, 'aprovar'))
    expect(await contarEvento(avisoId, 'dado_incorreto_aprovado')).toBe(1)
    await limpar(cobradorId)
  })
})
