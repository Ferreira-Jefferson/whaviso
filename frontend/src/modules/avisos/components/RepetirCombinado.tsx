// "Repetir este combinado" (E6 H6.10): controle RECOLHIDO por padrão, revelação
// progressiva, design clean. Recorrência é FACILITADOR disponível em TODOS os planos
// (não gated, H11.5): um atalho para registrar vários avisos do mesmo cliente. Aberto,
// oferece duas abas: "Por período" e "Datas específicas".
//
// A aba "Por período" lê como FRASE ("Todo dia 10, por 3 meses"): o dia (mensal) ou o dia
// da semana (semanal) vem da Data combinada; só o número de vezes é digitado. É sempre
// intervalo 1 (todo mês ou toda semana) com fim por N ocorrências (H6.10): sem "a cada N",
// sem "até uma data" e sem frequência diária.
//
// A CADÊNCIA (quais D-2..D+1 saem) NÃO mora aqui: é propriedade do próprio combinado,
// não da repetição. Ver `CadenciaLembretes`, renderizado ao lado deste no formulário.
//
// SERVIDOR É A AUTORIDADE: o resumo "isto gera N avisos" e "consome N vagas" é só uma
// PRÉVIA local para orientar; a palavra final (saldo) é da api, tratada em NovoAviso
// (Banner + "Recarregar créditos"). O front NUNCA calcula a data de cada ocorrência para
// enviar: só conta, para exibir. As datas são expandidas no servidor.
//
// TETO do nº de repetições (`maxOcorrencias`): cada repetição reserva 1 crédito, então o
// limite espelha o saldo livre da conta (vem de NovoAviso). É só um guard de UX; sem ele
// cai no teto absoluto (LIMITE_ABSOLUTO). O servidor segue decidindo de fato (recusa com
// Banner saldo_insuficiente).
import { useEffect, useMemo, useState } from 'react'
import { Lock, Plus, Repeat, X } from 'lucide-react'
import { Button, DateInput, Field, Input, SegmentedControl } from '@/shared/ui'
import { dataPtBR } from '@/shared/format'
import type { RecorrenciaInput } from '@/shared/contracts'

type Aba = 'periodo' | 'avulsas'
type Freq = 'mensal' | 'semanal'

const OPCOES_ABA: ReadonlyArray<{ value: Aba; label: string }> = [
  { value: 'periodo', label: 'Por período' },
  { value: 'avulsas', label: 'Datas específicas' },
]

const OPCOES_FREQ: ReadonlyArray<{ value: Freq; label: string }> = [
  { value: 'mensal', label: 'Mês' },
  { value: 'semanal', label: 'Semana' },
]

// Dia da semana (0=domingo) -> nome + artigo com gênero certo ("Toda terça-feira",
// "Todo domingo"): as -feira são femininas; domingo/sábado, masculinos.
const DIAS_SEMANA: ReadonlyArray<{ nome: string; artigo: 'Todo' | 'Toda' }> = [
  { nome: 'domingo', artigo: 'Todo' },
  { nome: 'segunda-feira', artigo: 'Toda' },
  { nome: 'terça-feira', artigo: 'Toda' },
  { nome: 'quarta-feira', artigo: 'Toda' },
  { nome: 'quinta-feira', artigo: 'Toda' },
  { nome: 'sexta-feira', artigo: 'Toda' },
  { nome: 'sábado', artigo: 'Todo' },
]

const UNIDADE: Record<Freq, string> = { mensal: 'meses', semanal: 'semanas' }

// Mínimo de repetições (a 1ª é a Data combinada; repetir só faz sentido com 2+).
const MIN_OCORRENCIAS = 2
// Teto absoluto do nº de repetições, independente do plano: o input numérico nunca vira
// campo livre. Planos grandes (envios >> 60) continuam limitados aqui; o teto do plano
// (`maxOcorrencias`) só morde quando os envios disponíveis ficam abaixo deste valor.
const LIMITE_ABSOLUTO = 60

// Dia do mês (1..31) e dia da semana (0..6) a partir de 'YYYY-MM-DD', SEM `new Date(iso)`
// (que parseia em UTC e poderia escorregar um dia): montamos pelos componentes locais.
function partesData(iso: string): { dia: number; semana: number } | null {
  const [a, m, d] = iso.split('-').map(Number)
  if (!a || !m || !d) return null
  return { dia: d, semana: new Date(a, m - 1, d).getDay() }
}

// Dia seguinte a 'YYYY-MM-DD' (piso das datas extras: cada uma vem depois da anterior).
// new Date(a, m-1, d+1) normaliza a virada de mês/ano; sem `new Date(iso)` (UTC).
function diaSeguinte(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  if (!a || !m || !d) return iso
  const dt = new Date(a, m - 1, d + 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

interface RepetirCombinadoProps {
  /** Data combinada atual (YYYY-MM-DD ou ''). Âncora da 1ª ocorrência. */
  dataCombinada: string
  /**
   * Teto do nº de repetições = envios que a conta ainda pode ativar (1 por repetição).
   * undefined quando não há teto numérico do plano (ex.: free, que só salva na agenda):
   * cai no LIMITE_ABSOLUTO. O servidor é a autoridade final.
   */
  maxOcorrencias?: number
  /** Emite a recorrência sempre que muda (undefined = combinado simples). */
  onChange: (recorrencia: RecorrenciaInput | undefined) => void
}

export function RepetirCombinado({
  dataCombinada,
  maxOcorrencias,
  onChange,
}: RepetirCombinadoProps) {
  const [aberto, setAberto] = useState(false)
  const [aba, setAba] = useState<Aba>('periodo')

  // Só dá para repetir a partir de uma data: a Data combinada é a âncora da 1ª
  // ocorrência (a frase "Todo dia X" e a 1ª data avulsa saem dela). Sem data, o
  // controle não expande; se a data for limpa com ele aberto, recolhe sozinho.
  const podeRepetir = Boolean(dataCombinada)

  // Período: frequência + quantas vezes no total (inclui a 1ª; sempre intervalo 1).
  const [freq, setFreq] = useState<Freq>('mensal')
  const [ocorrencias, setOcorrencias] = useState(3)

  // Teto efetivo do nº de repetições: o limite do plano (envios disponíveis), preso entre
  // o mínimo (input sempre válido) e o absoluto. Sem teto do plano, vale o absoluto.
  const teto = Math.max(
    MIN_OCORRENCIAS,
    Math.min(LIMITE_ABSOLUTO, maxOcorrencias ?? LIMITE_ABSOLUTO),
  )
  // O saldo limita de fato quando os créditos livres ficam abaixo do teto absoluto.
  const limitadoPorSaldo = maxOcorrencias != null && maxOcorrencias < LIMITE_ABSOLUTO

  // Datas específicas (ADICIONAIS; a 1ª ocorrência é sempre a Data combinada).
  const [datasAvulsas, setDatasAvulsas] = useState<string[]>([])

  // Monta a recorrência efetiva conforme a aba e o estado (ou undefined se não repete).
  const recorrencia = useMemo<RecorrenciaInput | undefined>(() => {
    if (!aberto) return undefined
    if (aba === 'periodo') return { tipo: 'periodo', freq, ocorrencias }
    const datas = datasAvulsas.filter(Boolean)
    return datas.length > 0 ? { tipo: 'avulsas', datas } : undefined
  }, [aberto, aba, freq, ocorrencias, datasAvulsas])

  // Avisa o pai a cada mudança efetiva.
  useEffect(() => {
    onChange(recorrencia)
    // onChange é estável (definido com useCallback no pai); só reagimos ao valor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorrencia])

  // Sem Data combinada não há âncora: recolhe se a data for limpa com o controle aberto.
  useEffect(() => {
    if (!podeRepetir) setAberto(false)
  }, [podeRepetir])

  // Se o teto encolher (plano carregou / envios disponíveis caíram) abaixo do valor atual,
  // ajusta para não deixar o input acima do máximo permitido.
  useEffect(() => {
    setOcorrencias((n) => Math.min(n, teto))
  }, [teto])

  // Quantos avisos a regra gera (prévia local). Combinado simples = 1.
  const totalOcorrencias = useMemo(() => {
    if (!recorrencia) return 1
    if (recorrencia.tipo === 'avulsas') return 1 + recorrencia.datas.length
    return recorrencia.ocorrencias
  }, [recorrencia])

  // Prefixo da frase da aba "Por período". A ESTRUTURA é estável ("Todo dia X" / "Toda
  // terça-feira"): só o trecho que vem da Data combinada (o dia do mês, ou o dia da semana)
  // muda. Sem data ainda, mostra um "X" como espaço reservado (não troca a frase, para não
  // confundir). O servidor é a autoridade e expande as datas.
  const partes = dataCombinada ? partesData(dataCombinada) : null
  // O trecho dinâmico (dia do mês ou dia da semana) ganha destaque: salvia + maior, para
  // o olho ir direto ao que muda. O resto da frase fica no tom normal.
  const destaque = 'text-base font-semibold text-salvia'
  const placeholderDia = <span className="text-base text-tinta-2">X</span>
  const prefixoFrase =
    freq === 'mensal' ? (
      <>
        Todo dia{' '}
        {partes ? <strong className={destaque}>{partes.dia}</strong> : placeholderDia}
      </>
    ) : partes ? (
      <>
        {DIAS_SEMANA[partes.semana]!.artigo}{' '}
        <strong className={destaque}>{DIAS_SEMANA[partes.semana]!.nome}</strong>
      </>
    ) : (
      <>Toda {placeholderDia}</>
    )

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
      {/* Cabeçalho: liga/desliga o recurso (recolhido por padrão). Só expande com uma
          Data combinada escolhida (a âncora da 1ª ocorrência). */}
      <button
        type="button"
        onClick={() => podeRepetir && setAberto((v) => !v)}
        disabled={!podeRepetir}
        aria-expanded={aberto}
        className="flex w-full items-center justify-between gap-3 rounded-card px-4 py-3 text-left transition-colors hover:bg-papel-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
      >
        <span className="flex items-center gap-2.5">
          <Repeat strokeWidth={1.75} className="size-4 text-salvia" />
          <span className="text-sm font-medium text-tinta">Repetir este combinado</span>
        </span>
        <span className="text-xs text-tinta-2">
          {!podeRepetir
            ? 'Escolha a Data combinada primeiro'
            : aberto
              ? 'Recolher'
              : 'Para combinados que se repetem'}
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
              <Field label="Frequência">
                <SegmentedControl<Freq>
                  ariaLabel="Frequência"
                  value={freq}
                  onChange={setFreq}
                  options={OPCOES_FREQ}
                />
              </Field>

              {/* Frase: "<prefixo>, por [N] <unidade>". Só o número é digitado; o dia (mensal)
                  ou o dia da semana (semanal) vem da Data combinada. */}
              <div className="flex flex-col gap-1.5">
                {/* Tudo numa linha só: "<prefixo>, por [N] <unidade>". O Input do design
                    system é w-full, então constrange a largura por um wrapper fixo. */}
                <div className="flex items-center gap-2 text-sm text-tinta">
                  <span className="font-medium">{prefixoFrase},</span>
                  <span className="text-tinta-2">por</span>
                  <span className="inline-flex w-20 shrink-0">
                    <Input
                      type="number"
                      min={MIN_OCORRENCIAS}
                      max={teto}
                      value={ocorrencias}
                      onChange={(e) =>
                        setOcorrencias(
                          Math.max(
                            MIN_OCORRENCIAS,
                            Math.min(teto, Number(e.target.value) || MIN_OCORRENCIAS),
                          ),
                        )
                      }
                      aria-label="Quantas vezes no total (inclui a primeira)"
                      className="text-center"
                    />
                  </span>
                  <span className="shrink-0">{UNIDADE[freq]}</span>
                </div>
                <p className="text-[11px] text-tinta-2">Conta a primeira (a Data combinada).</p>
                {limitadoPorSaldo && (
                  <p className="text-[11px] text-tinta-2">
                    Cada repetição reserva 1 envio. Você tem {maxOcorrencias} no saldo
                    {maxOcorrencias === 1 ? '' : ''}.
                  </p>
                )}
                {!dataCombinada && (
                  <p className="text-[11px] text-tinta-2">
                    O dia exato vem da Data combinada (escolha acima).
                  </p>
                )}
                {freq === 'mensal' && partes && partes.dia >= 29 && (
                  <p className="text-[11px] text-tinta-2">
                    Meses sem o dia {partes.dia} usam o último dia do mês.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* 1ª repetição é SEMPRE a Data combinada: mostra o campo já preenchido e
                  travado (cadeado), sem precisar de texto explicando. As demais datas
                  são adicionadas abaixo. */}
              <div className="flex items-center gap-2">
                <DateInput
                  value={dataCombinada}
                  disabled
                  aria-label="Primeira repetição (a Data combinada)"
                  className="flex-1"
                />
                <span
                  title="A primeira repetição é a Data combinada"
                  className="flex shrink-0 items-center justify-center rounded-input border border-transparent p-2.5 text-tinta-2"
                >
                  <Lock strokeWidth={1.75} className="size-4" />
                </span>
              </div>
              {datasAvulsas.map((data, i) => {
                // Sequência crescente: cada data extra é DEPOIS da anterior. O piso é o
                // dia seguinte à última data preenchida antes desta (a 1ª extra parte da
                // Data combinada). O servidor segue sendo a autoridade ao expandir.
                const anterior =
                  datasAvulsas.slice(0, i).reverse().find(Boolean) ?? dataCombinada
                return (
                  <div key={i} className="flex items-center gap-2">
                    <DateInput
                      value={data}
                      min={diaSeguinte(anterior)}
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
                )
              })}
              <Button
                type="button"
                variante="secondary"
                onClick={adicionarData}
                disabled={datasAvulsas.length >= teto - 1}
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
