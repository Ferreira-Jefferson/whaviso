// /admin/creditos: GESTÃO da CURVA de créditos pelo owner (H11.11). Edita a faixa de
// compra (envios_min..envios_max), o preço (piso/topo), a cortesia inicial do Free e os
// tetos de agenda (free / após a 1a compra); aplica em runtime (a tela de Créditos do
// usuário lê o catálogo na hora). A validação final é do servidor (PATCH
// /v1/admin/creditos-catalogo); aqui só montamos o formulário. Dinheiro em CENTAVOS via
// MoneyInput. Linguagem das Regras de Ouro: crédito, envio, saldo, recarga.
import { useState } from 'react'
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  MoneyInput,
  PageHeader,
  Skeleton,
} from '@/shared/ui'
import { ApiError } from '@/shared/api_client'
import { brl } from '@/shared/format'
import type { CreditosCatalogo } from '@/shared/contracts'
import { useCreditosCatalogo, useAtualizarCatalogo, type AtualizarCatalogoBody } from '../api'

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
  envios_min: number
  envios_max: number
  preco_centavos: number
  preco_max_centavos: number
  cortesia_inicial: number
  agenda_teto_free: number
  agenda_teto_pago: number
}

function FormCatalogo({ catalogo }: { catalogo: CreditosCatalogo }) {
  const atualizar = useAtualizarCatalogo()
  const [form, setForm] = useState<Form>(() => ({ ...catalogo }))
  const [feedback, setFeedback] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => ({ ...f, [k]: v }))
    setFeedback(null)
  }

  async function salvar() {
    setErro(null)
    setFeedback(null)
    const body: AtualizarCatalogoBody = { ...form }
    try {
      await atualizar.mutateAsync(body)
      setFeedback('Curva de créditos salva.')
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar a curva.')
    }
  }

  const porEnvioPiso = form.envios_min > 0 ? brl(Math.round(form.preco_centavos / form.envios_min)) : null
  const porEnvioTopo = form.envios_max > 0 ? brl(Math.round(form.preco_max_centavos / form.envios_max)) : null

  return (
    <Card className="flex flex-col gap-4">
      {feedback && <Banner tom="sucesso">{feedback}</Banner>}
      {erro && <Banner tom="erro">{erro}</Banner>}

      <h2 className="text-lg text-salvia">Curva de preço</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Envios mínimos (piso da faixa)">
          <InteiroInput value={form.envios_min} onChange={(v) => set('envios_min', v)} min={1} />
        </Field>
        <Field label="Envios máximos (topo da faixa)">
          <InteiroInput value={form.envios_max} onChange={(v) => set('envios_max', v)} min={1} />
        </Field>
        <Field label="Preço no piso (menor volume)" dica="Total no menor volume." dicaComoIcone>
          <MoneyInput value={form.preco_centavos} onChange={(v) => set('preco_centavos', v ?? 0)} />
        </Field>
        <Field label="Preço no topo (maior volume)" dica="Total no maior volume." dicaComoIcone>
          <MoneyInput value={form.preco_max_centavos} onChange={(v) => set('preco_max_centavos', v ?? 0)} />
        </Field>
      </div>
      {porEnvioPiso && porEnvioTopo && (
        <p className="text-xs text-tinta-2">
          No piso: {porEnvioPiso} por envio. No topo: {porEnvioTopo} por envio (o R$/envio cai
          conforme o volume sobe).
        </p>
      )}

      <h2 className="mt-2 text-lg text-salvia">Cortesia e agenda</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Cortesia inicial (Free)" dica="Saldo grátis ao nascer a conta." dicaComoIcone>
          <InteiroInput value={form.cortesia_inicial} onChange={(v) => set('cortesia_inicial', v)} />
        </Field>
        <Field label="Agenda do Free" dica="Teto de anotações sem nenhuma compra." dicaComoIcone>
          <InteiroInput value={form.agenda_teto_free} onChange={(v) => set('agenda_teto_free', v)} />
        </Field>
        <Field label="Agenda após a 1a compra" dica="Teto de anotações depois de comprar créditos." dicaComoIcone>
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

export default function CreditosAdminPage() {
  const { data, isLoading, isError } = useCreditosCatalogo()

  return (
    <div className="animate-rise">
      <PageHeader
        titulo="Créditos"
        descricao="Edite a curva de preço, a cortesia inicial e os tetos de agenda."
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
    </div>
  )
}
