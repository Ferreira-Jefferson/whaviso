// /fluxo: construtor do fluxo de conversa do atendente. Lista os fluxos; abrir um leva ao editor
// estruturado (etapas, configuracao e saidas), com validar, publicar e ativar. Rota 'fluxo' (config).
import { useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { Banner, Button, Dialog, ErrorState, Field, Input, PageHeader, Skeleton, useToast } from '@/shared/ui'
import { useCatalogo, useCriarFluxo } from '../api'
import { mensagemErro } from '../estados'
import { EditorFluxo } from '../components/EditorFluxo'
import { ListaFluxos } from '../components/ListaFluxos'

export default function Fluxo() {
  const catalogo = useCatalogo()
  const criar = useCriarFluxo()
  const { mostrarToast } = useToast()
  const [aberto, setAberto] = useState<string | null>(null)
  const [novo, setNovo] = useState(false)
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  function enviar(e: FormEvent) {
    e.preventDefault()
    const n = nome.trim()
    if (!n) {
      setErro('Dê um nome ao fluxo.')
      return
    }
    setErro(null)
    criar.mutate(
      { nome: n },
      {
        onSuccess: (f) => {
          setNovo(false)
          setNome('')
          setAberto(f.id)
          mostrarToast('Fluxo criado a partir do padrão.', { tom: 'sucesso' })
        },
        onError: (e2) => setErro(mensagemErro(e2, 'Não foi possível criar o fluxo.')),
      },
    )
  }

  if (aberto) {
    if (catalogo.isPending) return <Skeleton className="h-48 w-full" />
    if (catalogo.isError) return <ErrorState aoTentarDeNovo={() => void catalogo.refetch()} />
    return <EditorFluxo fluxoId={aberto} catalogo={catalogo.data} onVoltar={() => setAberto(null)} />
  }

  return (
    <div>
      <PageHeader
        titulo="Fluxo de conversa"
        descricao="As etapas que o atendente segue com o cliente, da saudação ao acompanhamento do pedido."
        acoes={
          <Button
            onClick={() => {
              setErro(null)
              setNovo(true)
            }}
          >
            <Plus className="size-4" aria-hidden /> Novo fluxo
          </Button>
        }
      />
      <ListaFluxos
        onAbrir={setAberto}
        onNovo={() => {
          setErro(null)
          setNovo(true)
        }}
      />

      <Dialog aberto={novo} onFechar={() => setNovo(false)} titulo="Novo fluxo">
        {novo && (
          <form onSubmit={enviar} className="flex flex-col gap-4 text-tinta">
            <Field label="Nome do fluxo">
              <Input value={nome} maxLength={120} onChange={(e) => setNome(e.target.value)} autoFocus />
            </Field>
            <p className="text-xs text-tinta-2">Nasce como rascunho, copiado do fluxo padrão.</p>
            {erro && <Banner tom="erro">{erro}</Banner>}
            <div className="flex flex-col-reverse gap-2">
              <Button type="button" variante="secondary" onClick={() => setNovo(false)} disabled={criar.isPending}>
                Cancelar
              </Button>
              <Button type="submit" loading={criar.isPending}>
                Criar fluxo
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  )
}
