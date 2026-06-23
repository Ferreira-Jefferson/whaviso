// /meus/conta: perfil do devedor (nome, telefone).
// - Perfil: GET/PATCH /v1/perfil via shared/auth (atualizarPerfil + recarregarPerfil).
// Login é sem senha (Google/WhatsApp), então não há troca de senha aqui.
// Reusa a lógica de perfil de shared/auth, sem importar o módulo auth (fronteira).
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Banner, Button, Card, Field, Input, PageHeader, PhoneInput } from '@/shared/ui'
import { useAuth, atualizarPerfil } from '@/shared/auth'
import { ApiError } from '@/shared/api_client'
import { contaSchema, type ContaForm } from '../schemas'

export default function ContaDevedorPage() {
  return (
    <div className="animate-rise">
      <PageHeader titulo="Minha conta" descricao="Seus dados." />
      <div className="flex flex-col gap-6">
        <FormularioPerfil />
      </div>
    </div>
  )
}

function FormularioPerfil() {
  const { profile, recarregarPerfil } = useAuth()
  const [feedback, setFeedback] = useState<{ tom: 'sucesso' | 'erro'; msg: string } | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ContaForm>({ resolver: zodResolver(contaSchema) })

  useEffect(() => {
    if (profile) {
      reset({
        nome: profile.nome || '',
        telefone: profile.telefone ?? null,
      })
    }
  }, [profile, reset])

  async function onSubmit(dados: ContaForm) {
    setFeedback(null)
    try {
      await atualizarPerfil({
        nome: dados.nome,
        telefone: dados.telefone,
      })
      await recarregarPerfil()
      setFeedback({ tom: 'sucesso', msg: 'Dados atualizados.' })
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Não foi possível salvar. Tente novamente.'
      setFeedback({ tom: 'erro', msg })
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-lg text-salvia">Seus dados</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        {feedback && <Banner tom={feedback.tom}>{feedback.msg}</Banner>}

        <Field label="Seu nome" erro={errors.nome?.message}>
          <Input autoComplete="name" placeholder="Como devemos te chamar?" {...register('nome')} />
        </Field>

        <Field label="Telefone (opcional)" erro={errors.telefone?.message}>
          <Controller
            control={control}
            name="telefone"
            render={({ field }) => (
              <PhoneInput
                value={field.value}
                onChange={field.onChange}
                autoComplete="tel"
                invalido={Boolean(errors.telefone)}
              />
            )}
          />
        </Field>

        <Button type="submit" loading={isSubmitting} className="self-start">
          Salvar dados
        </Button>
      </form>
    </Card>
  )
}
