// Gerenciamento de cargos (funcoes). A loja cria cargos proprios e renomeia/arquiva os seus.
// O cargo motoboy (sistema=true) e fixo do sistema: nao pode ser renomeado nem arquivado, e
// nunca ha opcao de apagar (o backend so arquiva via `ativo`). Presets da plataforma (sem
// loja_id) sao catalogo compartilhado, read-only para a loja.
import { useState } from 'react'
import { Contact, Lock, Pencil, Plus } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Skeleton,
  useToast,
} from '@/shared/ui'
import { useAtualizarCargo, useCargos, useCriarCargo, type Cargo } from '../api'

function mensagem(e: unknown, padrao: string): string {
  return e instanceof ApiError ? e.message : padrao
}

/** Cargo que a loja pode renomear/arquivar: proprio (tem loja_id) e nao-sistema. */
function editavel(c: Cargo): boolean {
  return c.loja_id != null && !c.sistema
}

export function PainelCargos() {
  const cargos = useCargos()
  const itens = cargos.data?.itens ?? []

  return (
    <div className="flex flex-col gap-5">
      <NovoCargo />

      {cargos.isPending && (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando cargos">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {cargos.isError && <ErrorState aoTentarDeNovo={() => void cargos.refetch()} />}
      {cargos.isSuccess && itens.length === 0 && (
        <EmptyState
          icone={<Contact className="size-7" aria-hidden />}
          titulo="Nenhum cargo"
          descricao="Crie o primeiro cargo (ex.: cozinheira, atendente) acima."
        />
      )}
      {cargos.isSuccess && itens.length > 0 && (
        <ul className="flex flex-col gap-2">
          {itens.map((c) => (
            <LinhaCargo key={c.id} cargo={c} />
          ))}
        </ul>
      )}
    </div>
  )
}

function NovoCargo() {
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const criar = useCriarCargo()
  const { mostrarToast } = useToast()

  const adicionar = () => {
    const limpo = nome.trim()
    if (limpo.length === 0) {
      setErro('Informe o nome do cargo.')
      return
    }
    setErro(null)
    criar.mutate(
      { nome: limpo },
      {
        onSuccess: () => {
          setNome('')
          mostrarToast('Cargo criado.', { tom: 'sucesso' })
        },
        onError: (e) => setErro(mensagem(e, 'Não foi possível criar o cargo.')),
      },
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        adicionar()
      }}
      className="flex flex-col gap-2 rounded-card border border-dashed border-linha p-3"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Novo cargo" erro={erro ?? undefined}>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} placeholder="Ex.: churrasqueiro" />
          </Field>
        </div>
        <Button type="submit" loading={criar.isPending} className="sm:mb-0.5">
          <Plus className="size-4" aria-hidden />
          Criar
        </Button>
      </div>
    </form>
  )
}

function LinhaCargo({ cargo }: { cargo: Cargo }) {
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(cargo.nome)
  const [erro, setErro] = useState<string | null>(null)
  const atualizar = useAtualizarCargo()
  const { mostrarToast } = useToast()
  const podeEditar = editavel(cargo)

  const salvarNome = () => {
    const limpo = nome.trim()
    if (limpo.length === 0) {
      setErro('Informe o nome.')
      return
    }
    setErro(null)
    atualizar.mutate(
      { id: cargo.id, patch: { nome: limpo } },
      {
        onSuccess: () => {
          setEditando(false)
          mostrarToast('Cargo atualizado.', { tom: 'sucesso' })
        },
        onError: (e) => setErro(mensagem(e, 'Não foi possível salvar.')),
      },
    )
  }

  const alternarAtivo = () => {
    atualizar.mutate(
      { id: cargo.id, patch: { ativo: !cargo.ativo } },
      {
        onSuccess: () => mostrarToast(cargo.ativo ? 'Cargo arquivado.' : 'Cargo reativado.', { tom: 'sucesso' }),
        onError: (e) => setErro(mensagem(e, 'Não foi possível mudar o status.')),
      },
    )
  }

  if (editando) {
    return (
      <li className="rounded-input border border-linha bg-papel-2 p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            salvarNome()
          }}
          className="flex flex-col gap-2"
        >
          <Field label="Nome do cargo" erro={erro ?? undefined}>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} autoFocus />
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
                setNome(cargo.nome)
                setErro(null)
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </li>
    )
  }

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-input border border-linha bg-cartao px-3 py-2.5">
      <span className="font-medium text-tinta">{cargo.nome}</span>
      {cargo.sistema && (
        <Badge tom="marca">
          <Lock className="mr-1 size-3" aria-hidden />
          Fixo do sistema
        </Badge>
      )}
      {!cargo.sistema && cargo.loja_id == null && <Badge tom="neutro">Padrão</Badge>}
      {!cargo.ativo && <Badge tom="neutro">Arquivado</Badge>}

      {podeEditar && (
        <div className="ml-auto flex items-center gap-1">
          <Button variante="ghost" className="min-h-11 px-3" onClick={() => setEditando(true)}>
            <Pencil className="size-4" aria-hidden />
            Renomear
          </Button>
          <Button
            variante="ghost"
            className="min-h-11 px-3"
            loading={atualizar.isPending}
            onClick={alternarAtivo}
          >
            {cargo.ativo ? 'Arquivar' : 'Reativar'}
          </Button>
        </div>
      )}
      {!podeEditar && (
        <span className="ml-auto text-xs text-tinta-2">
          {cargo.sistema ? 'Protegido' : 'Somente leitura'}
        </span>
      )}
      {erro && (
        <p className="w-full text-xs text-barro" role="alert">
          {erro}
        </p>
      )}
    </li>
  )
}
