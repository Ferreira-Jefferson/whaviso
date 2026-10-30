// Seção de planos da landing (página única). Lê a vitrine pública e renderiza os planos ativos
// como cards; cada card leva ao cadastro. Se não houver planos (ou falha de leitura), cai num
// estado neutro com um caminho para entrar, para a âncora #planos nunca ficar vazia.
import { Link } from 'react-router'
import { Check } from 'lucide-react'
import { brl } from '@/shared/format'
import { usePlanosPublicos } from '../planos'

export function Planos() {
  const { data, isLoading, isError } = usePlanosPublicos()
  const planos = data ?? []

  return (
    <section id="planos" className="mx-auto w-full max-w-5xl px-4 py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-3xl text-salvia md:text-4xl">Planos</h2>
        <p className="mt-3 text-tinta-2">
          Escolha o plano e comece a receber pedidos pelo seu WhatsApp, sem comissão por pedido.
        </p>
      </div>

      {isLoading ? (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-64 animate-pulse rounded-card border border-linha bg-cartao" />
          ))}
        </div>
      ) : planos.length > 0 ? (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {planos.map((p) => (
            <div key={p.id} className="flex flex-col rounded-card border border-linha bg-cartao p-6">
              <h3 className="font-display text-xl text-salvia">{p.nome}</h3>
              <p className="mt-2">
                <span className="tabular text-3xl font-bold text-tinta">{brl(p.valor_centavos)}</span>
                <span className="text-sm text-tinta-2"> /mês</span>
              </p>
              {p.inclui.length > 0 && (
                <ul className="mt-4 flex-1 space-y-2 text-sm text-tinta-2">
                  {p.inclui.map((item, i) => (
                    <li key={i} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-folha" aria-hidden />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                to="/entrar"
                className="mt-6 rounded-input bg-salvia px-6 py-2.5 text-center text-sm font-semibold text-papel hover:bg-tinta"
              >
                Começar
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <p className="text-tinta-2">
            {isError
              ? 'Não foi possível carregar os planos agora. Tente de novo em instantes.'
              : 'Fale com a gente para conhecer os planos disponíveis.'}
          </p>
          <Link
            to="/entrar"
            className="rounded-input bg-salvia px-8 py-3 text-base font-semibold text-papel hover:bg-tinta"
          >
            Entrar
          </Link>
        </div>
      )}
    </section>
  )
}
