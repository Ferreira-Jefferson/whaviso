// Credencial do Asaas (gateway de pagamento intermediado). A chave em si ja e dado de banco
// (credenciais_psp, modulo pagamentos); aqui so a tela de admin que faltava.
import { useState } from 'react'
import { CreditCard } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Badge, Banner, Button, Card, Field, Input, SecretField, Skeleton, useToast } from '@/shared/ui'
import { formatarDataHora } from '@/shared/format'
import { useAsaasStatus, useSalvarAsaas } from '../api'
import { AreaErro } from './AreaErro'

function mensagem(e: unknown, padrao: string): string {
  return e instanceof ApiError ? e.message : padrao
}

export function CartaoAsaas() {
  const status = useAsaasStatus()
  const salvar = useSalvarAsaas()
  const { mostrarToast } = useToast()
  const [chave, setChave] = useState('')

  const enviar = () => {
    if (!chave.trim()) return
    salvar.mutate(
      { chave: chave.trim() },
      {
        onSuccess: () => {
          setChave('')
          mostrarToast('Credencial do Asaas salva.', { tom: 'sucesso' })
        },
        onError: (e) => mostrarToast(mensagem(e, 'Não foi possível salvar a credencial.'), { tom: 'erro' }),
      },
    )
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <CreditCard className="size-5 flex-none text-salvia" aria-hidden />
        <div className="flex flex-col gap-1">
          <h2 className="text-lg text-salvia">Asaas</h2>
          <p className="text-sm text-tinta-2">
            Gateway do pagamento intermediado (Pix e cartão). A API key fica aqui; o modelo de
            ambiente e wallet seguem na configuração de deploy.
          </p>
        </div>
      </div>

      {status.isPending && <Skeleton className="h-10 w-48" />}
      {status.isError && <AreaErro erro={status.error} aoTentarDeNovo={() => void status.refetch()} />}
      {status.isSuccess && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tom={status.data.configurada ? 'sucesso' : 'neutro'}>
              {status.data.configurada ? 'Configurada' : 'Não configurada'}
            </Badge>
            {status.data.configurada && <SecretField rotulo="Cifrada" />}
            {status.data.atualizado_em && (
              <span className="text-xs text-tinta-2">atualizada em {formatarDataHora(status.data.atualizado_em)}</span>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Field label={status.data.configurada ? 'Trocar a API key' : 'API key do Asaas'}>
                <Input
                  type="password"
                  autoComplete="off"
                  value={chave}
                  onChange={(e) => setChave(e.target.value)}
                  placeholder="$aact_..."
                />
              </Field>
            </div>
            <Button onClick={enviar} loading={salvar.isPending} disabled={!chave.trim()}>
              Salvar
            </Button>
          </div>
          {salvar.isError && <Banner tom="erro">{mensagem(salvar.error, 'Não foi possível salvar a credencial.')}</Banner>}
        </div>
      )}
    </Card>
  )
}
