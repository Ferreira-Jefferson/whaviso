// Lista de mensagens de um fluxo. Itens com `chave` são EDITÁVEIS (ligam ao
// template unificado): viram link para o editor e mostram, por VERSÃO, o status
// vivo do template (ativa / aguardando aprovação / sem versão): uma chave com N
// versões mostra suas N pílulas, nunca resume para uma só (uma versão nova
// aprovada mas ainda não ativada não pode ficar invisível atrás do "Versão
// ativa" da anterior). Itens sem chave ainda não têm editor: mostram um estado
// honesto (em breve / depende da Meta / etc.). Linguagem das Regras de Ouro.
import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import type { Template } from '@/shared/contracts'
import { ESTADO_MENSAGEM, type MensagemItem } from '../catalogo_mensagens'
import { ROTULO_SITUACAO, situacaoTemplate } from '../situacao_template'

// Situação viva de UMA VERSÃO: 'ativo' (esta versão específica está no ar) é
// conceito de versão (ativo && aprovado); os demais espelham a situação real do
// template (situacao_template), para distinguir "não enviado à Meta" de "em
// análise", "aprovado (falta só ativar)" e "recusado" em vez de um rótulo genérico.
export type SituacaoChave = 'ativo' | 'aprovado' | 'em_analise' | 'rascunho' | 'rejeitado' | 'vazio'

const SITUACAO: Record<SituacaoChave, { rotulo: string; classe: string }> = {
  ativo: { rotulo: 'Versão ativa', classe: 'bg-salvia-claro text-folha' },
  // Aprovado na Meta mas ainda não ativado: mesma cor de "no ar" (folha), porém sem
  // preenchimento, para não parecer já ativo e ainda assim sinalizar que falta só
  // um clique do owner (Ativar esta versão).
  aprovado: { rotulo: 'Aprovado, falta ativar', classe: 'bg-papel-2 text-folha' },
  em_analise: { rotulo: ROTULO_SITUACAO.em_analise, classe: 'bg-ambar-claro text-ambar' },
  rejeitado: { rotulo: ROTULO_SITUACAO.rejeitado, classe: 'bg-papel-2 text-barro' },
  rascunho: { rotulo: ROTULO_SITUACAO.rascunho, classe: 'bg-papel-2 text-tinta-2' },
  vazio: { rotulo: 'Sem versão ainda', classe: 'bg-papel-2 text-tinta-2' },
}

/** Situação de uma versão específica (não da chave inteira): 'ativo' exige ativo E aprovado. */
function situacaoVersao(t: Pick<Template, 'ativo' | 'status_meta' | 'meta_submetido_em'>): SituacaoChave {
  if (t.ativo && t.status_meta === 'aprovado') return 'ativo'
  return situacaoTemplate(t)
}

export function ListaMensagens({
  mensagens,
  templates,
}: {
  mensagens: MensagemItem[]
  /** Todas as versões de todas as chaves, vindas da API; undefined enquanto carrega. */
  templates?: Template[]
}) {
  return (
    <ul className="flex flex-col">
      {mensagens.map((m) =>
        m.chave ? (
          <li key={m.nome}>
            <Link
              to={`/admin/mensagens/${m.chave}`}
              className="group flex items-center gap-4 border-b border-linha py-3 transition-colors first:pt-0 last:border-0 hover:text-salvia"
            >
              <Descricao m={m} />
              <PilhasVersoes chave={m.chave} templates={templates} />
              <ChevronRight
                strokeWidth={1.75}
                className="size-4 shrink-0 text-tinta-2 transition-transform group-hover:translate-x-0.5 group-hover:text-salvia"
                aria-hidden
              />
            </Link>
          </li>
        ) : (
          <li
            key={m.nome}
            className="flex items-center gap-4 border-b border-linha py-3 first:pt-0 last:border-0 last:pb-0"
          >
            <Descricao m={m} />
            <EstadoBadge item={m} />
          </li>
        ),
      )}
    </ul>
  )
}

function Descricao({ m }: { m: MensagemItem }) {
  // Rótulo de botão avulso (ex.: botao.solicitar_pix): o zap troca esse botão na hora do
  // envio, por isso ele tem linha própria. Os botões das mensagens normais são editados
  // dentro da própria mensagem (seção "Botões"), não aqui.
  const ehRotuloBotao = m.chave?.startsWith('botao.') ?? false
  return (
    <div className="min-w-0 flex-1">
      <p className="flex items-center gap-2 text-sm text-tinta group-hover:text-salvia">
        <span className="truncate">{m.nome}</span>
        {ehRotuloBotao && (
          <span className="inline-flex shrink-0 items-center rounded-pill bg-papel-2 px-2 py-0.5 text-[11px] font-medium text-tinta-2">
            Rótulo de botão
          </span>
        )}
      </p>
      <p className="truncate text-xs text-tinta-2">
        {m.destinatario} · {m.quando}
      </p>
    </div>
  )
}

// Status vivo de TODAS as versões de uma chave. Enquanto carrega (templates
// indefinido), não mostra nada (evita "piscar" um estado errado). Uma chave com N
// versões mostra N pílulas: uma aprovada-mas-não-ativada nunca fica escondida
// atrás da pílula "Versão ativa" de uma versão anterior.
function PilhasVersoes({ chave, templates }: { chave: string; templates?: Template[] }) {
  if (!templates) return null
  const versoes = templates.filter((t) => t.chave === chave).sort((a, b) => b.versao - a.versao)
  if (versoes.length === 0) {
    return <Pilha situacao="vazio" />
  }
  const maisDeUma = versoes.length > 1
  return (
    <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
      {versoes.map((t) => (
        <span key={t.id} className="inline-flex items-center gap-1">
          {maisDeUma && (
            <span className="text-[11px] text-tinta-2">
              {t.contexto === 'revisao' ? 'revisão · ' : ''}v{t.versao}
            </span>
          )}
          <Pilha situacao={situacaoVersao(t)} />
        </span>
      ))}
    </span>
  )
}

function Pilha({ situacao }: { situacao: SituacaoChave }) {
  const { rotulo, classe } = SITUACAO[situacao]
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-pill px-3 py-1 text-xs font-medium ${classe}`}
    >
      {rotulo}
    </span>
  )
}

function EstadoBadge({ item }: { item: MensagemItem }) {
  const { rotulo, classe } = ESTADO_MENSAGEM[item.estado]
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-pill px-3 py-1 text-xs font-medium ${classe}`}
    >
      {rotulo}
    </span>
  )
}
