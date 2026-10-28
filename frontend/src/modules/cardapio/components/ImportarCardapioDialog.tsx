// Importar cardapio por foto/PDF, agora como fluxo DENTRO do Cardapio (modal), nao mais uma
// rota/tela solta. Enviar o arquivo, acompanhar a leitura, revisar o rascunho e aprovar; o
// lote aprovado cai no cardapio da loja (invalida a arvore ['cardapio']). Em telas largas,
// historico ao lado da revisao.
import { useState } from 'react'
import { Dialog } from '@/shared/ui'
import { ListaImportacoes } from '../importacao/components/ListaImportacoes'
import { RevisaoImportacao } from '../importacao/components/RevisaoImportacao'
import { UploadCard } from '../importacao/components/UploadCard'

export function ImportarCardapioDialog({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const [selecionada, setSelecionada] = useState<string | null>(null)

  return (
    <Dialog aberto={aberto} onFechar={onFechar} titulo="Importar cardápio" className="max-w-4xl">
      <p>Transforme a foto ou o PDF do seu cardápio em itens, com revisão antes de publicar.</p>
      <div className="mt-4 grid items-start gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-tinta-2">Importações</h3>
          <ListaImportacoes selecionada={selecionada} aoAbrir={setSelecionada} />
        </div>
        <div className="flex flex-col gap-6">
          <UploadCard aoEnviar={setSelecionada} />
          {selecionada && <RevisaoImportacao key={selecionada} id={selecionada} aoDescartar={() => setSelecionada(null)} />}
        </div>
      </div>
    </Dialog>
  )
}
