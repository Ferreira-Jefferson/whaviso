// Seguranca do Pix na conversa (nó de pagamento = pix), rodando o motor REAL sob o role
// whaviso_atendente no Postgres local. Prova as quatro garantias que justificam habilitar o grant
// 0058 (SEC-032):
//   1. ISOLAMENTO: a loja so monta o BR Code a partir da PROPRIA loja_pix (duas lojas sentinela);
//      a chave de outra loja nunca entra no payload.
//   2. SEC-024: a chave decifrada entra no BR Code (dado publico do Pix), mas NUNCA no log.
//   3. matriz: o atendente tem SELECT na chave, mas NAO UPDATE/DELETE em loja_pix.
//   4. SEC-061: gerar um BR Code NAO e confirmar pagamento (pedido fica `novo`, sem linha em
//      `pagamentos`): o motor so efetiva a cobranca de forma determinista, nunca paga.
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { criarLogger, type Logger } from '@whaviso/shared/logger'
import { criarPixDecifra, criarRegistry, processarProximaMensagem, type DepsMotor } from '../../src/modules/motor_fluxo'
import { EstadoFluxo } from '../../src/modules/motor_fluxo/tipos'
import {
  bancoAcessivel, fecharPools, inserirEntrada, lerEnvios, lerPedidos, limpar, MASTER_KEY, semear, setContexto,
  poolAtendente, poolSuper, type Cenario,
} from '../db'

const online = await bancoAcessivel()
const registry = criarRegistry()
const pixDecifra = criarPixDecifra(MASTER_KEY)

const contas: string[] = []
async function novoCenario(op?: Parameters<typeof semear>[0]): Promise<Cenario> {
  const c = await semear(op)
  contas.push(c.contaId)
  return c
}
afterEach(async () => {
  while (contas.length) await limpar(contas.pop()!)
})
afterAll(fecharPools)

/** Posiciona a conversa no pagamento (carrinho valido + endereco) e dispara `pag:pix`. */
async function pagarComPix(c: Cenario, logger: Logger): Promise<void> {
  await setContexto(
    c.conversaId,
    EstadoFluxo.parse({
      etapa: 'pagamento', pagamento: 'pix', endereco_id: c.enderecoId,
      carrinho: [{ item_id: c.cardapio.burger, quantidade: 1, opcoes_ids: [c.cardapio.grande] }],
    }),
  )
  await inserirEntrada(c, 'interativo', 'pag:pix')
  const deps: DepsMotor = { pool: poolAtendente, logger, registry, conversaId: c.conversaId, pixDecifra }
  expect(await processarProximaMensagem(deps)).toBe('processada')
}

/** Texto do BR Code enfileirado (payload EMV comeca em 000201); null se nao houver. */
async function brCodeDaConversa(conversaId: string): Promise<string | null> {
  const textos = (await lerEnvios(conversaId)).map((e) => (e.payload as { texto?: string }).texto ?? '')
  return textos.find((t) => t.startsWith('000201')) ?? null
}

describe.skipIf(!online)('Pix na conversa (seguranca do motor)', () => {
  it('ISOLAMENTO: o BR Code so embute a chave Pix da PROPRIA loja (nunca de outra loja)', async () => {
    const a = await novoCenario({ pix: { tipo: 'email', chave: 'loja-a-SEGREDO@teste.com', titular: 'Loja A' } })
    const b = await novoCenario({ pix: { tipo: 'email', chave: 'loja-b-OUTRO@teste.com', titular: 'Loja B' } })

    const logger = criarLogger('pix-sec', 'silent')
    await pagarComPix(a, logger)

    const brCode = await brCodeDaConversa(a.conversaId)
    expect(brCode).not.toBeNull()
    expect(brCode!).toContain(a.pix!.chave) // a chave da propria loja
    expect(brCode!).not.toContain(b.pix!.chave) // NUNCA a chave da outra loja
    // A loja B nao participou: nenhuma conversa, nenhum envio.
    expect(await lerEnvios(b.conversaId)).toHaveLength(0)
  })

  it('SEC-024: a chave Pix decifrada entra no BR Code mas NUNCA no log', async () => {
    const SENTINELA = 'sentinela-pix-NAO-LOGAR@teste.com'
    const c = await novoCenario({ pix: { tipo: 'email', chave: SENTINELA, titular: 'Loja Sentinela' } })

    const linhas: string[] = []
    const logger = criarLogger('pix-sec-log', 'info', { write: (s: string) => void linhas.push(s) })
    await pagarComPix(c, logger)

    const brCode = await brCodeDaConversa(c.conversaId)
    expect(brCode).not.toBeNull()
    expect(brCode!).toContain(SENTINELA) // a chave e dado publico do Pix: vai no payload
    // ...mas o log do turno nunca a contem (nem o BR Code inteiro, que a carrega).
    const log = linhas.join('')
    expect(log).not.toContain(SENTINELA)
    expect(log).not.toContain(brCode!)
  })

  it('matriz: whaviso_atendente LE a chave cifrada mas NAO faz UPDATE/DELETE em loja_pix', async () => {
    const c = await novoCenario()
    // SELECT da cifra: permitido (grant 0058).
    await expect(
      poolAtendente.query('select chave_cifrada from public.loja_pix where loja_id = $1', [c.lojaId]),
    ).resolves.toBeDefined()
    // UPDATE/DELETE: negado por privilegio (a chave e escrita so pela api).
    await expect(
      poolAtendente.query("update public.loja_pix set titular = 'x' where loja_id = $1", [c.lojaId]),
    ).rejects.toThrow()
    await expect(
      poolAtendente.query('delete from public.loja_pix where loja_id = $1', [c.lojaId]),
    ).rejects.toThrow()
  })

  it('SEC-061: gerar o BR Code NAO confirma pagamento (pedido fica `novo`, sem linha em pagamentos)', async () => {
    const c = await novoCenario()
    const logger = criarLogger('pix-sec', 'silent')
    await pagarComPix(c, logger)

    const pedidos = await lerPedidos(c.lojaId)
    expect(pedidos).toHaveLength(1)
    expect(pedidos[0]!.status).toBe('novo') // segue aguardando preparo, nao "pago"
    // O motor nunca cria/concilia cobranca: a conciliacao e manual, na api (onda 3).
    const { rows } = await poolSuper.query('select count(*)::int as n from public.pagamentos where pedido_id = $1', [pedidos[0]!.id])
    expect(rows[0].n).toBe(0)
  })
})
