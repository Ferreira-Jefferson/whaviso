// /admin/usuarios: gestão de contas (plano, suspensão).
// O backend expõe GET /v1/admin/usuarios e PATCH /v1/admin/usuarios/:id
// ({ plano_id?, suspenso? }). Suspender = bloquear a conta na api (toda rota
// autenticada da pessoa passa a responder 403); reativar volta ao normal. Não
// apaga dados. Linguagem das Regras de Ouro em toda string.
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Search } from 'lucide-react'
import {
  Banner,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  PageHeader,
  Skeleton,
  TableResponsive,
  cn,
  type ColunaTabela,
} from '@/shared/ui'
import { useAdminUsuarios, useAtualizarUsuario, type UsuarioAdmin } from '../api'
import { Indisponivel } from '../components/Indisponivel'

const ROTULO_ROLE: Record<string, string> = {
  owner: 'Administração',
  user: 'Cliente',
}

// Sufixo quando a assinatura não está vigente (status diferente de 'ativa').
const SUFIXO_STATUS_PLANO: Record<string, string> = {
  trial: ' (cortesia)',
  cancelada: ' (cancelada)',
}

// O catálogo guarda o tipo do plano em minúsculas (free, start, profissional,
// plus). Na tela mostramos capitalizado (Free, Start, ...).
function rotuloPlano(planoId: string): string {
  return planoId.charAt(0).toUpperCase() + planoId.slice(1)
}

export default function UsuariosPage() {
  const [params, setParams] = useSearchParams()
  const busca = params.get('busca') ?? ''

  const { data, isLoading, isError } = useAdminUsuarios({ busca: busca || undefined })
  const atualizar = useAtualizarUsuario()
  // Pessoa cuja suspensão está em confirmação (suspender é destrutivo → confirma).
  const [aSuspender, setASuspender] = useState<UsuarioAdmin | null>(null)

  function setBusca(v: string) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (v) next.set('busca', v)
        else next.delete('busca')
        return next
      },
      { replace: true },
    )
  }

  function reativar(u: UsuarioAdmin) {
    atualizar.mutate({ id: u.id, suspenso: false })
  }

  function confirmarSuspensao() {
    if (!aSuspender) return
    const id = aSuspender.id
    atualizar.mutate(
      { id, suspenso: true },
      { onSuccess: () => setASuspender(null) },
    )
  }

  const colunas: ReadonlyArray<ColunaTabela<UsuarioAdmin>> = [
    {
      chave: 'nome',
      titulo: 'Nome',
      principal: true,
      render: (u) => (
        <span className="flex items-center gap-2">
          <span>{u.nome || ''}</span>
          {u.suspenso && (
            <span className="inline-flex items-center rounded-pill bg-barro/10 px-2 py-0.5 text-xs font-medium text-barro">
              Suspensa
            </span>
          )}
        </span>
      ),
    },
    {
      chave: 'role',
      titulo: 'Tipo',
      render: (u) => ROTULO_ROLE[u.role] ?? u.role,
    },
    {
      chave: 'plano',
      titulo: 'Plano',
      render: (u) => {
        if (!u.plano_id) return <span className="text-tinta-2">Sem plano</span>
        const sufixo = (u.plano_status && SUFIXO_STATUS_PLANO[u.plano_status]) ?? ''
        return (
          <span>
            {rotuloPlano(u.plano_id)}
            {sufixo && <span className="text-tinta-2">{sufixo}</span>}
          </span>
        )
      },
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      alinhar: 'direita',
      ocultarRotuloMobile: true,
      render: (u) => (
        <div className="flex flex-wrap justify-end gap-2">
          {u.suspenso ? (
            <Button
              variante="secondary"
              className="px-3 py-1.5 text-xs"
              loading={atualizar.isPending && atualizar.variables?.id === u.id}
              onClick={() => reativar(u)}
            >
              Reativar
            </Button>
          ) : (
            <Button
              variante="secondary"
              className={cn('px-3 py-1.5 text-xs text-barro')}
              onClick={() => setASuspender(u)}
            >
              Suspender
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="animate-rise">
      <PageHeader
        titulo="Usuários"
        descricao="Gestão de contas: plano e suspensão."
      />

      <Card className="mb-6">
        <label className="flex items-center gap-2 rounded-input border border-linha px-3 py-1">
          <Search strokeWidth={1.75} className="size-4 text-tinta-2" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome"
            className="border-0 px-0 focus-visible:outline-none"
            aria-label="Buscar usuários"
          />
        </label>
      </Card>

      {atualizar.isError && (
        <Banner tom="erro" className="mb-4">
          Não foi possível concluir a ação. Tente novamente.
        </Banner>
      )}

      {isError ? (
        <EmptyState
          titulo="Não foi possível carregar os usuários"
          descricao="Verifique sua conexão e tente novamente."
        />
      ) : isLoading || !data ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-card" />
          ))}
        </div>
      ) : data.indisponivel ? (
        <Indisponivel descricao="A api ainda não oferece o endpoint de usuários (GET /v1/admin/usuarios). Assim que existir, esta tela passa a listar e gerenciar contas." />
      ) : data.dados!.itens.length === 0 ? (
        <EmptyState titulo="Nenhum usuário encontrado" descricao="Ajuste a busca e tente de novo." />
      ) : (
        <TableResponsive
          legenda="Usuários do whaviso"
          colunas={colunas}
          linhas={data.dados!.itens}
          chaveLinha={(u) => u.id}
        />
      )}

      <ConfirmDialog
        aberto={aSuspender !== null}
        titulo="Suspender esta conta?"
        variante="destructive"
        textoConfirmar="Suspender"
        carregando={atualizar.isPending}
        onConfirmar={confirmarSuspensao}
        onCancelar={() => setASuspender(null)}
      >
        Enquanto suspensa, a pessoa fica bloqueada de usar o sistema. Os dados são
        preservados e você pode reativar a qualquer momento.
      </ConfirmDialog>
    </div>
  )
}
