// Leitura do motor: SO via @whaviso/shared/db (sql parametrizado, SEC-080). Todas as leituras
// filtram pela loja_id da conversa (SEC-001/002). Nunca projeta telefone/conteudo em log.
import { consultar, consultarUm, sql, type Executor } from '@whaviso/shared/db'

/** Reivindica a proxima mensagem de ENTRADA nao processada (claim do inbound, FOR UPDATE SKIP LOCKED). */
export interface MensagemClaim {
  id: string
  conversa_id: string
  loja_id: string
  tipo: string
  conteudo: string | null
}
export async function claimMensagem(tx: Executor, conversaId?: string): Promise<MensagemClaim | null> {
  const filtro = conversaId ?? null
  return consultarUm<MensagemClaim>(
    tx,
    sql`select id, conversa_id, loja_id, tipo, conteudo
          from public.mensagens
         where direcao = 'entrada' and processada_em is null
           and (${filtro}::uuid is null or conversa_id = ${filtro})
         order by criado_em
         for update skip locked
         limit 1`,
  )
}

/** Trava a conversa (serializa o turno por conversa) e devolve o que o motor precisa dela. */
export interface ConversaCtx {
  id: string
  loja_id: string
  numero_whatsapp_id: string
  cliente_id: string
  status: 'ia' | 'humano' | 'encerrada'
  contexto: unknown
}
export async function lockConversa(tx: Executor, conversaId: string): Promise<ConversaCtx | null> {
  return consultarUm<ConversaCtx>(
    tx,
    sql`select id, loja_id, numero_whatsapp_id, cliente_id, status, contexto
          from public.conversas where id = ${conversaId} for update`,
  )
}

export interface LojaRow {
  id: string
  nome: string
  horarios: unknown
  /** Pausa operacional (G7): liga/desliga. `pausada_ate` limita a pausa no tempo (null = indefinida). */
  pausada: boolean
  pausada_ate: Date | null
}
export async function lerLoja(tx: Executor, lojaId: string): Promise<LojaRow | null> {
  return consultarUm<LojaRow>(
    tx,
    sql`select id, nome, horarios, pausada, pausada_ate from public.lojas where id = ${lojaId}`,
  )
}

export interface ClienteRow {
  id: string
  nome: string | null
  telefone_hash: string
}
export async function lerCliente(tx: Executor, lojaId: string, clienteId: string): Promise<ClienteRow | null> {
  return consultarUm<ClienteRow>(
    tx,
    sql`select id, nome, telefone_hash from public.clientes where id = ${clienteId} and loja_id = ${lojaId}`,
  )
}

/** Ultimo endereco ativo do cliente (base do "repetir ultimo"), com o bairro (gate de area). */
export async function lerUltimoEndereco(
  tx: Executor,
  lojaId: string,
  clienteId: string,
): Promise<{ id: string; bairro: string | null } | null> {
  return consultarUm<{ id: string; bairro: string | null }>(
    tx,
    sql`select id, bairro from public.enderecos
         where loja_id = ${lojaId} and cliente_id = ${clienteId} and ativo
         order by ultimo_uso_em desc nulls last, criado_em desc
         limit 1`,
  )
}

export async function lerBairroEndereco(tx: Executor, lojaId: string, enderecoId: string): Promise<string | null> {
  const linha = await consultarUm<{ bairro: string | null }>(
    tx,
    sql`select bairro from public.enderecos where id = ${enderecoId} and loja_id = ${lojaId}`,
  )
  return linha?.bairro ?? null
}

export interface ZonaRow {
  bairro: string | null
  taxa_cliente_centavos: number
}
export async function lerZonas(tx: Executor, lojaId: string): Promise<ZonaRow[]> {
  return consultar<ZonaRow>(
    tx,
    sql`select bairro, taxa_cliente_centavos from public.zonas_entrega
         where loja_id = ${lojaId} and ativo and tipo = 'bairro'`,
  )
}

/** Bairros das zonas ativas da loja (area atendida), sem nulos e sem repetir. */
export async function lerZonasBairros(tx: Executor, lojaId: string): Promise<string[]> {
  const linhas = await consultar<{ bairro: string | null }>(
    tx,
    sql`select distinct bairro from public.zonas_entrega
         where loja_id = ${lojaId} and ativo and tipo = 'bairro' and bairro is not null
         order by bairro`,
  )
  return linhas.map((l) => l.bairro!).filter((b) => b.length > 0)
}

export async function lerStatusPedido(tx: Executor, lojaId: string, pedidoId: string): Promise<string | null> {
  const linha = await consultarUm<{ status: string }>(
    tx,
    sql`select status from public.pedidos where id = ${pedidoId} and loja_id = ${lojaId}`,
  )
  return linha?.status ?? null
}

// --- Cardapio vivo (seis leituras simples por loja; a montagem pura fica em montar_cardapio.ts) ---
export interface RawCategoria {
  id: string
  nome: string
  ativo: boolean
  programacao: unknown
  ordem: number
}
export interface RawItem {
  id: string
  categoria_id: string
  nome: string
  preco_centavos: number
  ativo: boolean
  esgotado_ate: Date | null
  ordem: number
}
export interface RawGrupo {
  id: string
  nome: string
  obrigatorio: boolean
  min_escolhas: number
  max_escolhas: number | null
  aplica_a_opcao_id: string | null
  ativo: boolean
  ordem: number
}
export interface RawOpcao {
  id: string
  grupo_id: string
  nome: string
  preco_centavos: number
  ativo: boolean
  esgotado_ate: Date | null
  ordem: number
}
export interface RawVinculoCategoria {
  categoria_id: string
  grupo_id: string
  ordem: number
}
export interface RawVinculoItem {
  item_id: string
  grupo_id: string
  incluir: boolean
  ordem: number
}
export interface CardapioRaw {
  categorias: RawCategoria[]
  itens: RawItem[]
  grupos: RawGrupo[]
  opcoes: RawOpcao[]
  vinculosCategoria: RawVinculoCategoria[]
  vinculosItem: RawVinculoItem[]
}

export async function lerCardapioRaw(tx: Executor, lojaId: string): Promise<CardapioRaw> {
  // Sequencial: um PoolClient nao suporta queries concorrentes (dentro da transacao do turno).
  const categorias = await consultar<RawCategoria>(
    tx,
    sql`select id, nome, ativo, programacao, ordem from public.categorias where loja_id = ${lojaId} order by ordem`,
  )
  const itens = await consultar<RawItem>(
    tx,
    sql`select id, categoria_id, nome, preco_centavos, ativo, esgotado_ate, ordem
          from public.itens where loja_id = ${lojaId} order by ordem`,
  )
  const grupos = await consultar<RawGrupo>(
    tx,
    sql`select id, nome, obrigatorio, min_escolhas, max_escolhas, aplica_a_opcao_id, ativo, ordem
          from public.grupos_opcoes where loja_id = ${lojaId} order by ordem`,
  )
  const opcoes = await consultar<RawOpcao>(
    tx,
    sql`select id, grupo_id, nome, preco_centavos, ativo, esgotado_ate, ordem
          from public.opcoes where loja_id = ${lojaId} order by ordem`,
  )
  const vinculosCategoria = await consultar<RawVinculoCategoria>(
    tx,
    sql`select categoria_id, grupo_id, ordem from public.categoria_grupos where loja_id = ${lojaId}`,
  )
  const vinculosItem = await consultar<RawVinculoItem>(
    tx,
    sql`select item_id, grupo_id, incluir, ordem from public.item_grupos where loja_id = ${lojaId}`,
  )
  return { categorias, itens, grupos, opcoes, vinculosCategoria, vinculosItem }
}
