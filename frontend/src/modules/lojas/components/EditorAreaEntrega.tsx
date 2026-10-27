// Editor da area de entrega. Dois modos (contrato AreaEntrega): raio em km a partir de um
// ponto, ou lista de bairros atendidos. "Sem entrega" = loja so com retirada/balcao (nao envia area).
// A montagem no formato do contrato e a validacao ficam no FormularioLoja.
import { useState } from 'react'
import { X } from 'lucide-react'
import { Button, Field, Input, SegmentedControl, cn } from '@/shared/ui'
import { RAIO_KM_MAX } from '@/shared/contracts/_generated/lojas'
import type { AreaForm, ModoArea } from '../campos'

const OPCOES: { value: ModoArea; label: string }[] = [
  { value: 'nenhuma', label: 'Sem entrega' },
  { value: 'raio', label: 'Por raio' },
  { value: 'bairros', label: 'Por bairro' },
]

export function EditorAreaEntrega({
  valor,
  onChange,
}: {
  valor: AreaForm
  onChange: (proximo: AreaForm) => void
}) {
  const [novoBairro, setNovoBairro] = useState('')
  const set = (parcial: Partial<AreaForm>) => onChange({ ...valor, ...parcial })

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
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Raio (km)" dica={`Entre 0 e ${RAIO_KM_MAX} km a partir do ponto abaixo.`}>
            <Input
              value={valor.raioKm}
              onChange={(e) => set({ raioKm: e.target.value.replace(/[^\d.,]/g, '').replace(',', '.') })}
              placeholder="Ex.: 5"
              inputMode="decimal"
              autoComplete="off"
            />
          </Field>
          <Field label="Latitude" dica="Coordenada do ponto central (ex.: a loja).">
            <Input
              value={valor.lat}
              onChange={(e) => set({ lat: e.target.value.replace(/[^\d.,-]/g, '').replace(',', '.') })}
              placeholder="-23.5610"
              inputMode="decimal"
              autoComplete="off"
            />
          </Field>
          <Field label="Longitude">
            <Input
              value={valor.lng}
              onChange={(e) => set({ lng: e.target.value.replace(/[^\d.,-]/g, '').replace(',', '.') })}
              placeholder="-46.6560"
              inputMode="decimal"
              autoComplete="off"
            />
          </Field>
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
