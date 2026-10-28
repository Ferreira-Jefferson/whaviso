// Dialog de cadastro/edicao de um fornecedor (nome, documento, telefone, observacoes). PII: o
// telefone atual aparece so MASCARADO (ultimos 4); da para revelar o claro sob demanda (dono/gerente,
// rota auditada) ou trocar digitando um novo. Nunca reexibimos o telefone em claro automaticamente.
import { useState } from 'react'
import { Eye, Lock } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Banner, Button, ConfirmDialog, Dialog, Field, Input, Textarea, useToast } from '@/shared/ui'
import type { FornecedorNovo, FornecedorPatch } from '@/shared/contracts/_generated/fornecedores'
import {
  useAlternarFornecedor,
  useAtualizarFornecedor,
  useCriarFornecedor,
  useRevelarTelefone,
  type Fornecedor,
} from '../api'

interface Props {
  aberto: boolean
  /** null = cadastro novo; preenchido = edicao daquele fornecedor. */
  fornecedor: Fornecedor | null
  aoFechar: () => void
}

export function FornecedorDialog({ aberto, fornecedor, aoFechar }: Props) {
  return (
    <Dialog
      aberto={aberto}
      onFechar={aoFechar}
      titulo={fornecedor ? 'Editar fornecedor' : 'Novo fornecedor'}
      className="max-w-lg"
    >
      {aberto && <Formulario key={fornecedor?.id ?? 'novo'} fornecedor={fornecedor} aoFechar={aoFechar} />}
    </Dialog>
  )
}

function mensagem(e: unknown, padrao: string): string {
  return e instanceof ApiError ? e.message : padrao
}

function Formulario({ fornecedor, aoFechar }: { fornecedor: Fornecedor | null; aoFechar: () => void }) {
  const ehEdicao = fornecedor != null
  const [nome, setNome] = useState(fornecedor?.nome ?? '')
  const [documento, setDocumento] = useState(fornecedor?.documento ?? '')
  const [telefone, setTelefone] = useState('')
  const [removerTelefone, setRemoverTelefone] = useState(false)
  const [observacoes, setObservacoes] = useState(fornecedor?.observacoes ?? '')
  const [telefoneRevelado, setTelefoneRevelado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmarArquivar, setConfirmarArquivar] = useState(false)

  const criar = useCriarFornecedor()
  const atualizar = useAtualizarFornecedor()
  const alternar = useAlternarFornecedor()
  const revelar = useRevelarTelefone()
  const { mostrarToast } = useToast()
  const salvando = criar.isPending || atualizar.isPending

  function salvar() {
    const nomeLimpo = nome.trim()
    const docLimpo = documento.trim()
    const telLimpo = telefone.trim()
    const obsLimpa = observacoes.trim()
    setErro(null)
    if (!nomeLimpo) return setErro('Informe o nome do fornecedor.')
    const aoErro = (e: unknown) => setErro(mensagem(e, 'Nao foi possivel salvar o fornecedor.'))

    if (!ehEdicao) {
      const corpo: FornecedorNovo = {
        nome: nomeLimpo,
        ...(docLimpo ? { documento: docLimpo } : {}),
        ...(telLimpo ? { telefone: telLimpo } : {}),
        ...(obsLimpa ? { observacoes: obsLimpa } : {}),
      }
      criar.mutate(corpo, {
        onSuccess: () => {
          mostrarToast('Fornecedor cadastrado.', { tom: 'sucesso' })
          aoFechar()
        },
        onError: aoErro,
      })
      return
    }

    const patch: FornecedorPatch = {}
    if (nomeLimpo !== fornecedor.nome) patch.nome = nomeLimpo
    if (docLimpo !== (fornecedor.documento ?? '')) patch.documento = docLimpo === '' ? null : docLimpo
    if (obsLimpa !== (fornecedor.observacoes ?? '')) patch.observacoes = obsLimpa === '' ? null : obsLimpa
    if (removerTelefone) patch.telefone = null
    else if (telLimpo) patch.telefone = telLimpo
    if (Object.keys(patch).length === 0) return aoFechar()
    atualizar.mutate(
      { id: fornecedor.id, patch },
      {
        onSuccess: () => {
          mostrarToast('Fornecedor atualizado.', { tom: 'sucesso' })
          aoFechar()
        },
        onError: aoErro,
      },
    )
  }

  function alternarAtivo() {
    if (!fornecedor) return
    alternar.mutate(
      { id: fornecedor.id, ativar: !fornecedor.ativo },
      {
        onSuccess: () => {
          mostrarToast(fornecedor.ativo ? 'Fornecedor arquivado.' : 'Fornecedor reativado.', { tom: 'sucesso' })
          setConfirmarArquivar(false)
          aoFechar()
        },
        onError: (e) => {
          setConfirmarArquivar(false)
          setErro(mensagem(e, 'Nao foi possivel mudar a situacao do fornecedor.'))
        },
      },
    )
  }

  function aoRevelar() {
    if (!fornecedor) return
    setErro(null)
    revelar.mutate(fornecedor.id, {
      onSuccess: (tel) => setTelefoneRevelado(tel),
      onError: (e) => setErro(mensagem(e, 'Nao foi possivel revelar o telefone.')),
    })
  }

  return (
    <form
      className="flex flex-col gap-4 text-left"
      onSubmit={(e) => {
        e.preventDefault()
        salvar()
      }}
    >
      <Field label="Nome">
        <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} placeholder="Distribuidora, acougue, grafica..." autoFocus />
      </Field>

      <Field label="Documento" dica="CNPJ ou CPF (opcional).">
        <Input value={documento} onChange={(e) => setDocumento(e.target.value)} maxLength={40} placeholder="00.000.000/0000-00" autoComplete="off" />
      </Field>

      <div className="flex flex-col gap-2">
        {ehEdicao && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-tinta-2">
            <Lock className="size-3.5 flex-none" aria-hidden />
            {removerTelefone ? (
              <span>O telefone sera removido ao salvar.</span>
            ) : telefoneRevelado ? (
              <span className="tabular text-tinta">Telefone: {telefoneRevelado}</span>
            ) : fornecedor.telefone_ultimos4 ? (
              <>
                <span className="tabular">Atual: final {fornecedor.telefone_ultimos4}</span>
                <button
                  type="button"
                  onClick={aoRevelar}
                  disabled={revelar.isPending}
                  className="inline-flex items-center gap-1 font-medium text-salvia underline underline-offset-2 hover:opacity-80 disabled:opacity-50"
                >
                  <Eye className="size-3.5" aria-hidden />
                  Revelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRemoverTelefone(true)
                    setTelefone('')
                    setTelefoneRevelado(null)
                  }}
                  className="font-medium text-barro underline underline-offset-2 hover:opacity-80"
                >
                  Remover
                </button>
              </>
            ) : (
              <span>Nenhum telefone cadastrado.</span>
            )}
          </div>
        )}
        <Field
          label={ehEdicao ? 'Novo telefone' : 'Telefone'}
          dica={ehEdicao ? 'Deixe em branco para manter o telefone atual.' : 'Opcional. Guardado com seguranca.'}
        >
          <Input
            value={telefone}
            onChange={(e) => {
              setTelefone(e.target.value)
              if (e.target.value) setRemoverTelefone(false)
            }}
            maxLength={30}
            placeholder="(11) 99999-9999"
            autoComplete="off"
            inputMode="tel"
          />
        </Field>
      </div>

      <Field label="Observacoes" dica="Opcional. Ex.: dia de entrega, condicao de pagamento.">
        <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} maxLength={500} rows={3} />
      </Field>

      {erro && <Banner tom="erro">{erro}</Banner>}

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
            variante={fornecedor.ativo ? 'ghost' : 'secondary'}
            disabled={salvando}
            className="ml-auto"
            onClick={() => (fornecedor.ativo ? setConfirmarArquivar(true) : alternarAtivo())}
          >
            {fornecedor.ativo ? 'Arquivar' : 'Reativar'}
          </Button>
        )}
      </div>

      {ehEdicao && (
        <ConfirmDialog
          aberto={confirmarArquivar}
          titulo="Arquivar fornecedor?"
          textoConfirmar="Arquivar"
          variante="destructive"
          carregando={alternar.isPending}
          onConfirmar={alternarAtivo}
          onCancelar={() => setConfirmarArquivar(false)}
        >
          O fornecedor deixa de aparecer para novos lancamentos, mas o historico de contas e mantido. Da para reativar depois.
        </ConfirmDialog>
      )}
    </form>
  )
}
