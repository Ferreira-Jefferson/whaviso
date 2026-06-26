// /app/creditos: tela de CRÉDITOS do usuário (Épico 11, carteira pré-paga). Mostra o saldo
// (livre/reservado/em hold/consumido), um SLIDER de quantidade (de envios_min a envios_max
// do catálogo) com o PREÇO calculado AO VIVO pela curva (mesma função do backend, fonte
// única), e um POPUP com o botão "Continuar no WhatsApp" (compra manual do MVP: o owner
// credita após o pagamento via Pix). Abaixo, o EXTRATO dos lançamentos.
// O limite é DECIDIDO PELO BACKEND: aqui só espelhamos o saldo (nunca recalculado).
// Linguagem das Regras de Ouro: crédito, envio, saldo, recarga.
import { useState } from 'react'
import {
  Banner,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  MoneyText,
  PageHeader,
  Skeleton,
} from '@/shared/ui'
import { precoEnvioCentavos } from '@/shared/plano'
import { useSession } from '@/shared/auth'
import { brl } from '@/shared/format'
import type { Lancamento } from '@/shared/contracts'
import { useCarteira, useExtrato } from '../api'
import { linkComprarCreditosWhatsApp } from '../whatsapp'

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
  const carteira = useCarteira()
  const extrato = useExtrato(1)
  const email = useSession()?.user.email ?? null

  const catalogo = carteira.data?.catalogo
  const saldo = carteira.data?.carteira

  // Quantidade do slider (entre envios_min e envios_max). Default: ponto médio arredondado.
  const [qtd, setQtd] = useState<number | null>(null)
  const [aConfirmar, setAConfirmar] = useState(false)

  const min = catalogo?.envios_min ?? 10
  const max = catalogo?.envios_max ?? 500
  const quantidade = qtd ?? Math.min(Math.max(Math.round((min + max) / 2), min), max)
  const total = catalogo ? precoEnvioCentavos(catalogo, quantidade) : 0
  const porEnvio = quantidade > 0 ? Math.round(total / quantidade) : 0

  const linkWhats = catalogo
    ? linkComprarCreditosWhatsApp({ envios: quantidade, precoCentavos: total, email })
    : null

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
          <CartaoSaldo titulo="Reservado" valor={saldo.reservado} />
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
            onChange={(e) => setQtd(Number(e.target.value))}
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
                <span className="text-sm text-tinta-2">({brl(porEnvio)} por envio)</span>
              </p>
            </div>
            <Button variante="primary" onClick={() => setAConfirmar(true)}>
              Recarregar
            </Button>
          </div>
          <p className="text-xs text-tinta-2">
            O saldo comprado soma ao que você já tem e não expira. No MVP a recarga é feita
            pelo WhatsApp: você combina o Pix por lá e o saldo entra após o pagamento.
          </p>
        </Card>
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
        titulo="Continuar a recarga no WhatsApp"
        textoConfirmar={linkWhats ? 'Continuar no WhatsApp' : 'Entendi'}
        onConfirmar={() => {
          if (linkWhats) window.open(linkWhats, '_blank', 'noopener,noreferrer')
          setAConfirmar(false)
        }}
        onCancelar={() => setAConfirmar(false)}
      >
        <span>
          Você vai recarregar <strong>{quantidade} envios</strong> por{' '}
          <MoneyText centavos={total} className="text-sm" />. No MVP a recarga é feita pelo
          WhatsApp: o saldo entra após o pagamento via Pix.
          {!linkWhats && ' (O canal de recarga ainda não está configurado.)'}
        </span>
      </ConfirmDialog>
    </div>
  )
}

// ---------------------------------------------------------------------------

function CartaoSaldo({ titulo, valor, destaque = false }: { titulo: string; valor: number; destaque?: boolean }) {
  return (
    <Card className={`flex flex-col gap-1 ${destaque ? 'border-salvia ring-1 ring-salvia/30' : ''}`}>
      <span className="text-sm text-tinta-2">{titulo}</span>
      <span className="font-display text-2xl text-salvia">{valor}</span>
    </Card>
  )
}
