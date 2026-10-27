// Fiscal da loja (/fiscal): documentos emitidos (NFC-e/NFS-e) e configuracao do emissor.
import { useState } from 'react'
import { PageHeader, SegmentedControl } from '@/shared/ui'
import { FiscalConfig } from '../components/FiscalConfig'
import { ListaDocumentos } from '../components/ListaDocumentos'

type Aba = 'documentos' | 'config'

const ABAS = [
  { value: 'documentos', label: 'Documentos' },
  { value: 'config', label: 'Emissor' },
] as const

export default function Fiscal() {
  const [aba, setAba] = useState<Aba>('documentos')

  return (
    <div>
      <PageHeader titulo="Fiscal" descricao="Notas fiscais dos pedidos, emitidas pelo serviço emissor da sua loja." />
      <div className="mb-4">
        <SegmentedControl ariaLabel="Seção fiscal" value={aba} onChange={setAba} options={ABAS} />
      </div>
      {aba === 'documentos' ? <ListaDocumentos /> : <FiscalConfig />}
    </div>
  )
}
