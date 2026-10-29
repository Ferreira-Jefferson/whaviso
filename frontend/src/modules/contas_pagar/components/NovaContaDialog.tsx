// Dialog de novo lancamento manual a pagar: escolhe o tipo de credor (fornecedor | pessoa) e o
// credor, o valor (centavos), a descricao e o vencimento (opcional). Dinheiro em centavos pelo
// MoneyInput; data de negocio 'YYYY-MM-DD' pelo DateInput. Pessoas vem por chamada HTTP ao modulo
// pessoas (api_client), nunca por import de modulo.
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ApiError } from '@/shared/api_client'
import { Banner, Button, DateInput, Dialog, Field, Input, MoneyInput, SegmentedControl, Select, Skeleton, useToast } from '@/shared/ui'
import type { CredorTipo } from '@/shared/contracts/_generated/enums'
import type { ContaPagarNovo } from '@/shared/contracts/_generated/contas_pagar'
import { useCriarConta, useFornecedoresAtivos, usePessoasCredor, type Credor } from '../api'
import { ROTULO_CREDOR } from '../estados'

interface Props {
  aberto: boolean
  aoFechar: () => void
}

export function NovaContaDialog({ aberto, aoFechar }: Props) {
  return (
    <Dialog aberto={aberto} onFechar={aoFechar} titulo="Novo lancamento" className="max-w-lg">
      {aberto && <Formulario aoFechar={aoFechar} />}
    </Dialog>
  )
}

function mensagem(e: unknown, padrao: string): string {
  return e instanceof ApiError ? e.message : padrao
}

function Formulario({ aoFechar }: { aoFechar: () => void }) {
  const [credorTipo, setCredorTipo] = useState<CredorTipo>('fornecedor')
  const [credorId, setCredorId] = useState('')
  const [valor, setValor] = useState<number | null>(null)
  const [descricao, setDescricao] = useState('')
  const [vencimento, setVencimento] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const fornecedores = useFornecedoresAtivos(credorTipo === 'fornecedor')
  const pessoas = usePessoasCredor(credorTipo === 'pessoa')
  const criar = useCriarConta()
  const { mostrarToast } = useToast()

  const credores: Credor[] = useMemo(
    () => (credorTipo === 'fornecedor' ? (fornecedores.data ?? []) : (pessoas.data ?? [])),
    [credorTipo, fornecedores.data, pessoas.data],
  )
  const carregandoCredores = credorTipo === 'fornecedor' ? fornecedores.isPending : pessoas.isPending
  const credorEfetivo = credorId || credores[0]?.id || ''

  function salvar() {
    const descLimpa = descricao.trim()
    setErro(null)
    if (!credorEfetivo) return setErro(`Escolha ${credorTipo === 'fornecedor' ? 'o fornecedor' : 'a pessoa'}.`)
    if (!descLimpa) return setErro('Informe uma descricao.')
    if (!valor || valor <= 0) return setErro('Informe um valor maior que zero.')
    // Uma chave por submit: um retry da MESMA submissao reusa a mesma chave (o React Query reenvia
    // as mesmas variaveis), entao duplo-clique/retry nao cria lancamento duplicado.
    const corpo: ContaPagarNovo = {
      credor_tipo: credorTipo,
      credor_id: credorEfetivo,
      descricao: descLimpa,
      valor_centavos: valor,
      ...(vencimento ? { vencimento } : {}),
      chave_idempotencia: crypto.randomUUID(),
    }
    criar.mutate(corpo, {
      onSuccess: () => {
        mostrarToast('Lancamento registrado.', { tom: 'sucesso' })
        aoFechar()
      },
      onError: (e) => setErro(mensagem(e, 'Nao foi possivel registrar o lancamento.')),
    })
  }

  const semCredores = !carregandoCredores && credores.length === 0

  return (
    <form
      className="flex flex-col gap-4 text-left"
      onSubmit={(e) => {
        e.preventDefault()
        salvar()
      }}
    >
      <Field label="Tipo de credor">
        <SegmentedControl
          ariaLabel="Tipo de credor"
          value={credorTipo}
          onChange={(v) => {
            setCredorTipo(v as CredorTipo)
            setCredorId('')
          }}
          options={[
            { value: 'fornecedor', label: ROTULO_CREDOR.fornecedor },
            { value: 'pessoa', label: ROTULO_CREDOR.pessoa },
          ]}
        />
      </Field>

      {carregandoCredores ? (
        <Skeleton className="h-10 w-full" />
      ) : semCredores ? (
        <Banner tom="info">
          {credorTipo === 'fornecedor' ? (
            <>Nenhum fornecedor ativo. Cadastre um na aba Fornecedores.</>
          ) : (
            <>
              Nenhuma pessoa ativa. Cadastre a equipe em{' '}
              <Link to="/pessoas" className="font-medium underline underline-offset-2">
                Pessoas
              </Link>
              .
            </>
          )}
        </Banner>
      ) : (
        <Field label={credorTipo === 'fornecedor' ? 'Fornecedor' : 'Pessoa'}>
          <Select
            ariaLabel={credorTipo === 'fornecedor' ? 'Fornecedor' : 'Pessoa'}
            value={credorEfetivo}
            onChange={setCredorId}
            options={credores.map((c) => ({ value: c.id, label: c.nome }))}
          />
        </Field>
      )}

      <Field label="Descricao">
        <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={200} placeholder="Ex.: compra de embalagens" />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Valor">
          <MoneyInput value={valor} onChange={setValor} />
        </Field>
        <Field label="Vencimento" dica="Opcional.">
          <DateInput value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
        </Field>
      </div>

      {erro && <Banner tom="erro">{erro}</Banner>}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={criar.isPending} disabled={semCredores}>
          Lancar
        </Button>
        <Button type="button" variante="secondary" disabled={criar.isPending} onClick={aoFechar}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
