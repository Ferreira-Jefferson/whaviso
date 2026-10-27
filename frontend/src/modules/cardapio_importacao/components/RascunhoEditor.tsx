// Editor do rascunho extraido: categorias > itens > grupos > opcoes. Controlado: o pai guarda o
// rascunho e decide quando salvar. Campos com confianca baixa levam o selo "Revisar". Remover um
// bloco tira so do rascunho; nada vai ao cardapio ate a aprovacao.
import { Trash2 } from 'lucide-react'
import { Badge, Button, Card, Field, Input, MoneyInput } from '@/shared/ui'
import type { RascunhoCardapio } from '@/shared/contracts/_generated/cardapio_importacao'
import { LIMIAR_CONFIANCA } from '../estados'

interface Props {
  rascunho: RascunhoCardapio
  onChange: (r: RascunhoCardapio) => void
  desabilitado?: boolean
}

type Cat = RascunhoCardapio['categorias'][number]
type Item = Cat['itens'][number]
type Grupo = Item['grupos'][number]
type Opcao = Grupo['opcoes'][number]

function Revisar({ confianca }: { confianca: number | undefined }) {
  if (confianca === undefined || confianca >= LIMIAR_CONFIANCA) return null
  return <Badge tom="atencao">Revisar</Badge>
}

function trocar<T>(lista: T[], i: number, novo: T): T[] {
  return lista.map((x, j) => (j === i ? novo : x))
}
function tirar<T>(lista: T[], i: number): T[] {
  return lista.filter((_, j) => j !== i)
}

export function RascunhoEditor({ rascunho, onChange, desabilitado = false }: Props) {
  const setCat = (ci: number, cat: Cat) => onChange({ categorias: trocar(rascunho.categorias, ci, cat) })

  return (
    <div className="grid gap-4">
      {rascunho.categorias.map((cat, ci) => (
        <Card key={ci} className="flex flex-col gap-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Field label="Categoria">
                <Input
                  value={cat.nome}
                  maxLength={80}
                  disabled={desabilitado}
                  onChange={(e) => setCat(ci, { ...cat, nome: e.target.value })}
                />
              </Field>
            </div>
            <Revisar confianca={cat.confianca} />
            <Button
              variante="ghost"
              disabled={desabilitado}
              aria-label={`Remover a categoria ${cat.nome || ci + 1}`}
              onClick={() => onChange({ categorias: tirar(rascunho.categorias, ci) })}
            >
              <Trash2 strokeWidth={1.75} className="size-4" aria-hidden />
            </Button>
          </div>

          {cat.itens.map((item, ii) => (
            <ItemEditor
              key={ii}
              item={item}
              desabilitado={desabilitado}
              onChange={(novo) => setCat(ci, { ...cat, itens: trocar(cat.itens, ii, novo) })}
              onRemover={() => setCat(ci, { ...cat, itens: tirar(cat.itens, ii) })}
            />
          ))}
          {cat.itens.length === 0 && <p className="text-sm text-tinta-2">Categoria sem itens.</p>}
        </Card>
      ))}
    </div>
  )
}

function ItemEditor({
  item,
  onChange,
  onRemover,
  desabilitado,
}: {
  item: Item
  onChange: (i: Item) => void
  onRemover: () => void
  desabilitado: boolean
}) {
  return (
    <div className="rounded-input border border-linha bg-papel-2/50 p-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <Field label="Item">
          <Input
            value={item.nome}
            maxLength={80}
            disabled={desabilitado}
            onChange={(e) => onChange({ ...item, nome: e.target.value })}
          />
        </Field>
        <Field label="Preço">
          <MoneyInput
            value={item.preco_centavos}
            disabled={desabilitado}
            onChange={(v) => onChange({ ...item, preco_centavos: v ?? 0 })}
          />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Descrição">
          <Input
            value={item.descricao ?? ''}
            maxLength={500}
            disabled={desabilitado}
            onChange={(e) => onChange({ ...item, descricao: e.target.value === '' ? null : e.target.value })}
          />
        </Field>
      </div>
      {item.grupos.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-salvia">
            {item.grupos.length === 1 ? '1 grupo de opções' : `${item.grupos.length} grupos de opções`}
          </summary>
          <div className="mt-3 grid gap-3">
            {item.grupos.map((g, gi) => (
              <GrupoEditor
                key={gi}
                grupo={g}
                desabilitado={desabilitado}
                onChange={(novo) => onChange({ ...item, grupos: trocar(item.grupos, gi, novo) })}
                onRemover={() => onChange({ ...item, grupos: tirar(item.grupos, gi) })}
              />
            ))}
          </div>
        </details>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <Revisar confianca={item.confianca} />
        <Button variante="ghost" disabled={desabilitado} onClick={onRemover}>
          <Trash2 strokeWidth={1.75} className="size-4" aria-hidden />
          Remover item
        </Button>
      </div>
    </div>
  )
}

function GrupoEditor({
  grupo,
  onChange,
  onRemover,
  desabilitado,
}: {
  grupo: Grupo
  onChange: (g: Grupo) => void
  onRemover: () => void
  desabilitado: boolean
}) {
  return (
    <div className="rounded-input border border-linha bg-cartao p-3">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <Field label="Grupo">
            <Input
              value={grupo.nome}
              maxLength={80}
              disabled={desabilitado}
              onChange={(e) => onChange({ ...grupo, nome: e.target.value })}
            />
          </Field>
        </div>
        <Revisar confianca={grupo.confianca} />
        <Button variante="ghost" disabled={desabilitado} aria-label={`Remover o grupo ${grupo.nome}`} onClick={onRemover}>
          <Trash2 strokeWidth={1.75} className="size-4" aria-hidden />
        </Button>
      </div>
      <label className="mt-2 flex items-center gap-2.5 text-sm text-tinta">
        <input
          type="checkbox"
          checked={grupo.obrigatorio}
          disabled={desabilitado}
          onChange={(e) => onChange({ ...grupo, obrigatorio: e.target.checked })}
          className="size-4 rounded border-linha text-salvia focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
        />
        Escolha obrigatória
      </label>
      <ul className="mt-3 grid gap-2">
        {grupo.opcoes.map((o, oi) => (
          <OpcaoEditor
            key={oi}
            opcao={o}
            desabilitado={desabilitado}
            podeRemover={grupo.opcoes.length > 1}
            onChange={(novo) => onChange({ ...grupo, opcoes: trocar(grupo.opcoes, oi, novo) })}
            onRemover={() => onChange({ ...grupo, opcoes: tirar(grupo.opcoes, oi) })}
          />
        ))}
      </ul>
    </div>
  )
}

function OpcaoEditor({
  opcao,
  onChange,
  onRemover,
  podeRemover,
  desabilitado,
}: {
  opcao: Opcao
  onChange: (o: Opcao) => void
  onRemover: () => void
  podeRemover: boolean
  desabilitado: boolean
}) {
  return (
    <li className="flex items-center gap-2">
      <Input
        aria-label="Nome da opção"
        value={opcao.nome}
        maxLength={80}
        disabled={desabilitado}
        onChange={(e) => onChange({ ...opcao, nome: e.target.value })}
      />
      <MoneyInput
        aria-label="Preço da opção"
        className="w-28 flex-none"
        value={opcao.preco_centavos}
        disabled={desabilitado}
        onChange={(v) => onChange({ ...opcao, preco_centavos: v ?? 0 })}
      />
      <Revisar confianca={opcao.confianca} />
      <Button
        variante="ghost"
        className="flex-none px-3"
        disabled={desabilitado || !podeRemover}
        aria-label="Remover a opção"
        onClick={onRemover}
      >
        <Trash2 strokeWidth={1.75} className="size-4" aria-hidden />
      </Button>
    </li>
  )
}
