// Dialog de cadastro/edicao de uma pessoa da equipe. Em "criar" e um formulario simples;
// em "editar" carrega o detalhe (com escalas), permite arquivar/reativar e edita a escala.
// PII: o telefone atual aparece so MASCARADO; para trocar, digita-se um numero novo (nunca
// reexibimos o numero em claro nesta tela). O backend normaliza/valida o telefone BR.
import { useMemo, useState } from 'react'
import { Lock } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  ErrorState,
  Field,
  Input,
  PhoneInput,
  Select,
  Skeleton,
  useToast,
} from '@/shared/ui'
import type { PessoaPatch } from '@/shared/contracts/_generated/pessoas'
import {
  useAtualizarPessoa,
  useCargos,
  useCriarPessoa,
  usePessoaDetalhe,
  type Cargo,
  type PessoaDetalhe,
} from '../api'
import { EscalaEditor } from './EscalaEditor'

interface Props {
  aberto: boolean
  /** null = cadastro novo; preenchido = edicao daquela pessoa. */
  pessoaId: string | null
  aoFechar: () => void
}

export function PessoaDialog({ aberto, pessoaId, aoFechar }: Props) {
  const ehEdicao = pessoaId != null
  const detalhe = usePessoaDetalhe(ehEdicao ? pessoaId : null)

  return (
    <Dialog
      aberto={aberto}
      onFechar={aoFechar}
      titulo={ehEdicao ? 'Editar pessoa' : 'Nova pessoa'}
      className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto"
    >
      {!ehEdicao && <Formulario key="novo" pessoa={null} aoFechar={aoFechar} />}
      {ehEdicao && detalhe.isPending && <Esqueleto />}
      {ehEdicao && detalhe.isError && <ErrorState aoTentarDeNovo={() => void detalhe.refetch()} />}
      {ehEdicao && detalhe.data && (
        <Formulario key={detalhe.data.id} pessoa={detalhe.data} aoFechar={aoFechar} />
      )}
    </Dialog>
  )
}

function mensagem(e: unknown, padrao: string): string {
  return e instanceof ApiError ? e.message : padrao
}

function Formulario({ pessoa, aoFechar }: { pessoa: PessoaDetalhe | null; aoFechar: () => void }) {
  const ehEdicao = pessoa != null
  const cargos = useCargos()

  const [nome, setNome] = useState(pessoa?.nome ?? '')
  const [cargoId, setCargoId] = useState(pessoa?.cargo_id ?? '')
  // Telefone NOVO digitado (E.164) ou null. Em edicao, vazio = manter o atual.
  const [telefoneNovo, setTelefoneNovo] = useState<string | null>(null)
  const [removerTelefone, setRemoverTelefone] = useState(false)
  const [observacoes, setObservacoes] = useState(pessoa?.observacoes ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [confirmarArquivar, setConfirmarArquivar] = useState(false)

  const criar = useCriarPessoa()
  const atualizar = useAtualizarPessoa()
  const { mostrarToast } = useToast()
  const salvando = criar.isPending || atualizar.isPending

  // Cargos selecionaveis: ativos + o cargo atual da pessoa (mesmo arquivado, para nao sumir).
  const opcoesCargo = useMemo<ReadonlyArray<Cargo>>(() => {
    const itens = cargos.data?.itens ?? []
    return itens.filter((c) => c.ativo || c.id === pessoa?.cargo_id)
  }, [cargos.data, pessoa?.cargo_id])

  const cargoEfetivo = cargoId || opcoesCargo[0]?.id || ''

  const salvar = () => {
    const nomeLimpo = nome.trim()
    if (nomeLimpo.length === 0) {
      setErro('Informe o nome.')
      return
    }
    if (!cargoEfetivo) {
      setErro('Escolha um cargo.')
      return
    }
    setErro(null)
    const obs = observacoes.trim()

    if (!ehEdicao) {
      criar.mutate(
        {
          nome: nomeLimpo,
          cargo_id: cargoEfetivo,
          ...(telefoneNovo ? { telefone: telefoneNovo } : {}),
          ...(obs ? { observacoes: obs } : {}),
        },
        {
          onSuccess: () => {
            mostrarToast('Pessoa cadastrada.', { tom: 'sucesso' })
            aoFechar()
          },
          onError: (e) => setErro(mensagem(e, 'Não foi possível cadastrar.')),
        },
      )
      return
    }

    const patch: PessoaPatch = {}
    if (nomeLimpo !== pessoa.nome) patch.nome = nomeLimpo
    if (cargoEfetivo !== pessoa.cargo_id) patch.cargo_id = cargoEfetivo
    if (removerTelefone) patch.telefone = null
    else if (telefoneNovo) patch.telefone = telefoneNovo
    if (obs !== (pessoa.observacoes ?? '')) patch.observacoes = obs.length > 0 ? obs : null

    if (Object.keys(patch).length === 0) {
      aoFechar()
      return
    }
    atualizar.mutate(
      { id: pessoa.id, patch },
      {
        onSuccess: () => {
          mostrarToast('Pessoa atualizada.', { tom: 'sucesso' })
          aoFechar()
        },
        onError: (e) => setErro(mensagem(e, 'Não foi possível salvar.')),
      },
    )
  }

  const alternarAtivo = () => {
    if (!pessoa) return
    atualizar.mutate(
      { id: pessoa.id, patch: { ativo: !pessoa.ativo } },
      {
        onSuccess: () => {
          mostrarToast(pessoa.ativo ? 'Pessoa arquivada.' : 'Pessoa reativada.', { tom: 'sucesso' })
          setConfirmarArquivar(false)
          aoFechar()
        },
        onError: (e) => {
          setConfirmarArquivar(false)
          setErro(mensagem(e, 'Não foi possível mudar o status.'))
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-5 text-left">
      {ehEdicao && !pessoa.ativo && (
        <Badge tom="neutro" className="self-start">
          Arquivada
        </Badge>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          salvar()
        }}
        className="flex flex-col gap-4"
      >
        <Field label="Nome">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} autoFocus placeholder="Nome da pessoa" />
        </Field>

        <Field label="Cargo" erro={cargos.isError ? 'Não foi possível carregar os cargos.' : undefined}>
          <Select
            ariaLabel="Cargo"
            value={cargoEfetivo}
            disabled={cargos.isPending || opcoesCargo.length === 0}
            onChange={setCargoId}
            options={opcoesCargo.map((c) => ({
              value: c.id,
              label: c.ativo ? c.nome : `${c.nome} (arquivado)`,
            }))}
          />
        </Field>

        <Field
          label="Telefone"
          dica={ehEdicao ? 'Deixe em branco para manter o telefone atual.' : undefined}
        >
          <PhoneInput
            value={telefoneNovo}
            onChange={(v) => {
              setTelefoneNovo(v)
              if (v) setRemoverTelefone(false)
            }}
          />
        </Field>
        {ehEdicao && (
          <div className="-mt-2 flex items-center gap-2 text-xs text-tinta-2">
            <Lock className="size-3.5 flex-none" aria-hidden />
            {removerTelefone ? (
              <span>O telefone será removido ao salvar.</span>
            ) : (
              <>
                <span className="tabular">Atual: {pessoa.telefone_mascarado ?? 'não informado'}</span>
                {pessoa.telefone_mascarado && (
                  <button
                    type="button"
                    onClick={() => {
                      setRemoverTelefone(true)
                      setTelefoneNovo(null)
                    }}
                    className="font-medium text-barro underline underline-offset-2 hover:opacity-80"
                  >
                    Remover
                  </button>
                )}
              </>
            )}
          </div>
        )}

        <Field label="Observações">
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Anotações internas "
            className="w-full resize-y rounded-input border border-linha bg-cartao px-3 py-2.5 text-sm text-tinta placeholder:text-tinta-2/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
          />
        </Field>

        {erro && (
          <p className="text-sm text-barro" role="alert">
            {erro}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={salvando}>
            {ehEdicao ? 'Salvar' : 'Cadastrar'}
          </Button>
          <Button type="button" variante="secondary" disabled={salvando} onClick={aoFechar}>
            Cancelar
          </Button>
          {ehEdicao && (
            <Button
              type="button"
              variante={pessoa.ativo ? 'ghost' : 'secondary'}
              disabled={salvando}
              className="ml-auto"
              onClick={() => (pessoa.ativo ? setConfirmarArquivar(true) : alternarAtivo())}
            >
              {pessoa.ativo ? 'Arquivar' : 'Reativar'}
            </Button>
          )}
        </div>
      </form>

      {ehEdicao && (
        <>
          <div className="h-px w-full bg-linha" />
          <EscalaEditor pessoaId={pessoa.id} escalas={pessoa.escalas} />
        </>
      )}

      {ehEdicao && (
        <ConfirmDialog
          aberto={confirmarArquivar}
          titulo="Arquivar pessoa?"
          textoConfirmar="Arquivar"
          variante="destructive"
          carregando={atualizar.isPending}
          onConfirmar={alternarAtivo}
          onCancelar={() => setConfirmarArquivar(false)}
        >
          A pessoa sai da lista ativa, mas o histórico é mantido. Dá para reativar depois.
        </ConfirmDialog>
      )}
    </div>
  )
}

function Esqueleto() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-20 w-full" />
    </div>
  )
}
