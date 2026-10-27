// Importacao de cardapio por foto/PDF (/cardapio-importacao): enviar o arquivo, acompanhar a
// leitura, revisar/editar o rascunho e aprovar. Em telas largas, historico ao lado da revisao.
import { useState } from 'react'
import { PageHeader } from '@/shared/ui'
import { ListaImportacoes } from '../components/ListaImportacoes'
import { RevisaoImportacao } from '../components/RevisaoImportacao'
import { UploadCard } from '../components/UploadCard'

export default function CardapioImportacao() {
  const [aberta, setAberta] = useState<string | null>(null)

  return (
    <div>
      <PageHeader
        titulo="Importar cardápio"
        descricao="Transforme a foto ou o PDF do seu cardápio em itens, com revisão antes de publicar."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-tinta-2">Importações</h2>
          <ListaImportacoes selecionada={aberta} aoAbrir={setAberta} />
        </div>
        <div className="flex flex-col gap-6">
          <UploadCard aoEnviar={setAberta} />
          {aberta && <RevisaoImportacao key={aberta} id={aberta} aoDescartar={() => setAberta(null)} />}
        </div>
      </div>
    </div>
  )
}
