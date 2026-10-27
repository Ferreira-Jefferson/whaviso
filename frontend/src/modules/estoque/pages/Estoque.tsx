// Estoque da loja ativa: duas secoes numa so tela (/estoque).
//  - Insumos: lista de materia-prima com saldo/unidade/minimo e destaque de estoque baixo;
//    criar/editar insumo e registrar movimento (entrada/saida/ajuste) por dialog.
//  - Fichas tecnicas: por item do cardapio, a lista de {insumo, quantidade} que ele consome.
// Dados pela api REST (raiz de cache ['estoque']); nada e decidido no cliente.
import { useState } from 'react'
import { Boxes, Plus } from 'lucide-react'
import { Badge, Button, EmptyState, ErrorState, SegmentedControl, Skeleton } from '@/shared/ui'
import type { InsumoDto } from '@/shared/contracts/_generated/estoque_insumos'
import { useInsumos } from '../api'
import { InsumoLinha } from '../components/InsumoLinha'
import { InsumoDialog } from '../components/InsumoDialog'
import { MovimentoDialog } from '../components/MovimentoDialog'
import { FichaTecnicaEditor } from '../components/FichaTecnicaEditor'

type Aba = 'insumos' | 'fichas'

const ABAS = [
  { value: 'insumos', label: 'Insumos' },
  { value: 'fichas', label: 'Fichas tecnicas' },
] as const

export default function Estoque() {
  const [aba, setAba] = useState<Aba>('insumos')
  const insumos = useInsumos(true)

  const [dlgInsumo, setDlgInsumo] = useState<{ aberto: boolean; insumo: InsumoDto | null }>({ aberto: false, insumo: null })
  const [dlgMovimento, setDlgMovimento] = useState<{ aberto: boolean; insumo: InsumoDto | null }>({ aberto: false, insumo: null })

  const lista = insumos.data ?? []
  const baixo = lista.filter((i) => i.abaixo_minimo && i.ativo).length

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-linha pb-4">
        <div>
          <h1 className="text-2xl text-salvia md:text-3xl">Estoque</h1>
          <p className="mt-1 text-sm text-tinta-2">
            Materia-prima da cozinha e a ficha tecnica de cada item (o que cada venda consome).
          </p>
        </div>
        {aba === 'insumos' && (
          <Button onClick={() => setDlgInsumo({ aberto: true, insumo: null })} className="max-md:w-full">
            <Plus strokeWidth={1.75} className="size-4" aria-hidden />
            Novo insumo
          </Button>
        )}
      </header>

      <div className="mb-4 mt-3.5 flex flex-wrap items-center gap-3">
        <SegmentedControl ariaLabel="Secao do estoque" value={aba} onChange={setAba} options={ABAS} />
        {aba === 'insumos' && baixo > 0 && (
          <Badge tom="atencao">
            {baixo === 1 ? '1 insumo com estoque baixo' : `${baixo} insumos com estoque baixo`}
          </Badge>
        )}
      </div>

      {aba === 'insumos' ? (
        <>
          {insumos.isPending && <Esqueleto />}
          {insumos.isError && <ErrorState aoTentarDeNovo={() => void insumos.refetch()} />}
          {insumos.isSuccess && lista.length === 0 && (
            <EmptyState
              icone={<Boxes className="size-7" aria-hidden />}
              titulo="Nenhum insumo cadastrado"
              descricao="Cadastre a materia-prima da sua cozinha (ex.: arroz, carne, embalagem) para controlar o saldo."
              acao={
                <Button onClick={() => setDlgInsumo({ aberto: true, insumo: null })}>
                  <Plus strokeWidth={1.75} className="size-4" aria-hidden />
                  Novo insumo
                </Button>
              }
            />
          )}
          {insumos.isSuccess && lista.length > 0 && (
            <div className="grid gap-3">
              {lista.map((insumo) => (
                <InsumoLinha
                  key={insumo.id}
                  insumo={insumo}
                  aoMovimentar={(i) => setDlgMovimento({ aberto: true, insumo: i })}
                  aoEditar={(i) => setDlgInsumo({ aberto: true, insumo: i })}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <FichaTecnicaEditor insumos={lista} />
      )}

      <InsumoDialog
        aberto={dlgInsumo.aberto}
        insumo={dlgInsumo.insumo}
        onFechar={() => setDlgInsumo((s) => ({ ...s, aberto: false }))}
      />
      <MovimentoDialog
        aberto={dlgMovimento.aberto}
        insumo={dlgMovimento.insumo}
        onFechar={() => setDlgMovimento((s) => ({ ...s, aberto: false }))}
      />
    </div>
  )
}

function Esqueleto() {
  return (
    <div aria-busy="true" aria-label="Carregando insumos" className="grid gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-card border border-linha bg-cartao p-4">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="mt-3 h-4 w-1/2" />
        </div>
      ))}
    </div>
  )
}
