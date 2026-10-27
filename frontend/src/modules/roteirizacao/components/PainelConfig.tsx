// Configuracao da roteirizacao da loja: tempo de preparo, tamanho e janela das corridas, origem
// (a loja) e velocidade media do fallback. Salvar exige dono/gerente (a api devolve 403 com
// mensagem). Valores validados de novo no servidor; aqui so o basico para nao enviar lixo.
import { useState } from 'react'
import { ApiError } from '@/shared/api_client'
import { Banner, Button, Card, ErrorState, Field, Input, Skeleton, useToast } from '@/shared/ui'
import { useConfig, useSalvarConfig, type Config } from '../api'

export function PainelConfig() {
  const config = useConfig()
  if (config.isPending) {
    return (
      <div aria-busy="true" aria-label="Carregando configuração" className="flex flex-col gap-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    )
  }
  if (config.isError) return <ErrorState aoTentarDeNovo={() => void config.refetch()} />
  return <Formulario key={JSON.stringify(config.data)} config={config.data} />
}

function numero(texto: string): number | null {
  const t = texto.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function Formulario({ config }: { config: Config }) {
  const [preparoBase, setPreparoBase] = useState(String(config.preparo_base_min))
  const [preparoItem, setPreparoItem] = useState(String(config.preparo_por_item_min))
  const [maxPedidos, setMaxPedidos] = useState(String(config.max_pedidos_corrida))
  const [janela, setJanela] = useState(String(config.janela_saida_min))
  const [desvio, setDesvio] = useState(String(config.desvio_max_min))
  const [lat, setLat] = useState(config.origem_lat == null ? '' : String(config.origem_lat))
  const [lng, setLng] = useState(config.origem_lng == null ? '' : String(config.origem_lng))
  const [volta, setVolta] = useState(config.volta_a_loja)
  const [velocidade, setVelocidade] = useState(String(config.velocidade_media_kmh))
  const [erro, setErro] = useState<string | null>(null)
  const salvar = useSalvarConfig()
  const { mostrarToast } = useToast()

  function enviar() {
    const pb = numero(preparoBase)
    const pi = numero(preparoItem)
    const mp = numero(maxPedidos)
    const jn = numero(janela)
    const dv = numero(desvio)
    const vl = numero(velocidade)
    const la = numero(lat)
    const lo = numero(lng)
    const inteiro = (n: number | null, min: number, max: number) => n != null && Number.isInteger(n) && n >= min && n <= max

    if (!inteiro(pb, 0, 120)) return setErro('Preparo base: inteiro de 0 a 120 minutos.')
    if (pi == null || pi < 0 || pi > 60) return setErro('Preparo por item: de 0 a 60 minutos.')
    if (!inteiro(mp, 1, 10)) return setErro('Máximo de pedidos por corrida: inteiro de 1 a 10.')
    if (!inteiro(jn, 0, 120)) return setErro('Janela de saída: inteiro de 0 a 120 minutos.')
    if (!inteiro(dv, 0, 120)) return setErro('Desvio máximo: inteiro de 0 a 120 minutos.')
    if (!inteiro(vl, 5, 120)) return setErro('Velocidade média: inteiro de 5 a 120 km/h.')
    if ((la == null) !== (lo == null)) return setErro('Informe latitude e longitude da origem juntas, ou deixe as duas vazias.')
    if (la != null && lo != null && (la < -90 || la > 90 || lo < -180 || lo > 180)) {
      return setErro('Latitude ou longitude da origem fora do intervalo válido.')
    }
    setErro(null)
    salvar.mutate(
      {
        preparo_base_min: pb!,
        preparo_por_item_min: pi,
        max_pedidos_corrida: mp!,
        janela_saida_min: jn!,
        desvio_max_min: dv!,
        origem_lat: la,
        origem_lng: lo,
        volta_a_loja: volta,
        velocidade_media_kmh: vl!,
      },
      {
        onSuccess: () => mostrarToast('Configuração salva.', { tom: 'sucesso' }),
        onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar a configuração.'),
      },
    )
  }

  const numerico = { inputMode: 'decimal' as const, autoComplete: 'off' }

  return (
    <Card>
      <form
        className="flex max-w-2xl flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          enviar()
        }}
      >
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-lg text-salvia">Preparo</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Preparo base (min)" dica="Tempo mínimo para qualquer pedido ficar pronto, contado a partir da criação.">
              <Input value={preparoBase} onChange={(e) => setPreparoBase(e.target.value)} {...numerico} />
            </Field>
            <Field label="Preparo por item (min)" dica="Minutos somados para cada item do pedido.">
              <Input value={preparoItem} onChange={(e) => setPreparoItem(e.target.value)} {...numerico} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-lg text-salvia">Corridas</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Máximo de pedidos" dica="Quantos pedidos cabem numa mesma corrida (1 a 10).">
              <Input value={maxPedidos} onChange={(e) => setMaxPedidos(e.target.value)} {...numerico} />
            </Field>
            <Field label="Janela de saída (min)" dica="Pedidos só entram na mesma corrida se ficarem prontos com até esta diferença.">
              <Input value={janela} onChange={(e) => setJanela(e.target.value)} {...numerico} />
            </Field>
            <Field label="Desvio máximo (min)" dica="Minutos extras de rota aceitos para encaixar mais um pedido na corrida.">
              <Input value={desvio} onChange={(e) => setDesvio(e.target.value)} {...numerico} />
            </Field>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-tinta">
            <input
              type="checkbox"
              checked={volta}
              onChange={(e) => setVolta(e.target.checked)}
              className="size-5 accent-salvia"
            />
            O motoboy volta para a loja ao fim da corrida
          </label>
        </fieldset>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-lg text-salvia">Origem e mapa</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Latitude da loja" dica="Ponto de saída das corridas. Sem origem, usamos o centro das paradas.">
              <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-23.5505" {...numerico} />
            </Field>
            <Field label="Longitude da loja">
              <Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-46.6333" {...numerico} />
            </Field>
            <Field label="Velocidade média (km/h)" dica="Usada só quando o provedor de mapas está fora do ar e a rota é estimada em linha reta.">
              <Input value={velocidade} onChange={(e) => setVelocidade(e.target.value)} {...numerico} />
            </Field>
          </div>
        </fieldset>

        {erro && <Banner tom="erro">{erro}</Banner>}

        <div>
          <Button type="submit" loading={salvar.isPending}>
            Salvar configuração
          </Button>
        </div>
      </form>
    </Card>
  )
}
