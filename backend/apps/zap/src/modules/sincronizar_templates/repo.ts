import type { Pool } from '@whaviso/shared/db'
import type { ConteudoTemplate } from '../../shared/meta_client/template_payload'

/** Uma versão de template reivindicada para submeter à Meta (meta_acao='criar'). */
export interface TemplateClaim {
  id: string
  nome_meta: string
  idioma: string
  categoria: string
  conteudo: ConteudoTemplate
  variaveis: string[]
  exemplos: Record<string, string>
  /** id na Meta (existe -> EDIT da versão; null -> CREATE). */
  meta_template_id: string | null
}

const LIMITE_CLAIM = 10

/**
 * Claim atômico das versões a submeter: zera `meta_acao` na própria reivindicação (sem um
 * estado 'processando' extra; a tabela é config de baixo volume). FOR UPDATE SKIP LOCKED
 * evita que dois ticks submetam a mesma versão. Em falha transitória, devolverParaSubmeter
 * recoloca meta_acao='criar'.
 */
export async function reivindicar(pool: Pool): Promise<TemplateClaim[]> {
  const { rows } = await pool.query<TemplateClaim>(
    `update public.templates set meta_acao=null
     where id in (
       select id from public.templates t
       where t.meta_acao='criar'
       order by t.criado_em
       limit ${LIMITE_CLAIM}
       for update skip locked
     )
     returning id, nome_meta, idioma, categoria, conteudo, variaveis, exemplos, meta_template_id`,
  )
  return rows
}

/** Submetido com sucesso: grava o id da Meta e o status inicial (geralmente pendente). */
export async function marcarSubmetido(
  pool: Pool,
  id: string,
  metaTemplateId: string | undefined,
  status: 'aprovado' | 'rejeitado' | 'pendente',
): Promise<void> {
  await pool.query(
    `update public.templates
       set meta_template_id=coalesce($2, meta_template_id), meta_submetido_em=now(),
           status_meta=$3::status_meta_template, meta_motivo=null
     where id=$1`,
    [id, metaTemplateId ?? null, status],
  )
}

/** A Meta recusou o create/edit (erro permanente): marca rejeitado com o motivo visível. */
export async function marcarRejeitado(pool: Pool, id: string, motivo: string): Promise<void> {
  await pool.query(
    `update public.templates
       set status_meta='rejeitado'::status_meta_template, meta_motivo=$2, meta_submetido_em=now()
     where id=$1`,
    [id, motivo],
  )
}

/** Falha transitória (rede/5xx): recoloca na fila para o próximo tick tentar de novo. */
export async function devolverParaSubmeter(pool: Pool, id: string): Promise<void> {
  await pool.query(`update public.templates set meta_acao='criar' where id=$1`, [id])
}

/** Atualiza o status_meta de uma versão por (nome_meta, idioma): webhook e reconcile. */
export async function atualizarStatusPorNome(
  pool: Pool,
  nomeMeta: string,
  idioma: string,
  status: 'aprovado' | 'rejeitado' | 'pendente',
  motivo: string | null,
): Promise<number> {
  const { rowCount } = await pool.query(
    `update public.templates
       set status_meta=$3::status_meta_template, meta_motivo=$4
     where nome_meta=$1 and idioma=$2`,
    [nomeMeta, idioma, status, motivo],
  )
  return rowCount ?? 0
}
