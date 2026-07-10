// WhatsAppPreview: bolha de mensagem no estilo WhatsApp (plano seção 1).
// Usado pelo admin (preview de template) e pela landing. O texto exibido SEMPRE
// vem renderizado pelo BACKEND (POST /v1/admin/templates/preview), risco nº 8:
// o cliente nunca renderiza o template enviado ao WhatsApp. A única coisa que este
// componente faz por cima é FORMATAÇÃO VISUAL dos marcadores do WhatsApp
// (*negrito*, _itálico_) via tokenizarWhatsApp, sem alterar o que é enviado.
// Botão de opt-out sempre visível (Regra de Ouro do produto).
import type { ReactNode } from 'react'
import { CheckCheck } from 'lucide-react'
import { tokenizarWhatsApp } from '@/shared/format/whatsapp'
import { cn } from './cn'

interface WhatsAppPreviewProps {
  /** Texto já renderizado pelo backend (com as variáveis substituídas). */
  texto: string
  /** Rótulos de botões interativos da mensagem (ex.: "Já paguei", "Sair dos lembretes"). */
  botoes?: string[]
  /** Horário fictício exibido na bolha. */
  horario?: string
  className?: string
  /** Conteúdo extra abaixo da bolha (ex.: rodapé informativo). */
  children?: ReactNode
}

// Verde de fundo do app do WhatsApp e da bolha de saída: tokens locais ao
// componente (cores de marca de terceiro, fora da paleta editorial do whaviso).
const FUNDO_CHAT = '#ECE5DD'
const BOLHA = '#DCF8C6'

// Desenha o texto aplicando negrito/itálico dos marcadores do WhatsApp. Os
// segmentos são inline, então quebras de linha/espaços seguem preservados pelo
// whitespace-pre-wrap do <p> pai.
function renderizarFormatado(texto: string): ReactNode {
  return tokenizarWhatsApp(texto).map((seg, i) => {
    let no: ReactNode = seg.texto
    if (seg.negrito) no = <strong className="font-semibold">{no}</strong>
    if (seg.italico) no = <em>{no}</em>
    return <span key={i}>{no}</span>
  })
}

export function WhatsAppPreview({
  texto,
  botoes = [],
  horario = '09:00',
  className,
  children,
}: WhatsAppPreviewProps) {
  return (
    <div
      className={cn('rounded-card border border-linha p-4', className)}
      style={{ backgroundColor: FUNDO_CHAT }}
    >
      <div className="flex flex-col items-end gap-1">
        <div
          className="max-w-[85%] rounded-xl rounded-tr-sm px-3 py-2 text-sm text-[#111b21] shadow-sm"
          style={{ backgroundColor: BOLHA }}
        >
          <p className="whitespace-pre-wrap break-words">{renderizarFormatado(texto)}</p>
          <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#667781]">
            {horario}
            <CheckCheck strokeWidth={2} className="size-3 text-[#53bdeb]" aria-hidden />
          </span>
        </div>

        {botoes.length > 0 && (
          <div className="flex w-full max-w-[85%] flex-col gap-1">
            {botoes.map((b) => (
              <div
                key={b}
                className="rounded-lg bg-white py-2 text-center text-sm font-medium text-[#00a5f4] shadow-sm"
              >
                {b}
              </div>
            ))}
          </div>
        )}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  )
}
