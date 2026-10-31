// Credencial do Resend (e-mail transacional): boas-vindas da allowlist de login. Ja e ativamente
// consumida pelo dreno de e-mail do zap, que agora le do banco a cada ciclo (sem precisar reiniciar).
import { useState } from 'react'
import { Mail } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Badge, Banner, Button, Card, Field, Input, SecretField, Skeleton, useToast } from '@/shared/ui'
import { formatarDataHora } from '@/shared/format'
import { useEmailPlataforma, useSalvarEmailPlataforma } from '../api'
import { AreaErro } from './AreaErro'

function mensagem(e: unknown, padrao: string): string {
  return e instanceof ApiError ? e.message : padrao
}

export function CartaoEmail() {
  const status = useEmailPlataforma()
  const salvar = useSalvarEmailPlataforma()
  const { mostrarToast } = useToast()
  const [apiKey, setApiKey] = useState('')
  const [remetente, setRemetente] = useState('')

  const enviar = () => {
    if (!apiKey.trim() || !remetente.trim()) return
    salvar.mutate(
      { api_key: apiKey.trim(), remetente: remetente.trim() },
      {
        onSuccess: () => {
          setApiKey('')
          mostrarToast('Credencial de e-mail salva.', { tom: 'sucesso' })
        },
        onError: (e) => mostrarToast(mensagem(e, 'Não foi possível salvar a credencial.'), { tom: 'erro' }),
      },
    )
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <Mail className="size-5 flex-none text-salvia" aria-hidden />
        <div className="flex flex-col gap-1">
          <h2 className="text-lg text-salvia">E-mail transacional</h2>
          <p className="text-sm text-tinta-2">
            Resend, usado para o boas-vindas da allowlist de login. Sem credencial, os e-mails ficam
            retidos na fila até você configurar.
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
            {status.data.remetente && <span className="text-xs text-tinta-2">remetente {status.data.remetente}</span>}
            {status.data.atualizado_em && (
              <span className="text-xs text-tinta-2">atualizada em {formatarDataHora(status.data.atualizado_em)}</span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Remetente" dica='Formato "Nome <endereco@dominio>".'>
              <Input value={remetente} onChange={(e) => setRemetente(e.target.value)} placeholder="Whaviso <nao-responda@whaviso.com>" />
            </Field>
            <Field label="API key do Resend">
              <Input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="re_..." />
            </Field>
          </div>
          <Button className="self-start" onClick={enviar} loading={salvar.isPending} disabled={!apiKey.trim() || !remetente.trim()}>
            Salvar
          </Button>
          {salvar.isError && <Banner tom="erro">{mensagem(salvar.error, 'Não foi possível salvar a credencial.')}</Banner>}
        </div>
      )}
    </Card>
  )
}
