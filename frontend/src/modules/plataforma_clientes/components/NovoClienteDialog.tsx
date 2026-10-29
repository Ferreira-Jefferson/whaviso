// Provisiona um restaurante cliente: nome do restaurante + e-mail do dono. O servidor cria a conta,
// a primeira loja e o vinculo do dono; se o e-mail nunca acessou o Whaviso, devolve a mensagem
// clara (mostrada aqui). So administradores (o servidor recusa os demais).
import { useState } from 'react'
import { ApiError } from '@/shared/api_client'
import { Banner, Button, Dialog, Field, Input, useToast } from '@/shared/ui'
import { useProvisionarCliente } from '../api'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function NovoClienteDialog({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  return (
    <Dialog aberto={aberto} onFechar={aoFechar} titulo="Novo cliente" className="max-w-md">
      {aberto && <FormNovoCliente aoFechar={aoFechar} />}
    </Dialog>
  )
}

function FormNovoCliente({ aoFechar }: { aoFechar: () => void }) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const provisionar = useProvisionarCliente()
  const { mostrarToast } = useToast()

  const salvar = () => {
    const nomeLimpo = nome.trim()
    const emailLimpo = email.trim()
    if (nomeLimpo.length < 2) return setErro('Informe o nome do restaurante.')
    if (!EMAIL.test(emailLimpo)) return setErro('Informe um e-mail válido para o dono.')
    setErro(null)
    provisionar.mutate(
      { nome_restaurante: nomeLimpo, email_dono: emailLimpo },
      {
        onSuccess: () => {
          mostrarToast('Cliente criado.', { tom: 'sucesso' })
          aoFechar()
        },
        onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível criar o cliente.'),
      },
    )
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        salvar()
      }}
    >
      <p className="text-sm text-tinta-2">Cria a conta, a primeira loja e vincula o dono pelo e-mail de acesso dele.</p>
      <Field label="Nome do restaurante">
        <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
      </Field>
      <Field label="E-mail do dono" dica="O dono precisa ter entrado no Whaviso ao menos uma vez.">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" spellCheck={false} maxLength={254} placeholder="dono@restaurante.com" />
      </Field>
      {erro && <Banner tom="erro">{erro}</Banner>}
      <div className="flex flex-col gap-2">
        <Button type="submit" loading={provisionar.isPending}>
          Criar cliente
        </Button>
        <Button type="button" variante="secondary" disabled={provisionar.isPending} onClick={aoFechar}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
