// Dialog de cadastro/edicao de uma zona de entrega. O tipo (bairro, polígono ou raio) so se
// escolhe na criacao; na edicao ele e fixo (a api nao troca o tipo). Valores em CENTAVOS
// (MoneyInput); pedido minimo e frete gratis vazios = sem regra (null).
import { useState } from 'react'
import { ApiError } from '@/shared/api_client'
import { Banner, Button, ConfirmDialog, Dialog, Field, Input, MoneyInput, SegmentedControl, useToast } from '@/shared/ui'
import type { ZonaNova, ZonaPatch } from '@/shared/contracts/_generated/zonas_entrega'
import { useAlternarZona, useAtualizarZona, useCriarZona, type Zona } from '../api'
import { DESCRICAO_TIPO, ROTULO_TIPO, lerDecimal, lerPoligono, poligonoParaTexto, type TipoZona } from '../estados'

interface Props {
  aberto: boolean
  /** null = zona nova; preenchido = edicao daquela zona. */
  zona: Zona | null
  aoFechar: () => void
}

const TIPOS: ReadonlyArray<{ value: TipoZona; label: string }> = (['bairro', 'raio', 'poligono'] as const).map(
  (t) => ({ value: t, label: ROTULO_TIPO[t] }),
)

export function ZonaDialog({ aberto, zona, aoFechar }: Props) {
  return (
    <Dialog aberto={aberto} onFechar={aoFechar} titulo={zona ? 'Editar zona' : 'Nova zona'} className="max-w-lg">
      {aberto && <Formulario key={zona?.id ?? 'nova'} zona={zona} aoFechar={aoFechar} />}
    </Dialog>
  )
}

function mensagem(e: unknown, padrao: string): string {
  return e instanceof ApiError ? e.message : padrao
}

type AreaLida =
  | { raio: { centro: { lat: number; lng: number }; metros: number } }
  | { poligono: { type: 'Polygon'; coordinates: [number, number][][] } }
  | { erro: string }

function Formulario({ zona, aoFechar }: { zona: Zona | null; aoFechar: () => void }) {
  const ehEdicao = zona != null
  const [tipo, setTipo] = useState<TipoZona>(zona?.tipo ?? 'bairro')
  const [nome, setNome] = useState(zona?.nome ?? '')
  const [bairro, setBairro] = useState(zona?.bairro ?? '')
  const areaRaio = zona?.area && 'metros' in zona.area ? zona.area : null
  const areaPoligono = zona?.area && 'coordinates' in zona.area ? zona.area : null
  const [lat, setLat] = useState(areaRaio ? String(areaRaio.centro.lat) : '')
  const [lng, setLng] = useState(areaRaio ? String(areaRaio.centro.lng) : '')
  const [metros, setMetros] = useState(areaRaio ? String(areaRaio.metros) : '')
  const [pontos, setPontos] = useState(areaPoligono ? poligonoParaTexto(areaPoligono.coordinates[0] ?? []) : '')
  const [taxa, setTaxa] = useState<number | null>(zona?.taxa_cliente_centavos ?? null)
  const [valorMotoboy, setValorMotoboy] = useState<number | null>(zona?.valor_motoboy_centavos ?? null)
  const [minimo, setMinimo] = useState<number | null>(zona?.pedido_minimo_centavos ?? null)
  const [freteGratis, setFreteGratis] = useState<number | null>(zona?.frete_gratis_acima_centavos ?? null)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmarDesativar, setConfirmarDesativar] = useState(false)

  const criar = useCriarZona()
  const atualizar = useAtualizarZona()
  const alternar = useAlternarZona()
  const { mostrarToast } = useToast()
  const salvando = criar.isPending || atualizar.isPending

  /** Monta a area geometrica do tipo atual, ou devolve a mensagem de erro de validacao. */
  function lerArea(): AreaLida {
    if (tipo === 'raio') {
      const la = lerDecimal(lat)
      const lo = lerDecimal(lng)
      const m = metros.trim() === '' ? null : Number(metros)
      if (la == null || lo == null || la < -90 || la > 90 || lo < -180 || lo > 180) {
        return { erro: 'Informe a latitude e a longitude do ponto central.' }
      }
      if (m == null || !Number.isInteger(m) || m < 1 || m > 100_000) {
        return { erro: 'Informe o raio em metros (inteiro, de 1 a 100000).' }
      }
      return { raio: { centro: { lat: la, lng: lo }, metros: m } }
    }
    const r = lerPoligono(pontos)
    if ('erro' in r) return r
    return { poligono: { type: 'Polygon', coordinates: [r.anel] } }
  }

  function salvar() {
    const nomeLimpo = nome.trim()
    if (nomeLimpo.length === 0) return setErro('Informe o nome da zona.')
    if (tipo === 'bairro' && bairro.trim().length === 0) return setErro('Informe o bairro.')
    if (taxa == null) return setErro('Informe a taxa cobrada do cliente (pode ser R$ 0,00).')
    if (valorMotoboy == null) return setErro('Informe o valor pago ao motoboy (pode ser R$ 0,00).')
    const area = tipo === 'bairro' ? null : lerArea()
    if (area && 'erro' in area) return setErro(area.erro)
    setErro(null)

    const valores = {
      taxa_cliente_centavos: taxa,
      valor_motoboy_centavos: valorMotoboy,
      pedido_minimo_centavos: minimo,
      frete_gratis_acima_centavos: freteGratis,
    }
    const aoErro = (e: unknown) => setErro(mensagem(e, 'Não foi possível salvar a zona.'))

    if (!ehEdicao) {
      let corpo: ZonaNova
      if (tipo === 'bairro') corpo = { tipo, nome: nomeLimpo, bairro: bairro.trim(), ...valores }
      else if (area && 'raio' in area) corpo = { tipo: 'raio', nome: nomeLimpo, ...area.raio, ...valores }
      else if (area && 'poligono' in area) corpo = { tipo: 'poligono', nome: nomeLimpo, area: area.poligono, ...valores }
      else return
      criar.mutate(corpo, {
        onSuccess: () => {
          mostrarToast('Zona criada.', { tom: 'sucesso' })
          aoFechar()
        },
        onError: aoErro,
      })
      return
    }

    const patch: ZonaPatch = { ...valores, nome: nomeLimpo }
    if (zona.tipo === 'bairro') patch.bairro = bairro.trim()
    else if (area && 'raio' in area) patch.area = area.raio
    else if (area && 'poligono' in area) patch.area = area.poligono
    atualizar.mutate(
      { id: zona.id, patch },
      {
        onSuccess: () => {
          mostrarToast('Zona atualizada.', { tom: 'sucesso' })
          aoFechar()
        },
        onError: aoErro,
      },
    )
  }

  function alternarAtivo() {
    if (!zona) return
    alternar.mutate(
      { id: zona.id, ativar: !zona.ativo },
      {
        onSuccess: () => {
          mostrarToast(zona.ativo ? 'Zona desativada.' : 'Zona reativada.', { tom: 'sucesso' })
          setConfirmarDesativar(false)
          aoFechar()
        },
        onError: (e) => {
          setConfirmarDesativar(false)
          setErro(mensagem(e, 'Não foi possível mudar a situação da zona.'))
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-5 text-left">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          salvar()
        }}
      >
        {!ehEdicao && (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-tinta">Como a zona é definida</span>
            <SegmentedControl value={tipo} onChange={setTipo} options={TIPOS} ariaLabel="Tipo da zona" />
            <p className="text-xs text-tinta-2">{DESCRICAO_TIPO[tipo]}</p>
          </div>
        )}
        {ehEdicao && <p className="text-xs text-tinta-2">Tipo: {ROTULO_TIPO[zona.tipo]} (não muda depois de criada).</p>}

        <Field label="Nome da zona">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} autoFocus placeholder="Ex.: Centro" />
        </Field>

        {tipo === 'bairro' && (
          <Field label="Bairro" dica="Comparado sem acento e sem diferenciar maiúsculas. Dois bairros ativos iguais não são permitidos.">
            <Input value={bairro} onChange={(e) => setBairro(e.target.value)} maxLength={80} placeholder="Ex.: Vila Madalena" />
          </Field>
        )}

        {tipo === 'raio' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Latitude do centro">
              <Input value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" placeholder="-23.5505" />
            </Field>
            <Field label="Longitude do centro">
              <Input value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" placeholder="-46.6333" />
            </Field>
            <Field label="Raio (metros)">
              <Input value={metros} onChange={(e) => setMetros(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="3000" />
            </Field>
          </div>
        )}

        {tipo === 'poligono' && (
          <Field
            label="Pontos da área"
            dica="Um ponto por linha, como latitude, longitude (decimais com ponto). Use ao menos 3 pontos, em ordem ao redor da área. O polígono é fechado automaticamente."
          >
            <textarea
              value={pontos}
              onChange={(e) => setPontos(e.target.value)}
              rows={5}
              spellCheck={false}
              placeholder={'-23.5505, -46.6333\n-23.5600, -46.6400\n-23.5650, -46.6200'}
              className="w-full resize-y rounded-input border border-linha bg-cartao px-3 py-2.5 font-mono text-sm text-tinta placeholder:text-tinta-2/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
            />
          </Field>
        )}

        <div className="flex flex-col gap-4 border-t border-linha pt-4">
          <p className="text-sm font-medium text-tinta">Valores desta zona</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Taxa cobrada do cliente" dica="Quanto o cliente paga de entrega nesta zona.">
              <MoneyInput value={taxa} onChange={setTaxa} />
            </Field>
            <Field label="Valor pago ao motoboy" dica="Quanto o motoboy recebe por entrega nesta zona.">
              <MoneyInput value={valorMotoboy} onChange={setValorMotoboy} />
            </Field>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-linha pt-4">
          <p className="text-sm font-medium text-tinta">Regras opcionais</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Pedido mínimo (opcional)" dica="Deixe vazio para não ter pedido mínimo.">
              <MoneyInput value={minimo} onChange={setMinimo} />
            </Field>
            <Field label="Frete grátis acima de (opcional)" dica="Pedidos a partir deste valor não pagam a taxa. Deixe vazio para não ter frete grátis.">
              <MoneyInput value={freteGratis} onChange={setFreteGratis} />
            </Field>
          </div>
        </div>

        {ehEdicao && zona.pedidos_em_aberto > 0 && (
          <Banner tom="info">
            {zona.pedidos_em_aberto === 1
              ? 'Há 1 pedido em andamento nesta zona.'
              : `Há ${zona.pedidos_em_aberto} pedidos em andamento nesta zona.`}{' '}
            Eles mantêm o valor de quando foram criados.
          </Banner>
        )}

        {erro && <Banner tom="erro">{erro}</Banner>}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={salvando}>
            {ehEdicao ? 'Salvar' : 'Criar zona'}
          </Button>
          <Button type="button" variante="secondary" disabled={salvando} onClick={aoFechar}>
            Cancelar
          </Button>
          {ehEdicao && (
            <Button
              type="button"
              variante={zona.ativo ? 'ghost' : 'secondary'}
              disabled={salvando}
              className="ml-auto"
              onClick={() => (zona.ativo ? setConfirmarDesativar(true) : alternarAtivo())}
            >
              {zona.ativo ? 'Desativar' : 'Reativar'}
            </Button>
          )}
        </div>
      </form>

      {ehEdicao && (
        <ConfirmDialog
          aberto={confirmarDesativar}
          titulo="Desativar zona?"
          textoConfirmar="Desativar"
          variante="destructive"
          carregando={alternar.isPending}
          onConfirmar={alternarAtivo}
          onCancelar={() => setConfirmarDesativar(false)}
        >
          Endereços desta zona deixam de ser atendidos até você reativá-la. Pedidos em andamento não mudam.
        </ConfirmDialog>
      )}
    </div>
  )
}
