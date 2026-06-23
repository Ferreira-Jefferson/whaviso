// Leitura e RENDER de templates unificados (tabela public.templates), compartilhado
// pelos módulos do zap. É a ponte entre o conteúdo estruturado guardado no banco e a
// MensagemWhats que o transporte envia: substitui {{1}}..{{n}}, monta os botões e
// repassa mídia. Não conhece regra de negócio (qual chave, com quais valores) nem o
// backend: isso é decisão de quem chama (scheduler/webhook). Sem strings fixas aqui.
import type { Pool } from '@whaviso/shared/db'
import { renderizarTexto } from '@whaviso/shared/contracts'
import type { BotaoZap, MensagemWhats, TipoMidia } from '../baileys_client'

export type ContextoTemplate = 'padrao' | 'revisao'

/** Conteúdo estruturado de um template (espelha o jsonb `conteudo` da tabela). */
export interface ConteudoTemplate {
  texto?: string
  botoes?: { acao: string; rotulo: string }[]
  midia?: { tipo: TipoMidia; url: string }
}

export interface TemplateAtivo {
  nome_meta: string
  idioma: string
  conteudo: ConteudoTemplate
  variaveis: string[]
}

/**
 * Lê o template ATIVO de uma chave. Se `contexto` for 'revisao' e houver variante
 * ativa, ela vence; senão cai no 'padrao' (assim nenhuma mensagem para por falta da
 * variante). Para chaves sem variante (ex.: resposta.*) basta o padrão.
 */
export async function carregarTemplateAtivo(
  pool: Pool,
  chave: string,
  contexto: ContextoTemplate = 'padrao',
): Promise<TemplateAtivo | null> {
  const { rows } = await pool.query<TemplateAtivo>(
    `select nome_meta, idioma, conteudo, variaveis
       from public.templates
      where chave = $1 and ativo
        and contexto in ('padrao'::template_contexto, $2::template_contexto)
      order by (contexto = $2::template_contexto) desc
      limit 1`,
    [chave, contexto],
  )
  return rows[0] ?? null
}

/**
 * Renderiza um template ATIVO numa MensagemWhats pronta para o transporte:
 *  - texto: substitui {{1}}..{{n}} pelos `valores` (na ordem de `variaveis`);
 *    posição sem valor vira string vazia, token fora de faixa fica intacto.
 *  - botoes: cada { acao, rotulo } vira id "acao:<refId>" (o payload que volta no
 *    inbound). Sem `refId`, os botões são omitidos (não há a quem amarrar a ação).
 *  - midia: repassada como está.
 */
export function renderMensagem(
  template: { conteudo: ConteudoTemplate; variaveis: string[] },
  para: string,
  opcoes: { valores?: Record<string, string>; refId?: string } = {},
): MensagemWhats {
  const valores = opcoes.valores ?? {}
  // Render compartilhado (mesma fonte do preview da api): valor ausente -> ''.
  const texto = renderizarTexto(template.conteudo.texto ?? '', template.variaveis, valores)

  const m: MensagemWhats = { para, texto }

  const botoes = template.conteudo.botoes
  if (botoes?.length && opcoes.refId) {
    m.botoes = botoes.map((b): BotaoZap => ({ id: `${b.acao}:${opcoes.refId}`, rotulo: b.rotulo }))
  }
  if (template.conteudo.midia) {
    m.midia = { tipo: template.conteudo.midia.tipo, url: template.conteudo.midia.url }
  }
  return m
}
