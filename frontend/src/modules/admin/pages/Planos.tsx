// /admin/planos: GESTÃO do catálogo pelo owner (H11.11). Edita preço, limites e
// recursos de cada plano; aplica em runtime (a tela de planos do usuário e as
// alavancas efetivas leem a tabela na hora, ver billing). O owner NÃO cria nem
// apaga planos: as 4 chaves são estáveis (free/start/profissional/plus); só os
// valores mudam. A validação final é do servidor (PATCH /v1/admin/planos/:id);
// aqui só montamos o formulário. No Plus (por_envio) o preço é por VOLUME DE
// ENVIOS: edita-se o piso (preco_centavos, em envios_min) e o topo
// (preco_max_centavos, em envios_max); a capacidade/vagas escalam com os envios.
// Dinheiro em CENTAVOS via MoneyInput. Linguagem das Regras de Ouro.
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
import type { Plano } from '@/shared/contracts'
import { useAdminPlanos, useAtualizarPlano, type AtualizarPlanoBody } from '../api'
import { Indisponivel } from '../components/Indisponivel'

// Inteiro não-negativo (ou nulo, quando o campo aceita vazio). Emite number | null.
function InteiroInput({
  value,
  onChange,
  min = 0,
}: {
  value: number | null
  onChange: (v: number | null) => void
  min?: number
}) {
  return (
    <Input
      type="number"
      min={min}
      value={value ?? ''}
      onChange={(e) => {
        const raw = e.target.value
        if (raw === '') return onChange(null)
        const n = Math.trunc(Number(raw))
        onChange(Number.isFinite(n) ? Math.max(min, n) : null)
      }}
    />
  )
}

// Recursos liga/desliga do plano. Rótulos nas Regras de Ouro (sem termos proibidos).
const RECURSOS: { chave: keyof FormPlano & RecursoBool; rotulo: string }[] = [
  { chave: 'permite_recorrente', rotulo: 'Lembretes recorrentes' },
  { chave: 'cadencia_configuravel', rotulo: 'Cadência configurável' },
  { chave: 'menu_texto_livre', rotulo: 'Menu de texto livre' },
  { chave: 'informado_pago_habilitado', rotulo: 'Confirmação de pagamento' },
  { chave: 'totais_periodo', rotulo: 'Totais por período' },
  { chave: 'somente_leitura', rotulo: 'Somente leitura (não envia avisos)' },
]

type RecursoBool =
  | 'permite_recorrente'
  | 'cadencia_configuravel'
  | 'menu_texto_livre'
  | 'informado_pago_habilitado'
  | 'totais_periodo'
  | 'somente_leitura'

interface FormPlano {
  nome: string
  preco_centavos: number | null
  preco_max_centavos: number | null
  capacidade_agenda: number | null
  vagas_ativas: number | null
  envios_min: number | null
  envios_max: number | null
  reengajamento_max: number | null
  permite_recorrente: boolean
  cadencia_configuravel: boolean
  menu_texto_livre: boolean
  informado_pago_habilitado: boolean
  totais_periodo: boolean
  somente_leitura: boolean
}

function formDoPlano(p: Plano): FormPlano {
  return {
    nome: p.nome,
    preco_centavos: p.preco_centavos,
    preco_max_centavos: p.preco_max_centavos,
    capacidade_agenda: p.capacidade_agenda,
    vagas_ativas: p.vagas_ativas,
    envios_min: p.envios_min,
    envios_max: p.envios_max,
    reengajamento_max: p.reengajamento_max,
    permite_recorrente: p.permite_recorrente,
    cadencia_configuravel: p.cadencia_configuravel,
    menu_texto_livre: p.menu_texto_livre,
    informado_pago_habilitado: p.informado_pago_habilitado,
    totais_periodo: p.totais_periodo,
    somente_leitura: p.somente_leitura,
  }
}

function CartaoPlanoEditavel({ plano }: { plano: Plano }) {
  const atualizar = useAtualizarPlano()
  const [form, setForm] = useState<FormPlano>(() => formDoPlano(plano))
  const [feedback, setFeedback] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  function set<K extends keyof FormPlano>(k: K, v: FormPlano[K]) {
    setForm((f) => ({ ...f, [k]: v }))
    setFeedback(null)
  }

  async function salvar() {
    setErro(null)
    setFeedback(null)
    // Sempre enviamos preço, reengajamento e os recursos. Os campos de limite
    // dependem do tipo do plano: Plus usa a faixa de envios (capacidade/vagas
    // escalam); os demais usam capacidade de agenda + vagas de aviso ativo.
    const body: AtualizarPlanoBody = {
      nome: form.nome,
      preco_centavos: form.preco_centavos ?? 0,
      reengajamento_max: form.reengajamento_max ?? 0,
      permite_recorrente: form.permite_recorrente,
      cadencia_configuravel: form.cadencia_configuravel,
      menu_texto_livre: form.menu_texto_livre,
      informado_pago_habilitado: form.informado_pago_habilitado,
      totais_periodo: form.totais_periodo,
      somente_leitura: form.somente_leitura,
    }
    if (plano.por_envio) {
      body.preco_max_centavos = form.preco_max_centavos ?? form.preco_centavos ?? 0
      body.envios_min = form.envios_min ?? 1
      body.envios_max = form.envios_max ?? form.envios_min ?? 1
    } else {
      body.capacidade_agenda = form.capacidade_agenda ?? 0
      body.vagas_ativas = form.vagas_ativas
    }
    try {
      await atualizar.mutateAsync({ id: plano.id, body })
      setFeedback('Plano salvo.')
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar o plano.')
    }
  }

  // No Plus, dica do R$/envio no topo da faixa (interpolação é do backend).
  const porEnvioTopo =
    plano.por_envio && form.preco_max_centavos && form.envios_max
      ? brl(Math.round(form.preco_max_centavos / form.envios_max))
      : null

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg text-salvia">{plano.nome}</h2>
        <span className="rounded-pill bg-papel-2 px-2 py-0.5 text-xs text-tinta-2">{plano.id}</span>
      </div>

      {feedback && <Banner tom="sucesso">{feedback}</Banner>}
      {erro && <Banner tom="erro">{erro}</Banner>}

      <Field label="Nome de exibição">
        <Input value={form.nome} onChange={(e) => set('nome', e.target.value)} />
      </Field>

      {plano.por_envio ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Preço no piso (menor volume)" dica="Total por mês no menor volume (envios mínimos)." dicaComoIcone>
              <MoneyInput value={form.preco_centavos} onChange={(v) => set('preco_centavos', v)} />
            </Field>
            <Field label="Preço no topo (maior volume)" dica="Total por mês no maior volume (envios máximos)." dicaComoIcone>
              <MoneyInput
                value={form.preco_max_centavos}
                onChange={(v) => set('preco_max_centavos', v)}
              />
            </Field>
            <Field label="Envios mínimos (piso da faixa)">
              <InteiroInput value={form.envios_min} onChange={(v) => set('envios_min', v)} min={1} />
            </Field>
            <Field label="Envios máximos (topo da faixa)">
              <InteiroInput value={form.envios_max} onChange={(v) => set('envios_max', v)} min={1} />
            </Field>
          </div>
          {porEnvioTopo && (
            <p className="text-xs text-tinta-2">No topo da faixa: {porEnvioTopo} por envio.</p>
          )}
        </>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Preço mensal">
            <MoneyInput value={form.preco_centavos} onChange={(v) => set('preco_centavos', v)} />
          </Field>
          <Field label="Capacidade de agenda" dica="Anotações que a conta mantém na agenda (balde único)." dicaComoIcone>
            <InteiroInput
              value={form.capacidade_agenda}
              onChange={(v) => set('capacidade_agenda', v)}
            />
          </Field>
          <Field label="Vagas de aviso ativo" dica="Envios de aviso ativos ao mesmo tempo. Vazio = usa a capacidade da agenda." dicaComoIcone>
            <InteiroInput value={form.vagas_ativas} onChange={(v) => set('vagas_ativas', v)} />
          </Field>
          <Field label="Reengajamento máximo" dica="Envios manuais pós-ciclo por combinado." dicaComoIcone>
            <InteiroInput
              value={form.reengajamento_max}
              onChange={(v) => set('reengajamento_max', v)}
            />
          </Field>
        </div>
      )}

      {plano.por_envio && (
        <Field label="Reengajamento máximo" dica="Envios manuais pós-ciclo por combinado." dicaComoIcone>
          <InteiroInput
            value={form.reengajamento_max}
            onChange={(v) => set('reengajamento_max', v)}
          />
        </Field>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-tinta">Recursos</legend>
        {RECURSOS.map(({ chave, rotulo }) => (
          <label key={chave} className="flex items-center gap-2 text-sm text-tinta-2">
            <input
              type="checkbox"
              className="size-4 accent-salvia"
              checked={form[chave]}
              onChange={(e) => set(chave, e.target.checked)}
            />
            {rotulo}
          </label>
        ))}
      </fieldset>

      <div className="flex justify-end pt-1">
        <Button type="button" onClick={salvar} loading={atualizar.isPending}>
          Salvar plano
        </Button>
      </div>
    </Card>
  )
}

export default function PlanosAdminPage() {
  const { data, isLoading, isError } = useAdminPlanos()

  return (
    <div className="animate-rise">
      <PageHeader titulo="Planos" descricao="Edite preço, limites e recursos de cada plano." />

      {isError ? (
        <EmptyState
          titulo="Não foi possível carregar os planos"
          descricao="Verifique sua conexão e tente novamente."
        />
      ) : isLoading || !data ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-96 w-full rounded-card" />
          ))}
        </div>
      ) : data.indisponivel ? (
        <Indisponivel descricao="A api de planos (GET /v1/billing/planos) não respondeu. Verifique o backend e tente de novo." />
      ) : data.dados!.planos.length === 0 ? (
        <EmptyState titulo="Nenhum plano cadastrado" descricao="Cadastre planos no backend para que apareçam aqui." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {data.dados!.planos.map((p) => (
              <CartaoPlanoEditavel key={p.id} plano={p} />
            ))}
          </div>

          <Banner tom="info" className="mt-6">
            Editar cria uma nova versão do plano e vale só para novas contratações.
            Quem já assinou mantém o plano contratado (preço, limites e recursos) até a
            renovação.
          </Banner>
        </>
      )}
    </div>
  )
}
