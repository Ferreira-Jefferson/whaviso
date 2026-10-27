// Escrita do motor: SO via @whaviso/shared/db (sql parametrizado, SEC-080). Escreve apenas o que
// o grant do whaviso_atendente permite: mensagens (saida + marca processada), conversas (contexto
// e status), enderecos, pedidos/itens, envios (enfileira) e eventos (append-only, sem PII).
import { consultar, consultarUm, sql, type Executor } from '@whaviso/shared/db'
import type { EstadoFluxo } from './tipos'
import type { LinhaSnapshot } from './cardapio'

/** Marca a mensagem de entrada como processada (claim concluido). Idempotente. */
export async function marcarProcessada(tx: Executor, mensagemId: string): Promise<void> {
  await consultar(
    tx,
    sql`update public.mensagens set processada_em = now()
         where id = ${mensagemId} and processada_em is null`,
  )
}

export async function salvarContexto(tx: Executor, conversaId: string, estado: EstadoFluxo): Promise<void> {
  await consultar(
    tx,
    sql`update public.conversas set contexto = ${JSON.stringify(estado)}::jsonb where id = ${conversaId}`,
  )
}

export async function marcarHumano(tx: Executor, conversaId: string): Promise<void> {
  await consultar(
    tx,
    sql`update public.conversas set status = 'humano', humano_desde = now()
         where id = ${conversaId} and status = 'ia'`,
  )
}

export async function encerrarConversa(tx: Executor, conversaId: string): Promise<void> {
  await consultar(
    tx,
    sql`update public.conversas set status = 'encerrada' where id = ${conversaId} and status = 'ia'`,
  )
}

/** Insere uma mensagem de SAIDA (autor ia) no log da conversa. */
export async function inserirMensagemSaida(
  tx: Executor,
  m: { lojaId: string; conversaId: string; tipo: 'texto' | 'interativo'; conteudo: string },
): Promise<void> {
  await consultar(
    tx,
    sql`insert into public.mensagens (loja_id, conversa_id, direcao, autor, tipo, conteudo)
        values (${m.lojaId}, ${m.conversaId}, 'saida', 'ia', ${m.tipo}::tipo_mensagem, ${m.conteudo})`,
  )
}

/** Enfileira uma resposta na outbox `envios` (texto livre dentro da janela de 24h). Dedupe por chave. */
export async function enfileirarEnvio(
  tx: Executor,
  e: {
    lojaId: string
    numeroId: string
    clienteId: string
    destinatarioHash: string
    conversaId: string
    payload: unknown
    dedupeChave: string
  },
): Promise<void> {
  await consultar(
    tx,
    sql`insert into public.envios
          (loja_id, numero_whatsapp_id, cliente_id, destinatario_hash, template_chave, payload,
           conversa_id, dedupe_chave)
        values (${e.lojaId}, ${e.numeroId}, ${e.clienteId}, ${e.destinatarioHash}, null,
                ${JSON.stringify(e.payload)}::jsonb, ${e.conversaId}, ${e.dedupeChave})
        on conflict (numero_whatsapp_id, dedupe_chave) where dedupe_chave is not null do nothing`,
  )
}

export async function criarEndereco(
  tx: Executor,
  lojaId: string,
  clienteId: string,
  logradouro: string,
  bairro: string | null,
): Promise<string> {
  const linha = await consultarUm<{ id: string }>(
    tx,
    sql`insert into public.enderecos (loja_id, cliente_id, logradouro, bairro, ultimo_uso_em)
        values (${lojaId}, ${clienteId}, ${logradouro}, ${bairro}, now())
        returning id`,
  )
  if (!linha) throw new Error('insert de endereco sem retorno')
  return linha.id
}

export async function marcarUsoEndereco(tx: Executor, lojaId: string, enderecoId: string): Promise<void> {
  await consultar(
    tx,
    sql`update public.enderecos set ultimo_uso_em = now() where id = ${enderecoId} and loja_id = ${lojaId}`,
  )
}

/** Proximo codigo `AAMMDD-NNN` do dia (sequencia diaria por loja). Conflito = retry no chamador. */
export async function proximoCodigo(tx: Executor, lojaId: string, aammdd: string): Promise<string> {
  const r = await consultarUm<{ n: number }>(
    tx,
    sql`select coalesce(max(substring(codigo from 8)::int), 0) + 1 as n
          from public.pedidos
         where loja_id = ${lojaId} and codigo ~ ${`^${aammdd}-[0-9]+$`}`,
  )
  return `${aammdd}-${String(r?.n ?? 1).padStart(3, '0')}`
}

export interface PedidoNovo {
  lojaId: string
  clienteId: string
  conversaId: string
  numeroId: string
  enderecoId: string | null
  codigo: string
  subtotal: number
  taxa: number
  total: number
}
export async function inserirPedido(tx: Executor, p: PedidoNovo): Promise<string> {
  const r = await consultarUm<{ id: string }>(
    tx,
    sql`insert into public.pedidos
          (loja_id, cliente_id, conversa_id, numero_whatsapp_id, endereco_id, codigo, status, origem,
           modalidade, subtotal_centavos, taxa_entrega_centavos, total_centavos)
        values (${p.lojaId}, ${p.clienteId}, ${p.conversaId}, ${p.numeroId}, ${p.enderecoId}, ${p.codigo},
                'novo', 'whatsapp', 'entrega', ${p.subtotal}, ${p.taxa}, ${p.total})
        returning id`,
  )
  if (!r) throw new Error('insert de pedido sem retorno')
  return r.id
}

export async function inserirLinha(tx: Executor, lojaId: string, pedidoId: string, l: LinhaSnapshot): Promise<void> {
  const r = await consultarUm<{ id: string }>(
    tx,
    sql`insert into public.itens_pedido
          (pedido_id, loja_id, item_id, nome_snapshot, preco_unitario_centavos, quantidade, total_centavos, criado_em)
        values (${pedidoId}, ${lojaId}, ${l.item_id}, ${l.nome_snapshot}, ${l.preco_unitario_centavos},
                ${l.quantidade}, ${l.total_centavos}, clock_timestamp())
        returning id`,
  )
  if (!r) throw new Error('insert de item sem retorno')
  for (const o of l.opcoes) {
    await consultar(
      tx,
      sql`insert into public.itens_pedido_opcoes
            (item_pedido_id, loja_id, opcao_id, grupo_nome_snapshot, nome_snapshot, preco_centavos, criado_em)
          values (${r.id}, ${lojaId}, ${o.opcao_id}, ${o.grupo_nome_snapshot}, ${o.nome_snapshot},
                  ${o.preco_centavos}, clock_timestamp())`,
    )
  }
}

/** Evento de auditoria (append-only, sem PII): so ids e tipo. */
export async function registrarEvento(
  tx: Executor,
  e: { lojaId: string; tipo: string; entidade: string; entidadeId: string },
): Promise<void> {
  await consultar(
    tx,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${e.lojaId}, ${e.tipo}, ${e.entidade}, ${e.entidadeId}, 'ia', '{}'::jsonb)`,
  )
}
