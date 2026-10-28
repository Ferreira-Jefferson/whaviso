// /contas-a-pagar (Financeiro): o que a loja paga para fora. Duas abas: "Fornecedores" (cadastro) e
// "A pagar" (lancamentos manuais: fornecedor ou pessoa, com marcar como pago). Dinheiro em centavos;
// PII (telefone do fornecedor) so MASCARADO, claro so sob demanda no dialog.
import { useState } from 'react'
import { PageHeader, Tabs, type TabItem } from '@/shared/ui'
import { PainelAcerto } from '../components/PainelAcerto'
import { PainelContas } from '../components/PainelContas'
import { PainelFornecedores } from '../components/PainelFornecedores'

export default function ContasPagar() {
  const [aba, setAba] = useState('a-pagar')

  const abas: ReadonlyArray<TabItem> = [
    { id: 'a-pagar', rotulo: 'A pagar', conteudo: <PainelContas /> },
    { id: 'acerto-motoboys', rotulo: 'Acerto de motoboys', conteudo: <PainelAcerto /> },
    { id: 'fornecedores', rotulo: 'Fornecedores', conteudo: <PainelFornecedores /> },
  ]

  return (
    <div>
      <PageHeader titulo="Contas a pagar" descricao="O que a sua loja paga para fornecedores e pessoas." />
      <Tabs itens={abas} ativa={aba} aoMudar={setAba} ariaLabel="Secoes de contas a pagar" />
    </div>
  )
}
