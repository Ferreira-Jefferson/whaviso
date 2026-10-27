import type { ReactNode } from 'react'
import { CheckCheck } from 'lucide-react'
import type { MensagemSaida } from '@/shared/contracts/_generated/conversas'
import { cn } from '@/shared/ui'
import { formatarHora } from '@/shared/format'
import { tokenizarWhatsApp } from '@/shared/format/whatsapp'
import { conteudoExibido, ladoDaBolha, ROTULO_AUTOR } from '../estados'

/** Aplica negrito/italico dos marcadores do WhatsApp sem alterar o texto em si. */
function formatar(texto: string): ReactNode {
  return tokenizarWhatsApp(texto).map((seg, i) => {
    let no: ReactNode = seg.texto
    if (seg.negrito) no = <strong className="font-semibold">{no}</strong>
    if (seg.italico) no = <em>{no}</em>
    return <span key={i}>{no}</span>
  })
}

/** Uma bolha de mensagem. O autor define o lado e a cor; sistema fica centralizado e discreto. */
export function Mensagem({ mensagem, mostrarAutor = true }: { mensagem: MensagemSaida; mostrarAutor?: boolean }) {
  const { texto, placeholder } = conteudoExibido(mensagem)
  const lado = ladoDaBolha(mensagem.autor)
  const hora = formatarHora(mensagem.criado_em)

  if (lado === 'centro') {
    return (
      <div className="my-1 flex justify-center">
        <span className="max-w-[90%] rounded-pill bg-papel-2 px-3 py-1 text-center text-xs text-tinta-2">
          {texto} · {hora}
        </span>
      </div>
    )
  }

  const direita = lado === 'direita'
  const humano = mensagem.autor === 'humano'

  return (
    <div className={cn('flex', direita ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow-sm sm:max-w-[72%]',
          direita
            ? humano
              ? 'rounded-tr-sm bg-salvia text-papel'
              : 'rounded-tr-sm bg-salvia-claro text-tinta'
            : 'rounded-tl-sm border border-linha bg-cartao text-tinta',
        )}
      >
        {direita && mostrarAutor && (
          <p className={cn('mb-0.5 text-[11px] font-bold', humano ? 'text-papel/80' : 'text-salvia')}>
            {ROTULO_AUTOR[mensagem.autor]}
          </p>
        )}
        <p className={cn('whitespace-pre-wrap break-words', placeholder && 'italic opacity-80')}>{formatar(texto)}</p>
        <span
          className={cn(
            'mt-1 flex items-center justify-end gap-1 text-[10px] tabular-nums',
            direita ? (humano ? 'text-papel/70' : 'text-tinta-2') : 'text-tinta-2',
          )}
        >
          {hora}
          {direita && <CheckCheck strokeWidth={2} className="size-3" aria-hidden />}
        </span>
      </div>
    </div>
  )
}
