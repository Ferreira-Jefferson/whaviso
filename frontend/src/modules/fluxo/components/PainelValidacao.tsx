// Resultado da validacao do rascunho: erros bloqueiam a publicacao; avisos nao.
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Banner } from '@/shared/ui'
import type { FluxoProblema, FluxoValidacao } from '@/shared/contracts/_generated/fluxo'
import { ROTULO_PROBLEMA } from '../estados'

function irParaNode(id: string) {
  document.getElementById(`node-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function Lista({ itens, tom }: { itens: FluxoProblema[]; tom: 'erro' | 'info' }) {
  return (
    <ul className="flex flex-col gap-2">
      {itens.map((p, i) => (
        <li key={i}>
          <Banner tom={tom}>
            <span className="font-medium">{ROTULO_PROBLEMA[p.codigo]}.</span> {p.mensagem}
            {p.node_id && (
              <button
                type="button"
                onClick={() => irParaNode(p.node_id as string)}
                className="ml-2 min-h-8 font-medium underline underline-offset-2"
              >
                Ver etapa
              </button>
            )}
          </Banner>
        </li>
      ))}
    </ul>
  )
}

export function PainelValidacao({ resultado }: { resultado: FluxoValidacao }) {
  return (
    <section aria-label="Resultado da validação" className="flex flex-col gap-3">
      {resultado.valido ? (
        <div className="flex items-center gap-2 rounded-input border border-folha/20 bg-salvia-claro px-3 py-2.5 text-sm text-folha">
          <CheckCircle2 className="size-5 flex-none" aria-hidden />
          Fluxo válido. Pode publicar.
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-input border border-barro/20 bg-barro/10 px-3 py-2.5 text-barro">
          <AlertTriangle className="size-5 flex-none" aria-hidden />
          <h3 className="font-display text-base font-semibold">
            {resultado.erros.length === 1
              ? '1 problema impede a publicação'
              : `${resultado.erros.length} problemas impedem a publicação`}
          </h3>
        </div>
      )}
      {resultado.erros.length > 0 && <Lista itens={resultado.erros} tom="erro" />}
      {resultado.avisos.length > 0 && (
        <>
          <h3 className="text-sm font-medium text-tinta">Avisos</h3>
          <Lista itens={resultado.avisos} tom="info" />
        </>
      )}
    </section>
  )
}
