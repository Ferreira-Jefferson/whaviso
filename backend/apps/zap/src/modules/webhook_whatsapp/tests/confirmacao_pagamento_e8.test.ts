import { afterAll, describe, expect, it, vi } from 'vitest'
import { processarBotao } from '../service'
import {
  clienteWhatsFake,
  criarAvisoInvertido,
  criarAvisoPendente,
  encerrarPools,
  limpar,
  poolSuper,
} from '../../../../test/harness'

// E8 H8.5: cobrador confirma/rejeita por botão no WhatsApp (com conta e sem conta).
// C4 (cobrador-com-conta-sem-telefone ignora), M4 (devedor não confirma), idempotência.
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
const TEL_DEVEDOR = '+5511999998888'
const TEL_COBRADOR = '+5511777776666'

afterAll(async () => {
  await encerrarPools()
})

function botao(acao: string, avisoId: string, telefone: string) {
  return { wamid: 'w_' + acao, telefone, buttonId: `${acao}:${avisoId}` }
}

async function statusDe(id: string): Promise<string> {
  const { rows } = await poolSuper.query(`select status from public.avisos where id=$1`, [id])
  return rows[0].status
}

async function contarEvento(id: string, tipo: string): Promise<number> {
  const { rows } = await poolSuper.query(
    `select count(*)::int as n from public.eventos_aviso where aviso_id=$1 and tipo=$2`, [id, tipo])
  return rows[0].n
}

describe('E8 H8.5: confirmar/rejeitar por botão (cobrador)', () => {
  // --- Cobrador COM conta: telefone do profile bate ----------------------------------
  it('confirmar (com conta): informado_pago → pago + evento via:telefone + encerramento agendado', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    await poolSuper.query(`update public.profiles set telefone=$2 where id=$1`, [cobradorId, TEL_COBRADOR])
    await poolSuper.query(`update public.avisos set status='informado_pago' where id=$1`, [avisoId])
    const whats = clienteWhatsFake()
    await processarBotao({ pool: poolSuper, logger, whats }, botao('confirmar', avisoId, TEL_COBRADOR))
    expect(await statusDe(avisoId)).toBe('pago')
    expect(await contarEvento(avisoId, 'confirmado_cobrador')).toBe(1)
    // Encerramento ao devedor agendado +~1min (janela de reversão).
    const enc = await poolSuper.query(
      `select agendar_para > now() + interval '30 seconds' as futuro
         from public.notificacoes_cobrador where aviso_id=$1 and tipo='encerramento' and status='agendado'`, [avisoId])
    expect(enc.rowCount).toBe(1)
    expect(enc.rows[0].futuro).toBe(true)
    await limpar(cobradorId)
  })

  it('rejeitar (com conta): informado_pago → programado + rejeicao ao devedor', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    await poolSuper.query(`update public.profiles set telefone=$2 where id=$1`, [cobradorId, TEL_COBRADOR])
    await poolSuper.query(`update public.avisos set status='informado_pago' where id=$1`, [avisoId])
    const whats = clienteWhatsFake()
    await processarBotao({ pool: poolSuper, logger, whats }, botao('rejeitar', avisoId, TEL_COBRADOR))
    expect(await statusDe(avisoId)).toBe('programado')
    expect(await contarEvento(avisoId, 'rejeitado_cobrador')).toBe(1)
    const rej = await poolSuper.query(
      `select count(*)::int as n from public.notificacoes_cobrador where aviso_id=$1 and tipo='rejeicao'`, [avisoId])
    expect(rej.rows[0].n).toBe(1)
    await limpar(cobradorId)
  })

  // --- Cobrador SEM conta (invertido): roteia por telefone_cobrador ------------------
  it('confirmar (sem conta): cobrador convidado confirma por telefone_cobrador', async () => {
    // Invertido: criador = devedor (com conta); cobrador convidado SEM conta (cobrador_id null,
    // telefone_cobrador = +5511960002222).
    const { devedorId, avisoId } = await criarAvisoInvertido({ dataCombinada: '2026-12-15' })
    await poolSuper.query(`update public.avisos set status='informado_pago' where id=$1`, [avisoId])
    const whats = clienteWhatsFake()
    await processarBotao({ pool: poolSuper, logger, whats }, botao('confirmar', avisoId, '+5511960002222'))
    expect(await statusDe(avisoId)).toBe('pago')
    expect(await contarEvento(avisoId, 'confirmado_cobrador')).toBe(1)
    await limpar(devedorId)
  })

  // --- C4: cobrador COM conta mas SEM telefone verificado -> NÃO roteável -> ignora ---
  it('C4: cobrador com conta sem telefone no profile não confirma por botão (ignora)', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    // profile.telefone fica NULL (default).
    await poolSuper.query(`update public.avisos set status='informado_pago' where id=$1`, [avisoId])
    const whats = clienteWhatsFake()
    await processarBotao({ pool: poolSuper, logger, whats }, botao('confirmar', avisoId, TEL_COBRADOR))
    // Não roteável -> estado não muda, nada enviado, nenhum evento.
    expect(await statusDe(avisoId)).toBe('informado_pago')
    expect(await contarEvento(avisoId, 'confirmado_cobrador')).toBe(0)
    expect(whats.enviadas).toHaveLength(0)
    await limpar(cobradorId)
  })

  // --- M4: o DEVEDOR (telefone_devedor) não confirma o próprio pagamento --------------
  it('M4: devedor tentando confirmar por botão é REJEITADO (estado não muda)', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    await poolSuper.query(`update public.profiles set telefone=$2 where id=$1`, [cobradorId, TEL_COBRADOR])
    await poolSuper.query(`update public.avisos set status='informado_pago' where id=$1`, [avisoId])
    const whats = clienteWhatsFake()
    // O telefone que responde é o do DEVEDOR (alvo dos lembretes), não o do cobrador.
    await processarBotao({ pool: poolSuper, logger, whats }, botao('confirmar', avisoId, TEL_DEVEDOR))
    expect(await statusDe(avisoId)).toBe('informado_pago')
    expect(await contarEvento(avisoId, 'confirmado_cobrador')).toBe(0)
    expect(whats.enviadas).toHaveLength(0)
    await limpar(cobradorId)
  })

  // --- Telefone divergente (nem cobrador nem devedor): ignora sem vazar ---------------
  it('telefone que não bate com o alvo cobrador é ignorado sem vazar', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    await poolSuper.query(`update public.profiles set telefone=$2 where id=$1`, [cobradorId, TEL_COBRADOR])
    await poolSuper.query(`update public.avisos set status='informado_pago' where id=$1`, [avisoId])
    const whats = clienteWhatsFake()
    await processarBotao({ pool: poolSuper, logger, whats }, botao('confirmar', avisoId, '+5511000000000'))
    expect(await statusDe(avisoId)).toBe('informado_pago')
    expect(whats.enviadas).toHaveLength(0)
    await limpar(cobradorId)
  })

  // --- Idempotência: toque duplo no botão ---------------------------------------------
  it('idempotente: confirmar de novo (já pago) não duplica evento/encerramento', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    await poolSuper.query(`update public.profiles set telefone=$2 where id=$1`, [cobradorId, TEL_COBRADOR])
    await poolSuper.query(`update public.avisos set status='informado_pago' where id=$1`, [avisoId])
    const whats = clienteWhatsFake()
    await processarBotao({ pool: poolSuper, logger, whats }, botao('confirmar', avisoId, TEL_COBRADOR))
    await processarBotao({ pool: poolSuper, logger, whats }, botao('confirmar', avisoId, TEL_COBRADOR))
    expect(await contarEvento(avisoId, 'confirmado_cobrador')).toBe(1)
    const enc = await poolSuper.query(
      `select count(*)::int as n from public.notificacoes_cobrador where aviso_id=$1 and tipo='encerramento'`, [avisoId])
    expect(enc.rows[0].n).toBe(1)
    await limpar(cobradorId)
  })
})
