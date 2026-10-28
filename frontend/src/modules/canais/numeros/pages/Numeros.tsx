// /numeros: numeros de WhatsApp (Meta Cloud API) conectados a loja ativa. Lista com status,
// pausar/reativar/reconectar/remover e o fluxo de conectar um numero novo (Embedded Signup,
// por credenciais, sem QR). Estados loading/empty/error; mobile-first. Rota 'numeros' (config).
import { useState } from 'react'
import { Plus, Smartphone } from 'lucide-react'
import { Button, ConfirmDialog, EmptyState, ErrorState, PageHeader, Skeleton, useToast } from '@/shared/ui'
import { ApiError } from '@/shared/api_client'
import {
  useConectarNumero,
  useMudarStatusNumero,
  useNumeros,
  useReconectarNumero,
  type NumeroSaida,
} from '../api'
import { CardNumero } from '../components/CardNumero'
import { ConectarNumeroDialog, type ModoConexao } from '../components/ConectarNumeroDialog'

export default function Numeros() {
  const lista = useNumeros()
  const conectar = useConectarNumero()
  const reconectar = useReconectarNumero()
  const mudarStatus = useMudarStatusNumero()
  const { mostrarToast } = useToast()

  // Dialog de conectar/reconectar: modo + id alvo (reconectar) + erro inline.
  const [modo, setModo] = useState<ModoConexao | null>(null)
  const [alvoReconectar, setAlvoReconectar] = useState<string | null>(null)
  const [erroDialog, setErroDialog] = useState<string | null>(null)
  // Confirmacao de remocao (pessimista).
  const [aRemover, setARemover] = useState<NumeroSaida | null>(null)

  const salvandoConexao = conectar.isPending || reconectar.isPending

  function abrirConectar() {
    setErroDialog(null)
    setAlvoReconectar(null)
    setModo('conectar')
  }

  function abrirReconectar(numero: NumeroSaida) {
    setErroDialog(null)
    setAlvoReconectar(numero.id)
    setModo('reconectar')
  }

  function fecharDialog() {
    setModo(null)
    setAlvoReconectar(null)
    setErroDialog(null)
  }

  function confirmarConexao(dados: { codigo: string; phone_number_id: string; waba_id: string }) {
    setErroDialog(null)
    if (modo === 'reconectar' && alvoReconectar) {
      reconectar.mutate(
        { id: alvoReconectar, codigo: dados.codigo },
        {
          onSuccess: () => {
            fecharDialog()
            mostrarToast('Número reconectado.')
          },
          onError: (e) => setErroDialog(e instanceof ApiError ? e.message : 'Não foi possível reconectar o número.'),
        },
      )
      return
    }
    conectar.mutate(
      { codigo: dados.codigo, phone_number_id: dados.phone_number_id, waba_id: dados.waba_id },
      {
        onSuccess: () => {
          fecharDialog()
          mostrarToast('Número conectado.')
        },
        onError: (e) => setErroDialog(e instanceof ApiError ? e.message : 'Não foi possível conectar o número.'),
      },
    )
  }

  function alterarStatus(numero: NumeroSaida, acao: 'pausar' | 'reativar', sucesso: string) {
    mudarStatus.mutate(
      { id: numero.id, acao },
      {
        onSuccess: () => mostrarToast(sucesso),
        onError: (e) =>
          mostrarToast(e instanceof ApiError ? e.message : 'Não foi possível atualizar o número.', { tom: 'erro' }),
      },
    )
  }

  function confirmarRemocao() {
    const numero = aRemover
    if (!numero) return
    mudarStatus.mutate(
      { id: numero.id, acao: 'remover' },
      {
        onSuccess: () => {
          setARemover(null)
          mostrarToast('Número removido.')
        },
        onError: (e) =>
          mostrarToast(e instanceof ApiError ? e.message : 'Não foi possível remover o número.', { tom: 'erro' }),
      },
    )
  }

  const numeros = lista.data?.numeros ?? []
  const idOcupado = mudarStatus.isPending ? (mudarStatus.variables?.id ?? null) : null

  return (
    <div className="animate-rise">
      <PageHeader
        titulo="Números"
        descricao="Números de WhatsApp conectados à sua loja."
        acoes={
          numeros.length > 0 ? (
            <Button variante="primary" onClick={abrirConectar}>
              <Plus strokeWidth={1.75} className="size-4" aria-hidden />
              Conectar número
            </Button>
          ) : undefined
        }
      />

      {lista.isPending && (
        <div className="grid gap-4 md:grid-cols-2" aria-busy="true" aria-label="Carregando números">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-4 rounded-card border border-linha bg-cartao p-5">
              <div className="flex items-start gap-3">
                <Skeleton className="size-10 flex-none rounded-full" />
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </div>
              <Skeleton className="h-px w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
      )}

      {lista.isError && <ErrorState aoTentarDeNovo={() => void lista.refetch()} />}

      {lista.isSuccess && numeros.length === 0 && (
        <EmptyState
          icone={<Smartphone className="size-7" aria-hidden />}
          titulo="Nenhum número conectado"
          descricao="Conecte um número de WhatsApp pela Meta (Cloud API) para começar a atender. A conexão é por credenciais, sem QR."
          acao={
            <Button variante="primary" onClick={abrirConectar}>
              <Plus strokeWidth={1.75} className="size-4" aria-hidden />
              Conectar número
            </Button>
          }
        />
      )}

      {lista.isSuccess && numeros.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {numeros.map((numero) => (
            <CardNumero
              key={numero.id}
              numero={numero}
              ocupado={idOcupado === numero.id}
              onPausar={() => alterarStatus(numero, 'pausar', 'Número pausado.')}
              onReativar={() => alterarStatus(numero, 'reativar', 'Número reativado.')}
              onReconectar={() => abrirReconectar(numero)}
              onRemover={() => setARemover(numero)}
            />
          ))}
        </div>
      )}

      <ConectarNumeroDialog
        aberto={modo != null}
        modo={modo ?? 'conectar'}
        carregando={salvandoConexao}
        erro={erroDialog}
        onConfirmar={confirmarConexao}
        onFechar={fecharDialog}
      />

      <ConfirmDialog
        aberto={aRemover != null}
        titulo="Remover número?"
        variante="destructive"
        textoConfirmar="Remover"
        textoCancelar="Voltar"
        carregando={mudarStatus.isPending && mudarStatus.variables?.acao === 'remover'}
        onConfirmar={confirmarRemocao}
        onCancelar={() => setARemover(null)}
      >
        Este número para de enviar e receber mensagens pela loja. Você pode conectar outro quando quiser.
      </ConfirmDialog>
    </div>
  )
}
