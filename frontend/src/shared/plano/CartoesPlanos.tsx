// Cartões de plano: visual ÚNICO usado na landing pública E na tela de planos do
// usuário (/app/plano), para as duas ficarem iguais (decisão 2026-06-25). Vive no
// kernel `shared` porque módulo nunca importa módulo (landing e billing são módulos
// distintos). O VISUAL é fixo aqui; o que muda entre os dois usos é só a CTA de
// cada cartão, injetada por `renderCta` (na landing é um link de cadastro; na tela
// do usuário é o botão de escolher/trocar, ou "Seu plano atual" desabilitado).
// Linguagem das Regras de Ouro: só "aviso/agenda/plano".
import { useState, type ReactNode } from 'react'
import { Card, MoneyText } from '../ui'
import type { Plano } from '../contracts'
import { precoEnvioCentavos } from './preco'

interface CartoesPlanosProps {
  planos: Plano[]
  // CTA de cada cartão. No Plus, recebe o nº de envios escolhido no slider (senão
  // null). Permite a landing renderizar um link e a tela do usuário um botão.
  renderCta: (plano: Plano, enviosEscolhidos: number | null) => ReactNode
  // Marca um cartão como o plano vigente (realce de borda). Opcional (a landing,
  // pública, não tem plano atual).
  planoAtualId?: string | null
}

export function CartoesPlanos({ planos, renderCta, planoAtualId = null }: CartoesPlanosProps) {
  return (
    <div className="grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {planos.map((p) =>
        p.por_envio ? (
          <CartaoPlus key={p.id} p={p} renderCta={renderCta} ehAtual={p.id === planoAtualId} />
        ) : (
          <CartaoSimples key={p.id} p={p} renderCta={renderCta} ehAtual={p.id === planoAtualId} />
        ),
      )}
    </div>
  )
}

function CartaoSimples({
  p,
  renderCta,
  ehAtual,
}: {
  p: Plano
  renderCta: (plano: Plano, enviosEscolhidos: number | null) => ReactNode
  ehAtual: boolean
}) {
  const destaque = p.id === 'profissional'
  const borda = destaque
    ? 'border-salvia ring-2 ring-salvia/40'
    : ehAtual
      ? 'border-salvia ring-1 ring-salvia/30'
      : ''
  return (
    <Card className={`flex h-full flex-col gap-4 bg-cartao ${borda}`}>
      {destaque ? (
        <span className="self-start rounded-pill bg-salvia px-3 py-1 text-xs font-medium text-papel">
          Mais popular
        </span>
      ) : (
        <span className="text-xs text-transparent">.</span>
      )}
      <div>
        <h3 className="text-lg text-salvia">{p.nome}</h3>
        <p className="mt-2 flex items-baseline gap-1">
          <MoneyText centavos={p.preco_centavos} className="font-display text-3xl text-tinta" />
          {p.preco_centavos > 0 && <span className="text-sm text-tinta-2">/mês</span>}
        </p>
      </div>
      <ul className="flex flex-1 flex-col gap-2 text-sm text-tinta">
        {p.vagas_ativas != null && (
          <li className="font-medium">{`• ${p.vagas_ativas} envios de aviso`}</li>
        )}
        <li>{`• Agenda de até ${p.capacidade_agenda} itens`}</li>
        <li>
          {p.somente_leitura
            ? '• Visualização e agenda (sem enviar avisos)'
            : '• Avisos automáticos no WhatsApp'}
        </li>
        {p.cadencia_configuravel && <li>• Cadência configurável</li>}
      </ul>
      <div className="mt-auto">{renderCta(p, null)}</div>
    </Card>
  )
}

function CartaoPlus({
  p,
  renderCta,
  ehAtual,
}: {
  p: Plano
  renderCta: (plano: Plano, enviosEscolhidos: number | null) => ReactNode
  ehAtual: boolean
}) {
  const min = p.envios_min ?? 26
  const max = p.envios_max ?? 200
  const [envios, setEnvios] = useState(() => Math.min(Math.max(50, min), max))
  const total = precoEnvioCentavos(p, envios)

  return (
    <Card
      className={`flex h-full flex-col gap-4 border-salvia bg-cartao ${ehAtual ? 'ring-1 ring-salvia/30' : 'ring-2 ring-salvia/40'}`}
    >
      <span className="self-start rounded-pill bg-salvia px-3 py-1 text-xs font-medium text-papel">
        Para quem cresce
      </span>
      <div>
        <h3 className="text-lg text-salvia">{p.nome}</h3>
        <p className="mt-2 flex items-baseline gap-1">
          <MoneyText centavos={total} className="font-display text-3xl text-tinta" />
          <span className="text-sm text-tinta-2">/mês</span>
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-card bg-papel-2 p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-tinta-2">Envios por mês</span>
          <span className="tabular text-lg text-salvia">{envios}</span>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          value={envios}
          onChange={(e) => setEnvios(Number(e.target.value))}
          className="w-full cursor-pointer"
          style={{ accentColor: 'var(--color-salvia)' }}
          aria-label="Envios por mês"
        />
        <div className="flex justify-between text-xs text-tinta-2">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      </div>

      <ul className="flex flex-1 flex-col gap-2 text-sm text-tinta">
        <li className="font-medium">{`• Até ${envios} envios de aviso por mês`}</li>
        <li>• Avisos automáticos no WhatsApp</li>
        {p.cadencia_configuravel && <li>• Cadência configurável</li>}
      </ul>

      <div className="mt-auto">{renderCta(p, envios)}</div>
    </Card>
  )
}
