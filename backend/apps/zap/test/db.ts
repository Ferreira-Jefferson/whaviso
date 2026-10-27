// Harness de banco dos testes de integracao do zap. Dois pools:
//   - poolSuper (postgres): semeia conta/loja/numero/cliente/conversa/envios (FK exige super).
//   - poolZap (whaviso_zap): roda o dreno sob o role de menor privilegio real (SEC-031).
// Roda no Postgres LOCAL (PGDATABASE; default whaviso_dev). Sem banco, os testes se pulam.
import pg from 'pg'
import { createHash, randomUUID } from 'node:crypto'
import { criarCifra, type Cifra } from '@whaviso/shared/cifra'

const SENHA = process.env.POSTGRES_PASSWORD ?? 'postgres'
const HOST = process.env.PGHOST ?? '127.0.0.1'
const DB = process.env.PGDATABASE ?? 'whaviso_dev'

export const MASTER_KEY = 'chave-mestra-de-teste-com-32-caracteres-ok'
export const cifra: Cifra = criarCifra(MASTER_KEY)

export const poolSuper = new pg.Pool({
  connectionString: `postgresql://postgres:${SENHA}@${HOST}:5432/${DB}`,
  max: 4,
})
export const poolZap = new pg.Pool({
  connectionString: `postgresql://whaviso_zap:whaviso_zap_dev@${HOST}:5432/${DB}`,
  max: 4,
})

export async function bancoAcessivel(): Promise<boolean> {
  try {
    await poolZap.query('select 1')
    await poolSuper.query('select 1')
    return true
  } catch {
    return false
  }
}

export async function fecharPools(): Promise<void> {
  await poolZap.end().catch(() => {})
  await poolSuper.end().catch(() => {})
}

const hex64 = (): string => createHash('sha256').update(randomUUID()).digest('hex')

export interface Cenario {
  contaId: string
  lojaId: string
  numeroId: string
  clienteId: string
  conversaId: string
}

export interface OpcoesCenario {
  /** token do numero (cifrado no banco); default um token valido. */
  token?: string | null
  /** telefone do cliente (cifrado no banco); default E.164 valido. */
  telefone?: string | null
  /** base da janela de 24h; default agora (dentro da janela). */
  ultimaEntrada?: Date | null
  statusNumero?: string
}

/** Semeia um cenario completo e devolve os ids. Limpeza por `limpar(contaId)`. */
export async function semear(op: OpcoesCenario = {}): Promise<Cenario> {
  const contaId = randomUUID()
  const lojaId = randomUUID()
  const numeroId = randomUUID()
  const clienteId = randomUUID()
  const conversaId = randomUUID()
  const userId = randomUUID()

  const token = op.token === undefined ? 'EAAG-token-de-teste-123' : op.token
  const telefone = op.telefone === undefined ? '+5511988887777' : op.telefone
  const ultima = op.ultimaEntrada === undefined ? new Date() : op.ultimaEntrada
  const tokenCifrado = token === null ? null : cifra.cifrar(Buffer.from(token, 'utf8'))
  const telCifrado = telefone === null ? null : cifra.cifrar(Buffer.from(telefone, 'utf8'))

  await poolSuper.query('insert into auth.users (id) values ($1)', [userId])
  await poolSuper.query('insert into public.contas (id, dono_user_id, nome) values ($1,$2,$3)', [
    contaId,
    userId,
    'Conta teste',
  ])
  await poolSuper.query('insert into public.lojas (id, conta_id, nome, ativo) values ($1,$2,$3,true)', [
    lojaId,
    contaId,
    'Loja teste',
  ])
  await poolSuper.query(
    `insert into public.numeros_whatsapp (id, loja_id, phone_number_id, waba_id, numero_hash, token_cifrado, status)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [numeroId, lojaId, `pnid-${numeroId.slice(0, 8)}`, 'waba-1', hex64(), tokenCifrado, op.statusNumero ?? 'conectado'],
  )
  await poolSuper.query(
    'insert into public.clientes (id, loja_id, telefone_hash, telefone_cifrado) values ($1,$2,$3,$4)',
    [clienteId, lojaId, hex64(), telCifrado],
  )
  await poolSuper.query(
    `insert into public.conversas (id, loja_id, numero_whatsapp_id, cliente_id, status, ultima_entrada_em)
     values ($1,$2,$3,$4,'ia',$5)`,
    [conversaId, lojaId, numeroId, clienteId, ultima],
  )
  return { contaId, lojaId, numeroId, clienteId, conversaId }
}

/** Enfileira um envio de texto livre (template_chave null) agendado para agora. */
export async function enfileirarTexto(
  c: Cenario,
  texto = 'oi',
  extra: { status?: string; tentativas?: number; atualizadoEm?: Date } = {},
): Promise<string> {
  const id = randomUUID()
  // atualizado_em so e aceito no INSERT (o trigger before-update o reescreve em updates): usamos
  // isso para forjar um orfao (processando antigo) sem mexer no trigger.
  await poolSuper.query(
    `insert into public.envios
       (id, loja_id, numero_whatsapp_id, cliente_id, destinatario_hash, template_chave, payload, conversa_id,
        status, agendado_para, tentativas, atualizado_em)
     values ($1,$2,$3,$4,$5,null,$6::jsonb,$7,$8,now(),$9,$10)`,
    [
      id,
      c.lojaId,
      c.numeroId,
      c.clienteId,
      hex64(),
      JSON.stringify({ tipo: 'texto', texto }),
      c.conversaId,
      extra.status ?? 'agendado',
      extra.tentativas ?? 0,
      extra.atualizadoEm ?? new Date(),
    ],
  )
  return id
}

export interface LinhaEnvio {
  status: string
  wamid: string | null
  enviado_em: Date | null
  tentativas: number
  erro: string | null
  proxima_tentativa_em: Date | null
}
export async function lerEnvio(id: string): Promise<LinhaEnvio> {
  const { rows } = await poolSuper.query<LinhaEnvio>(
    'select status, wamid, enviado_em, tentativas, erro, proxima_tentativa_em from public.envios where id = $1',
    [id],
  )
  return rows[0]!
}

export async function statusNumero(id: string): Promise<string> {
  const { rows } = await poolSuper.query<{ status: string }>(
    'select status from public.numeros_whatsapp where id = $1',
    [id],
  )
  return rows[0]!.status
}

export async function limpar(contaId: string): Promise<void> {
  // lojas/numeros/clientes/conversas/envios cascateiam da conta (FK on delete cascade).
  await poolSuper.query('delete from public.contas where id = $1', [contaId]).catch(() => {})
}
