// Credencial do numero oficial do whaviso no WhatsApp (Meta Cloud API). Hoje nao ha nenhuma
// feature que a CONSOME ainda (OTP de login por telefone, notificacao pelo numero oficial): esta
// tela so guarda e deixa administravel pra quando essa feature existir, sem precisar de redeploy.
import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Badge, Banner, Button, Card, Field, Input, SecretField, Skeleton, useToast } from '@/shared/ui'
import { formatarDataHora } from '@/shared/format'
import { useSalvarWhatsappOficial, useWhatsappOficial } from '../api'
import { AreaErro } from './AreaErro'

function mensagem(e: unknown, padrao: string): string {
  return e instanceof ApiError ? e.message : padrao
}

export function CartaoWhatsappOficial() {
  const status = useWhatsappOficial()
  const salvar = useSalvarWhatsappOficial()
  const { mostrarToast } = useToast()
  const [accessToken, setAccessToken] = useState('')
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [wabaId, setWabaId] = useState('')

  const enviar = () => {
    if (!accessToken.trim() || !phoneNumberId.trim()) return
    salvar.mutate(
      { access_token: accessToken.trim(), phone_number_id: phoneNumberId.trim(), waba_id: wabaId.trim() || null },
      {
        onSuccess: () => {
          setAccessToken('')
          mostrarToast('Credencial do número oficial salva.', { tom: 'sucesso' })
        },
        onError: (e) => mostrarToast(mensagem(e, 'Não foi possível salvar a credencial.'), { tom: 'erro' }),
      },
    )
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <MessageCircle className="size-5 flex-none text-salvia" aria-hidden />
        <div className="flex flex-col gap-1">
          <h2 className="text-lg text-salvia">WhatsApp oficial</h2>
          <p className="text-sm text-tinta-2">
            Número do whaviso na Meta Cloud API, reservado para funcionalidades futuras (ex.: OTP de
            login por telefone). Preparatório: ainda não há nada consumindo esta credencial.
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
            {status.data.phone_number_id && (
              <span className="text-xs text-tinta-2">phone_number_id {status.data.phone_number_id}</span>
            )}
            {status.data.atualizado_em && (
              <span className="text-xs text-tinta-2">atualizada em {formatarDataHora(status.data.atualizado_em)}</span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone Number ID">
              <Input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} placeholder="1234567890" />
            </Field>
            <Field label="WABA ID" dica="Opcional; usado pelo sync de templates.">
              <Input value={wabaId} onChange={(e) => setWabaId(e.target.value)} placeholder="999888777" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Access token">
                <Input
                  type="password"
                  autoComplete="off"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="EAAG..."
                />
              </Field>
            </div>
          </div>
          <Button
            className="self-start"
            onClick={enviar}
            loading={salvar.isPending}
            disabled={!accessToken.trim() || !phoneNumberId.trim()}
          >
            Salvar
          </Button>
          {salvar.isError && <Banner tom="erro">{mensagem(salvar.error, 'Não foi possível salvar a credencial.')}</Banner>}
        </div>
      )}
    </Card>
  )
}
