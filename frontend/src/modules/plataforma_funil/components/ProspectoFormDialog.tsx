// Cadastro e edicao de prospecto. O telefone (PII de terceiro) so aparece em claro aqui porque o
// operador acabou de digitar ou abriu o detalhe para ligar; nunca vai para lista nem log. O
// servidor valida o telefone BR (422 telefone_invalido) e recusa duplicata (409 com o id existente).
import { useState } from 'react'
import { Banner, Button, Dialog, Field, Input, useToast } from '@/shared/ui'
import type { ProspectoAtualizacao, ProspectoNovo } from '@/shared/contracts/_generated/plataforma_funil'
import { useAtualizarProspecto, useCriarProspecto, type ProspectoDetalhe } from '../api'
import { mensagemDeErro } from '../erros'

interface Props {
  aberto: boolean
  /** null = cadastro novo; preenchido = edicao. */
  prospecto: ProspectoDetalhe | null
  aoFechar: () => void
  /** Chamado com o id do prospecto criado (para abrir o detalhe em seguida). */
  aoCriar?: (id: string) => void
}

export function ProspectoFormDialog({ aberto, prospecto, aoFechar, aoCriar }: Props) {
  return (
    <Dialog
      aberto={aberto}
      onFechar={aoFechar}
      titulo={prospecto ? 'Editar prospecto' : 'Novo prospecto'}
      className="max-h-[90dvh] max-w-lg overflow-y-auto"
    >
      {aberto && <Formulario key={prospecto?.id ?? 'novo'} prospecto={prospecto} aoFechar={aoFechar} aoCriar={aoCriar} />}
    </Dialog>
  )
}

const CLASSE_TEXTAREA =
  'w-full rounded-input border border-linha bg-cartao px-3 py-2.5 text-sm text-tinta placeholder:text-tinta-2/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia'

function Formulario({ prospecto, aoFechar, aoCriar }: Omit<Props, 'aberto'>) {
  const [nome, setNome] = useState(prospecto?.nome_restaurante ?? '')
  const [contatoNome, setContatoNome] = useState(prospecto?.contato_nome ?? '')
  const [telefone, setTelefone] = useState(prospecto?.contato_telefone ?? '')
  const [email, setEmail] = useState(prospecto?.contato_email ?? '')
  const [cidade, setCidade] = useState(prospecto?.cidade ?? '')
  const [origem, setOrigem] = useState(prospecto?.origem ?? '')
  const [observacoes, setObservacoes] = useState(prospecto?.observacoes ?? '')
  const [erro, setErro] = useState<string | null>(null)

  const criar = useCriarProspecto()
  const atualizar = useAtualizarProspecto()
  const { mostrarToast } = useToast()
  const salvando = criar.isPending || atualizar.isPending

  const salvar = () => {
    const nomeLimpo = nome.trim()
    if (nomeLimpo.length === 0) return setErro('Informe o nome do restaurante.')
    setErro(null)
    const campos = {
      contato_nome: contatoNome.trim(),
      contato_telefone: telefone.trim(),
      contato_email: email.trim(),
      cidade: cidade.trim(),
      origem: origem.trim(),
      observacoes: observacoes.trim(),
    }

    if (!prospecto) {
      const body: ProspectoNovo = { nome_restaurante: nomeLimpo }
      for (const [k, v] of Object.entries(campos)) if (v) (body as Record<string, string>)[k] = v
      criar.mutate(body, {
        onSuccess: (p) => {
          mostrarToast('Prospecto cadastrado.', { tom: 'sucesso' })
          aoFechar()
          aoCriar?.(p.id)
        },
        onError: (e) => setErro(mensagemDeErro(e, 'Não foi possível cadastrar.')),
      })
      return
    }

    // Edicao: so o que mudou; campo esvaziado limpa (null).
    const atual: Record<string, string> = {
      contato_nome: prospecto.contato_nome ?? '',
      contato_telefone: prospecto.contato_telefone ?? '',
      contato_email: prospecto.contato_email ?? '',
      cidade: prospecto.cidade ?? '',
      origem: prospecto.origem ?? '',
      observacoes: prospecto.observacoes ?? '',
    }
    const patch: Record<string, string | null> = {}
    if (nomeLimpo !== prospecto.nome_restaurante) patch.nome_restaurante = nomeLimpo
    for (const [k, v] of Object.entries(campos)) if (v !== atual[k]) patch[k] = v === '' ? null : v
    if (Object.keys(patch).length === 0) return aoFechar()
    atualizar.mutate(
      { id: prospecto.id, patch: patch as ProspectoAtualizacao },
      {
        onSuccess: () => {
          mostrarToast('Prospecto atualizado.', { tom: 'sucesso' })
          aoFechar()
        },
        onError: (e) => setErro(mensagemDeErro(e, 'Não foi possível salvar.')),
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
      <Field label="Restaurante">
        <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nome do contato">
          <Input value={contatoNome} onChange={(e) => setContatoNome(e.target.value)} maxLength={120} />
        </Field>
        <Field label="Telefone do contato" dica="Com DDD. O servidor confere o número e avisa se já existe um prospecto com ele.">
          <Input type="tel" inputMode="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} maxLength={30} autoComplete="off" />
        </Field>
        <Field label="E-mail do contato">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} autoComplete="off" />
        </Field>
        <Field label="Cidade">
          <Input value={cidade} onChange={(e) => setCidade(e.target.value)} maxLength={80} />
        </Field>
      </div>
      <Field label="Como chegou" dica="Texto curto: indicação, Instagram, evento...">
        <Input value={origem} onChange={(e) => setOrigem(e.target.value)} maxLength={80} />
      </Field>
      <Field label="Observações">
        <textarea
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          rows={3}
          maxLength={4000}
          className={CLASSE_TEXTAREA}
        />
      </Field>
      <p className="text-xs text-tinta-2">Guarde só o necessário para o contato comercial. Esses dados são de terceiros.</p>
      {erro && <Banner tom="erro">{erro}</Banner>}
      <div className="flex flex-col gap-2">
        <Button type="submit" loading={salvando}>
          {prospecto ? 'Salvar' : 'Cadastrar'}
        </Button>
        <Button type="button" variante="secondary" disabled={salvando} onClick={aoFechar}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
