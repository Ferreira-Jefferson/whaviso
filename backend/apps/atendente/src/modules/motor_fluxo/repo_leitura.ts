// Leitura do motor: SO via @whaviso/shared/db (sql parametrizado, SEC-080). Todas as leituras
// filtram pela loja_id da conversa (SEC-001/002). Nunca projeta telefone/conteudo em log.
import { consultar, consultarUm, sql, sqlBruto, type Executor } from '@whaviso/shared/db'
import type { TipoChavePix } from '@whaviso/shared/contracts'
import {
  momentoSp,
  type Agendamento,
  type DadosDisponibilidade,
  type Excecao,
  type FaixaHorario,
} from '@whaviso/shared/disponibilidade'

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
  /** Pausa operacional (G7): liga/desliga. `pausada_ate` limita a pausa no tempo (null = indefinida). */
  pausada: boolean
  pausada_ate: Date | null
}
export async function lerLoja(tx: Executor, lojaId: string): Promise<LojaRow | null> {
  return consultarUm<LojaRow>(
    tx,
    sql`select id, nome, pausada, pausada_ate from public.lojas where id = ${lojaId}`,
  )
}

// time -> "HH:mm" (fragmento fixo de codigo; nome de coluna, nunca entrada do cliente).
const HM = (col: string) => sqlBruto(`to_char(${col}, 'HH24:MI')`)

/**
 * Disponibilidade da loja (fonte unica, regras-negocio/05) para o motor derivar o modo do atendente:
 * faixas de atendimento ATIVAS + a excecao ativa da data de HOJE (America/Sao_Paulo). O calculo do
 * modo e puro e mora no kernel `@whaviso/shared/disponibilidade`; aqui so lemos e mapeamos.
 */
export async function lerDisponibilidade(tx: Executor, lojaId: string, agora: Date): Promise<DadosDisponibilidade> {
  const hoje = momentoSp(agora).data
  const horarios = await consultar<FaixaHorario>(
    tx,
    sql`select dia_semana, ${HM('abre')} as abre, ${HM('fecha')} as fecha
          from public.horarios_funcionamento where loja_id = ${lojaId} and ativo`,
  )
  const exc = await consultarUm<{ fechado: boolean; abre: string | null; fecha: string | null }>(
    tx,
    sql`select fechado, ${HM('abre')} as abre, ${HM('fecha')} as fecha
          from public.excecoes_disponibilidade
         where loja_id = ${lojaId} and ativo and data = ${hoje}::date`,
  )
  const excecoes: Excecao[] = exc
    ? [{ data: hoje, fechado: exc.fechado, abre: exc.abre, fecha: exc.fecha }]
    : []
  return { horarios, excecoes }
}

/**
 * Janela de agendamento da loja (uma linha por loja, modo desligado|faixa|24h). Sem linha =
 * agendamento desligado (so pedido ao vivo). inicio/fim nulos do banco viram '00:00' (o modo que
 * nao e `faixa` nao os usa). dias nulo vira [].
 */
export async function lerAgendamento(tx: Executor, lojaId: string): Promise<Agendamento> {
  const r = await consultarUm<{ modo: Agendamento['modo']; inicio: string | null; fim: string | null; dias: number[] | null }>(
    tx,
    sql`select modo, ${HM('inicio')} as inicio, ${HM('fim')} as fim, dias
          from public.agendamento_config where loja_id = ${lojaId}`,
  )
  if (!r) return { modo: 'desligado', dias: [], inicio: '00:00', fim: '00:00' }
  return { modo: r.modo, dias: r.dias ?? [], inicio: r.inicio ?? '00:00', fim: r.fim ?? '00:00' }
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

/** Total do pedido (centavos) para fixar o valor do BR Code; filtra pela loja (SEC-001/002). */
export async function lerTotalPedido(tx: Executor, lojaId: string, pedidoId: string): Promise<number | null> {
  const linha = await consultarUm<{ total_centavos: number }>(
    tx,
    sql`select total_centavos from public.pedidos where id = ${pedidoId} and loja_id = ${lojaId}`,
  )
  return linha?.total_centavos ?? null
}

/**
 * Chave Pix cifrada da loja para montar o BR Code na conversa (grant 0058, SELECT por coluna). SO
 * as colunas minimas do BR Code; `chave_hash` fica de fora. A cifra e decifrada em memoria no
 * service (nunca logada). Filtra pela loja da conversa (isolamento multi-tenant, SEC-001/002).
 */
export interface PixLoja {
  tipo: TipoChavePix
  chaveCifrada: Buffer
  titular: string
  cidade: string | null
}
export async function lerPixLoja(tx: Executor, lojaId: string): Promise<PixLoja | null> {
  const linha = await consultarUm<{ tipo: TipoChavePix; chave_cifrada: Buffer; titular: string; cidade: string | null }>(
    tx,
    sql`select tipo, chave_cifrada, titular, cidade from public.loja_pix where loja_id = ${lojaId}`,
  )
  return linha
    ? { tipo: linha.tipo, chaveCifrada: linha.chave_cifrada, titular: linha.titular, cidade: linha.cidade }
    : null
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
  // Contador de estoque do item (historia 03): saldo zerado tira o item da oferta.
  controla_estoque: boolean
  quantidade_disponivel: number | null
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
    sql`select id, categoria_id, nome, preco_centavos, ativo, esgotado_ate, ordem,
               controla_estoque, quantidade_disponivel
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
