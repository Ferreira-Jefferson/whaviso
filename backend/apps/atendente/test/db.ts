// Harness de banco dos testes de integracao do atendente. Dois pools:
//   - poolSuper (postgres): semeia conta/loja/numero/cliente/conversa/cardapio/endereco (FK super).
//   - poolAtendente (whaviso_atendente): roda o motor sob o role de menor privilegio real (SEC-032).
// Roda no Postgres LOCAL (PGDATABASE; default whaviso_dev). Sem banco, os testes se pulam. Cada
// cenario usa uma conta/loja nova (ids aleatorios): a limpeza e por conta (cascata) e as contagens
// filtram por conversa/loja (isolado, seguro no whaviso_dev compartilhado do CI).
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
export const poolAtendente = new pg.Pool({
  connectionString: `postgresql://whaviso_atendente:whaviso_atendente_dev@${HOST}:5432/${DB}`,
  max: 4,
})

export async function bancoAcessivel(): Promise<boolean> {
  try {
    await poolAtendente.query('select 1')
    await poolSuper.query('select 1')
    return true
  } catch {
    return false
  }
}

export async function fecharPools(): Promise<void> {
  await poolAtendente.end().catch(() => {})
  await poolSuper.end().catch(() => {})
}

const hex64 = (): string => createHash('sha256').update(randomUUID()).digest('hex')

export interface Cardapio {
  categoria: string
  burger: string
  suco: string
  pequena: string
  grande: string
  bacon: string
}
export interface PixSeed {
  tipo: string
  chave: string
  titular: string
  cidade: string | null
}
export interface Cenario {
  contaId: string
  lojaId: string
  numeroId: string
  clienteId: string
  conversaId: string
  enderecoId: string
  cardapio: Cardapio
  telefoneHash: string
  /** Chave Pix semeada da loja (null quando `semPix`). O BR Code gerado embute `chave`/`titular`. */
  pix: PixSeed | null
}

async function um<T = { id: string }>(sqlTexto: string, params: unknown[]): Promise<T> {
  const r = await poolSuper.query(sqlTexto, params)
  return r.rows[0] as T
}

export interface OpcoesCenario {
  horarios?: unknown
  /**
   * Nao semeia a disponibilidade padrao (loja aberta a semana toda). Com isso, sem horario de
   * atendimento nem agendamento, o modo do atendente deriva para `fechado` (simula loja fechada).
   */
  semDisponibilidade?: boolean
  /** bairro do endereco do cliente (default 'Centro'). */
  bairro?: string
  /** bairro da zona de entrega ativa (default = `bairro`); use para simular fora de area. */
  zonaBairro?: string
  taxaZonaCentavos?: number | null
  statusConversa?: 'ia' | 'humano' | 'encerrada'
  /** Nao semeia `loja_pix` (simula loja sem Pix configurado, para a degradacao do nó de pix). */
  semPix?: boolean
  /** Chave Pix da loja. Default: uma chave `aleatoria` (UUID) UNICA por loja (isolamento). */
  pix?: Partial<PixSeed>
}

/** Semeia a chave Pix cifrada da loja (grant 0058): mesma cifra/MASTER_KEY da api. Devolve o claro. */
async function semearPix(lojaId: string, op: Partial<PixSeed> = {}): Promise<PixSeed> {
  const pix: PixSeed = {
    tipo: op.tipo ?? 'aleatoria',
    chave: op.chave ?? randomUUID(), // UUID unico por loja: distingue uma loja da outra no BR Code
    titular: op.titular ?? 'Recebedor Teste',
    cidade: op.cidade ?? 'Sao Paulo',
  }
  const chaveHash = createHash('sha256').update(pix.chave).digest('hex')
  await poolSuper.query(
    `insert into public.loja_pix (loja_id, tipo, chave_hash, chave_cifrada, ultimos4, titular, cidade)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [lojaId, pix.tipo, chaveHash, cifra.cifrar(Buffer.from(pix.chave)), pix.chave.slice(-4), pix.titular, pix.cidade],
  )
  return pix
}

/** Semeia conta/loja/cardapio/cliente/conversa/endereco. Limpeza por `limpar(contaId)`. */
export async function semear(op: OpcoesCenario = {}): Promise<Cenario> {
  const userId = randomUUID()
  await poolSuper.query('insert into auth.users (id) values ($1)', [userId])
  const contaId = (await um('insert into public.contas (dono_user_id, nome) values ($1,$2) returning id', [userId, 'Conta teste'])).id
  const lojaId = (await um('insert into public.lojas (conta_id, nome, horarios) values ($1,$2,$3) returning id', [contaId, 'Loja teste', op.horarios === undefined ? null : JSON.stringify(op.horarios)])).id
  const numeroId = (await um(
    `insert into public.numeros_whatsapp (loja_id, phone_number_id, waba_id, numero_hash, status)
     values ($1,$2,$3,$4,'conectado') returning id`,
    [lojaId, `pnid-${randomUUID().slice(0, 8)}`, 'waba-1', hex64()],
  )).id

  const telefone = '+5511988887777'
  const telefoneHash = cifra.hashTelefone(telefone)
  const clienteId = (await um(
    'insert into public.clientes (loja_id, telefone_hash, telefone_cifrado, nome) values ($1,$2,$3,$4) returning id',
    [lojaId, telefoneHash, cifra.cifrar(Buffer.from(telefone)), 'Cliente Teste'],
  )).id

  const bairro = op.bairro ?? 'Centro'
  const enderecoId = (await um(
    'insert into public.enderecos (loja_id, cliente_id, logradouro, numero, bairro, ultimo_uso_em) values ($1,$2,$3,$4,$5, now()) returning id',
    [lojaId, clienteId, 'Rua Teste', '10', bairro],
  )).id

  if (op.taxaZonaCentavos != null) {
    const zonaBairro = op.zonaBairro ?? bairro
    await poolSuper.query(
      `insert into public.zonas_entrega (loja_id, nome, tipo, bairro, taxa_cliente_centavos) values ($1,$2,'bairro',$3,$4)`,
      [lojaId, `Zona ${zonaBairro}`, zonaBairro, op.taxaZonaCentavos],
    )
  }

  const conversaId = (await um(
    `insert into public.conversas (loja_id, numero_whatsapp_id, cliente_id, status, contexto, ultima_entrada_em)
     values ($1,$2,$3,$4,'{}'::jsonb, now()) returning id`,
    [lojaId, numeroId, clienteId, op.statusConversa ?? 'ia'],
  )).id

  const pix = op.semPix ? null : await semearPix(lojaId, op.pix)

  // Disponibilidade padrao: loja aceitando pedido ao vivo a semana toda (modo atendimento). Duas
  // faixas por dia cobrem as 24h sem buraco na virada (00:00-23:00 e 23:00-02:00 cruzando a
  // meia-noite), para o modo ser estavel em qualquer horario real do relogio dos testes.
  if (!op.semDisponibilidade) {
    for (let dia = 0; dia < 7; dia++) {
      await poolSuper.query(
        `insert into public.horarios_funcionamento (loja_id, dia_semana, abre, fecha)
         values ($1,$2,'00:00','23:00'),($1,$2,'23:00','02:00')`,
        [lojaId, dia],
      )
    }
  }

  const cardapio = await semearCardapio(lojaId)
  return { contaId, lojaId, numeroId, clienteId, conversaId, enderecoId, cardapio, telefoneHash, pix }
}

async function semearCardapio(lojaId: string): Promise<Cardapio> {
  const categoria = (await um('insert into public.categorias (loja_id, nome) values ($1,$2) returning id', [lojaId, 'Lanches'])).id
  const gt = (await um(
    `insert into public.grupos_opcoes (loja_id, nome, tipo, obrigatorio, min_escolhas, max_escolhas, ordem)
     values ($1,'Tamanho','tamanho',true,1,1,0) returning id`, [lojaId])).id
  const opcao = async (g: string, nome: string, preco: number, ordem: number) =>
    (await um('insert into public.opcoes (loja_id, grupo_id, nome, preco_centavos, ordem) values ($1,$2,$3,$4,$5) returning id', [lojaId, g, nome, preco, ordem])).id
  const pequena = await opcao(gt, 'Pequena', 0, 0)
  const grande = await opcao(gt, 'Grande', 500, 1)
  const ga = (await um(
    `insert into public.grupos_opcoes (loja_id, nome, tipo, obrigatorio, min_escolhas, max_escolhas, aplica_a_opcao_id, ordem)
     values ($1,'Adicionais','adicional',false,0,2,$2,1) returning id`, [lojaId, grande])).id
  const bacon = await opcao(ga, 'Bacon', 300, 0)
  await poolSuper.query('insert into public.categoria_grupos (categoria_id, grupo_id, loja_id, ordem) values ($1,$2,$3,0),($1,$4,$3,1)', [categoria, gt, lojaId, ga])
  const burger = (await um('insert into public.itens (loja_id, categoria_id, nome, preco_centavos, ordem) values ($1,$2,$3,$4,0) returning id', [lojaId, categoria, 'Burger', 2000])).id
  const suco = (await um('insert into public.itens (loja_id, categoria_id, nome, preco_centavos, ordem) values ($1,$2,$3,$4,1) returning id', [lojaId, categoria, 'Suco', 800])).id
  await poolSuper.query('insert into public.item_grupos (item_id, grupo_id, loja_id, incluir) values ($1,$2,$3,false),($1,$4,$3,false)', [suco, gt, lojaId, ga])
  return { categoria, burger, suco, pequena, grande, bacon }
}

/** Insere uma mensagem de ENTRADA (como o zap faria) e devolve o id. */
export async function inserirEntrada(
  c: Cenario,
  tipo: 'texto' | 'interativo',
  conteudo: string,
): Promise<string> {
  const r = await um<{ id: string }>(
    `insert into public.mensagens (loja_id, conversa_id, direcao, autor, tipo, conteudo)
     values ($1,$2,'entrada','cliente',$3::tipo_mensagem,$4) returning id`,
    [c.lojaId, c.conversaId, tipo, conteudo],
  )
  return r.id
}

export async function lerEnvios(conversaId: string): Promise<Array<{ payload: unknown; dedupe_chave: string | null }>> {
  const { rows } = await poolSuper.query(
    'select payload, dedupe_chave from public.envios where conversa_id = $1 order by criado_em',
    [conversaId],
  )
  return rows as Array<{ payload: unknown; dedupe_chave: string | null }>
}

export async function lerPedidos(lojaId: string): Promise<Array<{ id: string; status: string; subtotal_centavos: number; taxa_entrega_centavos: number; total_centavos: number; codigo: string }>> {
  const { rows } = await poolSuper.query(
    'select id, status, subtotal_centavos, taxa_entrega_centavos, total_centavos, codigo from public.pedidos where loja_id = $1 order by criado_em',
    [lojaId],
  )
  return rows
}

export async function lerItens(pedidoId: string): Promise<Array<{ nome_snapshot: string; total_centavos: number }>> {
  const { rows } = await poolSuper.query(
    'select nome_snapshot, total_centavos from public.itens_pedido where pedido_id = $1',
    [pedidoId],
  )
  return rows
}

export async function statusConversa(conversaId: string): Promise<string> {
  const { rows } = await poolSuper.query('select status from public.conversas where id = $1', [conversaId])
  return rows[0].status as string
}

export async function contexto(conversaId: string): Promise<Record<string, unknown>> {
  const { rows } = await poolSuper.query('select contexto from public.conversas where id = $1', [conversaId])
  return rows[0].contexto as Record<string, unknown>
}

export async function resetProcessada(mensagemId: string): Promise<void> {
  await poolSuper.query('update public.mensagens set processada_em = null where id = $1', [mensagemId])
}

/** Forca o estado do fluxo (conversas.contexto) para montar cenarios de borda. */
export async function setContexto(conversaId: string, estado: unknown): Promise<void> {
  await poolSuper.query('update public.conversas set contexto = $2::jsonb where id = $1', [conversaId, JSON.stringify(estado)])
}

/** Marca um item como esgotado ate o futuro (simula item que some entre adicionar e pagar). */
export async function esgotarItem(itemId: string): Promise<void> {
  await poolSuper.query(
    `update public.itens set esgotado_ate = now() + interval '1 day' where id = $1`,
    [itemId],
  )
}

export async function processadaEm(mensagemId: string): Promise<Date | null> {
  const { rows } = await poolSuper.query('select processada_em from public.mensagens where id = $1', [mensagemId])
  return rows[0].processada_em as Date | null
}

export async function lerEnderecos(clienteId: string): Promise<Array<{ logradouro: string; bairro: string | null }>> {
  const { rows } = await poolSuper.query('select logradouro, bairro from public.enderecos where cliente_id = $1 order by criado_em', [clienteId])
  return rows
}

export async function lerOpcoesItem(pedidoId: string): Promise<string[]> {
  const { rows } = await poolSuper.query(
    `select o.nome_snapshot from public.itens_pedido_opcoes o
       join public.itens_pedido ip on ip.id = o.item_pedido_id
      where ip.pedido_id = $1`,
    [pedidoId],
  )
  return rows.map((r) => r.nome_snapshot as string)
}

export async function limpar(contaId: string): Promise<void> {
  await poolSuper.query('delete from public.eventos where loja_id in (select id from public.lojas where conta_id = $1)', [contaId]).catch(() => {})
  await poolSuper.query('delete from public.contas where id = $1', [contaId]).catch(() => {})
}
