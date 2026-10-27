// Cartao de um grupo de opcoes (biblioteca): cabecalho com nome/tipo/regra, lista de opcoes e
// o botao de adicionar opcao. As acoes borbulham para a pagina.
import { Pencil, Plus } from 'lucide-react'
import { Badge, Button } from '@/shared/ui'
import type { GrupoSaida, OpcaoSaida } from '@/shared/contracts/_generated/cardapio'
import { regraEscolhas, ROTULO_TIPO_GRUPO } from '../estados'
import { OpcaoLinha } from './OpcaoLinha'

interface Props {
  grupo: GrupoSaida
  ocupadoOpcaoId: string | null
  aoEditarGrupo: (grupo: GrupoSaida) => void
  aoNovaOpcao: (grupoId: string) => void
  aoEditarOpcao: (opcao: OpcaoSaida) => void
  aoAlternarOpcao: (opcao: OpcaoSaida, ligado: boolean) => void
}

export function GrupoCard({
  grupo,
  ocupadoOpcaoId,
  aoEditarGrupo,
  aoNovaOpcao,
  aoEditarOpcao,
  aoAlternarOpcao,
}: Props) {
  return (
    <section className="overflow-hidden rounded-card border border-linha bg-cartao">
      <header className="flex items-center gap-3 border-b border-linha bg-papel-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-display text-lg font-semibold text-salvia">{grupo.nome}</h2>
            <Badge tom="neutro">{ROTULO_TIPO_GRUPO[grupo.tipo]}</Badge>
            {!grupo.ativo && <Badge tom="neutro">Desligado</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-tinta-2">
            {regraEscolhas(grupo)}
            {grupo.obrigatorio ? ' · obrigatório' : ''}
          </p>
        </div>
        <Button
          variante="ghost"
          aria-label={`Editar grupo ${grupo.nome}`}
          onClick={() => aoEditarGrupo(grupo)}
          className="flex-none px-2.5"
        >
          <Pencil strokeWidth={1.75} className="size-4" aria-hidden />
        </Button>
      </header>

      {grupo.opcoes.length > 0 ? (
        <div className="divide-y divide-linha">
          {grupo.opcoes.map((opcao) => (
            <OpcaoLinha
              key={opcao.id}
              opcao={opcao}
              ocupado={ocupadoOpcaoId === opcao.id}
              aoAlternar={aoAlternarOpcao}
              aoEditar={aoEditarOpcao}
            />
          ))}
        </div>
      ) : (
        <p className="px-4 py-5 text-sm text-tinta-2">Nenhuma opção neste grupo ainda.</p>
      )}

      <div className="border-t border-linha p-3">
        <Button variante="secondary" onClick={() => aoNovaOpcao(grupo.id)} className="w-full">
          <Plus strokeWidth={1.75} className="size-4" aria-hidden />
          Adicionar opção
        </Button>
      </div>
    </section>
  )
}
