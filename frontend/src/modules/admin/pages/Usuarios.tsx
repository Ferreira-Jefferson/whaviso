// /admin/usuarios: gestão de contas (saldo de créditos, suspensão).
// O backend expõe GET /v1/admin/usuarios (perfil + saldo da carteira), PATCH
// /v1/admin/usuarios/:id ({ suspenso }) e POST /v1/admin/usuarios/:id/creditar
// ({ quantidade }). Creditar = ativar quem pagou via WhatsApp (H11.11), com
// confirmação antes de aplicar no banco. Suspender = bloquear a conta na api.
// Linguagem das Regras de Ouro: crédito, envio, saldo, recarga.
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
import { useAdminUsuarios, useAtualizarUsuario, useCreditarUsuario, type UsuarioAdmin } from '../api'
import { Indisponivel } from '../components/Indisponivel'

const ROTULO_ROLE: Record<string, string> = {
  owner: 'Administração',
  user: 'Cliente',
}

export default function UsuariosPage() {
  const [params, setParams] = useSearchParams()
  const busca = params.get('busca') ?? ''

  const { data, isLoading, isError } = useAdminUsuarios({ busca: busca || undefined })
  const atualizar = useAtualizarUsuario()
  const creditar = useCreditarUsuario()
  // Pessoa cuja suspensão está em confirmação (suspender é destrutivo → confirma).
  const [aSuspender, setASuspender] = useState<UsuarioAdmin | null>(null)
  // Pessoa que está recebendo crédito + a quantidade digitada (confirma antes de aplicar).
  const [aCreditar, setACreditar] = useState<UsuarioAdmin | null>(null)
  const [qtdCredito, setQtdCredito] = useState('')

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
    atualizar.mutate({ id, suspenso: true }, { onSuccess: () => setASuspender(null) })
  }

  function abrirCreditar(u: UsuarioAdmin) {
    setQtdCredito('')
    setACreditar(u)
  }

  function confirmarCredito() {
    if (!aCreditar) return
    const quantidade = Number(qtdCredito)
    if (!Number.isInteger(quantidade) || quantidade < 1) return
    creditar.mutate(
      { id: aCreditar.id, quantidade },
      { onSuccess: () => setACreditar(null) },
    )
  }

  const quantidadeValida = (() => {
    const n = Number(qtdCredito)
    return Number.isInteger(n) && n >= 1
  })()

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
      chave: 'saldo',
      titulo: 'Saldo',
      render: (u) => (
        <span className="flex flex-col">
          <span className="tabular text-tinta">{u.saldo_livre} livre</span>
          {(u.reservado > 0 || u.em_hold > 0) && (
            <span className="text-xs text-tinta-2">
              {u.reservado} reservado{u.em_hold > 0 ? ` · ${u.em_hold} em espera` : ''}
            </span>
          )}
        </span>
      ),
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      alinhar: 'direita',
      ocultarRotuloMobile: true,
      render: (u) => (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variante="primary"
            className="px-3 py-1.5 text-xs"
            onClick={() => abrirCreditar(u)}
          >
            Creditar envios
          </Button>
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
      <PageHeader titulo="Usuários" descricao="Gestão de contas: saldo de créditos e suspensão." />

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

      {(atualizar.isError || creditar.isError) && (
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

      {/* Creditar envios (H11.11): input de quantidade + confirmação antes do banco. */}
      <ConfirmDialog
        aberto={aCreditar !== null}
        titulo="Creditar envios nesta conta"
        textoConfirmar="Creditar"
        carregando={creditar.isPending}
        onConfirmar={confirmarCredito}
        onCancelar={() => setACreditar(null)}
      >
        <div className="flex flex-col gap-3">
          <p>
            Quantos envios creditar para <strong>{aCreditar?.nome || 'esta conta'}</strong>? O
            saldo soma ao que a pessoa já tem (saldo atual: {aCreditar?.saldo_livre ?? 0}).
          </p>
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            value={qtdCredito}
            onChange={(e) => setQtdCredito(e.target.value)}
            placeholder="Quantidade de envios"
            aria-label="Quantidade de envios a creditar"
          />
          {!quantidadeValida && qtdCredito !== '' && (
            <span className="text-xs text-barro">Informe um número inteiro de 1 ou mais.</span>
          )}
        </div>
      </ConfirmDialog>

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
