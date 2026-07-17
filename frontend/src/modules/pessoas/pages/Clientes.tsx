// E18 H18.4: aba Clientes da Gestão (/app/gestao/clientes). Lista central de clientes
// (agregada por telefone, identidade pelo número, E15). Cada linha mostra o número (completo,
// formatado) como identidade e a lista de nomes registrados nele (o nome varia por combinado;
// não há um nome único). A linha abre um modal com os totais e os combinados, onde dá para
// renomear por grupo de nome. O número é dado do próprio dono (nunca vai em rota/log, H15.7).
import { useState } from 'react'
import { Card, EmptyState, MoneyText, Spinner } from '@/shared/ui'
import { telefone as fmtTelefone } from '@/shared/format'
import type { Cliente } from '@/shared/contracts'
import { usePessoas } from '../api'
import { ClienteModal } from '../components/ClienteModal'

export default function ClientesPage() {
  const lista = usePessoas()
  const [aberto, setAberto] = useState<Cliente | null>(null)

  const clientes = lista.data?.itens ?? []

  return (
    <div>
      <p className="mb-4 text-sm text-tinta-2">
        Todos os seus clientes num só lugar. Abra um para ver o histórico e renomear.
      </p>

      {lista.isLoading ? (
        <div className="flex min-h-[20vh] items-center justify-center text-salvia">
          <Spinner className="size-6" />
        </div>
      ) : clientes.length === 0 ? (
        <EmptyState
          titulo="Nenhum cliente ainda"
          descricao="Assim que você criar combinados, os clientes aparecem aqui."
        />
      ) : (
        <Card className="flex flex-col divide-y divide-linha p-0">
          {clientes.map((c) => (
            <button
              key={c.telefone}
              type="button"
              onClick={() => setAberto(c)}
              className="flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-salvia-claro focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-salvia"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-tinta">
                  {fmtTelefone(c.telefone)}
                  {c.inativo && (
                    <span className="rounded-pill bg-ambar-claro px-2 py-0.5 text-xs font-medium text-ambar">
                      parado há um tempo
                    </span>
                  )}
                </span>
                {c.nomes.length > 0 && (
                  <span className="block truncate text-xs text-tinta-2">{c.nomes.join(', ')}</span>
                )}
              </span>
              <span className="shrink-0 text-right text-sm">
                {c.a_receber_centavos > 0 ? (
                  <span className="text-tinta-2">
                    a receber <MoneyText centavos={c.a_receber_centavos} className="text-ambar" />
                  </span>
                ) : (
                  <span className="text-tinta-2">
                    recebido <MoneyText centavos={c.recebido_centavos} className="text-folha" />
                  </span>
                )}
              </span>
            </button>
          ))}
        </Card>
      )}

      {aberto && <ClienteModal cliente={aberto} onFechar={() => setAberto(null)} />}
    </div>
  )
}
