import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useSearchParams } from 'react-router'
import { Button, Field, Input, Banner } from '@/shared/ui'
import { enviarCodigoWhatsapp, verificarCodigoWhatsapp } from '@/shared/supabase'
import { mensagemDeErroAuth, statusTelefone } from '@/shared/auth'
import { AuthCard } from '../components/AuthCard'
import { GoogleLoginButton } from '../components/GoogleLoginButton'
import {
  telefoneOtpSchema,
  codigoOtpSchema,
  paraE164,
  type TelefoneOtpForm,
  type CodigoOtpForm,
} from '../schemas'

// Login por WhatsApp (OTP de 6 dígitos): o Supabase gera o código e o nosso `zap`
// (Baileys) entrega pelo WhatsApp via Send SMS Hook. A copy do passo 2 varia entre
// "login" (número já cadastrado) e "cadastro" (número novo), decidido por um GET ao
// backend (/auth/status-telefone). A ENTREGA do OTP a +55 ainda é gated pela
// verificação de empresa na Meta + template de Autenticação aprovado; o fluxo de
// código já fica pronto. Para esconder de novo, volte a flag para false.
const WHATSAPP_LOGIN_ATIVO = true

export default function LoginPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const next = params.get('next')
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  // null = ainda pedindo o telefone; string = já enviamos o código para este E.164.
  const [telefoneEnviado, setTelefoneEnviado] = useState<string | null>(null)
  // null = não sabemos (status indisponível); true = número já tem cadastro (login);
  // false = número novo (cadastro). Só muda a copy, não bloqueia o envio.
  const [jaCadastrado, setJaCadastrado] = useState<boolean | null>(null)

  const formTelefone = useForm<TelefoneOtpForm>({
    resolver: zodResolver(telefoneOtpSchema),
  })
  const formCodigo = useForm<CodigoOtpForm>({
    resolver: zodResolver(codigoOtpSchema),
  })

  async function enviarCodigo(dados: TelefoneOtpForm) {
    setErroGeral(null)
    const e164 = paraE164(dados.telefone)
    if (!e164) {
      setErroGeral('Telefone inválido. Confira o DDD e o número.')
      return
    }
    // Antes de enviar, descobre a copy (login vs cadastro). Não bloqueia se falhar.
    const existe = await statusTelefone(e164)
    const { error } = await enviarCodigoWhatsapp(e164)
    if (error) {
      setErroGeral(mensagemDeErroAuth(error))
      return
    }
    setJaCadastrado(existe)
    setTelefoneEnviado(e164)
  }

  async function confirmarCodigo(dados: CodigoOtpForm) {
    if (!telefoneEnviado) return
    setErroGeral(null)
    const { error } = await verificarCodigoWhatsapp(telefoneEnviado, dados.codigo)
    if (error) {
      setErroGeral(mensagemDeErroAuth(error))
      return
    }
    // O AuthProvider resolve o perfil; os guards levam à home/onboarding.
    navigate(next ?? '/app', { replace: true })
  }

  // ---- Passo 2: digitar o código recebido no WhatsApp ----
  if (WHATSAPP_LOGIN_ATIVO && telefoneEnviado) {
    // Copy varia: login (número já cadastrado) vs cadastro (número novo). Quando o
    // status é desconhecido (null), usa um texto neutro.
    const titulo =
      jaCadastrado === false ? 'Confirme seu cadastro' : 'Digite o código'
    const subtitulo =
      jaCadastrado === false
        ? `Identificamos uma tentativa de cadastro com o WhatsApp ${telefoneEnviado}. Digite o código que enviamos para confirmar.`
        : jaCadastrado === true
          ? `Identificamos uma tentativa de login com o WhatsApp ${telefoneEnviado}. Digite o código que enviamos.`
          : `Enviamos um código no WhatsApp ${telefoneEnviado}.`
    return (
      <AuthCard titulo={titulo} subtitulo={subtitulo}>
        <form
          onSubmit={formCodigo.handleSubmit(confirmarCodigo)}
          className="flex flex-col gap-4"
          noValidate
        >
          {erroGeral && <Banner tom="erro">{erroGeral}</Banner>}

          <Field label="Código" erro={formCodigo.formState.errors.codigo?.message}>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              {...formCodigo.register('codigo')}
            />
          </Field>

          <Button
            type="submit"
            loading={formCodigo.formState.isSubmitting}
            className="w-full"
          >
            Entrar
          </Button>

          <button
            type="button"
            onClick={() => {
              setTelefoneEnviado(null)
              setJaCadastrado(null)
              setErroGeral(null)
              formCodigo.reset()
            }}
            className="text-sm text-tinta-2 hover:text-salvia hover:underline"
          >
            Usar outro número
          </button>
        </form>
      </AuthCard>
    )
  }

  // ---- Passo 1: escolher o método ----
  return (
    <AuthCard
      titulo="Entrar"
      subtitulo={
        WHATSAPP_LOGIN_ATIVO ? 'Use o Google ou o WhatsApp.' : 'Entre com o Google.'
      }
    >
      <div className="flex flex-col gap-4">
        {erroGeral && <Banner tom="erro">{erroGeral}</Banner>}

        <GoogleLoginButton onErro={setErroGeral} />

        {WHATSAPP_LOGIN_ATIVO && (
          <>
            <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-tinta-2">
              <span className="h-px flex-1 bg-linha" />
              ou
              <span className="h-px flex-1 bg-linha" />
            </div>

            <form
              onSubmit={formTelefone.handleSubmit(enviarCodigo)}
              className="flex flex-col gap-4"
              noValidate
            >
              <Field
                label="WhatsApp"
                dica="Enviaremos um código de acesso por mensagem."
                erro={formTelefone.formState.errors.telefone?.message}
              >
                <Input
                  type="tel"
                  autoComplete="tel"
                  placeholder="(11) 99999-8888"
                  {...formTelefone.register('telefone')}
                />
              </Field>

              <Button
                type="submit"
                loading={formTelefone.formState.isSubmitting}
                className="w-full"
              >
                Enviar código
              </Button>
            </form>
          </>
        )}
      </div>
    </AuthCard>
  )
}
