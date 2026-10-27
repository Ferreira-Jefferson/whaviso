// Detalhe de um cliente num modal: nome (editavel), telefone MASCARADO (PII, nunca
// em claro nesta tela), resumo de consumo (pedidos, gasto, ultimo pedido) e enderecos.
import { useEffect, useState, type ReactNode } from 'react'
import { Lock, MapPin, Package, Wallet } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { formatarData } from '@/shared/format'
import {
  Badge,
  Button,
  Dialog,
  ErrorState,
  Field,
  Input,
  MoneyText,
  Skeleton,
  useToast,
} from '@/shared/ui'
import { useAtualizarCliente, useClienteDetalhe, type ClienteDetalhe } from '../api'

interface Props {
  /** Id do cliente aberto; null fecha o modal. */
  id: string | null
  aoFechar: () => void
}

export function DetalheClienteDialog({ id, aoFechar }: Props) {
  const consulta = useClienteDetalhe(id)
  const cliente = consulta.data

  return (
    <Dialog aberto={id != null} onFechar={aoFechar} titulo="Cliente" className="max-w-lg">
      {consulta.isPending && <EsqueletoDetalhe />}
      {consulta.isError && (
        <ErrorState aoTentarDeNovo={() => void consulta.refetch()} />
      )}
      {cliente && <Corpo cliente={cliente} />}
    </Dialog>
  )
}

function Corpo({ cliente }: { cliente: ClienteDetalhe }) {
  const { total, total_gasto_centavos, ultimo_pedido_em } = cliente.resumo_pedidos
  return (
    <div className="flex flex-col gap-5 text-left">
      <EditarNome id={cliente.id} nome={cliente.nome} />

      <div className="flex items-center gap-2 text-sm text-tinta">
        <Lock className="size-4 flex-none text-tinta-2" aria-hidden />
        <span className="tabular">{cliente.telefone_mascarado ?? 'Telefone nao informado'}</span>
        <Badge tom="neutro">Protegido</Badge>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <Tile icone={<Package className="size-4" aria-hidden />} rotulo="Pedidos" valor={<span className="tabular-nums">{total}</span>} />
        <Tile icone={<Wallet className="size-4" aria-hidden />} rotulo="Gasto" valor={<MoneyText centavos={total_gasto_centavos} />} />
        <Tile
          icone={<Package className="size-4" aria-hidden />}
          rotulo="Ultimo pedido"
          valor={<span className="tabular-nums">{ultimo_pedido_em ? formatarData(ultimo_pedido_em) : 'Nenhum'}</span>}
        />
      </div>

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-tinta">
          <MapPin className="size-4 text-tinta-2" aria-hidden />
          Enderecos
        </h3>
        {cliente.enderecos.length === 0 ? (
          <p className="text-sm text-tinta-2">Nenhum endereco cadastrado.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {cliente.enderecos.map((e) => (
              <li key={e.id} className="rounded-input border border-linha bg-papel-2 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  {e.apelido && <span className="font-medium text-tinta">{e.apelido}</span>}
                  {!e.ativo && <Badge tom="neutro">Inativo</Badge>}
                </div>
                <p className="text-tinta-2">{linhaEndereco(e)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function EditarNome({ id, nome }: { id: string; nome: string | null }) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(nome ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const atualizar = useAtualizarCliente()
  const { mostrarToast } = useToast()

  // Re-sincroniza o rascunho quando troca o cliente aberto no modal.
  useEffect(() => {
    setValor(nome ?? '')
    setEditando(false)
    setErro(null)
  }, [id, nome])

  if (!editando) {
    return (
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl font-semibold text-tinta">{nome ?? 'Cliente sem nome'}</p>
        </div>
        <Button variante="ghost" onClick={() => setEditando(true)}>
          Editar nome
        </Button>
      </div>
    )
  }

  const salvar = () => {
    const limpo = valor.trim()
    if (limpo.length === 0) {
      setErro('Informe um nome.')
      return
    }
    setErro(null)
    atualizar.mutate(
      { id, nome: limpo },
      {
        onSuccess: () => {
          setEditando(false)
          mostrarToast('Nome atualizado.', { tom: 'sucesso' })
        },
        onError: (e) => setErro(e instanceof ApiError ? e.message : 'Nao foi possivel salvar o nome.'),
      },
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        salvar()
      }}
      className="flex flex-col gap-3"
    >
      <Field label="Nome" erro={erro ?? undefined}>
        <Input value={valor} onChange={(e) => setValor(e.target.value)} maxLength={120} autoFocus placeholder="Nome do cliente" />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" loading={atualizar.isPending}>
          Salvar
        </Button>
        <Button
          type="button"
          variante="secondary"
          disabled={atualizar.isPending}
          onClick={() => {
            setEditando(false)
            setValor(nome ?? '')
            setErro(null)
          }}
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
}

function Tile({ icone, rotulo, valor }: { icone: ReactNode; rotulo: string; valor: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-input border border-linha bg-papel-2 p-3">
      <span className="flex items-center gap-1 text-xs text-tinta-2">
        {icone}
        {rotulo}
      </span>
      <span className="text-base font-semibold text-tinta">{valor}</span>
    </div>
  )
}

function linhaEndereco(e: ClienteDetalhe['enderecos'][number]): string {
  const rua = [e.logradouro, e.numero].filter(Boolean).join(', ')
  const partes = [rua, e.complemento, e.bairro, [e.cidade, e.uf].filter(Boolean).join('/')].filter(
    (p): p is string => Boolean(p && p.length > 0),
  )
  return partes.join(' · ')
}

function EsqueletoDetalhe() {
  return (
    <div aria-busy="true" className="flex flex-col gap-5">
      <Skeleton className="h-7 w-2/3" />
      <Skeleton className="h-5 w-1/2" />
      <div className="grid grid-cols-3 gap-2.5">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
      <Skeleton className="h-20" />
    </div>
  )
}
