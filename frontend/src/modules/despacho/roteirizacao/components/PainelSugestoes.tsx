// Aba de sugestoes: o operador pede ao servidor para agrupar os pedidos prontos em corridas
// (tempo de preparo + proximidade), confere/ajusta e aceita cada uma. A sugestao NAO e
// persistida: vive neste estado e some ao sair da tela; so o aceite grava a corrida.
import { useState } from 'react'
import { MapPinOff, Route, Sparkles } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { formatarHora } from '@/shared/format'
import { Banner, Button, Card, EmptyState, Field, Input, cn, useToast } from '@/shared/ui'
import { useConfig, useGeocodificarPendentes, useMotoboysAtivos, useSugerir, type Sugestao } from '../api'
import { ROTULO_MOTIVO } from '../estados'
import { MapaDespacho } from '../mapa/MapaDespacho'
import { CorridaSugeridaCard } from './CorridaSugeridaCard'

export function PainelSugestoes() {
  const [disponiveis, setDisponiveis] = useState('')
  const [geocodificar, setGeocodificar] = useState(true)
  const [resultado, setResultado] = useState<Sugestao | null>(null)
  // Corridas ja aceitas na rodada atual (por ordem_saida); zera a cada nova sugestao.
  const [aceitas, setAceitas] = useState<ReadonlySet<number>>(new Set())
  const [erro, setErro] = useState<string | null>(null)
  // Corrida em destaque no mapa (sincroniza mapa <-> cartao). null = nenhuma.
  const [ativa, setAtiva] = useState<number | null>(null)

  const sugerir = useSugerir()
  const geocodificarPendentes = useGeocodificarPendentes()
  const motoboys = useMotoboysAtivos()
  const config = useConfig()
  const { mostrarToast } = useToast()

  function gerar() {
    setErro(null)
    const n = disponiveis.trim() === '' ? undefined : Number(disponiveis)
    if (n !== undefined && (!Number.isInteger(n) || n < 0 || n > 50)) {
      return setErro('Motoboys disponíveis: inteiro de 0 a 50, ou deixe vazio.')
    }
    sugerir.mutate(
      { motoboysDisponiveis: n, geocodificar },
      {
        onSuccess: (r) => {
          setResultado(r)
          setAceitas(new Set())
          setAtiva(null)
        },
        onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível gerar as sugestões.'),
      },
    )
  }

  function localizarPendentes() {
    setErro(null)
    geocodificarPendentes.mutate(undefined, {
      onSuccess: (r) => {
        mostrarToast(
          r.interrompido
            ? `Localizamos ${r.geocodificados} endereços. O mapa pediu uma pausa: tente de novo em instantes.`
            : `Localizamos ${r.geocodificados} de ${r.processados} endereços.`,
          { tom: r.falhas > 0 || r.interrompido ? 'info' : 'sucesso' },
        )
        gerar()
      },
      onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível localizar os endereços.'),
    })
  }

  const corridas = (resultado?.corridas ?? []).filter((c) => !aceitas.has(c.ordem_saida))
  const semLocalizacao = resultado?.sem_localizacao ?? []
  const temPendentes = semLocalizacao.some((s) => s.motivo === 'pendente' || s.motivo === 'geocode_falhou')

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <p className="text-sm text-tinta-2">
          Agrupa os pedidos de entrega prontos (ou quase) em corridas, pelo tempo de preparo e pela proximidade dos endereços.
          Nada é criado até você aceitar.
        </p>
        <form
          className="flex flex-col gap-4 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            gerar()
          }}
        >
          <div className="w-full sm:w-56">
            <Field label="Motoboys disponíveis (opcional)" dica="Corridas além desse número aparecem como 'sem motoboy livre'. Vazio = sem limite.">
              <Input value={disponiveis} onChange={(e) => setDisponiveis(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Sem limite" />
            </Field>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-tinta">
            <input
              type="checkbox"
              checked={geocodificar}
              onChange={(e) => setGeocodificar(e.target.checked)}
              className="size-5 accent-salvia"
            />
            Localizar endereços novos no mapa
          </label>
          <Button type="submit" loading={sugerir.isPending} className="sm:ml-auto">
            <Sparkles className="size-4" aria-hidden />
            Sugerir corridas
          </Button>
        </form>
        {erro && <Banner tom="erro">{erro}</Banner>}
      </Card>

      {resultado && (
        <>
          <div className="flex flex-col gap-2">
            <p className="text-xs text-tinta-2">Gerado às {formatarHora(resultado.gerado_em)}.</p>
            {resultado.estimado && (
              <Banner tom="info">
                O provedor de mapas não respondeu: tempos e distâncias foram estimados em linha reta.
              </Banner>
            )}
            {!resultado.origem_configurada && (
              <Banner tom="info">
                A loja ainda não tem origem configurada: usamos o centro das paradas como ponto de saída. Informe a
                localização da loja na aba Configuração para rotas mais fiéis.
              </Banner>
            )}
          </div>

          {resultado.corridas.length === 0 && semLocalizacao.length === 0 && (
            <EmptyState
              icone={<Sparkles className="size-7" aria-hidden />}
              titulo="Nenhum pedido para roteirizar"
              descricao="Não há pedidos de entrega prontos e sem motoboy agora."
            />
          )}

          {resultado.corridas.length > 0 && corridas.length === 0 && (
            <Banner tom="sucesso">Todas as corridas sugeridas foram aceitas. Acompanhe no Despacho.</Banner>
          )}

          {corridas.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-lg text-salvia">
                  <Route className="size-5" aria-hidden />
                  Corridas sugeridas
                </h2>
                <span className="text-sm text-tinta-2">
                  {corridas.length} {corridas.length === 1 ? 'corrida' : 'corridas'}
                </span>
              </div>
              <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                <div className="lg:sticky lg:top-4">
                  <MapaDespacho corridas={corridas} config={config.data} ativa={ativa} onAtiva={setAtiva} />
                </div>
                <ul className="flex flex-col gap-3">
                  {corridas.map((c) => (
                    <li
                      key={c.ordem_saida}
                      onMouseEnter={() => setAtiva(c.ordem_saida)}
                      onMouseLeave={() => setAtiva(null)}
                      onFocus={() => setAtiva(c.ordem_saida)}
                      onBlur={() => setAtiva(null)}
                      className={cn(
                        'rounded-card transition-shadow',
                        ativa === c.ordem_saida && 'shadow-[0_0_0_2px_var(--color-salvia)]',
                      )}
                    >
                      <CorridaSugeridaCard
                        sugestao={c}
                        motoboys={motoboys.data ?? []}
                        aoAceitar={() => setAceitas((atual) => new Set(atual).add(c.ordem_saida))}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {semLocalizacao.length > 0 && (
            <Card className="flex flex-col gap-3">
              <h2 className="flex items-center gap-2 text-lg text-salvia">
                <MapPinOff className="size-5" aria-hidden />
                Pedidos sem localização
              </h2>
              <p className="text-sm text-tinta-2">
                Estes pedidos ficaram fora das sugestões. Monte a corrida deles à mão no Despacho.
              </p>
              <ul className="flex flex-col divide-y divide-linha rounded-input border border-linha">
                {semLocalizacao.map((s) => (
                  <li key={s.pedido_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="font-medium text-tinta">Pedido {s.codigo}</span>
                    <span className="text-tinta-2">{ROTULO_MOTIVO[s.motivo]}</span>
                  </li>
                ))}
              </ul>
              {temPendentes && (
                <div>
                  <Button variante="secondary" loading={geocodificarPendentes.isPending || sugerir.isPending} onClick={localizarPendentes}>
                    Localizar endereços e sugerir de novo
                  </Button>
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  )
}
