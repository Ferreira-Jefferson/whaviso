// Fixtures de teste do modulo (so usadas por *.test.ts). Semeia via superusuario.
import { randomUUID, createHash } from 'node:crypto'
import { poolSuper, criarUsuario, criarConta, criarLoja, criarMembro, type Cenario } from '../../../../test/db'

export interface Mundo {
  userId: string
  contaId: string
  lojaId: string
  numeroId: string
  /** Membro do userId na loja (para semear quem assumiu a conversa no handoff). */
  membroId: string
}

export async function criarMundo(c: Cenario, papel: 'dono' | 'gerente' | 'atendente' = 'dono'): Promise<Mundo> {
  const userId = await criarUsuario(c)
  const contaId = await criarConta(c, userId)
  const lojaId = await criarLoja(contaId)
  const membroId = await criarMembro(contaId, userId, papel, lojaId)
  const numeroId = randomUUID()
  await poolSuper.query(
    `insert into public.numeros_whatsapp (id, loja_id, phone_number_id, waba_id) values ($1,$2,$3,'waba')`,
    [numeroId, lojaId, `pn_${numeroId}`],
  )
  return { userId, contaId, lojaId, numeroId, membroId }
}

export async function criarCliente(lojaId: string, nome: string | null): Promise<{ id: string; hash: string }> {
  const id = randomUUID()
  const hash = createHash('sha256').update(id).digest('hex')
  await poolSuper.query('insert into public.clientes (id, loja_id, telefone_hash, nome) values ($1,$2,$3,$4)', [
    id,
    lojaId,
    hash,
    nome,
  ])
  return { id, hash }
}

export async function criarConversa(
  m: Mundo,
  clienteId: string,
  o: {
    status?: 'ia' | 'aguardando' | 'humano' | 'encerrada'
    ultimaEntrada?: Date | null
    atendidoPor?: string | null
  } = {},
): Promise<string> {
  const id = randomUUID()
  await poolSuper.query(
    `insert into public.conversas (id, loja_id, numero_whatsapp_id, cliente_id, status, ultima_entrada_em, atendido_por_membro_id)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [id, m.lojaId, m.numeroId, clienteId, o.status ?? 'humano', o.ultimaEntrada ?? null, o.atendidoPor ?? null],
  )
  return id
}

export async function criarMensagem(
  lojaId: string,
  conversaId: string,
  direcao: 'entrada' | 'saida',
  conteudo: string,
  criadoEm: Date,
  autor: 'cliente' | 'ia' | 'humano' = direcao === 'entrada' ? 'cliente' : 'ia',
): Promise<string> {
  const id = randomUUID()
  await poolSuper.query(
    `insert into public.mensagens (id, loja_id, conversa_id, direcao, autor, conteudo, criado_em)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [id, lojaId, conversaId, direcao, autor, conteudo, criadoEm],
  )
  return id
}

export async function criarPedido(m: Mundo, conversaId: string, clienteId: string): Promise<string> {
  const id = randomUUID()
  await poolSuper.query(
    `insert into public.pedidos (id, loja_id, cliente_id, conversa_id, codigo, subtotal_centavos, total_centavos)
     values ($1,$2,$3,$4,$5,1000,1000)`,
    [id, m.lojaId, clienteId, conversaId, 'P' + id.slice(0, 5)],
  )
  return id
}
