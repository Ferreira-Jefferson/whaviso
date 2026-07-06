import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useSearchParams } from 'react-router'
import { Button, Field, Input, Banner } from '@/shared/ui'
import { enviarCodigoWhatsapp, verificarCodigoWhatsapp, completarMesclagem } from '@/shared/supabase'
import { mensagemDeErroAuth, nextSeguro, statusTelefone, verificarSessao } from '@/shared/auth'
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
// entrega pelo WhatsApp via Send SMS Hook (Meta Cloud API, template AUTHENTICATION). A
// copy do passo 2 varia entre "login" (número já cadastrado) e "cadastro" (número novo),
// decidido por um GET ao backend (/auth/status-telefone). Para esconder de novo, volte a
// flag para false.
const WHATSAPP_LOGIN_ATIVO = true

export default function LoginPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const next = nextSeguro(params.get('next'))
  // Quem chega pelos botões de "Criar conta" traz ?modo=cadastro: muda só a copy
  // do passo 1 (cadastrar x entrar). O passo 2 do OTP decide login/cadastro pelo
  // status real do número, então não depende disso.
  const modoCadastro = params.get('modo') === 'cadastro'
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
    // Consulta o status do número apenas para determinar a copy (login vs cadastro).
    // Não bloqueia mais pelo método: conta split é resolvida pelo backend após o OTP.
    const status = await statusTelefone(e164)
    const { error } = await enviarCodigoWhatsapp(e164)
    if (error) {
      setErroGeral(mensagemDeErroAuth(error))
      return
    }
    setJaCadastrado(status?.existe ?? null)
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
    // Detecta conta split (phone-only sem profile, mas phone já existe numa conta Google).
    // Se houver merge, troca a sessão transparentemente antes de navegar.
    const resultado = await verificarSessao()
    if (resultado?.tipo === 'mesclado' && resultado.magic_token) {
      await completarMesclagem(resultado.magic_token)
    }
    // AuthProvider resolve o perfil pela mudança de sessão; guards levam à home/onboarding.
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
        ? `O código verificador foi enviado para o WhatsApp ${telefoneEnviado}. Digite-o abaixo para confirmar seu cadastro.`
        : `O código verificador foi enviado para o WhatsApp ${telefoneEnviado}. Digite-o abaixo.`
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
  const tituloPasso1 = modoCadastro ? 'Criar conta' : 'Entrar'
  const subtituloPasso1 = WHATSAPP_LOGIN_ATIVO
    ? modoCadastro
      ? 'Crie sua conta com o Google ou o WhatsApp.'
      : 'Use o Google ou o WhatsApp.'
    : modoCadastro
      ? 'Crie sua conta com o Google.'
      : 'Entre com o Google.'
  return (
    <AuthCard titulo={tituloPasso1} subtitulo={subtituloPasso1}>
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
