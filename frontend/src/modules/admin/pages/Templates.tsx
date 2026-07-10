// /admin/templates: todas as mensagens do produto, agrupadas por FLUXO, vindas da
// tabela unificada `templates` (GET /v1/admin/mensagens). A seção "Ciclo de
// lembretes" é a TRILHA editável (peça-assinatura): cada etapa (D-2 → D-1 → D →
// D+1) é um nó clicável que leva ao editor (/admin/mensagens/ciclo.<etapa>). As
// demais seções viram lista: editáveis (com status vivo + link) quando têm chave,
// ou catálogo com estado honesto quando ainda não há editor. O owner é o único que
// mexe em templates (risco nº 8). Linguagem das Regras de Ouro em toda string.
import { Card, EmptyState, PageHeader, Skeleton } from '@/shared/ui'
import { SECOES_MENSAGENS, type SecaoMensagens } from '../catalogo_mensagens'
import { useMensagens, type Template } from '../api'
import { CicloTemplates } from '../components/CicloTemplates'
import { ListaMensagens, type SituacaoChave } from '../components/ListaMensagens'
import { situacaoTemplate } from '../situacao_template'

export default function TemplatesPage() {
  const mensagens = useMensagens()
  const resumoPorChave = construirResumo(mensagens.data)

  return (
    <div className="animate-rise">
      <PageHeader
        titulo="Templates de mensagem"
        descricao="Tudo o que o whaviso envia por WhatsApp, agrupado por fluxo. Toque numa etapa do ciclo ou numa resposta para visualizar e configurar a mensagem. Você é a única pessoa que edita templates."
      />

      {/* Legenda: chave de cores dos nós/itens editáveis, logo abaixo do título
          (acessibilidade: a situação não depende só da cor). */}
      <Legenda />

      <div className="flex flex-col gap-10">
        {SECOES_MENSAGENS.map((secao) => (
          <Secao key={secao.id} secao={secao} mensagens={mensagens} resumoPorChave={resumoPorChave} />
        ))}
      </div>
    </div>
  )
}

// Situação viva de cada chave a partir dos templates unificados: 'ativo' (tem
// versão ativa E aprovada na Meta, de fato no ar) ou 'vazio' (sem versão). Sem
// versão no ar, resume as versões pela que MAIS pede atenção do owner:
// rejeitado (corrigir e reenviar) > em_analise (só esperar) > rascunho (enviar).
// Retorna undefined enquanto carrega, para a lista não piscar um estado errado.
function construirResumo(
  mensagens: Template[] | undefined,
): ((chave: string) => SituacaoChave | undefined) | undefined {
  if (!mensagens) return undefined
  const porChave = new Map<string, Template[]>()
  for (const t of mensagens) {
    const arr = porChave.get(t.chave) ?? []
    arr.push(t)
    porChave.set(t.chave, arr)
  }
  return (chave) => {
    const arr = porChave.get(chave)
    if (!arr || arr.length === 0) return 'vazio'
    // "No ar" (verde) exige a versão ativa E aprovada na Meta; enquanto a Meta não
    // aprova, o envio fica gated (E12), então a chave mostra o estado da proposta.
    if (arr.some((t) => t.ativo && t.status_meta === 'aprovado')) return 'ativo'
    const situacoes = new Set(arr.map(situacaoTemplate))
    if (situacoes.has('rejeitado')) return 'rejeitado'
    if (situacoes.has('em_analise')) return 'em_analise'
    return 'rascunho'
  }
}

function Secao({
  secao,
  mensagens,
  resumoPorChave,
}: {
  secao: SecaoMensagens
  mensagens: ReturnType<typeof useMensagens>
  resumoPorChave?: (chave: string) => SituacaoChave | undefined
}) {
  const headingId = `secao-${secao.id}`
  return (
    <section aria-labelledby={headingId}>
      <TituloSecao id={headingId} titulo={secao.titulo} descricao={secao.descricao} />
      {secao.variante === 'ciclo' ? (
        <CicloEditavel mensagens={mensagens} />
      ) : (
        <Card>
          <ListaMensagens mensagens={secao.mensagens} resumoPorChave={resumoPorChave} />
        </Card>
      )}
    </section>
  )
}

// Seção do ciclo: trilha editável vinda da API (com loading e erro). Filtra as
// mensagens unificadas para as chaves 'ciclo.*' (a trilha cuida do match por etapa).
function CicloEditavel({
  mensagens,
}: {
  mensagens: ReturnType<typeof useMensagens>
}) {
  const { data, isLoading, isError } = mensagens

  if (isError) {
    return (
      <EmptyState
        titulo="Não foi possível carregar os templates"
        descricao="Verifique sua conexão e tente novamente."
      />
    )
  }

  if (isLoading || !data) {
    return (
      <Card className="py-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 sm:flex-col sm:items-center sm:gap-3">
              <Skeleton className="size-16 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-28 rounded-input" />
            </div>
          ))}
        </div>
      </Card>
    )
  }

  return (
    <Card className="py-6">
      <CicloTemplates templates={data.filter((t) => t.chave.startsWith('ciclo.'))} />
    </Card>
  )
}

// Título de uma seção de templates (ciclo de lembretes, combinado, respostas...).
function TituloSecao({
  id,
  titulo,
  descricao,
}: {
  id: string
  titulo: string
  descricao: string
}) {
  return (
    <div className="mb-3">
      <h2 id={id} className="text-lg text-salvia sm:text-xl">
        {titulo}
      </h2>
      <p className="mt-0.5 text-sm text-tinta-2">{descricao}</p>
    </div>
  )
}

// Legenda das cores dos nós, em linha única e discreta. Fica no topo porque
// serve de chave para o status de qualquer template editável.
function Legenda() {
  return (
    <ul className="-mt-2 mb-7 flex flex-wrap gap-x-6 gap-y-2 text-xs text-tinta-2">
      <ItemLegenda cor="border-folha bg-salvia-claro" texto="Versão ativa no ar" />
      <ItemLegenda cor="border-ambar bg-ambar-claro" texto="Em análise na Meta" />
      <ItemLegenda cor="border-tinta-2 bg-papel-2" texto="Não enviado à Meta" />
      <ItemLegenda cor="border-barro bg-papel-2" texto="Recusado pela Meta" />
      <ItemLegenda cor="border-linha bg-papel-2" texto="Sem versão ainda" />
    </ul>
  )
}

function ItemLegenda({ cor, texto }: { cor: string; texto: string }) {
  return (
    <li className="inline-flex items-center gap-2">
      <span className={`size-3 shrink-0 rounded-full border-2 ${cor}`} aria-hidden />
      {texto}
    </li>
  )
}
