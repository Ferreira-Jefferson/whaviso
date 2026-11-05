// /plataforma/numeros: console do OPERADOR Whaviso para gerir os numeros de WhatsApp de QUALQUER
// loja de QUALQUER conta (gestao pela plataforma / suporte). O operador escolhe a conta e a loja
// (SeletorLoja) e entao ve os numeros daquela loja com as acoes conectar, pausar, reativar,
// reconectar e remover, espelhando a experiencia self-service da loja (canais/numeros). Estados de
// carregando/erro/vazio e mensagens do envelope {error:{code,message}}. Modulo nunca importa modulo.
import { useState } from 'react'
import { Info, Plus, Smartphone } from 'lucide-react'
import {
  Banner,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  Skeleton,
  useToast,
} from '@/shared/ui'
import { ApiError } from '@/shared/api_client'
import {
  useAnexarNumero,
  useConectarNumero,
  useMudarStatusNumero,
  useNumerosLoja,
  useReconectarNumero,
  type NumeroSaida,
} from '../api'
import { CardNumero } from '../components/CardNumero'
import { AnexarNumeroDialog } from '../components/AnexarNumeroDialog'
import { ConectarNumeroDialog, type ModoConexao } from '../components/ConectarNumeroDialog'
import { AreaErro } from '../components/AreaErro'
import { SeletorLoja, type LojaAlvo } from '../components/SeletorLoja'

export default function Numeros() {
  const [alvo, setAlvo] = useState<LojaAlvo | null>(null)

  return (
    <div className="animate-rise">
      <PageHeader
        titulo="Números"
        descricao="Gestão pela plataforma: a equipe Whaviso vê e gerencia os números de WhatsApp de qualquer loja, para dar suporte."
      />

      {alvo == null ? (
        <Card>
          <SeletorLoja aoSelecionar={setAlvo} />
        </Card>
      ) : (
        <GestaoNumeros alvo={alvo} aoTrocarLoja={() => setAlvo(null)} />
      )}
    </div>
  )
}

function GestaoNumeros({ alvo, aoTrocarLoja }: { alvo: LojaAlvo; aoTrocarLoja: () => void }) {
  const lista = useNumerosLoja(alvo.lojaId)
  const conectar = useConectarNumero(alvo.lojaId)
  const anexar = useAnexarNumero(alvo.lojaId)
  const reconectar = useReconectarNumero(alvo.lojaId)
  const mudarStatus = useMudarStatusNumero(alvo.lojaId)
  const { mostrarToast } = useToast()

  // Dialog de conectar/reconectar: modo + id alvo (reconectar) + erro inline.
  const [modo, setModo] = useState<ModoConexao | null>(null)
  const [alvoReconectar, setAlvoReconectar] = useState<string | null>(null)
  const [erroDialog, setErroDialog] = useState<string | null>(null)
  // Dialog de anexar WABA existente (sem Embedded Signup): aberto + erro inline.
  const [anexarAberto, setAnexarAberto] = useState(false)
  const [erroAnexar, setErroAnexar] = useState<string | null>(null)
  // Confirmacao de remocao (pessimista).
  const [aRemover, setARemover] = useState<NumeroSaida | null>(null)

  const salvandoConexao = conectar.isPending || reconectar.isPending

  function abrirConectar() {
    setErroDialog(null)
    setAlvoReconectar(null)
    setModo('conectar')
  }

  function abrirAnexar() {
    setErroAnexar(null)
    setAnexarAberto(true)
  }

  function confirmarAnexo(dados: { waba_id: string; phone_number_id: string; access_token: string }) {
    setErroAnexar(null)
    anexar.mutate(dados, {
      onSuccess: () => {
        setAnexarAberto(false)
        mostrarToast('Número anexado.')
      },
      onError: (e) => setErroAnexar(e instanceof ApiError ? e.message : 'Não foi possível anexar o número.'),
    })
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
    <div className="flex flex-col gap-5">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5 text-sm text-tinta-2">
          <Info strokeWidth={1.75} className="mt-0.5 size-4 flex-none text-salvia" aria-hidden />
          <p className="min-w-0">
            Loja <span className="font-medium text-tinta">{alvo.lojaNome}</span>
            <span className="text-tinta-2"> · conta {alvo.contaNome}</span>
          </p>
        </div>
        <Button variante="secondary" onClick={aoTrocarLoja}>
          Trocar de loja
        </Button>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold text-tinta">Números da loja</h2>
        {numeros.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button variante="secondary" onClick={abrirAnexar}>
              Anexar WABA existente
            </Button>
            <Button variante="primary" onClick={abrirConectar}>
              <Plus strokeWidth={1.75} className="size-4" aria-hidden />
              Conectar número
            </Button>
          </div>
        )}
      </div>

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

      {lista.isError && <AreaErro erro={lista.error} aoTentarDeNovo={() => void lista.refetch()} />}

      {lista.isSuccess && numeros.length === 0 && (
        <EmptyState
          icone={<Smartphone className="size-7" aria-hidden />}
          titulo="Nenhum número conectado"
          descricao="Esta loja ainda não tem número de WhatsApp. Conecte um pela Meta (Cloud API) para a loja começar a atender. A conexão é por credenciais, sem QR."
          acao={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variante="primary" onClick={abrirConectar}>
                <Plus strokeWidth={1.75} className="size-4" aria-hidden />
                Conectar número
              </Button>
              <Button variante="secondary" onClick={abrirAnexar}>
                Anexar WABA existente
              </Button>
            </div>
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

      <Banner tom="info">
        Esta tela é a gestão pela plataforma (suporte). Ela mostra só metadados do número (identificadores da Meta,
        status e verificação), nunca o número em si nem conteúdo da loja.
      </Banner>

      <ConectarNumeroDialog
        aberto={modo != null}
        modo={modo ?? 'conectar'}
        nomeLoja={alvo.lojaNome}
        carregando={salvandoConexao}
        erro={erroDialog}
        onConfirmar={confirmarConexao}
        onFechar={fecharDialog}
      />

      <AnexarNumeroDialog
        aberto={anexarAberto}
        nomeLoja={alvo.lojaNome}
        carregando={anexar.isPending}
        erro={erroAnexar}
        onConfirmar={confirmarAnexo}
        onFechar={() => {
          setAnexarAberto(false)
          setErroAnexar(null)
        }}
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
        Este número para de enviar e receber mensagens pela loja. É possível conectar outro quando quiser.
      </ConfirmDialog>
    </div>
  )
}
