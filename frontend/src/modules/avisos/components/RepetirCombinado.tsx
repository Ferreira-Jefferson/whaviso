// "Repetir este combinado" (E6 H6.10): controle RECOLHIDO por padrão, revelação
// progressiva, design clean. Recorrência é FACILITADOR disponível em TODOS os planos
// (não gated, H11.5): um atalho para registrar vários avisos do mesmo cliente. Aberto,
// oferece duas abas: "Por período" e "Datas avulsas".
//
// A CADÊNCIA (quais D-2..D+1 saem) NÃO mora aqui: é propriedade do próprio combinado,
// não da repetição. Ver `CadenciaLembretes`, renderizado ao lado deste no formulário.
//
// SERVIDOR É A AUTORIDADE: o resumo "isto gera N avisos" e "consome N vagas" é só uma
// PRÉVIA local para orientar; a palavra final (limite de plano) é da api, tratada em
// NovoAviso (Banner + "Ver meu plano"). O front NUNCA calcula a data de cada ocorrência
// para enviar: só conta, para exibir. As datas são expandidas no servidor.
import { useEffect, useMemo, useState } from 'react'
import { Plus, Repeat, X } from 'lucide-react'
import {
  Button,
  DateInput,
  Field,
  Input,
  SegmentedControl,
  Select,
} from '@/shared/ui'
import { dataPtBR } from '@/shared/format'
import type { RecorrenciaInput } from '@/shared/contracts'

type Aba = 'periodo' | 'avulsas'
type Freq = 'mensal' | 'semanal' | 'diaria'

const OPCOES_ABA: ReadonlyArray<{ value: Aba; label: string }> = [
  { value: 'periodo', label: 'Por período' },
  { value: 'avulsas', label: 'Datas avulsas' },
]

const OPCOES_FREQ: ReadonlyArray<{ value: Freq; label: string }> = [
  { value: 'mensal', label: 'Por mês' },
  { value: 'semanal', label: 'Por semana' },
  { value: 'diaria', label: 'Por dia' },
]

type FimPor = 'ocorrencias' | 'ate'

interface RepetirCombinadoProps {
  /** Data combinada atual (YYYY-MM-DD ou ''). Âncora da 1ª ocorrência. */
  dataCombinada: string
  /** Emite a recorrência sempre que muda (undefined = combinado simples). */
  onChange: (recorrencia: RecorrenciaInput | undefined) => void
}

// Conta as ocorrências de um período por DATA LIMITE (só para a prévia local; o servidor
// recalcula a data real de cada ocorrência). Mensal mantém o dia (último do mês quando
// não existe, ex.: 31); semanal/diária somam dias corridos. Cap defensivo em 60.
function contarPorData(data: string, freq: Freq, intervalo: number, ate: string): number {
  if (!data || !ate || ate < data) return 0
  const partes = data.split('-').map(Number)
  const ay = partes[0]
  const am = partes[1]
  const ad = partes[2]
  if (ay == null || am == null || ad == null) return 0
  const limite = ate
  let total = 0
  for (let k = 0; k < 60; k++) {
    let y = ay
    let m = am
    let d = ad
    if (freq === 'mensal') {
      const totalMeses = (am - 1) + k * intervalo
      y = ay + Math.floor(totalMeses / 12)
      m = (totalMeses % 12) + 1
      const ultimoDia = new Date(y, m, 0).getDate()
      d = Math.min(ad, ultimoDia)
    } else {
      const dias = (freq === 'semanal' ? 7 : 1) * intervalo * k
      const base = new Date(ay, am - 1, ad)
      base.setDate(base.getDate() + dias)
      y = base.getFullYear()
      m = base.getMonth() + 1
      d = base.getDate()
    }
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (iso > limite) break
    total++
  }
  return total
}

// Unidade do intervalo conforme a frequência, com plural só quando faz sentido. Deixa o
// campo "A cada N <unidade>" auto-explicativo: é intervalo entre ocorrências, não pulo.
function unidadeIntervalo(freq: Freq, intervalo: number): string {
  const um = intervalo === 1
  if (freq === 'mensal') return um ? 'mês' : 'meses'
  if (freq === 'semanal') return um ? 'semana' : 'semanas'
  return um ? 'dia' : 'dias'
}

export function RepetirCombinado({ dataCombinada, onChange }: RepetirCombinadoProps) {
  const [aberto, setAberto] = useState(false)
  const [aba, setAba] = useState<Aba>('periodo')

  // Período.
  const [freq, setFreq] = useState<Freq>('mensal')
  const [intervalo, setIntervalo] = useState(1)
  const [fimPor, setFimPor] = useState<FimPor>('ocorrencias')
  const [ocorrencias, setOcorrencias] = useState(3)
  const [ate, setAte] = useState('')

  // Datas avulsas (ADICIONAIS; a 1ª ocorrência é sempre a Data combinada).
  const [datasAvulsas, setDatasAvulsas] = useState<string[]>([])

  // Monta a recorrência efetiva conforme a aba e o estado (ou undefined se não repete).
  const recorrencia = useMemo<RecorrenciaInput | undefined>(() => {
    if (!aberto) return undefined
    if (aba === 'periodo') {
      const base = { tipo: 'periodo' as const, freq, intervalo }
      return fimPor === 'ocorrencias'
        ? { ...base, ocorrencias }
        : ate
          ? { ...base, ate }
          : undefined // sem data limite ainda: incompleto, não envia recorrência
    }
    const datas = datasAvulsas.filter(Boolean)
    return datas.length > 0 ? { tipo: 'avulsas', datas } : undefined
  }, [aberto, aba, freq, intervalo, fimPor, ocorrencias, ate, datasAvulsas])

  // Avisa o pai a cada mudança efetiva.
  useEffect(() => {
    onChange(recorrencia)
    // onChange é estável (definido com useCallback no pai); só reagimos ao valor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorrencia])

  // Quantos avisos a regra gera (prévia local). Combinado simples = 1.
  const totalOcorrencias = useMemo(() => {
    if (!recorrencia) return 1
    if (recorrencia.tipo === 'avulsas') return 1 + recorrencia.datas.length
    if (recorrencia.ocorrencias != null) return recorrencia.ocorrencias
    if (recorrencia.ate != null) {
      return contarPorData(dataCombinada, recorrencia.freq, recorrencia.intervalo, recorrencia.ate)
    }
    return 1
  }, [recorrencia, dataCombinada])

  function adicionarData() {
    setDatasAvulsas((atual) => [...atual, ''])
  }
  function removerData(indice: number) {
    setDatasAvulsas((atual) => atual.filter((_, i) => i !== indice))
  }
  function mudarData(indice: number, valor: string) {
    setDatasAvulsas((atual) => atual.map((d, i) => (i === indice ? valor : d)))
  }

  return (
    <div className="rounded-card border border-linha bg-papel-2/40">
      {/* Cabeçalho: liga/desliga o recurso (recolhido por padrão). */}
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-center justify-between gap-3 rounded-card px-4 py-3 text-left transition-colors hover:bg-papel-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia"
      >
        <span className="flex items-center gap-2.5">
          <Repeat strokeWidth={1.75} className="size-4 text-salvia" />
          <span className="text-sm font-medium text-tinta">Repetir este combinado</span>
        </span>
        <span className="text-xs text-tinta-2">
          {aberto ? 'Recolher' : 'Para combinados que se repetem'}
        </span>
      </button>

      {aberto && (
        <div className="flex flex-col gap-5 border-t border-linha px-4 py-4">
          <p className="text-xs text-tinta-2">
            Um atalho para registrar de uma vez vários avisos do mesmo cliente. Cada repetição
            tem seu próprio ciclo de lembretes na data dela.
          </p>

          <SegmentedControl<Aba>
            ariaLabel="Como repetir"
            value={aba}
            onChange={setAba}
            options={OPCOES_ABA}
          />

          {aba === 'periodo' ? (
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Frequência">
                  <Select<Freq>
                    ariaLabel="Frequência"
                    value={freq}
                    onChange={setFreq}
                    options={OPCOES_FREQ}
                  />
                </Field>
                {/* Campo montado à mão (não via Field) para mostrar a unidade ao lado do
                    número: "A cada 2 meses" lê como intervalo, sem texto de exemplo. */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="campo-intervalo" className="text-sm font-medium text-tinta">
                    A cada
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="campo-intervalo"
                      type="number"
                      min={1}
                      max={12}
                      value={intervalo}
                      onChange={(e) => setIntervalo(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
                      className="w-20"
                    />
                    <span className="text-sm text-tinta-2">{unidadeIntervalo(freq, intervalo)}</span>
                  </div>
                </div>
              </div>

              <Field label="Terminar">
                <SegmentedControl<FimPor>
                  ariaLabel="Quando terminar a repetição"
                  value={fimPor}
                  onChange={setFimPor}
                  options={[
                    { value: 'ocorrencias', label: 'Após N vezes' },
                    { value: 'ate', label: 'Até uma data' },
                  ]}
                />
              </Field>

              {fimPor === 'ocorrencias' ? (
                <Field label="Quantas vezes no total" dica="Inclui a primeira (a Data combinada).">
                  <Input
                    type="number"
                    min={2}
                    max={60}
                    value={ocorrencias}
                    onChange={(e) => setOcorrencias(Math.max(2, Math.min(60, Number(e.target.value) || 2)))}
                  />
                </Field>
              ) : (
                <Field label="Repetir até" dica="A última repetição não passa desta data.">
                  <DateInput
                    value={ate}
                    min={dataCombinada || undefined}
                    onChange={(e) => setAte(e.target.value)}
                  />
                </Field>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-tinta-2">
                A primeira repetição é a Data combinada. Adicione as outras datas:
              </p>
              {datasAvulsas.length === 0 && (
                <p className="text-sm text-tinta-2">Nenhuma data extra ainda.</p>
              )}
              {datasAvulsas.map((data, i) => (
                <div key={i} className="flex items-center gap-2">
                  <DateInput
                    value={data}
                    min={dataCombinada || undefined}
                    onChange={(e) => mudarData(i, e.target.value)}
                    aria-label={`Data da repetição ${i + 2}`}
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => removerData(i)}
                    aria-label={`Remover data da repetição ${i + 2}`}
                    className="shrink-0 rounded-input border border-linha p-2.5 text-tinta-2 transition-colors hover:border-barro hover:text-barro focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
                  >
                    <X strokeWidth={1.75} className="size-4" />
                  </button>
                </div>
              ))}
              <Button
                type="button"
                variante="secondary"
                onClick={adicionarData}
                disabled={datasAvulsas.length >= 59}
                className="self-start"
              >
                <Plus strokeWidth={1.75} className="size-4" />
                Adicionar data
              </Button>
            </div>
          )}

          {/* Resumo AO VIVO: quantos avisos a regra gera e quantas vagas consome. A
              palavra final (limite) é do servidor (CTA em NovoAviso se estourar). */}
          <div className="rounded-input border border-salvia/20 bg-salvia-claro px-3 py-2.5 text-sm text-salvia">
            {totalOcorrencias > 1 ? (
              <p>
                Isto gera <strong>{totalOcorrencias} avisos</strong> e reserva{' '}
                <strong>{totalOcorrencias} vagas</strong> do seu plano (uma por repetição).
                {dataCombinada && (
                  <span className="mt-1 block text-xs text-salvia/80">
                    Começa em {dataPtBR(dataCombinada)}. As datas exatas são definidas ao salvar.
                  </span>
                )}
              </p>
            ) : (
              <p>
                Ainda sem repetições: isto gera <strong>1 aviso</strong>. Configure acima para
                repetir.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
