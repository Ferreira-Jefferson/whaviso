// Mini-chat de teste do WhatsApp (diagnóstico do owner). Caixa no estilo WhatsApp
// para enviar mensagens de texto a um número de teste e ver as respostas, checando se
// o aparelho conectado realmente envia/recebe. O número de teste é cadastrado pelo
// menu de três pontos do cabeçalho. Toda a entrega é pelo backend (api enfileira, zap
// envia pela Meta Cloud API); este componente é só a interface. Sem regra de negócio aqui.
import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCheck, Clock, MoreVertical, Send } from 'lucide-react'
import { Button, Dialog, PhoneInput, Spinner, cn } from '@/shared/ui'
import {
  useEnviarTeste,
  useSalvarTesteNumero,
  useTesteMensagens,
  useTesteNumero,
  type TesteMensagem,
} from '../api'

// Cores de marca do WhatsApp (locais ao componente, fora da paleta editorial), iguais
// às do WhatsAppPreview do design system.
const FUNDO_CHAT = '#ECE5DD'
const BOLHA_SAIDA = '#DCF8C6'

function StatusSaida({ m }: { m: TesteMensagem }) {
  if (m.status === 'falhou') {
    return (
      <span title={m.erro ?? 'falha no envio'} className="inline-flex items-center text-barro">
        <AlertCircle strokeWidth={2} className="size-3" />
      </span>
    )
  }
  if (m.status === 'enviado') {
    return <CheckCheck strokeWidth={2} className="size-3 text-[#53bdeb]" aria-label="enviado" />
  }
  // agendado / processando: ainda na fila do zap.
  return <Clock strokeWidth={2} className="size-3 text-[#667781]" aria-label="enviando" />
}

export function ChatTeste() {
  const numero = useTesteNumero()
  const mensagens = useTesteMensagens(true)
  const enviar = useEnviarTeste()
  const salvarNumero = useSalvarTesteNumero()

  const [texto, setTexto] = useState('')
  const [editandoNumero, setEditandoNumero] = useState(false)
  const [numeroEdit, setNumeroEdit] = useState<string | null>(null)

  const telefone = numero.data?.telefone ?? null
  const itens = mensagens.data?.itens ?? []

  // Rola para o fim quando chegam mensagens novas.
  const fimRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: 'end' })
  }, [itens.length])

  const aoEnviar = () => {
    const t = texto.trim()
    if (!t || !telefone) return
    enviar.mutate(t, { onSuccess: () => setTexto('') })
  }

  const abrirEdicao = () => {
    setNumeroEdit(telefone)
    setEditandoNumero(true)
  }

  const aoSalvarNumero = () => {
    salvarNumero.mutate(numeroEdit, { onSuccess: () => setEditandoNumero(false) })
  }

  return (
    <div className="mt-2 border-t border-linha pt-5">
      <div className="mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-card border border-linha shadow-sm">
        {/* Cabeçalho: título + menu de três pontos (cadastrar/editar número de teste). */}
        <div className="flex items-center justify-between gap-2 bg-salvia px-4 py-3 text-papel">
          <div className="min-w-0">
            <p className="text-sm font-medium">Conversa de teste</p>
            <p className="truncate text-xs text-papel/80">
              {telefone ? `Para ${telefone}` : 'Nenhum número de teste cadastrado'}
            </p>
          </div>
          <button
            type="button"
            onClick={abrirEdicao}
            aria-label="Número de teste"
            title="Cadastrar ou editar o número de teste"
            className="flex size-8 shrink-0 items-center justify-center rounded-input text-papel/90 transition-colors hover:bg-white/15"
          >
            <MoreVertical strokeWidth={2} className="size-5" />
          </button>
        </div>

        {/* Área das mensagens (balões), estilo WhatsApp. */}
        <div
          className="flex h-72 flex-col gap-1.5 overflow-y-auto px-3 py-3"
          style={{ backgroundColor: FUNDO_CHAT }}
        >
          {mensagens.isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner className="size-6" />
            </div>
          ) : itens.length === 0 ? (
            <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-[#667781]">
              {telefone
                ? 'Envie uma mensagem para começar o teste.'
                : 'Cadastre um número de teste no menu de três pontos para começar.'}
            </div>
          ) : (
            itens.map((m) => (
              <div
                key={m.id}
                className={cn('flex', m.direcao === 'saida' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[80%] rounded-xl px-3 py-2 text-sm text-[#111b21] shadow-sm',
                    m.direcao === 'saida' ? 'rounded-tr-sm' : 'rounded-tl-sm bg-white',
                  )}
                  style={m.direcao === 'saida' ? { backgroundColor: BOLHA_SAIDA } : undefined}
                >
                  <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                  <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#667781]">
                    {m.horario}
                    {m.direcao === 'saida' && <StatusSaida m={m} />}
                  </span>
                </div>
              </div>
            ))
          )}
          <div ref={fimRef} />
        </div>

        {/* Rodapé: digitar e enviar. */}
        <form
          className="flex items-center gap-2 border-t border-linha bg-cartao p-2"
          onSubmit={(e) => {
            e.preventDefault()
            aoEnviar()
          }}
        >
          <input
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            disabled={!telefone}
            placeholder={telefone ? 'Mensagem de teste' : 'Cadastre um número primeiro'}
            maxLength={1000}
            className={cn(
              'min-w-0 flex-1 rounded-input border border-linha bg-cartao px-3 py-2 text-sm text-tinta',
              'placeholder:text-tinta-2/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          />
          <Button
            type="submit"
            loading={enviar.isPending}
            disabled={!telefone || !texto.trim()}
            aria-label="Enviar mensagem de teste"
          >
            <Send strokeWidth={2} className="size-4" />
          </Button>
        </form>
      </div>

      {enviar.isError && (
        <p className="mx-auto mt-2 max-w-md text-center text-xs text-barro">
          Não foi possível enviar. Verifique se o WhatsApp está conectado e tente de novo.
        </p>
      )}

      {/* Cadastro/edição do número de teste (menu de três pontos). */}
      <Dialog
        aberto={editandoNumero}
        onFechar={() => setEditandoNumero(false)}
        titulo="Número de teste"
        acoes={
          <>
            <Button
              className="w-full"
              loading={salvarNumero.isPending}
              onClick={aoSalvarNumero}
            >
              Salvar
            </Button>
            <Button
              variante="secondary"
              className="w-full"
              disabled={salvarNumero.isPending}
              onClick={() => setEditandoNumero(false)}
            >
              Cancelar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p>
            As mensagens de teste vão para este número, que conversa só com esta caixa
            (não recebe os avisos do ciclo). Use um celular seu para conferir a entrega.
          </p>
          <PhoneInput value={numeroEdit} onChange={setNumeroEdit} />
        </div>
      </Dialog>
    </div>
  )
}
