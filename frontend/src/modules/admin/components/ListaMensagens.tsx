// Lista de mensagens de um fluxo. Itens com `chave` são EDITÁVEIS (ligam ao
// template unificado): viram link para o editor e mostram o status vivo do
// template (ativa / aguardando aprovação / sem versão). Itens sem chave ainda
// não têm editor: mostram um estado honesto (em breve / depende da Meta / etc.).
// Linguagem das Regras de Ouro.
import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { ESTADO_MENSAGEM, type MensagemItem } from '../catalogo_mensagens'
import { ROTULO_SITUACAO } from '../situacao_template'

// Situação viva de uma CHAVE (resumo das versões): 'ativo' (tem versão no ar) e
// 'vazio' (sem versão) são conceitos da chave; os demais espelham a situação real
// do template (situacao_template), para a lista distinguir "não enviado à Meta" de
// "em análise", "aprovado (falta só ativar)" e "recusado" em vez do antigo rótulo
// genérico.
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

export function ListaMensagens({
  mensagens,
  resumoPorChave,
}: {
  mensagens: MensagemItem[]
  /** Situação viva de cada chave (vinda dos templates da API). */
  resumoPorChave?: (chave: string) => SituacaoChave | undefined
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
              <PilhaSituacao situacao={resumoPorChave?.(m.chave)} />
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

// Status vivo de uma mensagem editável. Enquanto carrega (situacao indefinida),
// não mostra pílula (evita "piscar" um estado errado).
function PilhaSituacao({ situacao }: { situacao?: SituacaoChave }) {
  if (!situacao) return null
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
