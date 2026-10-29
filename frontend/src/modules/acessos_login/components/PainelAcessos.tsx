// Allowlist de login (operador): lista de e-mails liberados para criar conta. Adicionar, aprovar
// (dispara o boas-vindas) e revogar. A seguranca real e a autorizacao na api (cobranca:gerir).
import { useState, type FormEvent } from 'react'
import { ShieldCheck } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Select,
  Skeleton,
  TableResponsive,
  useToast,
  type ColunaTabela,
  type SelectOption,
} from '@/shared/ui'
import { formatarDataHora } from '@/shared/format'
import { acessoStatus, type AcessoDTO, type AcessoStatus } from '../contracts'
import { useAcessos, useAdicionarAcesso, useAprovarAcesso, useRevogarAcesso } from '../api'

type FiltroStatus = AcessoStatus | 'todos'

const OPCOES_STATUS: ReadonlyArray<SelectOption<FiltroStatus>> = [
  { value: 'todos', label: 'Todos' },
  ...acessoStatus.options.map((s) => ({ value: s, label: ROTULO[s] })),
]

const ROTULO: Record<AcessoStatus, string> = {
  pendente: 'Pendente',
  aprovado: 'Aprovado',
  revogado: 'Revogado',
}
const TOM: Record<AcessoStatus, 'neutro' | 'sucesso' | 'atencao'> = {
  pendente: 'atencao',
  aprovado: 'sucesso',
  revogado: 'neutro',
}

function mensagem(e: unknown, padrao: string): string {
  return e instanceof ApiError ? e.message : padrao
}

export function PainelAcessos() {
  const { mostrarToast } = useToast()
  const [filtro, setFiltro] = useState<FiltroStatus>('todos')
  const [email, setEmail] = useState('')

  const lista = useAcessos(filtro === 'todos' ? undefined : filtro)
  const adicionar = useAdicionarAcesso()
  const aprovar = useAprovarAcesso()
  const revogar = useRevogarAcesso()
  const itens = lista.data ?? []

  function enviar(e: FormEvent) {
    e.preventDefault()
    const valor = email.trim()
    if (!valor) return
    adicionar.mutate(
      { email: valor },
      {
        onSuccess: () => {
          setEmail('')
          mostrarToast('E-mail adicionado à lista de acessos.')
        },
        onError: (err) => mostrarToast(mensagem(err, 'Não foi possível adicionar o e-mail.'), { tom: 'erro' }),
      },
    )
  }

  const colunas: ReadonlyArray<ColunaTabela<AcessoDTO>> = [
    { chave: 'email', titulo: 'E-mail', principal: true, render: (a) => <span className="font-medium break-all">{a.email}</span> },
    {
      chave: 'status',
      titulo: 'Situação',
      render: (a) => (
        <span className="flex flex-col gap-0.5">
          <Badge tom={TOM[a.status]}>{ROTULO[a.status]}</Badge>
          {a.aprovado_em && <span className="text-xs text-tinta-2">em {formatarDataHora(a.aprovado_em)}</span>}
        </span>
      ),
    },
    { chave: 'origem', titulo: 'Origem', render: (a) => <span className="text-tinta-2">{a.origem === 'pagamento' ? 'Pagamento' : 'Manual'}</span> },
    {
      chave: 'boas_vindas',
      titulo: 'Boas-vindas',
      render: (a) => (
        <span className="text-tinta-2">{a.boas_vindas_enviado_em ? 'Enviado' : 'Não'}</span>
      ),
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      alinhar: 'direita',
      render: (a) => (
        <div className="flex justify-end gap-2">
          {a.status !== 'aprovado' && (
            <Button
              variante="secondary"
              loading={aprovar.isPending && aprovar.variables === a.id}
              onClick={() =>
                aprovar.mutate(a.id, {
                  onSuccess: () => mostrarToast('Acesso liberado. Boas-vindas na fila de envio.'),
                  onError: (err) => mostrarToast(mensagem(err, 'Não foi possível aprovar.'), { tom: 'erro' }),
                })
              }
            >
              Aprovar
            </Button>
          )}
          {a.status !== 'revogado' && (
            <Button
              variante="ghost"
              loading={revogar.isPending && revogar.variables === a.id}
              onClick={() =>
                revogar.mutate(a.id, {
                  onSuccess: () => mostrarToast('Acesso revogado.'),
                  onError: (err) => mostrarToast(mensagem(err, 'Não foi possível revogar.'), { tom: 'erro' }),
                })
              }
            >
              Revogar
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={enviar} className="flex flex-col gap-3 rounded-card border border-linha bg-cartao p-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Adicionar e-mail">
            <Input
              id="novo-email"
              type="email"
              inputMode="email"
              autoComplete="off"
              placeholder="pessoa@restaurante.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
        </div>
        <Button type="submit" loading={adicionar.isPending}>
          Adicionar
        </Button>
      </form>

      <div className="flex items-center gap-3">
        <ShieldCheck className="size-5 text-salvia" />
        <Select
          ariaLabel="Filtrar por situação"
          value={filtro}
          onChange={(v) => setFiltro(v)}
          options={OPCOES_STATUS}
        />
      </div>

      {lista.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : lista.isError ? (
        <EmptyState titulo="Não foi possível carregar" descricao="Tente de novo em instantes." />
      ) : itens.length === 0 ? (
        <EmptyState titulo="Nenhum e-mail na lista" descricao="Adicione um e-mail para liberar o primeiro acesso." />
      ) : (
        <TableResponsive colunas={colunas} linhas={itens} chaveLinha={(a) => a.id} legenda="Acessos de login" />
      )}
    </div>
  )
}
