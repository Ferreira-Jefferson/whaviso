// Dialog de cadastro/edicao do cadastro de entrega de um motoboy. O motoboy e uma PESSOA de
// cargo 'motoboy' (nome e telefone vivem em Pessoas): aqui se escolhe a pessoa e se informam
// veiculo, placa e Pix. PII: o Pix atual aparece so MASCARADO (ultimos 4); para trocar, digita-se
// uma chave nova (tipo + chave juntos). Nunca reexibimos o Pix em claro.
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Lock } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Banner, Button, ConfirmDialog, Dialog, Field, Input, Select, Skeleton, useToast } from '@/shared/ui'
import type { TipoChavePix, TipoVeiculo } from '@/shared/contracts/_generated/enums'
import type { MotoboyNovo, MotoboyPatch } from '@/shared/contracts/_generated/motoboys'
import {
  useAlternarMotoboy,
  useAtualizarMotoboy,
  useCriarMotoboy,
  useMotoboys,
  usePessoasMotoboy,
  type Motoboy,
} from '../api'
import { PLACEHOLDER_PIX, ROTULO_PIX, ROTULO_VEICULO, TIPOS_PIX, VEICULOS } from '../estados'

interface Props {
  aberto: boolean
  /** null = cadastro novo; preenchido = edicao daquele motoboy. */
  motoboy: Motoboy | null
  aoFechar: () => void
}

const OPCOES_VEICULO = VEICULOS.map((v) => ({ value: v, label: ROTULO_VEICULO[v] }))
const OPCOES_PIX = TIPOS_PIX.map((t) => ({ value: t, label: ROTULO_PIX[t] }))

export function MotoboyDialog({ aberto, motoboy, aoFechar }: Props) {
  return (
    <Dialog
      aberto={aberto}
      onFechar={aoFechar}
      titulo={motoboy ? 'Editar motoboy' : 'Novo motoboy'}
      className="max-w-lg"
    >
      {aberto && <Formulario key={motoboy?.id ?? 'novo'} motoboy={motoboy} aoFechar={aoFechar} />}
    </Dialog>
  )
}

function mensagem(e: unknown, padrao: string): string {
  return e instanceof ApiError ? e.message : padrao
}

function Formulario({ motoboy, aoFechar }: { motoboy: Motoboy | null; aoFechar: () => void }) {
  const ehEdicao = motoboy != null
  const pessoas = usePessoasMotoboy(!ehEdicao)
  // Todos os motoboys (inclusive arquivados) para esconder pessoas que ja tem cadastro de entrega.
  const existentes = useMotoboys(true)

  const [pessoaId, setPessoaId] = useState('')
  const [veiculo, setVeiculo] = useState<TipoVeiculo>(motoboy?.veiculo ?? 'moto')
  const [placa, setPlaca] = useState(motoboy?.placa ?? '')
  const [pixTipo, setPixTipo] = useState<TipoChavePix>(motoboy?.pix_tipo ?? 'cpf')
  const [pix, setPix] = useState('')
  const [removerPix, setRemoverPix] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmarArquivar, setConfirmarArquivar] = useState(false)

  const criar = useCriarMotoboy()
  const atualizar = useAtualizarMotoboy()
  const alternar = useAlternarMotoboy()
  const { mostrarToast } = useToast()
  const salvando = criar.isPending || atualizar.isPending

  const disponiveis = useMemo(() => {
    const usadas = new Set((existentes.data?.itens ?? []).map((m) => m.pessoa_id))
    return (pessoas.data ?? []).filter((p) => !usadas.has(p.id))
  }, [pessoas.data, existentes.data])
  const pessoaEfetiva = pessoaId || disponiveis[0]?.id || ''
  const carregandoPessoas = !ehEdicao && (pessoas.isPending || existentes.isPending)

  function salvar() {
    const placaLimpa = placa.trim()
    const pixLimpo = pix.trim()
    setErro(null)
    const aoErro = (e: unknown) => setErro(mensagem(e, 'Não foi possível salvar o motoboy.'))

    if (!ehEdicao) {
      if (!pessoaEfetiva) return setErro('Escolha a pessoa que será o motoboy.')
      const corpo: MotoboyNovo = {
        pessoa_id: pessoaEfetiva,
        veiculo,
        ...(placaLimpa ? { placa: placaLimpa } : {}),
        ...(pixLimpo ? { pix_tipo: pixTipo, pix: pixLimpo } : {}),
      }
      criar.mutate(corpo, {
        onSuccess: () => {
          mostrarToast('Motoboy cadastrado.', { tom: 'sucesso' })
          aoFechar()
        },
        onError: aoErro,
      })
      return
    }

    const patch: MotoboyPatch = {}
    if (veiculo !== motoboy.veiculo) patch.veiculo = veiculo
    if (placaLimpa !== (motoboy.placa ?? '')) patch.placa = placaLimpa === '' ? null : placaLimpa
    if (removerPix) {
      patch.pix_tipo = null
      patch.pix = null
    } else if (pixLimpo) {
      patch.pix_tipo = pixTipo
      patch.pix = pixLimpo
    }
    if (Object.keys(patch).length === 0) return aoFechar()
    atualizar.mutate(
      { id: motoboy.id, patch },
      {
        onSuccess: () => {
          mostrarToast('Motoboy atualizado.', { tom: 'sucesso' })
          aoFechar()
        },
        onError: aoErro,
      },
    )
  }

  function alternarAtivo() {
    if (!motoboy) return
    alternar.mutate(
      { id: motoboy.id, ativar: !motoboy.ativo },
      {
        onSuccess: () => {
          mostrarToast(motoboy.ativo ? 'Motoboy arquivado.' : 'Motoboy reativado.', { tom: 'sucesso' })
          setConfirmarArquivar(false)
          aoFechar()
        },
        onError: (e) => {
          setConfirmarArquivar(false)
          setErro(mensagem(e, 'Não foi possível mudar a situação do motoboy.'))
        },
      },
    )
  }

  if (carregandoPessoas) {
    return (
      <div aria-busy="true" className="flex flex-col gap-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    )
  }

  const semPessoas = !ehEdicao && disponiveis.length === 0

  return (
    <form
      className="flex flex-col gap-4 text-left"
      onSubmit={(e) => {
        e.preventDefault()
        salvar()
      }}
    >
      {ehEdicao ? (
        <div className="flex flex-col gap-0.5">
          <span className="text-base font-medium text-tinta">{motoboy.nome}</span>
          <span className="tabular text-xs text-tinta-2">
            Telefone: {motoboy.telefone_ultimos4 ? `final ${motoboy.telefone_ultimos4}` : 'não informado'} (editado em Pessoas)
          </span>
        </div>
      ) : semPessoas ? (
        <Banner tom="info">
          Não há pessoa com cargo Motoboy sem cadastro de entrega. Cadastre a pessoa em{' '}
          <Link to="/pessoas" className="font-medium underline underline-offset-2">
            Pessoas
          </Link>{' '}
          com o cargo Motoboy e volte aqui.
        </Banner>
      ) : (
        <Field label="Pessoa" dica="Só aparecem pessoas com cargo Motoboy. Nome e telefone ficam em Pessoas.">
          <Select
            ariaLabel="Pessoa"
            value={pessoaEfetiva}
            onChange={setPessoaId}
            options={disponiveis.map((p) => ({ value: p.id, label: p.nome }))}
          />
        </Field>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Veículo">
          <Select ariaLabel="Veículo" value={veiculo} onChange={setVeiculo} options={OPCOES_VEICULO} />
        </Field>
        <Field label="Placa ">
          <Input value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} maxLength={12} placeholder="ABC1D23" autoComplete="off" />
        </Field>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium text-tinta">Chave Pix para o pagamento </span>
        {ehEdicao && (
          <div className="flex items-center gap-2 text-xs text-tinta-2">
            <Lock className="size-3.5 flex-none" aria-hidden />
            {removerPix ? (
              <span>O Pix será removido ao salvar.</span>
            ) : motoboy.pix_ultimos4 ? (
              <>
                <span className="tabular">
                  Atual: {motoboy.pix_tipo ? ROTULO_PIX[motoboy.pix_tipo] : 'Pix'} final {motoboy.pix_ultimos4}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setRemoverPix(true)
                    setPix('')
                  }}
                  className="font-medium text-barro underline underline-offset-2 hover:opacity-80"
                >
                  Remover
                </button>
              </>
            ) : (
              <span>Nenhum Pix cadastrado.</span>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[10rem_1fr]">
          <Field label="Tipo da chave">
            <Select ariaLabel="Tipo da chave Pix" value={pixTipo} onChange={setPixTipo} options={OPCOES_PIX} />
          </Field>
          <Field label={ehEdicao ? 'Nova chave Pix' : 'Chave Pix'} dica={ehEdicao ? 'Deixe em branco para manter a chave atual.' : undefined}>
            <Input
              value={pix}
              onChange={(e) => {
                setPix(e.target.value)
                if (e.target.value) setRemoverPix(false)
              }}
              maxLength={140}
              placeholder={PLACEHOLDER_PIX[pixTipo]}
              autoComplete="off"
            />
          </Field>
        </div>
      </div>

      {erro && <Banner tom="erro">{erro}</Banner>}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={salvando} disabled={semPessoas}>
          {ehEdicao ? 'Salvar' : 'Cadastrar'}
        </Button>
        <Button type="button" variante="secondary" disabled={salvando} onClick={aoFechar}>
          Cancelar
        </Button>
        {ehEdicao && (
          <Button
            type="button"
            variante={motoboy.ativo ? 'ghost' : 'secondary'}
            disabled={salvando}
            className="ml-auto"
            onClick={() => (motoboy.ativo ? setConfirmarArquivar(true) : alternarAtivo())}
          >
            {motoboy.ativo ? 'Arquivar' : 'Reativar'}
          </Button>
        )}
      </div>

      {ehEdicao && (
        <ConfirmDialog
          aberto={confirmarArquivar}
          titulo="Arquivar motoboy?"
          textoConfirmar="Arquivar"
          variante="destructive"
          carregando={alternar.isPending}
          onConfirmar={alternarAtivo}
          onCancelar={() => setConfirmarArquivar(false)}
        >
          O motoboy deixa de aparecer no despacho, mas o histórico e os fechamentos são mantidos. Dá para reativar depois.
        </ConfirmDialog>
      )}
    </form>
  )
}
