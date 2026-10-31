// Cadastra um usuario (dono de restaurante, equipe dele ou alguem a vincular a uma loja ja
// cadastrada). Dois caminhos mutuamente exclusivos: "Nova conta" (nome + e-mail + plano opcional;
// a pessoa cria a propria loja depois) ou "Vincular a loja existente" (pelo codigo publico da
// loja; exige que o e-mail ja tenha entrado no Whaviso uma vez). O toggle "ja liberar o acesso"
// aprova o login na hora ou deixa pendente (ex.: aguardando pagamento). So administradores (o
// servidor recusa os demais).
import { useState } from 'react'
import { ApiError } from '@/shared/api_client'
import { Banner, Button, Dialog, Field, Input, SegmentedControl, Select, Switch, useToast } from '@/shared/ui'
import { brl } from '@/shared/format'
import { useCriarUsuario, usePlanosAtivos } from '../api'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Modo = 'nova_conta' | 'vincular_loja'

export function NovoUsuarioDialog({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  return (
    <Dialog aberto={aberto} onFechar={aoFechar} titulo="Novo usuário" className="max-w-md">
      {aberto && <FormNovoUsuario aoFechar={aoFechar} />}
    </Dialog>
  )
}

function FormNovoUsuario({ aoFechar }: { aoFechar: () => void }) {
  const [modo, setModo] = useState<Modo>('nova_conta')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [codigoLoja, setCodigoLoja] = useState('')
  const [planoId, setPlanoId] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const criar = useCriarUsuario()
  const planos = usePlanosAtivos()
  const { mostrarToast } = useToast()

  const salvar = () => {
    const nomeLimpo = nome.trim()
    const emailLimpo = email.trim()
    if (nomeLimpo.length < 2) return setErro('Informe o nome.')
    if (!EMAIL.test(emailLimpo)) return setErro('Informe um e-mail válido.')
    const codigoLimpo = codigoLoja.trim()
    if (modo === 'vincular_loja' && codigoLimpo.length < 1) return setErro('Informe o código da loja.')
    setErro(null)
    criar.mutate(
      {
        nome: nomeLimpo,
        email: emailLimpo,
        ativo,
        ...(modo === 'vincular_loja' ? { loja_codigo_publico: codigoLimpo } : {}),
        ...(modo === 'nova_conta' && planoId ? { plano_id: planoId } : {}),
      },
      {
        onSuccess: () => {
          mostrarToast('Usuário criado.', { tom: 'sucesso' })
          aoFechar()
        },
        onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível criar o usuário.'),
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
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-tinta">Tipo de cadastro</span>
        <SegmentedControl
          value={modo}
          onChange={setModo}
          ariaLabel="Tipo de cadastro"
          preencher
          options={[
            { value: 'nova_conta', label: 'Nova conta' },
            { value: 'vincular_loja', label: 'Vincular a loja existente' },
          ]}
        />
      </div>

      <Field label="Nome">
        <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
      </Field>
      <Field
        label="E-mail"
        dica={
          modo === 'vincular_loja'
            ? 'A pessoa precisa ter entrado no Whaviso ao menos uma vez.'
            : undefined
        }
      >
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" spellCheck={false} maxLength={254} placeholder="pessoa@restaurante.com" />
      </Field>

      {modo === 'vincular_loja' ? (
        <Field label="Código da loja" dica="O código público da loja aparece na ficha da conta.">
          <Input value={codigoLoja} onChange={(e) => setCodigoLoja(e.target.value)} maxLength={40} autoComplete="off" spellCheck={false} />
        </Field>
      ) : (
        <Field label="Plano (opcional)" dica="A pessoa cria a própria loja depois de entrar pela primeira vez.">
          <Select
            value={planoId}
            onChange={setPlanoId}
            ariaLabel="Plano"
            disabled={planos.isPending}
            options={[
              { value: '', label: 'Sem plano' },
              ...(planos.data ?? []).map((p) => ({ value: p.id, label: `${p.nome} (${brl(p.valor_centavos)})` })),
            ]}
          />
        </Field>
      )}

      <div className="flex items-start justify-between gap-3 rounded-input border border-linha p-3">
        <div>
          <p className="text-sm font-medium text-tinta">Já liberar o acesso</p>
          <p className="text-xs text-tinta-2">
            {ativo
              ? 'A pessoa já consegue entrar no Whaviso agora.'
              : 'Fica aguardando aprovação.'}
          </p>
        </div>
        <Switch ligado={ativo} onMudar={setAtivo} rotulo="Já liberar o acesso" />
      </div>

      {erro && <Banner tom="erro">{erro}</Banner>}
      <div className="flex flex-col gap-2">
        <Button type="submit" loading={criar.isPending}>
          Criar usuário
        </Button>
        <Button type="button" variante="secondary" disabled={criar.isPending} onClick={aoFechar}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
