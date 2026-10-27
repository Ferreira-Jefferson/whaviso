// Fidelidade: configuracao do programa (pontos ou cashback) e saldo por cliente.
// Rota /fidelidade. Dados pela api REST (raiz ['fidelidade']); a regra de calculo e do backend.
import { useState } from 'react'
import { ErrorState, PageHeader, Skeleton, Tabs } from '@/shared/ui'
import { usePrograma } from '../api'
import { ProgramaForm } from '../components/ProgramaForm'
import { SaldoCliente } from '../components/SaldoCliente'

type Aba = 'programa' | 'saldo'

export default function Fidelidade() {
  const [aba, setAba] = useState<Aba>('programa')
  const programa = usePrograma()

  const painelPrograma = (
    <>
      {programa.isPending && <Skeleton className="h-64 w-full max-w-2xl" />}
      {programa.isError && <ErrorState aoTentarDeNovo={() => void programa.refetch()} />}
      {programa.isSuccess && <ProgramaForm programa={programa.data} />}
    </>
  )

  return (
    <div>
      <PageHeader titulo="Fidelidade" descricao="Pontos ou cashback para quem volta a pedir." />
      <Tabs
        ariaLabel="Fidelidade"
        ativa={aba}
        aoMudar={(id) => setAba(id as Aba)}
        itens={[
          { id: 'programa', rotulo: 'Programa', conteudo: painelPrograma },
          { id: 'saldo', rotulo: 'Saldo por cliente', conteudo: <SaldoCliente /> },
        ]}
      />
    </div>
  )
}
