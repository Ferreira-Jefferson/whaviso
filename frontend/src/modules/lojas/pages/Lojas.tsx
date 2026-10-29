// Gestao das lojas da conta (multi-tenant): uma conta pode ter varias lojas. Lista as lojas,
// abre o editor da loja (perfil, entrega e horarios, em abas; ver FormularioLoja), permite tornar
// uma loja a ativa do painel e ativar/desativar (so o dono). Rota `/lojas`.
import { useMemo, useState } from 'react'
import { Plus, Store } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { useTenant } from '@/shared/tenant'
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Skeleton,
  cn,
  useToast,
} from '@/shared/ui'
import type { LojaSaida as Loja } from '@/shared/contracts/_generated/lojas'
import { useAlterarAtivo, useLojas } from '../api'
import { CardLoja } from '../components/CardLoja'
import { FormularioLoja } from '../components/FormularioLoja'

export default function Lojas() {
  const [incluirInativas, setIncluirInativas] = useState(false)
  const [form, setForm] = useState<{ loja: Loja | null } | null>(null)
  const [paraDesativar, setParaDesativar] = useState<Loja | null>(null)

  const { lojaAtiva, selecionarLoja } = useTenant()
  const { mostrarToast } = useToast()
  const consulta = useLojas(incluirInativas)
  const alterar = useAlterarAtivo()

  const lojas = useMemo(() => consulta.data ?? [], [consulta.data])
  // Sem conta: a api responde 403 (so o dono da conta lista/gere). A loja e liberada pela equipe.
  const semConta = consulta.error instanceof ApiError && consulta.error.status === 403
  const algumDono =lojas.some((l) => l.papel === 'dono')
  const total = lojas.length
  const abertas = lojas.filter((l) => l.aberta_agora === true).length
  const conectados = lojas.reduce((s, l) => s + l.numeros_whatsapp.conectados, 0)
  const ocupadoId = alterar.isPending ? (alterar.variables?.id ?? null) : null

  function alternarAtivo(loja: Loja) {
    if (loja.ativo) {
      setParaDesativar(loja)
      return
    }
    alterar.mutate(
      { id: loja.id, ativar: true },
      { onError: (e) => mostrarToast(e instanceof ApiError ? e.message : 'Não foi possível reativar a loja.', { tom: 'erro' }) },
    )
  }

  function confirmarDesativar() {
    const loja = paraDesativar
    if (!loja) return
    alterar.mutate(
      { id: loja.id, ativar: false },
      {
        onSuccess: () => setParaDesativar(null),
        onError: (e) => {
          setParaDesativar(null)
          mostrarToast(e instanceof ApiError ? e.message : 'Não foi possível desativar a loja.', { tom: 'erro' })
        },
      },
    )
  }

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-linha pb-4">
        <div>
          <h1 className="text-2xl text-salvia md:text-3xl">Lojas</h1>
          <p className="mt-1 text-sm text-tinta-2">Perfil, horários e área de entrega de cada loja da sua conta.</p>
        </div>
        <dl className="flex w-full justify-between gap-4 md:w-auto md:gap-6" aria-label="Resumo das lojas">
          <Numero valor={total} rotulo="Lojas" />
          <Numero valor={abertas} rotulo="Abertas" />
          <Numero valor={conectados} rotulo="Números" />
        </dl>
      </header>

      <div className="mb-4 mt-3.5 flex flex-wrap items-center justify-between gap-3">
        {algumDono ? (
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-tinta-2">
            <input
              type="checkbox"
              checked={incluirInativas}
              onChange={(e) => setIncluirInativas(e.target.checked)}
              className="size-4 accent-salvia"
            />
            Mostrar lojas inativas
          </label>
        ) : (
          <span />
        )}
        {algumDono && (
          <Button type="button" onClick={() => setForm({ loja: null })}>
            <Plus aria-hidden strokeWidth={1.75} className="size-4" />
            Nova loja
          </Button>
        )}
      </div>

      {consulta.isPending && <EsqueletoLista />}
      {consulta.isError && !semConta && (
        <ErrorState aoTentarDeNovo={() => void consulta.refetch()} className="mt-2" />
      )}

      {(semConta || (consulta.isSuccess && total === 0)) && (
        <EmptyState
          className="mt-2"
          icone={<Store className="size-7" aria-hidden />}
          titulo="Nenhuma loja por aqui"
          descricao="Sua loja é liberada pela equipe Whaviso."
        />
      )}

      {consulta.isSuccess && total > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {lojas.map((loja) => {
            const ativaNoShell = lojaAtiva?.id === loja.id
            return (
              <li key={loja.id} className="flex">
                <CardLoja
                  loja={loja}
                  ativaNoShell={ativaNoShell}
                  podeGerir={loja.papel !== 'atendente'}
                  ehDono={loja.papel === 'dono'}
                  alterandoAtivo={ocupadoId === loja.id}
                  onEditar={() => setForm({ loja })}
                  onUsar={loja.ativo && !ativaNoShell ? () => selecionarLoja(loja.id) : undefined}
                  onAlternarAtivo={() => alternarAtivo(loja)}
                />
              </li>
            )
          })}
        </ul>
      )}

      {form && <FormularioLoja key={form.loja?.id ?? 'nova'} loja={form.loja} onFechar={() => setForm(null)} />}

      <ConfirmDialog
        aberto={paraDesativar != null}
        titulo="Desativar esta loja?"
        variante="destructive"
        textoConfirmar="Desativar"
        carregando={alterar.isPending}
        onConfirmar={confirmarDesativar}
        onCancelar={() => setParaDesativar(null)}
      >
        A loja <strong className="text-tinta">{paraDesativar?.nome}</strong> deixa de aparecer no painel e para de
        receber pedidos. Nada é apagado: você pode reativar quando quiser.
      </ConfirmDialog>
    </div>
  )
}

function Numero({ valor, rotulo }: { valor: number; rotulo: string }) {
  return (
    <div className="grid md:text-right">
      <dd className="order-1 font-display text-[22px] font-semibold leading-tight tabular-nums">{valor}</dd>
      <dt className="order-2 text-xs font-bold uppercase tracking-[0.04em] text-tinta-2">{rotulo}</dt>
    </div>
  )
}

function EsqueletoLista() {
  return (
    <div aria-busy="true" aria-label="Carregando lojas" className="mt-2 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className={cn('flex flex-col gap-4 rounded-card border border-linha bg-cartao p-5')}>
          <div className="flex items-center gap-3">
            <Skeleton className="size-11 rounded-full" />
            <Skeleton className="h-5 w-1/2" />
          </div>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-9 w-28" />
        </div>
      ))}
    </div>
  )
}
