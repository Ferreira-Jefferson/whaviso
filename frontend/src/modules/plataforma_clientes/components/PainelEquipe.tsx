// Equipe Whaviso (operadores): so administradores. Vincula um usuario do Auth ja existente
// (por id), troca o papel e desativa (nunca remove). O servidor garante >= 1 admin ativo e que
// ninguem se autopromove; aqui mostramos a mensagem de erro dele.
import { useState } from 'react'
import { Plus, UserCog } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import {
  Badge,
  Banner,
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  Skeleton,
  TableResponsive,
  useToast,
  type ColunaTabela,
} from '@/shared/ui'
import { formatarData } from '@/shared/format'
import type { OperadorDTO } from '@/shared/contracts/_generated/plataforma_clientes'
import { papelOperador, type PapelOperador } from '@/shared/contracts/_generated/enums'
import { useAtualizarOperador, useConvidarOperador, useOperadores } from '../api'
import { ROTULO_PAPEL_OPERADOR } from '../rotulos'
import { AreaErro } from './AreaErro'

const OPCOES_PAPEL = papelOperador.options.map((p) => ({ value: p, label: ROTULO_PAPEL_OPERADOR[p] }))
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function mensagem(e: unknown, padrao: string): string {
  return e instanceof ApiError ? e.message : padrao
}

export function PainelEquipe() {
  const lista = useOperadores()
  const [convidando, setConvidando] = useState(false)
  const [alvo, setAlvo] = useState<OperadorDTO | null>(null)

  const itens = lista.data?.itens ?? []

  const colunas: ReadonlyArray<ColunaTabela<OperadorDTO>> = [
    {
      chave: 'nome',
      titulo: 'Pessoa',
      principal: true,
      render: (o) => (
        <span className="flex items-center gap-2 font-medium">
          {o.nome}
          {!o.ativo && <Badge tom="neutro">Desativado</Badge>}
        </span>
      ),
    },
    {
      chave: 'papel',
      titulo: 'Papel',
      render: (o) => <Badge tom={o.papel === 'admin' ? 'marca' : 'neutro'}>{ROTULO_PAPEL_OPERADOR[o.papel]}</Badge>,
    },
    { chave: 'criado', titulo: 'Desde', render: (o) => <span className="tabular text-tinta-2">{formatarData(o.criado_em)}</span> },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-tinta-2">Quem opera o console da plataforma. A gestão é restrita a administradores.</p>
        <Button onClick={() => setConvidando(true)}>
          <Plus className="size-4" aria-hidden />
          Adicionar à equipe
        </Button>
      </div>

      {lista.isPending && (
        <div aria-busy="true" aria-label="Carregando equipe" className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {lista.isError && <AreaErro exigeAdmin erro={lista.error} aoTentarDeNovo={() => void lista.refetch()} />}

      {lista.isSuccess && itens.length === 0 && (
        <EmptyState icone={<UserCog className="size-7" aria-hidden />} titulo="Equipe vazia" descricao="Adicione quem vai operar o console." />
      )}
      {lista.isSuccess && itens.length > 0 && (
        <TableResponsive colunas={colunas} linhas={itens} chaveLinha={(o) => o.id} onRowClick={setAlvo} legenda="Equipe Whaviso" />
      )}

      <ConviteDialog aberto={convidando} aoFechar={() => setConvidando(false)} />
      <EdicaoDialog operador={alvo} aoFechar={() => setAlvo(null)} />
    </div>
  )
}

function ConviteDialog({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  return (
    <Dialog aberto={aberto} onFechar={aoFechar} titulo="Adicionar à equipe" className="max-w-md">
      {aberto && <FormConvite aoFechar={aoFechar} />}
    </Dialog>
  )
}

function FormConvite({ aoFechar }: { aoFechar: () => void }) {
  const [userId, setUserId] = useState('')
  const [nome, setNome] = useState('')
  const [papel, setPapel] = useState<PapelOperador>('operador')
  const [erro, setErro] = useState<string | null>(null)
  const convidar = useConvidarOperador()
  const { mostrarToast } = useToast()

  const salvar = () => {
    const id = userId.trim()
    const nomeLimpo = nome.trim()
    if (!UUID.test(id)) return setErro('Informe o id do usuário (UUID) como aparece no Auth.')
    if (nomeLimpo.length === 0) return setErro('Informe o nome.')
    setErro(null)
    convidar.mutate(
      { user_id: id, nome: nomeLimpo, papel },
      {
        onSuccess: () => {
          mostrarToast('Pessoa adicionada à equipe.', { tom: 'sucesso' })
          aoFechar()
        },
        onError: (e) => setErro(mensagem(e, 'Não foi possível adicionar.')),
      },
    )
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        salvar()
      }}
    >
      <p className="text-sm text-tinta-2">Vincula um usuário que já existe no login à equipe da plataforma.</p>
      <Field label="Id do usuário" dica="O identificador do usuário no Auth. O servidor recusa se o usuário não existir.">
        <Input value={userId} onChange={(e) => setUserId(e.target.value)} autoComplete="off" spellCheck={false} placeholder="00000000-0000-0000-0000-000000000000" />
      </Field>
      <Field label="Nome">
        <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
      </Field>
      <Field label="Papel">
        <Select ariaLabel="Papel" value={papel} onChange={setPapel} options={OPCOES_PAPEL} />
      </Field>
      {erro && <Banner tom="erro">{erro}</Banner>}
      <div className="flex flex-col gap-2">
        <Button type="submit" loading={convidar.isPending}>
          Adicionar
        </Button>
        <Button type="button" variante="secondary" disabled={convidar.isPending} onClick={aoFechar}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}

function EdicaoDialog({ operador, aoFechar }: { operador: OperadorDTO | null; aoFechar: () => void }) {
  return (
    <Dialog aberto={operador != null} onFechar={aoFechar} titulo={operador?.nome ?? 'Operador'} className="max-w-md">
      {operador && <FormEdicao key={operador.id} operador={operador} aoFechar={aoFechar} />}
    </Dialog>
  )
}

function FormEdicao({ operador, aoFechar }: { operador: OperadorDTO; aoFechar: () => void }) {
  const [papel, setPapel] = useState<PapelOperador>(operador.papel)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState(false)
  const atualizar = useAtualizarOperador()
  const { mostrarToast } = useToast()

  const aplicar = (patch: { papel?: PapelOperador; ativo?: boolean }, ok: string) => {
    setErro(null)
    atualizar.mutate(
      { id: operador.id, patch },
      {
        onSuccess: () => {
          mostrarToast(ok, { tom: 'sucesso' })
          setConfirmar(false)
          aoFechar()
        },
        onError: (e) => {
          setConfirmar(false)
          setErro(mensagem(e, 'Não foi possível salvar.'))
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Papel">
        <Select ariaLabel="Papel" value={papel} onChange={setPapel} options={OPCOES_PAPEL} disabled={!operador.ativo} />
      </Field>
      {erro && <Banner tom="erro">{erro}</Banner>}
      <div className="flex flex-col gap-2">
        <Button
          loading={atualizar.isPending}
          disabled={papel === operador.papel}
          onClick={() => aplicar({ papel }, 'Papel atualizado.')}
        >
          Salvar papel
        </Button>
        {operador.ativo ? (
          <Button variante="destructive" disabled={atualizar.isPending} onClick={() => setConfirmar(true)}>
            Desativar acesso
          </Button>
        ) : (
          <Button variante="secondary" loading={atualizar.isPending} onClick={() => aplicar({ ativo: true }, 'Acesso reativado.')}>
            Reativar acesso
          </Button>
        )}
        <Button variante="ghost" onClick={aoFechar}>
          Fechar
        </Button>
      </div>
      <ConfirmDialog
        aberto={confirmar}
        titulo="Desativar acesso?"
        variante="destructive"
        textoConfirmar="Desativar"
        carregando={atualizar.isPending}
        onCancelar={() => setConfirmar(false)}
        onConfirmar={() => aplicar({ ativo: false }, 'Acesso desativado.')}
      >
        {operador.nome} perde o acesso ao console. O registro fica guardado e dá para reativar depois.
      </ConfirmDialog>
    </div>
  )
}
