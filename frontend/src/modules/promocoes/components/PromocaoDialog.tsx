// Criar/editar promocao. Tipo, codigo e itens do combo sao imutaveis depois de criados (regra do
// backend): na edicao aparecem so leitura. Validacao de borda com os contratos Zod gerados; as regras
// de negocio (desconto, limites) sao aplicadas pelo backend.
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { brl } from '@/shared/format'
import { Button, Dialog, Field, Input, MoneyInput, Select, SegmentedControl, useToast } from '@/shared/ui'
import { PromocaoAtualizarEntrada, PromocaoCriarEntrada } from '@/shared/contracts/_generated/promocoes'
import {
  useAtualizarPromocao,
  useCriarPromocao,
  useItensCardapio,
  type Promocao,
  type PromocaoTipo,
} from '../api'
import { campoParaIso, isoParaCampo, ROTULO_TIPO, TIPOS } from '../estados'
import { Alternador } from './Alternador'

interface Props {
  aberto: boolean
  /** null = criar; objeto = editar. */
  promocao: Promocao | null
  aoFechar: () => void
}

type Chave = 'nome' | 'codigo' | 'valor' | 'inicio_em' | 'fim_em' | 'limite_total' | 'limite_por_cliente' | 'min_pedido_centavos' | 'desconto_maximo_centavos' | 'itens'
type Erros = Partial<Record<Chave, string>>

interface LinhaCombo {
  item_id: string
  quantidade: number
}

const MENSAGENS: Record<Chave, string> = {
  nome: 'Dê um nome para a promoção.',
  codigo: 'Código de 3 a 30 letras, números, _ ou -.',
  valor: 'Valor inválido para este tipo.',
  inicio_em: 'Data de início inválida.',
  fim_em: 'O fim deve ser depois do início.',
  limite_total: 'Informe um número inteiro maior que zero.',
  limite_por_cliente: 'Informe um número inteiro maior que zero.',
  min_pedido_centavos: 'Valor mínimo inválido.',
  desconto_maximo_centavos: 'O teto de desconto deve ser maior que zero.',
  itens: 'Escolha ao menos um item, sem repetir.',
}

export function PromocaoDialog({ aberto, promocao, aoFechar }: Props) {
  return (
    <Dialog aberto={aberto} onFechar={aoFechar} titulo={promocao ? 'Editar promoção' : 'Nova promoção'} className="max-w-lg">
      {aberto && <Formulario key={promocao?.id ?? 'nova'} promocao={promocao} aoFechar={aoFechar} />}
    </Dialog>
  )
}

const numOuNull = (t: string): number | null => {
  const s = t.trim()
  return s === '' ? null : Number(s)
}

function Formulario({ promocao, aoFechar }: Pick<Props, 'promocao' | 'aoFechar'>) {
  const editando = promocao != null
  const criar = useCriarPromocao()
  const atualizar = useAtualizarPromocao()
  const itensCardapio = useItensCardapio()
  const { mostrarToast } = useToast()

  const [tipo, setTipo] = useState<PromocaoTipo>(promocao?.tipo ?? 'cupom_percentual')
  const [nome, setNome] = useState(promocao?.nome ?? '')
  const [codigo, setCodigo] = useState(promocao?.codigo ?? '')
  const [valor, setValor] = useState<number | null>(promocao?.valor ?? null)
  const [inicio, setInicio] = useState(isoParaCampo(promocao?.inicio_em ?? null))
  const [fim, setFim] = useState(isoParaCampo(promocao?.fim_em ?? null))
  const [limiteTotal, setLimiteTotal] = useState(promocao?.limite_total?.toString() ?? '')
  const [limiteCliente, setLimiteCliente] = useState(promocao?.limite_por_cliente?.toString() ?? '')
  const [minimo, setMinimo] = useState<number | null>(promocao?.min_pedido_centavos ?? 0)
  const [teto, setTeto] = useState<number | null>(promocao?.desconto_maximo_centavos ?? null)
  const [ativo, setAtivo] = useState(promocao?.ativo ?? true)
  const [linhas, setLinhas] = useState<LinhaCombo[]>(promocao?.itens ?? [])
  const [novoItem, setNovoItem] = useState('')
  const [erros, setErros] = useState<Erros>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)

  const catalogo = itensCardapio.data ?? []
  const nomeDe = (id: string) => catalogo.find((i) => i.id === id)?.nome ?? 'Item do cardápio'
  const combo = tipo === 'combo'
  const pendente = criar.isPending || atualizar.isPending

  const aoSucesso = () => {
    mostrarToast(editando ? 'Promoção atualizada.' : 'Promoção criada.', { tom: 'sucesso' })
    aoFechar()
  }
  const aoErro = (e: Error) =>
    setErroGeral(e instanceof ApiError ? e.message : 'Não foi possível salvar a promoção.')

  const mapearIssues = (issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }>) => {
    const novos: Erros = {}
    for (const i of issues) {
      const k = i.path[0]
      if (typeof k === 'string' && k in MENSAGENS && !novos[k as Chave]) novos[k as Chave] = MENSAGENS[k as Chave]
    }
    setErros(novos)
    if (Object.keys(novos).length === 0) setErroGeral('Confira os campos da promoção.')
  }

  const enviar = () => {
    setErroGeral(null)
    const comuns = {
      nome: nome.trim(),
      valor: valor ?? 0,
      inicio_em: campoParaIso(inicio),
      fim_em: campoParaIso(fim),
      limite_total: numOuNull(limiteTotal),
      limite_por_cliente: numOuNull(limiteCliente),
      min_pedido_centavos: minimo ?? 0,
      desconto_maximo_centavos: teto,
      ativo,
    }
    if (editando) {
      const r = PromocaoAtualizarEntrada.safeParse(comuns)
      if (!r.success) return mapearIssues(r.error.issues)
      setErros({})
      atualizar.mutate({ id: promocao.id, body: r.data }, { onSuccess: aoSucesso, onError: aoErro })
      return
    }
    const r = PromocaoCriarEntrada.safeParse({
      ...comuns,
      tipo,
      ...(combo ? { itens: linhas } : { codigo: codigo.trim() }),
    })
    if (!r.success) return mapearIssues(r.error.issues)
    setErros({})
    criar.mutate(r.data, { onSuccess: aoSucesso, onError: aoErro })
  }

  const opcoesItem = catalogo.filter((i) => !linhas.some((l) => l.item_id === i.id))

  return (
    <form
      className="flex flex-col gap-4 text-left"
      onSubmit={(e) => {
        e.preventDefault()
        enviar()
      }}
    >
      {editando ? (
        <p className="text-sm text-tinta-2">
          {ROTULO_TIPO[tipo]}
          {promocao.codigo ? ` · código ${promocao.codigo}` : ''}. Tipo, código e itens não mudam depois de criados: para trocar, crie outra promoção.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-tinta">Tipo</span>
          <SegmentedControl<PromocaoTipo>
            ariaLabel="Tipo de promoção"
            value={tipo}
            onChange={(t) => {
              setTipo(t)
              setValor(null)
              setErros({})
            }}
            options={TIPOS.map((t) => ({ value: t, label: ROTULO_TIPO[t] }))}
          />
        </div>
      )}

      <Field label="Nome" erro={erros.nome}>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} placeholder="Ex.: 10% de desconto no primeiro pedido" autoFocus />
      </Field>

      {!combo && !editando && (
        <Field label="Código do cupom" erro={erros.codigo} dica="O cliente digita este código no pedido. Maiúsculas e minúsculas valem igual.">
          <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={30} placeholder="BEMVINDO10" className="uppercase" />
        </Field>
      )}

      <Field
        label={tipo === 'cupom_percentual' ? 'Desconto (%)' : tipo === 'cupom_fixo' ? 'Desconto (R$)' : 'Preço final do combo'}
        erro={erros.valor}
        dica={tipo === 'combo' ? 'Quanto o cliente paga pelos itens do combo juntos.' : 'O desconto vale só sobre os itens; a taxa de entrega fica de fora.'}
      >
        {tipo === 'cupom_percentual' ? (
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={valor ?? ''}
            onChange={(e) => setValor(e.target.value === '' ? null : Math.trunc(Number(e.target.value)))}
          />
        ) : (
          <MoneyInput value={valor} onChange={setValor} />
        )}
      </Field>

      {combo && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-tinta">Itens do combo</legend>
          {linhas.length === 0 && <p className="text-xs text-tinta-2">Nenhum item ainda.</p>}
          <ul className="flex flex-col gap-1.5">
            {linhas.map((l, i) => (
              <li key={l.item_id} className="flex items-center gap-2 rounded-input border border-linha bg-papel-2 px-3 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate text-tinta">{nomeDe(l.item_id)}</span>
                {editando ? (
                  <span className="tabular-nums text-tinta-2">{l.quantidade}x</span>
                ) : (
                  <>
                    <Input
                      type="number"
                      min={1}
                      max={99}
                      aria-label={`Quantidade de ${nomeDe(l.item_id)}`}
                      value={l.quantidade}
                      className="w-16 px-2 py-1.5"
                      onChange={(e) =>
                        setLinhas((x) => x.map((y, j) => (j === i ? { ...y, quantidade: Math.max(1, Math.trunc(Number(e.target.value)) || 1) } : y)))
                      }
                    />
                    <Button
                      type="button"
                      variante="ghost"
                      aria-label={`Remover ${nomeDe(l.item_id)}`}
                      onClick={() => setLinhas((x) => x.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
          {!editando && (
            <div className="flex items-start gap-2">
              <Select
                ariaLabel="Adicionar item ao combo"
                value={novoItem}
                onChange={setNovoItem}
                disabled={itensCardapio.isPending}
                className="flex-1"
                options={[
                  { value: '', label: itensCardapio.isPending ? 'Carregando itens...' : 'Escolha um item' },
                  ...opcoesItem.map((i) => ({ value: i.id, label: `${i.nome} (${brl(i.preco_centavos)})` })),
                ]}
              />
              <Button
                type="button"
                variante="secondary"
                disabled={!novoItem}
                onClick={() => {
                  setLinhas((x) => [...x, { item_id: novoItem, quantidade: 1 }])
                  setNovoItem('')
                }}
              >
                <Plus className="size-4" aria-hidden />
                Adicionar
              </Button>
            </div>
          )}
          {itensCardapio.isError && <p className="text-xs text-barro">Não foi possível carregar o cardápio.</p>}
          {erros.itens && (
            <p role="alert" className="text-xs text-barro">
              {erros.itens}
            </p>
          )}
        </fieldset>
      )}

      <div className="flex flex-col gap-3 border-t border-linha pt-4">
        <span className="text-xs font-medium uppercase tracking-wide text-tinta-2">Agendamento e limites</span>
        <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Começa em" erro={erros.inicio_em} dica="Horário de Brasília. Vazio vale desde já.">
          <Input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </Field>
        <Field label="Termina em" erro={erros.fim_em} dica="Horário de Brasília. Vazio não expira.">
          <Input type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} />
        </Field>
        <Field label="Limite total de usos" erro={erros.limite_total} dica="Vazio = sem limite.">
          <Input type="number" inputMode="numeric" min={1} value={limiteTotal} onChange={(e) => setLimiteTotal(e.target.value)} placeholder="Sem limite" />
        </Field>
        <Field label="Usos por cliente" erro={erros.limite_por_cliente} dica="Vazio = sem limite.">
          <Input type="number" inputMode="numeric" min={1} value={limiteCliente} onChange={(e) => setLimiteCliente(e.target.value)} placeholder="Sem limite" />
        </Field>
        <Field label="Pedido mínimo" erro={erros.min_pedido_centavos}>
          <MoneyInput value={minimo} onChange={setMinimo} />
        </Field>
        <Field label="Teto de desconto" erro={erros.desconto_maximo_centavos} dica="Limita o desconto em reais. Vazio = sem teto.">
          <MoneyInput value={teto} onChange={setTeto} />
        </Field>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-input border border-linha bg-papel-2 px-3 py-2.5">
        <span className="flex flex-col">
          <span className="text-sm font-medium text-tinta">{ativo ? 'Promoção ligada' : 'Promoção desligada'}</span>
          <span className="text-xs text-tinta-2">
            {ativo ? 'Vale para novos pedidos.' : 'Não vale enquanto estiver desligada.'}
          </span>
        </span>
        <Alternador ligado={ativo} onMudar={setAtivo} rotulo="Promoção ligada" />
      </div>

      {erroGeral && (
        <p role="alert" className="text-sm text-barro">
          {erroGeral}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" loading={pendente}>
          {editando ? 'Salvar' : 'Criar promoção'}
        </Button>
        <Button type="button" variante="secondary" disabled={pendente} onClick={aoFechar}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
