// Fiscal da loja (/fiscal): documentos emitidos (NFC-e/NFS-e) e configuracao do emissor.
import { useState } from 'react'
import { PageHeader, SegmentedControl } from '@/shared/ui'
import { FiscalConfig } from '../components/FiscalConfig'
import { ItensFiscais } from '../components/ItensFiscais'
import { ListaDocumentos } from '../components/ListaDocumentos'
import { PedidosEmitir } from '../components/PedidosEmitir'

type Aba = 'documentos' | 'itens' | 'config'

const ABAS = [
  { value: 'documentos', label: 'Documentos' },
  { value: 'itens', label: 'Itens' },
  { value: 'config', label: 'Emissor' },
] as const

export default function Fiscal() {
  const [aba, setAba] = useState<Aba>('documentos')

  return (
    <div className="animate-rise">
      <PageHeader titulo="Fiscal" descricao="Notas fiscais dos pedidos, emitidas pelo serviço emissor da sua loja." />
      <div className="mb-4">
        <SegmentedControl ariaLabel="Seção fiscal" value={aba} onChange={setAba} options={ABAS} />
      </div>
      {aba === 'documentos' && (
        <>
          <PedidosEmitir />
          <ListaDocumentos />
        </>
      )}
      {aba === 'itens' && <ItensFiscais />}
      {aba === 'config' && <FiscalConfig />}
    </div>
  )
}
