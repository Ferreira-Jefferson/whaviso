// Estado da credencial do atendente: so metadado ("configurada, termina em 1234, validada em ...").
// A chave nunca e exibida. Aqui tambem ficam ligar/desligar e o modelo preferido (PATCH, sem chave).
import { useEffect, useState } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Badge, Banner, Button, Field, Input, SecretField, cn, useToast } from '@/shared/ui'
import { formatarDataHora } from '@/shared/format'
import { useAjustarCredencial, type Estado } from '../api'
import { ROTULO_PROVEDOR } from '../estados'

export function CartaoCredencial({ estado }: { estado: Estado }) {
  const { mostrarToast } = useToast()
  const ajustar = useAjustarCredencial()
  const [modelo, setModelo] = useState(estado.modelo_preferido ?? '')
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => setModelo(estado.modelo_preferido ?? ''), [estado.modelo_preferido])

  async function aplicar(patch: { ativo?: boolean; modelo_preferido?: string | null }, ok: string) {
    setErro(null)
    try {
      await ajustar.mutateAsync(patch)
      mostrarToast(ok, { tom: 'sucesso' })
    } catch (e) {
      setErro(
        e instanceof ApiError
          ? e.isForbidden
            ? 'Só o dono da loja pode alterar a chave.'
            : e.message
          : 'Não foi possível salvar. Tente de novo.',
      )
    }
  }

  // Sem registro nenhum: nada a mostrar alem do convite a cadastrar.
  if (!estado.criado_em) {
    return (
      <div className="flex items-start gap-3 rounded-card border border-dashed border-linha bg-cartao p-5 sm:p-6">
        <span className="flex size-10 flex-none items-center justify-center rounded-full bg-papel-2 text-tinta-2">
          <KeyRound className="size-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold text-tinta">Nenhuma chave cadastrada</h3>
          <p className="mt-1 text-sm text-tinta-2">
            Sem a chave do provedor, o atendente não responde. Cadastre a chave no formulário abaixo.
          </p>
        </div>
      </div>
    )
  }

  const modeloAlterado = modelo.trim() !== (estado.modelo_preferido ?? '')

  return (
    <div className="flex flex-col gap-5 rounded-card border border-linha bg-cartao p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 flex-none items-center justify-center rounded-full bg-salvia-claro text-salvia">
            <KeyRound className="size-5" strokeWidth={1.75} aria-hidden />
          </span>
          <span className="font-display text-lg font-semibold text-tinta">
            {estado.provedor ? ROTULO_PROVEDOR[estado.provedor] : 'Provedor'}
          </span>
        </div>
        <Badge tom={estado.configurada ? 'sucesso' : 'neutro'}>
          {estado.configurada ? 'Configurada e ativa' : 'Pausada'}
        </Badge>
      </div>

      {/* Chave: dado protegido, write-only. Nunca é exibida, só o final mascarado. */}
      <SecretField ultimos4={estado.ultimos4} className="w-full" />

      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-tinta-2">Validada em</dt>
          <dd className="mt-0.5 font-medium text-tinta">
            {estado.validada_em ? formatarDataHora(estado.validada_em) : 'ainda não validada'}
          </dd>
        </div>
        <div>
          <dt className="text-tinta-2">Última troca</dt>
          <dd className="mt-0.5 font-medium text-tinta">
            {estado.atualizado_em ? formatarDataHora(estado.atualizado_em) : 'sem registro'}
          </dd>
        </div>
      </dl>

      <button
        type="button"
        role="switch"
        aria-checked={estado.ativo}
        disabled={ajustar.isPending}
        onClick={() =>
          void aplicar({ ativo: !estado.ativo }, estado.ativo ? 'Atendente pausado.' : 'Atendente ligado.')
        }
        className="flex min-h-11 items-center justify-between gap-3 rounded-input border border-linha bg-papel-2 px-3 py-2.5 text-left transition-colors hover:border-salvia/40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia disabled:opacity-60"
      >
        <span className="min-w-0">
          <span className="block font-medium text-tinta">Atendente ligado</span>
          <span className="block text-sm text-tinta-2">
            {estado.ativo ? 'Usa a chave para responder.' : 'Pausado: a chave fica guardada, mas não é usada.'}
          </span>
        </span>
        <span
          className={cn(
            'inline-flex h-6 w-11 flex-none items-center rounded-pill p-0.5 transition-colors',
            estado.ativo ? 'bg-salvia' : 'bg-linha',
          )}
        >
          <span className={cn('size-5 rounded-full bg-cartao shadow-sm transition-transform', estado.ativo && 'translate-x-5')} />
        </span>
      </button>

      <div className="flex flex-col gap-3 border-t border-linha pt-5 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Modelo preferido" dica="Opcional. Deixe vazio para usar o padrão do provedor.">
            <Input value={modelo} maxLength={120} onChange={(e) => setModelo(e.target.value)} />
          </Field>
        </div>
        <Button
          type="button"
          variante="secondary"
          disabled={!modeloAlterado}
          loading={ajustar.isPending}
          onClick={() => void aplicar({ modelo_preferido: modelo.trim() || null }, 'Modelo atualizado.')}
        >
          Salvar modelo
        </Button>
      </div>

      {erro && <Banner tom="erro">{erro}</Banner>}

      <p className="flex items-start gap-2 border-t border-linha pt-4 text-xs text-tinta-2">
        <ShieldCheck className="mt-0.5 size-4 flex-none text-salvia" strokeWidth={1.75} aria-hidden />
        Por segurança, a chave guardada nunca é exibida de novo, nem para você. Para alterar, cadastre uma nova.
      </p>
    </div>
  )
}
