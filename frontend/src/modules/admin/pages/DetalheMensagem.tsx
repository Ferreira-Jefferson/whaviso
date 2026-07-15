// /admin/mensagens/:chave: VIEWER + proposta de nova versão de uma mensagem do
// template unificado (tabela `templates`). Mesma maquinaria do ciclo:
// - O texto enviado é uma versão APROVADA; não há edição ao vivo do ativo, só se
//   PROPÕE uma nova versão (nasce 'pendente').
// - O PREVIEW vem do BACKEND (POST /v1/admin/mensagens/preview): o cliente nunca
//   renderiza o texto final (risco nº 8).
// - O LINT de linguagem roda no cliente ANTES de propor (e no backend também).
//
// Escopo atual (família resposta.*): editor de TEXTO + paleta de variáveis da
// chave. Botões e mídia já existem no modelo/transporte, mas o editor deles entra
// junto com as famílias que os usam (ciclo, combinado); aqui as respostas não têm.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { AlertTriangle, ArrowLeft, Bold, CheckCircle2, Copy, Italic, Loader2, Plus, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react'
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  SegmentedControl,
  Skeleton,
  WhatsAppPreview,
  type SegmentOption,
} from '@/shared/ui'
import { ApiError } from '@/shared/api_client'
import {
  lintLinguagem,
  type AcaoBotaoTemplate,
  type BotaoTemplate,
  type CategoriaTemplate,
  type ContextoTemplate,
  type Template,
} from '@/shared/contracts'
import {
  adminKeys,
  useSubmeterMensagem,
  useAtivarMensagem,
  useCriarMensagem,
  useApagarMensagem,
  useMensagens,
  usePreviewMensagem,
} from '../api'
import { StatusMetaBadge } from '../components/StatusMetaBadge'
import { situacaoTemplate } from '../situacao_template'
import { mensagemPorChave, metaFallback, type MensagemItem } from '../catalogo_mensagens'
import {
  CATALOGO_VARIAVEIS,
  exemplosPadrao,
  paraIndexado,
  paraNomeado,
  variaveisDoCorpo,
} from '../templates_catalogo'

export default function DetalheMensagemPage() {
  const { chave } = useParams()
  const { data, isLoading, isError } = useMensagens()

  if (isError) {
    return (
      <div className="animate-rise">
        <Voltar />
        <EmptyState titulo="Não foi possível carregar" descricao="Verifique sua conexão e tente novamente." />
      </div>
    )
  }

  if (isLoading || !data) {
    return (
      <div className="animate-rise flex flex-col gap-4">
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-48 w-full rounded-card" />
      </div>
    )
  }

  // Metadado do catálogo curado quando existe; senão, derivado da chave + versões do
  // banco, para que QUALQUER template (inclusive os fora do catálogo) seja editável.
  const meta = chave ? (mensagemPorChave(chave) ?? metaFallback(chave, data)) : undefined

  if (!chave || !meta) {
    return (
      <div className="animate-rise">
        <EmptyState
          titulo="Mensagem desconhecida"
          descricao="Esta mensagem não existe no catálogo de templates."
          acao={
            <Link to="/admin/templates" className="text-sm font-medium text-salvia hover:underline">
              Voltar para os templates
            </Link>
          }
        />
      </div>
    )
  }

  return <Conteudo chave={chave} meta={meta} mensagens={data} />
}

function Voltar() {
  return (
    <Link
      to="/admin/templates"
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-tinta-2 hover:text-salvia"
    >
      <ArrowLeft strokeWidth={1.75} className="size-4" />
      Voltar para os templates
    </Link>
  )
}

const OPCOES_CONTEXTO: SegmentOption<ContextoTemplate>[] = [
  { value: 'padrao', label: 'Padrão' },
  { value: 'revisao', label: 'Em revisão' },
]

// Categoria do template na Meta: UTILITY p/ avisos/notificações (quase tudo); AUTHENTICATION
// é o OTP (formato fixo, registrado à parte); MARKETING raramente. Default UTILITY.
const OPCOES_CATEGORIA: SegmentOption<CategoriaTemplate>[] = [
  { value: 'UTILITY', label: 'Utilidade' },
  { value: 'MARKETING', label: 'Marketing' },
]

function Conteudo({
  chave,
  meta,
  mensagens,
}: {
  chave: string
  meta: MensagemItem
  mensagens: Template[]
}) {
  // Mensagens com variante de revisão (o ciclo) ganham um alternador de contexto;
  // as demais editam só o 'padrao'.
  const [contexto, setContexto] = useState<ContextoTemplate>('padrao')
  const ctx = meta.temRevisao ? contexto : 'padrao'

  const daChave = mensagens
    .filter((t) => t.chave === chave && t.contexto === ctx)
    .sort((a, b) => b.versao - a.versao)
  // "No ar" = a versão ativa E aprovada na Meta (o dreno do zap é gated nos dois:
  // ativo + status_meta='aprovado'). Só há uma no ar por (chave, contexto) e ativar
  // exige aprovação (a api recusa ativar versão não aprovada, e ativar troca o ativo
  // anterior). Uma versão não aprovada nunca está no ar: aparece como "outra versão"
  // com seu estado real na Meta e o botão de submeter/ativar.
  const noAr = daChave.find((t) => t.ativo && t.status_meta === 'aprovado') ?? null
  const propostas = daChave.filter((t) => t.id !== noAr?.id)

  // Versão que semeia o editor: SÓ a que o owner escolheu em "Usar como base". Ao
  // abrir a tela o editor nasce VAZIO (base = null); clicar "Usar como base" em
  // qualquer versão (inclusive a que está no ar) preenche os campos. Trocar de base
  // OU de contexto reancora o seed (via `key` no editor). `baseId` é só uma
  // preferência de UI; a lista continua vindo do servidor.
  const [baseId, setBaseId] = useState<string | null>(null)
  const seed = noAr ?? daChave[0] ?? null
  const base = (baseId ? daChave.find((t) => t.id === baseId) : undefined) ?? null
  const temBase = base !== null

  return (
    <div className="animate-rise">
      <Voltar />
      <PageHeader
        titulo={meta.nome}
        descricao={`${meta.destinatario} · ${meta.quando}. Visualize a versão ativa e proponha uma nova.`}
        acoes={seed ? <StatusMetaBadge template={seed} /> : undefined}
      />

      {/* Rótulo de botão avulso: contextualiza por que ele tem cartão próprio e vai à Meta,
          diferente dos botões que já vivem dentro de uma mensagem (seção "Botões" dela). */}
      {chave.startsWith('botao.') && (
        <div className="mb-6">
          <Banner tom="info">
            Este é o rótulo de um botão, não uma mensagem. O whaviso troca este botão na hora do
            envio, por isso ele tem um cartão próprio aqui. Os botões das outras mensagens são
            editados dentro da própria mensagem, na seção “Botões”. Como toda mensagem, o texto só
            entra no ar depois de aprovado e ativado.
          </Banner>
        </div>
      )}

      {meta.temRevisao && (
        <div className="mb-6 flex flex-col gap-1.5">
          <SegmentedControl
            value={contexto}
            onChange={setContexto}
            options={OPCOES_CONTEXTO}
            ariaLabel="Variante da mensagem"
          />
          <p className="text-xs text-tinta-2">
            {contexto === 'revisao'
              ? 'Variante enviada quando a pessoa já tocou em “Já paguei” (aguardando você confirmar). Se não houver versão ativa aqui, o lembrete usa a versão padrão.'
              : 'Versão normal do lembrete, enviada enquanto o combinado está em aberto.'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <VersaoAtiva
            ativo={noAr}
            emUso={temBase && base?.id === noAr?.id}
            onUsarComoBase={() => noAr && setBaseId(noAr.id)}
          />
          <Propostas propostas={propostas} baseId={base?.id ?? null} onUsarComoBase={setBaseId} />
        </div>
        <NovaProposta
          // Remonta (reancorando o seed) quando o contexto muda OU quando a versão
          // BASE muda: o seed vem do useState inicial, que só lê no mount. Incluir a
          // identidade da base no key garante que escolher "Usar como base", ativar
          // uma versão, ou navegar para outro template (mesma rota :chave, mesmo ctx)
          // sempre reancore o editor na versão certa em vez de manter estado velho.
          key={`${ctx}:${base?.id ?? 'vazio'}`}
          chave={chave}
          contexto={ctx}
          meta={meta}
          sugestaoNomeMeta={base?.nome_meta}
          sugestaoBotoes={base?.conteudo.botoes}
          // Semeia o editor com a versão base (texto reconvertido para tokens
          // nomeados; categoria da Meta), para propor a partir dela em vez do zero.
          sugestaoTexto={base ? paraNomeado(base.conteudo.texto, base.variaveis) : undefined}
          sugestaoCategoria={base?.categoria}
          baseLabel={base ? `${base.nome_meta} · v${base.versao}` : undefined}
          temBase={temBase}
          onLimpar={() => setBaseId(null)}
        />
      </div>
    </div>
  )
}

// Ação "Usar como base": carrega esta versão no editor "Propor nova versão" (para
// replicar com ajustes). Quando a versão já é a base atual, vira só um indicador.
function UsarComoBase({ emUso, onUsarComoBase }: { emUso: boolean; onUsarComoBase: () => void }) {
  if (emUso) {
    return (
      <span className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-salvia">
        <CheckCircle2 strokeWidth={1.75} className="size-4" />
        Em uso no editor
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onUsarComoBase}
      className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-salvia hover:underline"
    >
      <Copy strokeWidth={1.75} className="size-4" />
      Usar como base
    </button>
  )
}

// ---- Versão ativa: viewer + preview do BACKEND ----
function VersaoAtiva({
  ativo,
  emUso,
  onUsarComoBase,
}: {
  ativo: Template | null
  emUso: boolean
  onUsarComoBase: () => void
}) {
  const preview = usePreviewMensagem()
  const { mutate } = preview

  const texto = ativo?.conteudo.texto
  const variaveisKey = JSON.stringify(ativo?.variaveis ?? [])
  const botoes = (ativo?.conteudo.botoes ?? []).map((b) => b.rotulo)

  useEffect(() => {
    if (!texto) return
    const variaveis = JSON.parse(variaveisKey) as string[]
    mutate({ conteudo: { texto }, variaveis, valores: exemplosPadrao(variaveis) })
  }, [texto, variaveisKey, mutate])

  if (!ativo) {
    return (
      <Card>
        <h2 className="mb-2 text-lg text-salvia">Versão no ar</h2>
        <p className="text-sm text-tinta-2">
          Nenhuma versão está no ar nesta mensagem. O whaviso só envia depois que a Meta aprovar o
          template: submeta uma versão à Meta abaixo e ative-a quando for aprovada.
        </p>
      </Card>
    )
  }

  return (
    <Card className={`flex flex-col gap-4 ${emUso ? 'ring-1 ring-salvia' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg text-salvia">Versão no ar</h2>
        <span className="text-xs text-tinta-2">
          {ativo.nome_meta} · v{ativo.versao}
        </span>
      </div>

      {preview.isPending ? (
        <Skeleton className="h-32 w-full rounded-card" />
      ) : preview.data ? (
        <WhatsAppPreview texto={preview.data.render} botoes={botoes} />
      ) : (
        <Banner tom="info">Pré-visualização indisponível no momento.</Banner>
      )}

      <UsarComoBase emUso={emUso} onUsarComoBase={onUsarComoBase} />
    </Card>
  )
}

// ---- Propostas (versões não ativas) + aprovar/ativar/apagar ----
function Propostas({
  propostas,
  baseId,
  onUsarComoBase,
}: {
  propostas: Template[]
  baseId: string | null
  onUsarComoBase: (id: string) => void
}) {
  if (propostas.length === 0) return null
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-lg text-salvia">Outras versões</h2>
      <ul className="flex flex-col gap-4">
        {propostas.map((t) => (
          <LinhaProposta
            key={t.id}
            template={t}
            emUso={t.id === baseId}
            onUsarComoBase={() => onUsarComoBase(t.id)}
          />
        ))}
      </ul>
    </Card>
  )
}

function LinhaProposta({
  template,
  emUso,
  onUsarComoBase,
}: {
  template: Template
  emUso: boolean
  onUsarComoBase: () => void
}) {
  const qc = useQueryClient()
  const ativar = useAtivarMensagem()
  const submeter = useSubmeterMensagem()
  const apagar = useApagarMensagem()
  const [confirmando, setConfirmando] = useState(false)
  // Situação real (fonte única): rascunho = nunca enviado; em_analise = já foi à Meta.
  const situacao = situacaoTemplate(template)
  const aprovado = situacao === 'aprovado'
  const rejeitado = situacao === 'rejeitado'
  const emAnalise = situacao === 'em_analise'

  // "Submeter à Meta" só ENFILEIRA (meta_acao='criar'); o zap submete no próximo ciclo do
  // scheduler (~30s) e só então grava meta_submetido_em -> a situação vira 'em_analise'.
  // Sem isto o badge fica "Não enviado à Meta" e parece que "nada aconteceu". Enquanto
  // aguardamos, mostramos "Enviando à Meta…" e re-consultamos a lista a cada 3s até o
  // status virar (o efeito para sozinho) ou 60s de teto (rede de segurança se o zap demorar).
  const [aguardandoEnvio, setAguardandoEnvio] = useState(false)
  const enviando = aguardandoEnvio && situacao === 'rascunho'
  useEffect(() => {
    if (!aguardandoEnvio) return
    if (situacao !== 'rascunho') {
      setAguardandoEnvio(false)
      return
    }
    const intervalo = setInterval(() => {
      void qc.invalidateQueries({ queryKey: adminKeys.mensagens })
    }, 3_000)
    const teto = setTimeout(() => setAguardandoEnvio(false), 60_000)
    return () => {
      clearInterval(intervalo)
      clearTimeout(teto)
    }
  }, [aguardandoEnvio, situacao, qc])

  return (
    <li
      className={`flex flex-col gap-2 border-b border-linha pb-4 last:border-0 last:pb-0 ${
        emUso ? 'rounded-input bg-salvia-claro/40 p-3 last:pb-3' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-tinta">
          {template.nome_meta} · v{template.versao}
        </span>
        <StatusMetaBadge template={template} />
      </div>
      <pre className="whitespace-pre-wrap break-words rounded-input bg-papel-2 p-3 text-xs text-tinta-2">
        {template.conteudo.texto}
      </pre>

      {/* A Meta recusou: mostra o motivo para o owner corrigir e reenviar. */}
      {rejeitado && template.meta_motivo && (
        <Banner tom="erro">
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle strokeWidth={1.75} className="size-4" />
            A Meta recusou este template: {template.meta_motivo}. Ajuste o texto e submeta de novo.
          </span>
        </Banner>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {aprovado ? (
          <Button variante="secondary" loading={ativar.isPending} onClick={() => ativar.mutate(template.id)}>
            <CheckCircle2 strokeWidth={1.75} className="size-4" />
            Ativar esta versão
          </Button>
        ) : emAnalise ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-tinta-2">
            <ShieldCheck strokeWidth={1.75} className="size-4" />
            Em análise na Meta
          </span>
        ) : enviando ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-tinta-2">
            <Loader2 strokeWidth={1.75} className="size-4 animate-spin" />
            Enviando à Meta…
          </span>
        ) : (
          <Button
            variante="secondary"
            loading={submeter.isPending}
            onClick={() =>
              submeter.mutate(template.id, { onSuccess: () => setAguardandoEnvio(true) })
            }
          >
            <ShieldCheck strokeWidth={1.75} className="size-4" />
            {rejeitado ? 'Submeter à Meta de novo' : 'Submeter à Meta'}
          </Button>
        )}

        {/* A versão marcada como ativa nunca pode ser apagada (a api recusa com 409
            template_ativo): só mostramos o apagar para versões não ativas. */}
        {template.ativo ? null : confirmando ? (
          <>
            <Button variante="destructive" loading={apagar.isPending} onClick={() => apagar.mutate(template.id)}>
              <Trash2 strokeWidth={1.75} className="size-4" />
              Confirmar exclusão
            </Button>
            <button
              type="button"
              className="text-sm text-tinta-2 hover:text-tinta"
              onClick={() => setConfirmando(false)}
            >
              Cancelar
            </button>
          </>
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-sm text-tinta-2 hover:text-barro"
            onClick={() => setConfirmando(true)}
          >
            <Trash2 strokeWidth={1.75} className="size-4" />
            Apagar versão
          </button>
        )}

        <span className="ml-auto">
          <UsarComoBase emUso={emUso} onUsarComoBase={onUsarComoBase} />
        </span>
      </div>

      {!aprovado && !emAnalise && !enviando && (
        <p className="text-xs text-tinta-2">
          Submeta a versão para a Meta validar. Quando ela aprovar, o status muda aqui e você poderá ativá-la.
        </p>
      )}
      {enviando && (
        <p className="text-xs text-tinta-2">
          Enfileirado. O envio à Meta acontece no próximo ciclo (poucos segundos) e o status muda para “Em análise” aqui, sem recarregar.
        </p>
      )}
      {emAnalise && (
        <p className="text-xs text-tinta-2">
          A Meta está analisando esta versão. O status atualiza sozinho quando ela responder (costuma levar de minutos a horas).
        </p>
      )}

      {(ativar.isError || submeter.isError || apagar.isError) && (
        <Banner tom="erro">
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle strokeWidth={1.75} className="size-4" />
            Não foi possível concluir. Tente novamente.
          </span>
        </Banner>
      )}
    </li>
  )
}

// Rótulos padrão por ação (ponto de partida no editor; o rótulo é editável).
// Cobre TODO o enum acaoBotaoTemplate (é um Record exaustivo): cada ação tratada pelo
// webhook do zap (ACOES_BOTAO) tem um default. Os textos seguem as Regras de Ouro.
const ROTULO_PADRAO: Record<AcaoBotaoTemplate, string> = {
  ja_paguei: 'Já paguei',
  ver_pix: 'Ver chave Pix',
  optout: 'Não quero mais lembretes',
  ativar: 'Ativar lembretes',
  aceite: 'Aceitar',
  recusa: 'Recusar combinado',
  // 3ª opção do aceite (E5): no combinado.resumo, "Algum dado está incorreto" (no invertido o
  // owner costuma trocar por "Chave Pix incorreta").
  dado_incorreto: 'Algum dado está incorreto',
  // Confirmação de pagamento (E8): quem recebe confirma ou nega o recebimento.
  confirmar: 'Confirmar pagamento',
  rejeitar: 'Ainda não recebi',
  // Cadastro de chave Pix pelo devedor (E14): pedido + wizard de chave.
  solicitar_pix: 'Pedir chave Pix',
  informar_pix: 'Informar chave',
  pix_pular: 'Agora não',
  pix_corrigir: 'Corrigir anterior',
  pix_confirma_tipo: 'Confirmar',
  pix_corrige_tipo: 'Corrigir tipo',
  pix_confirmar: 'Confirmar',
}

interface BotaoEditavel {
  acao: AcaoBotaoTemplate
  rotulo: string
  incluido: boolean
}

// ---- Nova proposta: editor de texto + paleta de variáveis + botões da chave ----
function NovaProposta({
  chave,
  contexto,
  meta,
  sugestaoNomeMeta,
  sugestaoBotoes,
  sugestaoTexto,
  sugestaoCategoria,
  baseLabel,
  temBase,
  onLimpar,
}: {
  chave: string
  contexto: ContextoTemplate
  meta: MensagemItem
  sugestaoNomeMeta?: string
  sugestaoBotoes?: BotaoTemplate[]
  sugestaoTexto?: string
  sugestaoCategoria?: CategoriaTemplate
  // Rótulo da versão que semeou o editor (ex.: "nome · v2"); undefined quando vazio.
  baseLabel?: string
  // Há uma versão carregada como base? Mostra o botão "Limpar" quando sim.
  temBase: boolean
  onLimpar: () => void
}) {
  // Default do nome: o da versão ativa do contexto, ou derivado da chave (a
  // variante de revisão recebe sufixo para não colidir com o nome do padrão).
  const nomePadrao =
    chave.replace(/\./g, '_') + (contexto === 'revisao' ? '_revisao' : '')
  const [nomeMeta, setNomeMeta] = useState(sugestaoNomeMeta ?? nomePadrao)
  // Texto e categoria nascem da versão ativa (se houver), para o owner propor a
  // partir dela; o componente remonta por contexto (key={ctx}), reancorando o seed.
  const [corpo, setCorpo] = useState(sugestaoTexto ?? '')
  const [categoria, setCategoria] = useState<CategoriaTemplate>(sugestaoCategoria ?? 'UTILITY')

  // Botões editáveis: as ações permitidas da chave (acao é código, rotulo editável).
  // Prefill a partir da versão ativa, se houver; senão usa os rótulos padrão.
  const [botoes, setBotoes] = useState<BotaoEditavel[]>(() =>
    (meta.acoes ?? []).map((acao) => {
      const sug = sugestaoBotoes?.find((b) => b.acao === acao)
      return {
        acao,
        rotulo: sug?.rotulo ?? ROTULO_PADRAO[acao],
        incluido: sugestaoBotoes ? Boolean(sug) : true,
      }
    }),
  )

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const caretAlvo = useRef<number | null>(null)

  const criar = useCriarMensagem()
  const preview = usePreviewMensagem()
  const { mutate: previewMutate, reset: previewReset } = preview

  // Variáveis disponíveis nesta chave (paleta). Vazio para a maioria das respostas.
  const variaveisPermitidas = useMemo(() => meta.variaveis ?? [], [meta.variaveis])
  const paleta = CATALOGO_VARIAVEIS.filter((v) => variaveisPermitidas.includes(v.chave))

  // Variáveis presentes no corpo, limitadas às permitidas da chave; corpo indexado.
  const variaveis = useMemo(
    () => variaveisDoCorpo(corpo).filter((c) => variaveisPermitidas.includes(c)),
    [corpo, variaveisPermitidas],
  )
  const corpoIndexado = useMemo(() => paraIndexado(corpo, variaveis), [corpo, variaveis])
  const valores = useMemo(() => exemplosPadrao(variaveis), [variaveis])

  // Botões incluídos -> conteudo.botoes; o conteúdo completo (texto + botões) é o
  // que vai ao preview/submit. Botão incluído sem rótulo invalida o envio.
  const botoesConteudo: BotaoTemplate[] = useMemo(
    () => botoes.filter((b) => b.incluido).map((b) => ({ acao: b.acao, rotulo: b.rotulo.trim() })),
    [botoes],
  )
  const conteudoAtual = useMemo(
    () => (botoesConteudo.length ? { texto: corpoIndexado, botoes: botoesConteudo } : { texto: corpoIndexado }),
    [corpoIndexado, botoesConteudo],
  )

  // Lint no cliente do texto E dos rótulos de botão (o backend também valida).
  const textoLint = [corpo, ...botoesConteudo.map((b) => b.rotulo)].join(' ')
  const palavraProibida = textoLint.trim() ? lintLinguagem(textoLint) : null
  const rotulosOk = botoesConteudo.every((b) => b.rotulo.length > 0)
  const podeEnviar =
    corpoIndexado.trim().length > 0 && nomeMeta.trim().length > 0 && rotulosOk && !palavraProibida

  useLayoutEffect(() => {
    const alvo = caretAlvo.current
    if (alvo == null) return
    caretAlvo.current = null
    const ta = textareaRef.current
    if (ta) {
      ta.focus()
      ta.setSelectionRange(alvo, alvo)
    }
  }, [corpo])

  // Pré-visualização AO VIVO (debounce): render vem sempre do backend. Inclui os
  // botões para o backend lintar os rótulos também.
  const variaveisKey = JSON.stringify(variaveis)
  const valoresKey = JSON.stringify(valores)
  const conteudoKey = JSON.stringify(conteudoAtual)
  useEffect(() => {
    if (!corpoIndexado.trim()) {
      previewReset()
      return
    }
    const id = setTimeout(() => {
      previewMutate({
        conteudo: JSON.parse(conteudoKey) as { texto: string; botoes?: BotaoTemplate[] },
        variaveis: JSON.parse(variaveisKey) as string[],
        valores: JSON.parse(valoresKey) as Record<string, string>,
      })
    }, 400)
    return () => clearTimeout(id)
  }, [corpoIndexado, conteudoKey, variaveisKey, valoresKey, previewMutate, previewReset])

  function inserirToken(token: string) {
    const trecho = `{{${token}}}`
    const ta = textareaRef.current
    if (!ta) {
      setCorpo((c) => c + trecho)
      return
    }
    const ini = ta.selectionStart ?? corpo.length
    const fim = ta.selectionEnd ?? corpo.length
    caretAlvo.current = ini + trecho.length
    setCorpo(corpo.slice(0, ini) + trecho + corpo.slice(fim))
  }

  // Envolve a seleção com o marcador do WhatsApp (* negrito, _ itálico). Sem
  // seleção, insere o par e deixa o caret no meio para o owner digitar dentro.
  function envolverSelecao(marcador: '*' | '_') {
    const ta = textareaRef.current
    if (!ta) {
      setCorpo((c) => c + marcador + marcador)
      return
    }
    const ini = ta.selectionStart ?? corpo.length
    const fim = ta.selectionEnd ?? corpo.length
    const selecao = corpo.slice(ini, fim)
    caretAlvo.current = selecao ? fim + 2 : ini + 1
    setCorpo(corpo.slice(0, ini) + marcador + selecao + marcador + corpo.slice(fim))
  }

  function enviar() {
    if (!podeEnviar) return
    criar.mutate(
      {
        chave,
        contexto,
        idioma: 'pt_BR',
        nome_meta: nomeMeta.trim(),
        conteudo: conteudoAtual,
        variaveis,
        categoria,
        // Amostras por variável p/ o `example` exigido pela Meta no create (mesmas usadas no preview).
        exemplos: valores,
      },
      {
        onSuccess: () => {
          // Volta ao seed da versão ativa (a proposta nova ainda não é o ativo).
          setCorpo(sugestaoTexto ?? '')
          previewReset()
        },
      },
    )
  }

  const erroLinguagemBackend =
    criar.error instanceof ApiError && criar.error.code === 'linguagem_proibida'

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg text-salvia">Propor nova versão</h2>
          {temBase && (
            <button
              type="button"
              onClick={onLimpar}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-salvia hover:underline"
            >
              <RotateCcw strokeWidth={1.75} className="size-4" />
              Limpar
            </button>
          )}
        </div>
        <p className="mt-1 text-sm text-tinta-2">
          A nova versão nasce aguardando aprovação. Escreva a mensagem
          {paleta.length > 0 ? ' e insira as variáveis pela paleta' : ''}: o exemplo abaixo atualiza ao vivo.
        </p>
        {baseLabel && (
          <p className="mt-1 text-xs text-tinta-2">
            Partindo de <span className="font-medium text-tinta">{baseLabel}</span>. Ajuste o que precisar e proponha.
          </p>
        )}
      </div>

      <Field label="Nome do template na Meta">
        <Input value={nomeMeta} onChange={(e) => setNomeMeta(e.target.value)} placeholder="ex.: resposta_ja_paguei" />
      </Field>

      <Field label="Categoria na Meta">
        <SegmentedControl
          value={categoria}
          onChange={setCategoria}
          options={OPCOES_CATEGORIA}
          ariaLabel="Categoria do template na Meta"
        />
      </Field>

      {/* Pré-visualização AO VIVO, ACIMA do editor (texto vem do backend; os
          botões refletem o editor abaixo). */}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-tinta">Pré-visualização</span>
        <WhatsAppPreview
          texto={preview.data?.render ?? ''}
          botoes={botoesConteudo.map((b) => b.rotulo)}
        >
          {preview.data && !preview.data.lint_ok && (
            <p className="text-xs text-barro">
              O backend também sinalizou linguagem não permitida nesta proposta.
            </p>
          )}
        </WhatsAppPreview>
      </div>

      <Field label="Texto da mensagem">
        <div className="flex flex-col gap-1.5">
          {/* Formatação do WhatsApp: envolve a seleção com * (negrito) ou _ (itálico).
              O preview acima mostra o resultado já formatado. */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => envolverSelecao('*')}
              title="Negrito (*texto*)"
              aria-label="Aplicar negrito"
              className="inline-flex items-center gap-1 rounded-pill border border-linha bg-papel-2 px-3 py-1 text-xs text-tinta hover:text-salvia"
            >
              <Bold strokeWidth={2} className="size-3.5" />
              Negrito
            </button>
            <button
              type="button"
              onClick={() => envolverSelecao('_')}
              title="Itálico (_texto_)"
              aria-label="Aplicar itálico"
              className="inline-flex items-center gap-1 rounded-pill border border-linha bg-papel-2 px-3 py-1 text-xs text-tinta hover:text-salvia"
            >
              <Italic strokeWidth={2} className="size-3.5" />
              Itálico
            </button>
          </div>
          <textarea
            ref={textareaRef}
            value={corpo}
            onChange={(e) => setCorpo(e.target.value)}
            rows={5}
            placeholder="Escreva a resposta enviada ao WhatsApp."
            aria-invalid={palavraProibida ? true : undefined}
            className="w-full rounded-input border border-linha bg-cartao px-3 py-2.5 font-mono text-sm text-tinta placeholder:text-tinta-2/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia aria-[invalid=true]:border-barro"
          />
        </div>
      </Field>

      {palavraProibida && (
        <Banner tom="erro">
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle strokeWidth={1.75} className="size-4" />
            O texto contém um termo não permitido pelas Regras de Ouro: “{palavraProibida}”. Reescreva como aviso,
            lembrete ou combinado antes de propor.
          </span>
        </Banner>
      )}

      {paleta.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {paleta.map((v) => (
            <button
              key={v.chave}
              type="button"
              onClick={() => inserirToken(v.token)}
              title={`Inserir {{${v.token}}} na mensagem`}
              className="inline-flex items-center rounded-pill border border-linha bg-papel-2 px-3 py-1 text-xs text-tinta hover:text-salvia"
            >
              {v.rotulo}
            </button>
          ))}
        </div>
      )}

      {/* Botões da mensagem: a AÇÃO é fixa (comportamento no código); o owner
          escolhe quais aparecem e edita o RÓTULO. */}
      {botoes.length > 0 && (
        <Field label="Botões">
          <ul className="flex flex-col gap-2">
            {botoes.map((b, i) => (
              <li key={b.acao} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={b.incluido}
                  aria-label={`Incluir o botão ${b.acao}`}
                  onChange={(e) =>
                    setBotoes((prev) =>
                      prev.map((x, j) => (j === i ? { ...x, incluido: e.target.checked } : x)),
                    )
                  }
                  className="size-4 shrink-0 accent-salvia"
                />
                <Input
                  value={b.rotulo}
                  disabled={!b.incluido}
                  aria-label={`Rótulo do botão ${b.acao}`}
                  onChange={(e) =>
                    setBotoes((prev) =>
                      prev.map((x, j) => (j === i ? { ...x, rotulo: e.target.value } : x)),
                    )
                  }
                  className="flex-1 disabled:opacity-50"
                />
              </li>
            ))}
          </ul>
        </Field>
      )}

      <Button onClick={enviar} loading={criar.isPending} disabled={!podeEnviar}>
        <Plus strokeWidth={1.75} className="size-4" />
        Propor versão
      </Button>

      {criar.isSuccess && (
        <Banner tom="sucesso">
          Versão proposta. Ela ficará aguardando aprovação antes de poder ser ativada.
        </Banner>
      )}

      {criar.isError && (
        <Banner tom="erro">
          {erroLinguagemBackend
            ? 'O texto contém um termo não permitido pelas Regras de Ouro. Reescreva e tente de novo.'
            : 'Não foi possível propor a versão. Tente novamente.'}
        </Banner>
      )}
    </Card>
  )
}
