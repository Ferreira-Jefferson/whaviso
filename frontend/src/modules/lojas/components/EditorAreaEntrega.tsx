// Editor da area de entrega. Dois modos (contrato AreaEntrega): raio em km a partir de um
// ponto, ou lista de bairros atendidos. "Sem entrega" = loja so com retirada/balcao (nao envia area).
// No modo raio a area e desenhada no mapa (SeletorArea), sem digitar coordenada: o centro do mapa
// vem do endereco do formulario geocodificado. A montagem no formato do contrato e a validacao
// ficam no FormularioLoja.
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button, Field, Input, SegmentedControl, cn } from '@/shared/ui'
import { RAIO_KM_MAX } from '@/shared/contracts/_generated/lojas'
import {
  SeletorArea,
  useGeocodificarEndereco,
  kmParaMetros,
  metrosParaKm,
  type AreaGeo,
  type EnderecoParaGeocode,
  type PontoMapa,
} from '@/shared/mapa'
import type { AreaForm, ModoArea } from '../campos'

const OPCOES: { value: ModoArea; label: string }[] = [
  { value: 'nenhuma', label: 'Sem entrega' },
  { value: 'raio', label: 'Por raio' },
  { value: 'bairros', label: 'Por bairro' },
]

// Arredonda para no maximo `casas` casas decimais (evita strings gigantes de coordenada/km).
function arredondar(n: number, casas: number): number {
  const f = 10 ** casas
  return Math.round(n * f) / f
}

// Deriva a area do mapa (AreaGeo) do estado do formulario; null quando falta coordenada ou raio.
function formParaAreaGeo(valor: AreaForm): AreaGeo | null {
  if (valor.lat.trim() === '' || valor.lng.trim() === '' || valor.raioKm.trim() === '') return null
  const lat = Number(valor.lat)
  const lng = Number(valor.lng)
  const km = Number(valor.raioKm)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(km)) return null
  return { tipo: 'raio', centro: { lat, lng }, metros: kmParaMetros(km) }
}

export function EditorAreaEntrega({
  valor,
  onChange,
  endereco,
}: {
  valor: AreaForm
  onChange: (proximo: AreaForm) => void
  endereco?: EnderecoParaGeocode
}) {
  const [novoBairro, setNovoBairro] = useState('')
  const set = (parcial: Partial<AreaForm>) => onChange({ ...valor, ...parcial })

  // Centro do mapa (icone da loja): geocodifica o endereco DESTE formulario (pode nao ser a loja
  // ativa), com debounce. Degrada para null quando falta endereco ou o provedor esta indisponivel.
  const { geocodificar } = useGeocodificarEndereco()
  const [centro, setCentro] = useState<PontoMapa | null>(null)
  const logradouro = endereco?.logradouro?.trim() ?? ''
  const cidade = endereco?.cidade?.trim() ?? ''

  useEffect(() => {
    if (!logradouro || !cidade || !endereco) {
      setCentro(null)
      return
    }
    let cancelado = false
    const t = setTimeout(() => {
      void geocodificar(endereco).then((ponto) => {
        if (!cancelado) setCentro(ponto)
      })
    }, 600)
    return () => {
      cancelado = true
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    logradouro,
    cidade,
    endereco?.numero,
    endereco?.bairro,
    endereco?.uf,
    endereco?.cep,
    geocodificar,
  ])

  const areaGeo = formParaAreaGeo(valor)
  const aplicarArea = (v: AreaGeo) => {
    if (v.tipo !== 'raio') return
    set({
      raioKm: String(arredondar(metrosParaKm(v.metros), 2)),
      lat: String(arredondar(v.centro.lat, 6)),
      lng: String(arredondar(v.centro.lng, 6)),
    })
  }

  const adicionarBairro = () => {
    const b = novoBairro.trim()
    if (!b) return
    const existe = valor.bairros.some((x) => x.toLowerCase() === b.toLowerCase())
    if (!existe) set({ bairros: [...valor.bairros, b] })
    setNovoBairro('')
  }

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl ariaLabel="Área de entrega" value={valor.modo} onChange={(m) => set({ modo: m })} options={OPCOES} />

      {valor.modo === 'nenhuma' && (
        <p className="text-sm text-tinta-2">A loja não faz entrega: só retirada no balcão.</p>
      )}

      {valor.modo === 'raio' && (
        <div className="flex flex-col gap-2">
          <SeletorArea
            modo="raio"
            raioKmMax={RAIO_KM_MAX}
            valor={areaGeo}
            onChange={aplicarArea}
            centroLoja={centro}
          />
          <p className="text-sm text-tinta-2">
            Arraste o ponto da loja e a borda do círculo, ou digite os km.
          </p>
        </div>
      )}

      {valor.modo === 'bairros' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Field label="Adicionar bairro">
                <Input
                  value={novoBairro}
                  onChange={(e) => setNovoBairro(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      adicionarBairro()
                    }
                  }}
                  placeholder="Ex.: Centro"
                  maxLength={100}
                  autoComplete="off"
                />
              </Field>
            </div>
            <Button type="button" variante="secondary" onClick={adicionarBairro} disabled={!novoBairro.trim()}>
              Adicionar
            </Button>
          </div>

          {valor.bairros.length === 0 ? (
            <p className="text-sm text-tinta-2">Nenhum bairro ainda. Liste os bairros que a loja atende.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {valor.bairros.map((b) => (
                <li
                  key={b.toLowerCase()}
                  className={cn('inline-flex items-center gap-1 rounded-pill border border-linha bg-papel-2 py-1 pl-3 pr-1 text-sm text-tinta')}
                >
                  {b}
                  <button
                    type="button"
                    aria-label={`Remover ${b}`}
                    onClick={() => set({ bairros: valor.bairros.filter((x) => x !== b) })}
                    className="inline-flex size-6 items-center justify-center rounded-full text-tinta-2 transition-colors hover:bg-linha hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
                  >
                    <X strokeWidth={1.75} className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
