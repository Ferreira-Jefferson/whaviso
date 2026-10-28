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
import type { PessoaEntregaNova, PessoaPatch } from '@/shared/contracts/_generated/pessoas'
import {
  useAtualizarPessoa,
  useCargos,
  useCriarPessoa,
  useDefinirEntrega,
  usePessoaDetalhe,
  type Cargo,
  type PessoaDetalhe,
} from '../api'
import { entregaInicial, type EntregaForm } from '../estados'
import { EntregaSecao } from './EntregaSecao'
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
  const [entrega, setEntrega] = useState<EntregaForm>(() => entregaInicial(pessoa?.entrega ?? null))
  const [erro, setErro] = useState<string | null>(null)
  const [confirmarArquivar, setConfirmarArquivar] = useState(false)

  const criar = useCriarPessoa()
  const atualizar = useAtualizarPessoa()
  const definirEntrega = useDefinirEntrega()
  const { mostrarToast } = useToast()
  const salvando = criar.isPending || atualizar.isPending || definirEntrega.isPending

  // Cargos selecionaveis: ativos + o cargo atual da pessoa (mesmo arquivado, para nao sumir).
  const opcoesCargo = useMemo<ReadonlyArray<Cargo>>(() => {
    const itens = cargos.data?.itens ?? []
    return itens.filter((c) => c.ativo || c.id === pessoa?.cargo_id)
  }, [cargos.data, pessoa?.cargo_id])

  const cargoEfetivo = cargoId || opcoesCargo[0]?.id || ''
  // A secao de entrega so aparece para o cargo com chave 'motoboy' (a pessoa da entrega).
  const ehMotoboy = opcoesCargo.find((c) => c.id === cargoEfetivo)?.chave === 'motoboy'
  const mudarEntrega = (patch: Partial<EntregaForm>) => setEntrega((e) => ({ ...e, ...patch }))

  /** Corpo do PUT /entrega a partir do formulario (placa/Pix: ausente mantem, null limpa, valor troca). */
  function corpoEntrega(): PessoaEntregaNova {
    const body: PessoaEntregaNova = {
      veiculo: entrega.veiculo,
      regime_pagamento: entrega.regime,
      periodicidade_fixo: entrega.periodicidade,
      valor_fixo_centavos: entrega.regime === 'por_entrega' ? 0 : (entrega.valorFixo ?? 0),
    }
    const placaLimpa = entrega.placa.trim()
    if (ehEdicao) {
      if (placaLimpa !== (pessoa?.entrega?.placa ?? '')) body.placa = placaLimpa === '' ? null : placaLimpa
    } else if (placaLimpa) {
      body.placa = placaLimpa
    }
    const pixLimpo = entrega.pix.trim()
    if (entrega.removerPix) {
      body.pix_tipo = null
      body.pix = null
    } else if (pixLimpo) {
      body.pix_tipo = entrega.pixTipo
      body.pix = pixLimpo
    }
    return body
  }

  const salvar = async () => {
    const nomeLimpo = nome.trim()
    if (nomeLimpo.length === 0) {
      setErro('Informe o nome.')
      return
    }
    if (!cargoEfetivo) {
      setErro('Escolha um cargo.')
      return
    }
    if (ehMotoboy && entrega.regime !== 'por_entrega' && !(entrega.valorFixo && entrega.valorFixo > 0)) {
      setErro('Informe o valor fixo para esse regime de pagamento.')
      return
    }
    setErro(null)
    const obs = observacoes.trim()

    try {
      let pessoaId: string
      if (!ehEdicao) {
        const nova = await criar.mutateAsync({
          nome: nomeLimpo,
          cargo_id: cargoEfetivo,
          ...(telefoneNovo ? { telefone: telefoneNovo } : {}),
          ...(obs ? { observacoes: obs } : {}),
        })
        pessoaId = nova.id
      } else {
        const patch: PessoaPatch = {}
        if (nomeLimpo !== pessoa.nome) patch.nome = nomeLimpo
        if (cargoEfetivo !== pessoa.cargo_id) patch.cargo_id = cargoEfetivo
        if (removerTelefone) patch.telefone = null
        else if (telefoneNovo) patch.telefone = telefoneNovo
        if (obs !== (pessoa.observacoes ?? '')) patch.observacoes = obs.length > 0 ? obs : null
        if (Object.keys(patch).length === 0 && !ehMotoboy) {
          aoFechar()
          return
        }
        if (Object.keys(patch).length > 0) await atualizar.mutateAsync({ id: pessoa.id, patch })
        pessoaId = pessoa.id
      }
      if (ehMotoboy) await definirEntrega.mutateAsync({ id: pessoaId, body: corpoEntrega() })
      mostrarToast(ehEdicao ? 'Pessoa atualizada.' : 'Pessoa cadastrada.', { tom: 'sucesso' })
      aoFechar()
    } catch (e) {
      setErro(mensagem(e, ehEdicao ? 'Não foi possível salvar.' : 'Não foi possível cadastrar.'))
    }
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
          void salvar()
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

        {ehMotoboy && (
          <>
            <div className="h-px w-full bg-linha" />
            <EntregaSecao
              valor={entrega}
              aoMudar={mudarEntrega}
              entregaAtual={pessoa?.entrega ?? null}
              ehEdicao={ehEdicao}
            />
          </>
        )}

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
