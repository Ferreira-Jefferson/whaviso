// /admin/creditos: GESTÃO da CURVA de créditos pelo owner (H11.11). Edita a tabela de
// MARCOS (envios -> R$/envio), a cortesia inicial do Free e os tetos de agenda (free / após
// a 1a compra); aplica em runtime (a tela de Créditos do usuário lê o catálogo na hora). A
// faixa do slider (mínimo/máximo de envios) deriva do primeiro/último marco. A validação
// final é do servidor (PATCH /v1/admin/creditos-catalogo); aqui só montamos o formulário.
// Dinheiro em CENTAVOS via MoneyInput. Linguagem das Regras de Ouro: crédito, envio, saldo.
import { useState } from 'react'
import {
  Banner,
  Button,
  Card,
  ChavePixInput,
  EmptyState,
  Field,
  Input,
  MoneyInput,
  PageHeader,
  Skeleton,
} from '@/shared/ui'
import { ApiError } from '@/shared/api_client'
import { brl } from '@/shared/format'
import type { ConfigPlataforma, CreditosCatalogo, CurvaPonto, TipoChavePix } from '@/shared/contracts'
import {
  useCreditosCatalogo,
  useAtualizarCatalogo,
  useConfigPlataforma,
  useAtualizarConfigPlataforma,
  type AtualizarCatalogoBody,
} from '../api'

// Inteiro não-negativo. Emite number (default min em vazio).
function InteiroInput({
  value,
  onChange,
  min = 0,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
}) {
  return (
    <Input
      type="number"
      min={min}
      value={Number.isFinite(value) ? value : ''}
      onChange={(e) => {
        const raw = e.target.value
        const n = Math.trunc(Number(raw))
        onChange(raw === '' || !Number.isFinite(n) ? min : Math.max(min, n))
      }}
    />
  )
}

interface Form {
  curva: CurvaPonto[]
  cortesia_inicial: number
  agenda_teto_free: number
  agenda_teto_pago: number
}

function FormCatalogo({ catalogo }: { catalogo: CreditosCatalogo }) {
  const atualizar = useAtualizarCatalogo()
  const [form, setForm] = useState<Form>(() => ({
    curva: catalogo.curva.map((p) => ({ ...p })),
    cortesia_inicial: catalogo.cortesia_inicial,
    agenda_teto_free: catalogo.agenda_teto_free,
    agenda_teto_pago: catalogo.agenda_teto_pago,
  }))
  const [feedback, setFeedback] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => ({ ...f, [k]: v }))
    setFeedback(null)
  }

  function setPonto(i: number, patch: Partial<CurvaPonto>) {
    setForm((f) => ({ ...f, curva: f.curva.map((p, idx) => (idx === i ? { ...p, ...patch } : p)) }))
    setFeedback(null)
  }
  function adicionarMarco() {
    setForm((f) => {
      const ultimo = f.curva[f.curva.length - 1]
      return { ...f, curva: [...f.curva, { envios: (ultimo?.envios ?? 0) + 10, centavos: ultimo?.centavos ?? 0 }] }
    })
    setFeedback(null)
  }
  function removerMarco(i: number) {
    setForm((f) => ({ ...f, curva: f.curva.filter((_, idx) => idx !== i) }))
    setFeedback(null)
  }

  async function salvar() {
    setErro(null)
    setFeedback(null)
    // Ordena os marcos por quantidade antes de enviar (o backend exige envios crescentes).
    const curva = [...form.curva].sort((a, b) => a.envios - b.envios)
    const body: AtualizarCatalogoBody = {
      curva,
      cortesia_inicial: form.cortesia_inicial,
      agenda_teto_free: form.agenda_teto_free,
      agenda_teto_pago: form.agenda_teto_pago,
    }
    try {
      await atualizar.mutateAsync(body)
      setFeedback('Curva de créditos salva.')
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar a curva.')
    }
  }

  const marcosOrd = [...form.curva].sort((a, b) => a.envios - b.envios)
  const piso = marcosOrd[0]
  const topo = marcosOrd[marcosOrd.length - 1]

  return (
    <Card className="flex flex-col gap-4">
      {feedback && <Banner tom="sucesso">{feedback}</Banner>}
      {erro && <Banner tom="erro">{erro}</Banner>}

      <h2 className="text-lg text-salvia">Curva de preço (marcos)</h2>
      <p className="text-xs text-tinta-2">
        Cada marco define o R$/envio a partir daquela quantidade; entre marcos o preço é
        interpolado. A faixa do slider (mínimo e máximo de envios) vem do primeiro e do último
        marco. Ao menos 2 marcos.
      </p>
      <div className="flex flex-col gap-3">
        {form.curva.map((p, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
            <Field label="Envios (a partir de)">
              <InteiroInput value={p.envios} onChange={(v) => setPonto(i, { envios: v })} min={1} />
            </Field>
            <Field label="R$/envio">
              <MoneyInput value={p.centavos} onChange={(v) => setPonto(i, { centavos: v ?? 0 })} />
            </Field>
            <Button
              type="button"
              variante="ghost"
              onClick={() => removerMarco(i)}
              disabled={form.curva.length <= 2}
            >
              Remover
            </Button>
          </div>
        ))}
      </div>
      <div>
        <Button type="button" variante="secondary" onClick={adicionarMarco}>
          Adicionar marco
        </Button>
      </div>
      {piso && topo && (
        <p className="text-xs text-tinta-2">
          Faixa do slider: {piso.envios} a {topo.envios} envios. No menor volume:{' '}
          {brl(piso.centavos)} por envio. No maior: {brl(topo.centavos)} por envio (o R$/envio
          cai conforme o volume sobe).
        </p>
      )}

      <h2 className="mt-2 text-lg text-salvia">Cortesia e agenda</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Cortesia inicial (Free)" dica="Saldo grátis ao nascer a conta.">
          <InteiroInput value={form.cortesia_inicial} onChange={(v) => set('cortesia_inicial', v)} />
        </Field>
        <Field label="Agenda do Free" dica="Teto de anotações sem nenhuma compra.">
          <InteiroInput value={form.agenda_teto_free} onChange={(v) => set('agenda_teto_free', v)} />
        </Field>
        <Field label="Agenda após a 1a compra" dica="Teto de anotações depois de comprar créditos.">
          <InteiroInput value={form.agenda_teto_pago} onChange={(v) => set('agenda_teto_pago', v)} />
        </Field>
      </div>

      <div className="flex justify-end pt-1">
        <Button type="button" onClick={salvar} loading={atualizar.isPending}>
          Salvar curva
        </Button>
      </div>
    </Card>
  )
}

// Chave Pix DA PLATAFORMA (H11.10): a que vai na mensagem de compra enviada ao WhatsApp de
// quem recarrega. Mesmo formato da chave do cobrador (tipo/chave/titular/banco) + comentário.
// Reusa o ChavePixInput. String vazia salva como null (limpa o campo).
function FormPixPlataforma({ config }: { config: ConfigPlataforma }) {
  const atualizar = useAtualizarConfigPlataforma()
  const [tipo, setTipo] = useState<TipoChavePix | ''>(config.pix_tipo ?? '')
  const [chave, setChave] = useState(config.pix_chave ?? '')
  const [titular, setTitular] = useState(config.pix_titular ?? '')
  const [banco, setBanco] = useState(config.pix_banco ?? '')
  const [comentario, setComentario] = useState(config.pix_comentario ?? '')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const tocar = () => setFeedback(null)

  async function salvar() {
    setErro(null)
    setFeedback(null)
    const limpar = (s: string) => (s.trim() === '' ? null : s.trim())
    try {
      await atualizar.mutateAsync({
        pix_tipo: tipo === '' ? null : tipo,
        pix_chave: limpar(chave),
        pix_titular: limpar(titular),
        pix_banco: limpar(banco),
        pix_comentario: limpar(comentario),
      })
      setFeedback('Chave Pix de recebimento salva.')
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar a chave Pix.')
    }
  }

  return (
    <Card className="mt-6 flex flex-col gap-4">
      {feedback && <Banner tom="sucesso">{feedback}</Banner>}
      {erro && <Banner tom="erro">{erro}</Banner>}

      <h2 className="text-lg text-salvia">Chave Pix de recebimento</h2>
      <p className="text-xs text-tinta-2">
        A chave que vai na mensagem de compra de crédito enviada ao WhatsApp de quem recarrega.
        Sem chave preenchida, a recarga não é enviada.
      </p>

      <ChavePixInput
        tipo={tipo}
        onTipoChange={(t) => {
          setTipo(t)
          tocar()
        }}
        chave={chave}
        onChaveChange={(v) => {
          setChave(v)
          tocar()
        }}
        rotuloChave="Chave Pix"
        orientacao="linha"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Titular da chave">
          <Input
            value={titular}
            placeholder="Nome de quem recebe"
            onChange={(e) => {
              setTitular(e.target.value)
              tocar()
            }}
          />
        </Field>
        <Field label="Banco">
          <Input
            value={banco}
            placeholder="Banco da chave"
            onChange={(e) => {
              setBanco(e.target.value)
              tocar()
            }}
          />
        </Field>
      </div>

      <Field label="Comentário (opcional)" dica="Observação livre sobre o pagamento.">
        <Input
          value={comentario}
          placeholder="Ex.: confirmamos o pagamento em até 1 dia útil"
          onChange={(e) => {
            setComentario(e.target.value)
            tocar()
          }}
        />
      </Field>

      <div className="flex justify-end pt-1">
        <Button type="button" onClick={salvar} loading={atualizar.isPending}>
          Salvar chave Pix
        </Button>
      </div>
    </Card>
  )
}

function SecaoPixPlataforma() {
  const { data, isLoading, isError } = useConfigPlataforma()
  if (isLoading || !data) {
    return isError ? (
      <Banner tom="erro" className="mt-6">
        Não foi possível carregar a chave Pix de recebimento.
      </Banner>
    ) : (
      <Skeleton className="mt-6 h-80 w-full rounded-card" />
    )
  }
  return <FormPixPlataforma config={data} />
}

export default function CreditosAdminPage() {
  const { data, isLoading, isError } = useCreditosCatalogo()

  return (
    <div className="animate-rise">
      <PageHeader
        titulo="Créditos"
        descricao="Edite a curva de preço, a cortesia inicial, os tetos de agenda e a chave Pix de recebimento."
      />

      {isError ? (
        <EmptyState
          titulo="Não foi possível carregar a curva"
          descricao="Verifique sua conexão e tente novamente."
        />
      ) : isLoading || !data ? (
        <Skeleton className="h-96 w-full rounded-card" />
      ) : (
        <>
          <FormCatalogo catalogo={data} />
          <Banner tom="info" className="mt-6">
            A edição vale em runtime: a tela de Créditos do usuário passa a mostrar a nova
            curva na hora. O saldo já comprado por cada conta não muda.
          </Banner>
        </>
      )}

      <SecaoPixPlataforma />
    </div>
  )
}
