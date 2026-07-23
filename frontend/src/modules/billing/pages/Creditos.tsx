// /app/creditos: tela de CRÉDITOS do usuário (Épico 11, carteira pré-paga). Mostra o saldo
// (livre/reservado/em hold/consumido), um SLIDER de quantidade (de envios_min a envios_max
// do catálogo) com o PREÇO calculado AO VIVO pela curva (mesma função do backend, fonte
// única), e um POPUP de confirmação que dispara POST /billing/recarga: o servidor EMPURRA a
// mensagem de compra (template + chave Pix da plataforma) para o WhatsApp do usuário; ele
// paga via Pix e manda o comprovante na conversa, e o owner credita depois. Abaixo, o
// EXTRATO dos lançamentos. O limite é DECIDIDO PELO BACKEND: aqui só espelhamos o saldo.
// Linguagem das Regras de Ouro: crédito, envio, saldo, recarga.
import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Banner,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  InfoHint,
  MoneyText,
  PageHeader,
  Skeleton,
} from '@/shared/ui'
import { precoEnvioCentavos } from '@/shared/plano'
import { ApiError } from '@/shared/api_client'
import type { Lancamento } from '@/shared/contracts'
import { atualizarPerfil, OtpTelefoneDialog } from '@/shared/auth'
import {
  billingKeys,
  MIME_COMPROVANTE_ACEITOS,
  useCarteira,
  useEnviarComprovante,
  useExtrato,
  useRecarga,
  type MimeComprovante,
} from '../api'
import { linkConversaWhatsApp } from '../whatsapp'

/** Lê um File como base64 puro (sem o prefixo `data:...;base64,`). */
function lerArquivoBase64(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'))
    leitor.onload = () => {
      const resultado = String(leitor.result ?? '')
      const virgula = resultado.indexOf(',')
      resolve(virgula >= 0 ? resultado.slice(virgula + 1) : resultado)
    }
    leitor.readAsDataURL(arquivo)
  })
}

// Rótulo amigável de cada tipo de lançamento do extrato (sem termos proibidos).
const ROTULO_LANCAMENTO: Record<Lancamento['tipo'], string> = {
  cortesia: 'Cortesia inicial',
  compra: 'Compra de créditos',
  credito_owner: 'Recarga creditada',
  reserva: 'Reserva (combinado ativado)',
  consumo: 'Envio realizado',
  devolucao: 'Devolução ao saldo',
  hold: 'Em espera (24h)',
  estorno: 'Estorno',
}

// Lançamentos que SOMAM ao saldo livre vs os que saem dele (só para o sinal visual).
const ENTRA: Lancamento['tipo'][] = ['cortesia', 'compra', 'credito_owner', 'devolucao']

export default function CreditosPage() {
  const queryClient = useQueryClient()
  const carteira = useCarteira()
  const extrato = useExtrato(1)
  const recarga = useRecarga()
  const enviarComprovante = useEnviarComprovante()

  const catalogo = carteira.data?.catalogo
  const saldo = carteira.data?.carteira

  // Quantidade do slider (entre envios_min e envios_max). Default: ponto médio arredondado.
  const [qtd, setQtd] = useState<number | null>(null)
  const [aConfirmar, setAConfirmar] = useState(false)
  // Vira true quando a recarga foi confirmada e a mensagem foi enfileirada ao WhatsApp.
  const [enviado, setEnviado] = useState(false)
  // Item 3: popup de cadastro/verificação de WhatsApp quando a recarga recusa por
  // telefone_ausente, sem sair da tela. Ao confirmar o código, salva o telefone e refaz a
  // recarga automaticamente (mesma quantidade que a pessoa já tinha confirmado).
  const [cadastrarWhats, setCadastrarWhats] = useState(false)
  // Item 19: anexar comprovante da recarga em andamento (JSON base64; ver MODULE.md do billing
  // no backend sobre a escolha de não usar multipart). Guarda o resultado para a mensagem.
  const [comprovanteResultado, setComprovanteResultado] = useState<
    'aprovado' | 'aguardando_revisao_manual' | null
  >(null)
  const inputComprovanteRef = useRef<HTMLInputElement>(null)

  const min = catalogo?.envios_min ?? 10
  const max = catalogo?.envios_max ?? 250
  const quantidade = qtd ?? Math.min(Math.max(Math.round((min + max) / 2), min), max)
  const total = catalogo ? precoEnvioCentavos(catalogo, quantidade) : 0

  // Link só para ABRIR a conversa (a mensagem é empurrada pelo servidor). O número vem da
  // resposta da recarga (telefone_vendas = número pareado pelo zap), não de env. null se a
  // sessão estiver desconectada -> a tela mostra o aviso sem o botão de abrir conversa.
  const linkConversa = linkConversaWhatsApp(recarga.data?.telefone_vendas)

  // Mudar a quantidade reseta o resultado/erro anterior (nova intenção de recarga).
  function aoMudarQuantidade(n: number) {
    setQtd(n)
    setEnviado(false)
    setComprovanteResultado(null)
    recarga.reset()
  }

  async function aoVerificarWhatsApp(telefoneE164: string) {
    await atualizarPerfil({ telefone: telefoneE164 })
    setCadastrarWhats(false)
    // Refaz a recarga automaticamente com a mesma quantidade (item 3: sem a pessoa ter que
    // clicar em Recarregar de novo depois de cadastrar o WhatsApp).
    recarga.mutate(
      { quantidade },
      { onSuccess: () => setEnviado(true) },
    )
  }

  async function aoEscolherComprovante(arquivo: File) {
    const recargaId = recarga.data?.id
    if (!recargaId) return
    const mime = arquivo.type as MimeComprovante
    if (!MIME_COMPROVANTE_ACEITOS.includes(mime)) return
    const arquivoBase64 = await lerArquivoBase64(arquivo)
    enviarComprovante.mutate(
      { recargaId, arquivoBase64, arquivoMime: mime },
      {
        onSuccess: (r) => {
          setComprovanteResultado(r.status)
          if (r.status === 'aprovado') void queryClient.invalidateQueries({ queryKey: billingKeys.carteira })
        },
      },
    )
  }

  return (
    <div className="animate-rise">
      <PageHeader
        titulo="Créditos"
        descricao="Veja seu saldo e recarregue envios quando quiser. Você paga só pelo que envia."
      />

      {/* Saldo (espelho do servidor, H11.8) */}
      {carteira.isLoading ? (
        <Skeleton className="h-28 w-full rounded-card" />
      ) : carteira.isError || !saldo ? (
        <EmptyState
          titulo="Não foi possível carregar seu saldo"
          descricao="Verifique sua conexão e tente novamente."
          acao={
            <Button variante="secondary" onClick={() => carteira.refetch()}>
              Tentar de novo
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CartaoSaldo titulo="Saldo livre" valor={saldo.saldo_livre} destaque />
          <CartaoSaldo
            titulo="Reservado"
            valor={saldo.reservado}
            dica="Créditos já separados para combinados ativos que ainda não dispararam. Eles saem do reservado só quando o lembrete é enviado (viram 'envios feitos') ou quando voltam ao saldo livre, se o combinado não for aceito ou for encerrado."
          />
          <CartaoSaldo titulo="Em espera (24h)" valor={saldo.em_hold} />
          <CartaoSaldo titulo="Envios feitos" valor={saldo.consumido} />
        </div>
      )}

      {/* Alerta de saldo baixo (H11.8): antes de esbarrar no limite ao ativar. */}
      {saldo && saldo.saldo_livre > 0 && saldo.saldo_livre <= 3 && (
        <Banner tom="info" className="mt-4">
          Seu saldo está baixo ({saldo.saldo_livre}{' '}
          {saldo.saldo_livre === 1 ? 'envio' : 'envios'}). Recarregue abaixo para não ficar
          sem ativar novos combinados.
        </Banner>
      )}
      {saldo && saldo.saldo_livre === 0 && (
        <Banner tom="info" className="mt-4">
          Você está sem saldo. Recarregue abaixo para ativar e enviar lembretes. Sua agenda e
          o que já anotou continuam disponíveis.
        </Banner>
      )}

      {/* Recarga: slider de quantidade + preço ao vivo (H11.3) */}
      <h2 className="mt-8 mb-4 text-lg text-salvia">Recarregar</h2>
      {carteira.isLoading || !catalogo ? (
        <Skeleton className="h-64 w-full rounded-card" />
      ) : (
        <Card className="flex flex-col gap-5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm text-tinta-2">Quantos envios?</span>
            <span className="tabular text-2xl text-salvia">{quantidade}</span>
          </div>
          <input
            type="range"
            min={min}
            max={max}
            value={quantidade}
            onChange={(e) => aoMudarQuantidade(Number(e.target.value))}
            className="w-full cursor-pointer"
            style={{ accentColor: 'var(--color-salvia)' }}
            aria-label="Quantidade de envios para recarregar"
          />
          <div className="flex items-center justify-between text-xs text-tinta-2">
            <span>{min}</span>
            <span>{max}</span>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3 rounded-card bg-papel-2 p-4">
            <div>
              <span className="text-sm text-tinta-2">Total</span>
              <p className="flex items-baseline gap-2">
                <MoneyText centavos={total} className="font-display text-3xl text-tinta" />
              </p>
            </div>
            <Button variante="primary" onClick={() => setAConfirmar(true)}>
              Recarregar
            </Button>
          </div>
          <p className="text-xs text-tinta-2">
            O saldo comprado soma ao que você já tem e não expira. Ao recarregar, enviamos as
            instruções de pagamento no seu WhatsApp; o saldo entra após o pagamento.
          </p>
        </Card>
      )}

      {/* Resultado da recarga (H11.10): a mensagem com o Pix foi empurrada ao WhatsApp. */}
      {enviado && (
        <Banner tom="sucesso" className="mt-4">
          Estamos enviando as instruções de pagamento no seu WhatsApp. Pague via Pix e envie o
          comprovante na conversa que liberamos seus envios.
          {linkConversa && (
            <>
              {' '}
              <a
                href={linkConversa}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline"
              >
                Abrir conversa no WhatsApp
              </a>
              .
            </>
          )}
        </Banner>
      )}

      {/* Item 19 (H11.14): anexar o comprovante direto na tela, sem depender só do WhatsApp. */}
      {enviado && recarga.data?.id && (
        <Card className="mt-4 flex flex-col gap-3">
          <h3 className="text-sm font-medium text-tinta">Já pagou? Anexe o comprovante aqui</h3>
          <p className="text-xs text-tinta-2">
            Envie a foto ou o PDF do Pix. Se tudo bater, o saldo entra automaticamente; senão,
            fica em análise e liberamos assim que confirmarmos.
          </p>
          <input
            ref={inputComprovanteRef}
            type="file"
            accept={MIME_COMPROVANTE_ACEITOS.join(',')}
            className="hidden"
            onChange={(e) => {
              const arquivo = e.target.files?.[0]
              e.target.value = ''
              if (arquivo) void aoEscolherComprovante(arquivo)
            }}
          />
          <Button
            variante="secondary"
            className="self-start"
            loading={enviarComprovante.isPending}
            onClick={() => inputComprovanteRef.current?.click()}
          >
            Anexar comprovante
          </Button>
          {comprovanteResultado === 'aprovado' && (
            <Banner tom="sucesso">Comprovante confirmado! O saldo já entrou na sua conta.</Banner>
          )}
          {comprovanteResultado === 'aguardando_revisao_manual' && (
            <Banner tom="info">Recebemos seu comprovante e ele está em análise.</Banner>
          )}
          {enviarComprovante.isError && (
            <Banner tom="erro">
              {(enviarComprovante.error instanceof ApiError && enviarComprovante.error.message) ||
                'Não foi possível enviar o comprovante. Tente de novo.'}
            </Banner>
          )}
        </Card>
      )}

      {recarga.isError && !enviado && (
        <Banner tom="erro" className="mt-4">
          {recarga.error instanceof ApiError && recarga.error.code === 'telefone_ausente' ? (
            <>
              Cadastre seu WhatsApp para receber as instruções de pagamento.{' '}
              <button
                type="button"
                className="font-medium underline"
                onClick={() => setCadastrarWhats(true)}
              >
                Cadastrar WhatsApp
              </button>
            </>
          ) : (
            (recarga.error instanceof ApiError && recarga.error.message) ||
            'Não foi possível iniciar a recarga. Tente de novo.'
          )}
        </Banner>
      )}

      {/* Extrato dos lançamentos (H11.8: transparência) */}
      <h2 className="mt-8 mb-4 text-lg text-salvia">Extrato</h2>
      {extrato.isLoading ? (
        <Skeleton className="h-40 w-full rounded-card" />
      ) : extrato.isError ? (
        <EmptyState titulo="Não foi possível carregar o extrato" descricao="Tente de novo mais tarde." />
      ) : !extrato.data || extrato.data.itens.length === 0 ? (
        <Card>
          <p className="text-sm text-tinta-2">Nenhum lançamento ainda.</p>
        </Card>
      ) : (
        <Card className="flex flex-col divide-y divide-linha">
          {extrato.data.itens.map((l) => {
            const entra = ENTRA.includes(l.tipo)
            return (
              <div key={l.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-col">
                  <span className="text-sm text-tinta">{ROTULO_LANCAMENTO[l.tipo]}</span>
                  <span className="text-xs text-tinta-2">
                    {new Date(l.criado_em).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                <span className={`tabular text-sm ${entra ? 'text-folha' : 'text-tinta-2'}`}>
                  {entra ? '+' : ''}
                  {l.quantidade}
                </span>
              </div>
            )
          })}
        </Card>
      )}

      <ConfirmDialog
        aberto={aConfirmar}
        titulo="Confirmar recarga"
        textoConfirmar="Enviar instruções no WhatsApp"
        carregando={recarga.isPending}
        onConfirmar={() =>
          recarga.mutate(
            { quantidade },
            {
              onSuccess: () => {
                setAConfirmar(false)
                setEnviado(true)
              },
              onError: () => setAConfirmar(false),
            },
          )
        }
        onCancelar={() => setAConfirmar(false)}
      >
        <span>
          Você vai recarregar <strong>{quantidade} envios</strong> por{' '}
          <MoneyText centavos={total} className="text-sm" />. Vamos enviar as instruções de
          pagamento no seu WhatsApp; o saldo entra após você pagar via Pix e enviar o
          comprovante na conversa.
        </span>
      </ConfirmDialog>

      {/* Item 3: popup de cadastro/verificação de WhatsApp (componente compartilhado, também
          usável por Conta/Onboarding numa leva futura). Ao confirmar, refaz a recarga. */}
      <OtpTelefoneDialog
        aberto={cadastrarWhats}
        onFechar={() => setCadastrarWhats(false)}
        onVerificado={aoVerificarWhatsApp}
        titulo="Cadastrar WhatsApp"
        descricao="Vamos enviar as instruções de pagamento da sua recarga para este número."
      />
    </div>
  )
}

// ---------------------------------------------------------------------------

function CartaoSaldo({
  titulo,
  valor,
  destaque = false,
  dica,
}: {
  titulo: string
  valor: number
  destaque?: boolean
  dica?: string
}) {
  return (
    <Card className={`flex flex-col gap-1 ${destaque ? 'border-salvia ring-1 ring-salvia/30' : ''}`}>
      <span className="flex items-center gap-1 text-sm text-tinta-2">
        {titulo}
        {dica && <InfoHint texto={dica} rotulo={`Sobre ${titulo.toLowerCase()}`} />}
      </span>
      <span className="font-display text-2xl text-salvia">{valor}</span>
    </Card>
  )
}
