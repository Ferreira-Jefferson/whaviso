// Acesso a dados do modulo cardapio_importacao. Dono de `importacoes_cardapio` (fila + rascunho);
// le `credenciais_llm` SO o estado (ativo), nunca a chave (grant por coluna). Toda consulta filtra
// por loja_id (SEC-110). O binario (`arquivo_bytes`) so e escrito aqui (insert) e zerado; nunca e
// selecionado (a api nao tem grant de select nele). Nada de conteudo do arquivo vai a log.
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'

const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)

export interface ImportacaoLinha {
  id: string
  status: 'fila' | 'processando' | 'rascunho_pronto' | 'erro' | 'aprovada' | 'descartada'
  tipo_arquivo: 'imagem' | 'pdf'
  tamanho_bytes: number
  rascunho: unknown
  erro: string | null
  tentativas: number
  criado_em: string
  atualizado_em: string
}

const COLS = sql`id, status::text as status, tipo_arquivo::text as tipo_arquivo, tamanho_bytes, rascunho, erro,
  tentativas, ${TS('criado_em')} as criado_em, ${TS('atualizado_em')} as atualizado_em`

/** A loja tem credencial de LLM ativa? So o estado; a chave nao e lida aqui (SEC-020/024). */
export async function llmAtiva(exec: Executor, lojaId: string): Promise<boolean> {
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`select id from public.credenciais_llm where loja_id = ${lojaId} and ativo`,
  )
  return r != null
}

/** Job recente e ainda util do mesmo arquivo (evita duplo envio e custo de LLM em dobro). */
export async function recentePorHash(
  exec: Executor,
  lojaId: string,
  hash: string,
  janelaMinutos: number,
): Promise<ImportacaoLinha | null> {
  return consultarUm<ImportacaoLinha>(
    exec,
    sql`select ${COLS} from public.importacoes_cardapio
         where loja_id = ${lojaId} and arquivo_hash = ${hash}
           and status in ('fila', 'processando', 'rascunho_pronto')
           and criado_em > now() - make_interval(mins => ${janelaMinutos})
         order by criado_em desc limit 1`,
  )
}

export async function inserir(
  exec: Executor,
  d: {
    lojaId: string
    tipo: 'imagem' | 'pdf'
    mime: string
    bytes: Buffer
    hash: string
    userId: string
  },
): Promise<ImportacaoLinha> {
  const r = await consultarUm<ImportacaoLinha>(
    exec,
    sql`insert into public.importacoes_cardapio
          (loja_id, tipo_arquivo, mime, arquivo_bytes, arquivo_hash, tamanho_bytes, criado_por_user_id)
        values (${d.lojaId}, ${d.tipo}::tipo_arquivo_importacao, ${d.mime}, ${d.bytes}, ${d.hash},
                ${d.bytes.length}, ${d.userId})
        returning ${COLS}`,
  )
  return r!
}

export async function listar(exec: Executor, lojaId: string): Promise<ImportacaoLinha[]> {
  return consultar<ImportacaoLinha>(
    exec,
    sql`select ${COLS} from public.importacoes_cardapio
         where loja_id = ${lojaId}
         order by criado_em desc, id desc
         limit 50`,
  )
}

export async function obter(exec: Executor, lojaId: string, id: string): Promise<ImportacaoLinha | null> {
  return consultarUm<ImportacaoLinha>(
    exec,
    sql`select ${COLS} from public.importacoes_cardapio where loja_id = ${lojaId} and id = ${id}`,
  )
}

/** Trava a linha para editar/aprovar/descartar (evita aprovacao concorrente dupla). */
export async function travar(exec: Executor, lojaId: string, id: string): Promise<ImportacaoLinha | null> {
  return consultarUm<ImportacaoLinha>(
    exec,
    sql`select ${COLS} from public.importacoes_cardapio where loja_id = ${lojaId} and id = ${id} for update`,
  )
}

export async function gravarRascunho(exec: Executor, lojaId: string, id: string, rascunho: unknown): Promise<void> {
  await consultar(
    exec,
    sql`update public.importacoes_cardapio set rascunho = ${JSON.stringify(rascunho)}::jsonb
         where loja_id = ${lojaId} and id = ${id}`,
  )
}

/** Estado final: zera o arquivo bruto (retencao minima). */
export async function finalizar(
  exec: Executor,
  lojaId: string,
  id: string,
  status: 'aprovada' | 'descartada',
): Promise<void> {
  await consultar(
    exec,
    sql`update public.importacoes_cardapio
           set status = ${status}::status_importacao_cardapio, arquivo_bytes = null, processando_desde = null
         where loja_id = ${lojaId} and id = ${id}`,
  )
}

/**
 * Recupera jobs presos em `processando` alem do timeout (consumidor caiu): volta para `fila` com
 * +1 tentativa; ao atingir o maximo vira `erro` (codigo `tempo_esgotado`) e o arquivo e zerado.
 * Devolve quantos jobs foram tocados.
 */
export async function recuperarPresos(
  exec: Executor,
  lojaId: string,
  timeoutMinutos: number,
  maxTentativas: number,
): Promise<number> {
  // 1) esgotou as tentativas: erro sanitizado + arquivo zerado. (Duas instrucoes, e nao um CASE:
  //    a api nao tem SELECT em arquivo_bytes, entao nao pode referencia-lo numa expressao.)
  const esgotados = await consultar<{ id: string }>(
    exec,
    sql`update public.importacoes_cardapio
           set status = 'erro', tentativas = tentativas + 1, erro = 'tempo_esgotado',
               arquivo_bytes = null, processando_desde = null
         where loja_id = ${lojaId} and status = 'processando'
           and processando_desde < now() - make_interval(mins => ${timeoutMinutos})
           and tentativas + 1 >= ${maxTentativas}
        returning id`,
  )
  // 2) ainda tem tentativa: volta para a fila.
  const reenfileirados = await consultar<{ id: string }>(
    exec,
    sql`update public.importacoes_cardapio
           set status = 'fila', tentativas = tentativas + 1, processando_desde = null
         where loja_id = ${lojaId} and status = 'processando'
           and processando_desde < now() - make_interval(mins => ${timeoutMinutos})
           and tentativas + 1 < ${maxTentativas}
        returning id`,
  )
  return esgotados.length + reenfileirados.length
}

/** Auditoria append-only sem PII (tabela eventos): so ids e estado. */
export async function registrarEvento(
  exec: Executor,
  e: { lojaId: string; tipo: string; importacaoId: string; userId: string; detalhes?: Record<string, unknown> },
): Promise<void> {
  const detalhes = JSON.stringify({ user_id: e.userId, ...e.detalhes })
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${e.lojaId}, ${e.tipo}, 'importacao_cardapio', ${e.importacaoId}, 'loja', ${detalhes}::jsonb)`,
  )
}
