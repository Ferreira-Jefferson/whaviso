import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Navigate, useNavigate } from 'react-router'
import { Button, Field, Input, Banner, Spinner } from '@/shared/ui'
import { useAuth, atualizarPerfil, homeDoPapel, mensagemDeErroAuth } from '@/shared/auth'
import { atualizarTelefone, verificarNovoTelefone } from '@/shared/supabase'
import { ApiError } from '@/shared/api_client'
import { AuthCard } from '../components/AuthCard'
import { onboardingSchema, codigoOtpSchema, paraE164, type OnboardingForm, type CodigoOtpForm } from '../schemas'

// Tela curta pós-signup/primeiro login: coletamos nome e WhatsApp.
// Para usuários Google, o WhatsApp passa por verificação OTP via updateUser
// (Supabase linka a identidade phone à conta Google existente). Só depois o
// PATCH /perfil salva o telefone e o backfill de avisos acontece com segurança.
export default function OnboardingPage() {
  const navigate = useNavigate()
  const { status, profile, precisaOnboarding, role, recarregarPerfil, signOut } = useAuth()
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  // null = passo 1 (dados); string E.164 = passo 2 (código recebido no WhatsApp)
  const [telefoneVerificando, setTelefoneVerificando] = useState<string | null>(null)
  const [dadosPendentes, setDadosPendentes] = useState<OnboardingForm | null>(null)

  const formDados = useForm<OnboardingForm>({ resolver: zodResolver(onboardingSchema) })
  const formCodigo = useForm<CodigoOtpForm>({ resolver: zodResolver(codigoOtpSchema) })

  useEffect(() => {
    if (profile) {
      formDados.reset({
        nome: profile.nome || '',
        telefone: profile.telefone ?? '',
      })
    }
  }, [profile, formDados])

  if (status === 'carregando') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-salvia">
        <Spinner className="size-6" />
      </div>
    )
  }

  if (status === 'deslogado') return <Navigate to="/entrar" replace />
  if (!precisaOnboarding) return <Navigate to={homeDoPapel(role)} replace />

  // ---- Passo 1: nome + WhatsApp ----
  async function onSubmitDados(dados: OnboardingForm) {
    setErroGeral(null)
    const e164 = paraE164(dados.telefone)
    if (!e164) {
      setErroGeral('Telefone inválido. Confira o DDD e o número.')
      return
    }
    // Envia OTP via updateUser: o Supabase vincula a identidade phone ao usuário logado
    // (Google ou phone), garantindo posse do número antes do backfill.
    const { error } = await atualizarTelefone(e164)
    if (error) {
      setErroGeral(mensagemDeErroAuth(error))
      return
    }
    setDadosPendentes(dados)
    setTelefoneVerificando(e164)
  }

  // ---- Passo 2: código recebido no WhatsApp ----
  async function onConfirmarCodigo(dados: CodigoOtpForm) {
    if (!telefoneVerificando || !dadosPendentes) return
    setErroGeral(null)
    const { error } = await verificarNovoTelefone(telefoneVerificando, dados.codigo)
    if (error) {
      setErroGeral(mensagemDeErroAuth(error))
      return
    }
    try {
      const atualizado = await atualizarPerfil({
        nome: dadosPendentes.nome,
        telefone: telefoneVerificando,
      })
      await recarregarPerfil()
      navigate(homeDoPapel(atualizado.role), { replace: true })
    } catch (err) {
      setErroGeral(err instanceof ApiError ? err.message : 'Não foi possível salvar. Tente novamente.')
    }
  }

  if (telefoneVerificando) {
    return (
      <AuthCard
        titulo="Confirme seu WhatsApp"
        subtitulo={`Enviamos um código para ${telefoneVerificando}. Digite abaixo para confirmar.`}
      >
        <form
          onSubmit={formCodigo.handleSubmit(onConfirmarCodigo)}
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

          <Button type="submit" loading={formCodigo.formState.isSubmitting} className="w-full">
            Confirmar
          </Button>

          <button
            type="button"
            onClick={() => {
              setTelefoneVerificando(null)
              setDadosPendentes(null)
              setErroGeral(null)
              formCodigo.reset()
            }}
            className="text-sm text-tinta-2 hover:text-salvia hover:underline"
          >
            Usar outro número
          </button>

          <button
            type="button"
            onClick={() => void signOut()}
            className="text-sm text-tinta-2 hover:text-salvia hover:underline"
          >
            Cancelar
          </button>
        </form>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      titulo="Vamos completar seu cadastro"
      subtitulo="Informe seu nome e seu WhatsApp."
    >
      <form onSubmit={formDados.handleSubmit(onSubmitDados)} className="flex flex-col gap-4" noValidate>
        {erroGeral && <Banner tom="erro">{erroGeral}</Banner>}

        <Field label="Seu nome" erro={formDados.formState.errors.nome?.message}>
          <Input autoComplete="name" placeholder="Como devemos te chamar?" {...formDados.register('nome')} />
        </Field>

        <Field
          label="Seu WhatsApp"
          dica="Vamos confirmar com um código enviado por mensagem."
          erro={formDados.formState.errors.telefone?.message}
        >
          <Input type="tel" autoComplete="tel" placeholder="(11) 99999-8888" {...formDados.register('telefone')} />
        </Field>

        <Button type="submit" loading={formDados.formState.isSubmitting} className="w-full">
          Enviar código
        </Button>

        {/* Cancelar o onboarding: sem completar o cadastro não há conta utilizável, então
            cancelar encerra a sessão; ao deslogar, o guard desta página leva a /entrar. */}
        <button
          type="button"
          onClick={() => void signOut()}
          className="text-sm text-tinta-2 hover:text-salvia hover:underline"
        >
          Cancelar
        </button>
      </form>
    </AuthCard>
  )
}
