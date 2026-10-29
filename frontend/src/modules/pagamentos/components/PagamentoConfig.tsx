// Config de recebimento da loja: como o Pix e recebido (chave propria x intermediado pelo Whaviso)
// e quem paga a taxa de intermediacao (a loja absorve x repassa ao cliente), alem de habilitar
// cartao. O caminho intermediado e por cartao dependem do Whaviso ter o PSP ativado; enquanto nao
// estiver, a cobranca intermediada avisa que ainda nao esta disponivel (a api responde isso).
import { useEffect, useState } from 'react'
import { CreditCard, Landmark, Receipt } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Banner, Button, Card, ErrorState, SegmentedControl, Skeleton, Switch, useToast } from '@/shared/ui'
import { useConfigPagamento, useSalvarConfigPagamento, type PagamentoConfig as Config } from '../api'

const PIX_MODO = [
  { value: 'chave_propria', label: 'Minha chave Pix' },
  { value: 'intermediado', label: 'Pelo Whaviso' },
] as const

const ENCARGO = [
  { value: 'absorve', label: 'Eu pago a taxa' },
  { value: 'repassa', label: 'Repasso ao cliente' },
] as const

export function PagamentoConfig() {
  const estado = useConfigPagamento()
  const salvar = useSalvarConfigPagamento()
  const { mostrarToast } = useToast()

  const [pixModo, setPixModo] = useState<Config['pix_modo']>('chave_propria')
  const [encargo, setEncargo] = useState<Config['encargo_modo']>('absorve')
  const [cartao, setCartao] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Sincroniza o formulario com o que veio do servidor (uma vez por carga).
  useEffect(() => {
    if (!estado.data) return
    setPixModo(estado.data.pix_modo)
    setEncargo(estado.data.encargo_modo)
    setCartao(estado.data.cartao_habilitado)
  }, [estado.data])

  if (estado.isPending) return <Skeleton className="h-64 w-full" />
  if (estado.isError) return <ErrorState aoTentarDeNovo={() => void estado.refetch()} />

  const mudou =
    !!estado.data
    && (pixModo !== estado.data.pix_modo
      || encargo !== estado.data.encargo_modo
      || cartao !== estado.data.cartao_habilitado)

  async function enviar() {
    setErro(null)
    try {
      await salvar.mutateAsync({ pix_modo: pixModo, encargo_modo: encargo, cartao_habilitado: cartao })
      mostrarToast('Configuração de recebimento salva.', { tom: 'sucesso' })
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível salvar a configuração.')
    }
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-lg text-salvia">
          <Landmark strokeWidth={1.75} className="size-5" aria-hidden />
          Pix dos pedidos
        </h2>
        <p className="text-sm text-tinta-2">Como você recebe o Pix dos pedidos.</p>
        <SegmentedControl ariaLabel="Modo de recebimento do Pix" value={pixModo} onChange={setPixModo} options={PIX_MODO} />
        <p className="text-xs text-tinta-2">
          {pixModo === 'chave_propria'
            ? 'O dinheiro cai direto na sua chave Pix. Sem taxa de intermediação, mas você confirma o pagamento à mão.'
            : 'O Whaviso gera a cobrança e confirma o pagamento sozinho. Cobra uma pequena taxa por transação.'}
        </p>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-lg text-salvia">
          <Receipt strokeWidth={1.75} className="size-5" aria-hidden />
          Taxa de intermediação
        </h2>
        <p className="text-sm text-tinta-2">Quando a cobrança passa pelo Whaviso, quem paga a taxa.</p>
        <SegmentedControl ariaLabel="Quem paga a taxa" value={encargo} onChange={setEncargo} options={ENCARGO} />
        <p className="text-xs text-tinta-2">
          {encargo === 'absorve'
            ? 'A taxa sai do seu repasse. O cliente paga só o valor do pedido.'
            : 'A taxa é somada ao valor que o cliente paga. Você recebe o pedido cheio.'}
        </p>
      </Card>

      <Card className="flex flex-col gap-3 lg:col-span-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="flex items-center gap-2 text-lg text-salvia">
              <CreditCard strokeWidth={1.75} className="size-5" aria-hidden />
              Cartão
            </h2>
            <p className="text-sm text-tinta-2">
              Aceitar cartão nos pedidos. O cartão é sempre processado pelo Whaviso (com a taxa de intermediação).
            </p>
          </div>
          <Switch ligado={cartao} onMudar={setCartao} rotulo="Aceitar cartão" />
        </div>
      </Card>

      <div className="flex flex-col gap-3 lg:col-span-2">
        {erro && <Banner tom="erro">{erro}</Banner>}
        <Button
          onClick={() => void enviar()}
          loading={salvar.isPending}
          disabled={!mudou}
          className="max-md:w-full md:self-start"
        >
          Salvar configuração
        </Button>
      </div>
    </div>
  )
}
