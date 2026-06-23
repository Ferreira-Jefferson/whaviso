import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Navigate, useNavigate } from 'react-router'
import { Button, Field, Input, Banner, Spinner } from '@/shared/ui'
import { useAuth, atualizarPerfil, homeDoPapel } from '@/shared/auth'
import { ApiError } from '@/shared/api_client'
import { AuthCard } from '../components/AuthCard'
import { onboardingSchema, paraE164, type OnboardingForm } from '../schemas'

// Tela curta pós-signup/primeiro login: o trigger do backend cria o profile com
// nome vazio (role 'user' por padrão), então aqui coletamos nome e WhatsApp e fazemos
// PATCH /v1/perfil. O WhatsApp serve para "puxar" os avisos abertos para esse número
// (backfill por telefone na api). Depois → home do papel. O Pix NÃO é pedido aqui, só
// no cadastro de um aviso (NovoAviso).
export default function OnboardingPage() {
  const navigate = useNavigate()
  const { status, profile, precisaOnboarding, role, recarregarPerfil } = useAuth()
  const [erroGeral, setErroGeral] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingForm>({ resolver: zodResolver(onboardingSchema) })

  // Pré-preenche se já houver algum dado parcial no perfil.
  useEffect(() => {
    if (profile) {
      reset({
        nome: profile.nome || '',
        telefone: profile.telefone ?? '',
      })
    }
  }, [profile, reset])

  if (status === 'carregando') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-salvia">
        <Spinner className="size-6" />
      </div>
    )
  }

  // Sem sessão → login. Perfil já completo → segue para a home do papel.
  if (status === 'deslogado') return <Navigate to="/entrar" replace />
  if (!precisaOnboarding) return <Navigate to={homeDoPapel(role)} replace />

  async function onSubmit(dados: OnboardingForm) {
    setErroGeral(null)
    try {
      // PATCH retorna o perfil atualizado (com o role definitivo do banco).
      const atualizado = await atualizarPerfil({
        nome: dados.nome,
        telefone: paraE164(dados.telefone),
      })
      // Sincroniza o provider; o redirect usa o role da resposta (não o do closure).
      await recarregarPerfil()
      navigate(homeDoPapel(atualizado.role), { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        setErroGeral(err.message)
        return
      }
      setErroGeral('Não foi possível salvar. Tente novamente.')
    }
  }

  return (
    <AuthCard
      titulo="Vamos completar seu cadastro"
      subtitulo="Informe seu nome e seu WhatsApp."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        {erroGeral && <Banner tom="erro">{erroGeral}</Banner>}

        <Field label="Seu nome" erro={errors.nome?.message}>
          <Input autoComplete="name" placeholder="Como devemos te chamar?" {...register('nome')} />
        </Field>

        <Field
          label="Seu WhatsApp"
          dica="Usamos para encontrar os avisos registrados para o seu WhatsApp."
          erro={errors.telefone?.message}
        >
          <Input type="tel" autoComplete="tel" placeholder="(11) 99999-8888" {...register('telefone')} />
        </Field>

        <Button type="submit" loading={isSubmitting} className="w-full">
          Concluir
        </Button>
      </form>
    </AuthCard>
  )
}
