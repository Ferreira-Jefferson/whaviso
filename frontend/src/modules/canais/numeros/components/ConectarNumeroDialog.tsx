// Dialog de conectar/reconectar um numero de WhatsApp (Meta Cloud API, Embedded Signup).
// Caminho PRINCIPAL: popup oficial da Meta (SDK do Facebook), que devolve code + ids
// automaticamente. Fallback recolhivel: cadastro manual (colar code + ids), para quando o popup
// nao estiver disponivel ou falhar.
//   - modo 'conectar':   code do Embedded Signup + phone_number_id + waba_id (POST /numeros).
//   - modo 'reconectar':  so um novo code para rotacionar o token (POST /numeros/:id/reconectar).
// Segredo: o `codigo` e sensivel (SEC-020) -> autoComplete off, nunca persistido nem exibido
// de volta; o token nunca aparece nesta tela.
import { useEffect, useState } from 'react'
import { Info, PencilLine, ShieldCheck } from 'lucide-react'
import { Banner, Button, Dialog, Field, Input } from '@/shared/ui'
import { useEmbeddedSignup } from '@/shared/meta_signup'

export type ModoConexao = 'conectar' | 'reconectar'

interface ConectarNumeroDialogProps {
  aberto: boolean
  modo: ModoConexao
  carregando: boolean
  erro: string | null
  onConfirmar: (dados: { codigo: string; phone_number_id: string; waba_id: string }) => void
  onFechar: () => void
}

const VAZIO = { codigo: '', phone_number_id: '', waba_id: '' }

export function ConectarNumeroDialog({
  aberto,
  modo,
  carregando,
  erro,
  onConfirmar,
  onFechar,
}: ConectarNumeroDialogProps) {
  const { disponivel, carregando: lancandoPopup, lancar } = useEmbeddedSignup()
  const [form, setForm] = useState(VAZIO)
  // Sem o popup disponivel, ja comeca no modo manual; com ele, o manual e opcional (recolhido).
  const [manual, setManual] = useState(!disponivel)
  const [erroPopup, setErroPopup] = useState<string | null>(null)

  // Limpa estado sempre que o dialog abre (nao guarda credencial entre usos).
  useEffect(() => {
    if (aberto) {
      setForm(VAZIO)
      setManual(!disponivel)
      setErroPopup(null)
    }
  }, [aberto, modo, disponivel])

  const reconectar = modo === 'reconectar'
  const bloqueado = carregando || lancandoPopup
  // Caminho da Meta ativo quando ha popup disponivel e o usuario nao optou pelo manual.
  const viaMeta = disponivel && !manual

  const codigoOk = form.codigo.trim().length > 0
  const idsOk = reconectar || (form.phone_number_id.trim().length > 0 && form.waba_id.trim().length > 0)
  const podeEnviarManual = codigoOk && idsOk && !bloqueado

  function enviarManual() {
    if (!podeEnviarManual) return
    onConfirmar({
      codigo: form.codigo.trim(),
      phone_number_id: form.phone_number_id.trim(),
      waba_id: form.waba_id.trim(),
    })
  }

  async function conectarComMeta() {
    if (bloqueado) return
    setErroPopup(null)
    try {
      const resultado = await lancar()
      // A pagina dispara a mutation (useConectarNumero/useReconectarNumero) via onConfirmar.
      onConfirmar(resultado)
    } catch (e) {
      setErroPopup(e instanceof Error ? e.message : 'Nao foi possivel concluir a conexao pela Meta.')
    }
  }

  const rotuloMeta = reconectar ? 'Reconectar com a Meta' : 'Conectar com a Meta'
  const rotuloManual = reconectar ? 'Reconectar' : 'Conectar'

  return (
    <Dialog
      aberto={aberto}
      onFechar={bloqueado ? () => {} : onFechar}
      titulo={reconectar ? 'Reconectar número' : 'Conectar número'}
      acoes={
        <>
          {viaMeta ? (
            <Button
              variante="primary"
              className="w-full"
              loading={bloqueado}
              onClick={() => void conectarComMeta()}
            >
              {rotuloMeta}
            </Button>
          ) : (
            <Button
              variante="primary"
              className="w-full"
              loading={bloqueado}
              onClick={enviarManual}
              disabled={!podeEnviarManual}
            >
              {rotuloManual}
            </Button>
          )}
          <Button variante="secondary" className="w-full" disabled={bloqueado} onClick={onFechar}>
            Cancelar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-left">
        <div className="flex items-start gap-2.5 rounded-input border border-linha bg-papel-2 px-3.5 py-3 text-sm text-tinta-2">
          <Info strokeWidth={1.75} className="mt-0.5 size-4 flex-none text-salvia" aria-hidden />
          <p>
            {viaMeta
              ? reconectar
                ? 'Toque em "Reconectar com a Meta". Uma janela da Meta abre para você entrar e renovar a conexão deste número. O número e os identificadores continuam os mesmos.'
                : 'Toque em "Conectar com a Meta". Uma janela da Meta abre para você entrar e cadastrar o número. É rápido e só precisa ser feito uma vez.'
              : reconectar
                ? 'Cole o novo código do cadastro da Meta para renovar a conexão deste número. O número e os identificadores continuam os mesmos.'
                : 'A conexão é pela Meta (WhatsApp Cloud API), por credenciais e sem QR. Conclua o cadastro no painel da Meta e cole aqui o código e os identificadores.'}
          </p>
        </div>

        {viaMeta ? (
          <>
            {erroPopup && <Banner tom="erro">{erroPopup}</Banner>}

            {disponivel && (
              <button
                type="button"
                onClick={() => {
                  setErroPopup(null)
                  setManual(true)
                }}
                disabled={bloqueado}
                className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-salvia transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia disabled:cursor-not-allowed disabled:opacity-50"
              >
                <PencilLine strokeWidth={1.75} className="size-4" aria-hidden />
                Inserir manualmente
              </button>
            )}
          </>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              enviarManual()
            }}
          >
            <Field label="Código da Meta" dica="Código gerado ao concluir o cadastro no painel da Meta. É usado uma vez e nunca fica guardado.">
              <Input
                value={form.codigo}
                onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
                placeholder="Cole o código aqui"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={2048}
              />
            </Field>

            {!reconectar && (
              <>
                <Field label="ID do número (phone number ID)" dica="Identificador do número na Meta. Não é o telefone em si.">
                  <Input
                    value={form.phone_number_id}
                    onChange={(e) => setForm((f) => ({ ...f, phone_number_id: e.target.value }))}
                    placeholder="Ex.: 1098xxxxxxxxxxx"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={200}
                    inputMode="numeric"
                  />
                </Field>

                <Field label="ID da conta (WABA ID)" dica="Identificador da sua conta de WhatsApp Business na Meta.">
                  <Input
                    value={form.waba_id}
                    onChange={(e) => setForm((f) => ({ ...f, waba_id: e.target.value }))}
                    placeholder="Ex.: 1023xxxxxxxxxxx"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={200}
                    inputMode="numeric"
                  />
                </Field>
              </>
            )}

            {erro && <Banner tom="erro">{erro}</Banner>}

            {disponivel && (
              <button
                type="button"
                onClick={() => {
                  setErroPopup(null)
                  setManual(false)
                }}
                disabled={bloqueado}
                className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-salvia transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia disabled:cursor-not-allowed disabled:opacity-50"
              >
                Usar a conexão pela Meta
              </button>
            )}

            {/* Submit implicito pelo Enter dentro do form; o botao visivel fica no rodape do Dialog. */}
            <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
          </form>
        )}

        <p className="flex items-start gap-2 text-xs text-tinta-2">
          <ShieldCheck strokeWidth={1.75} className="mt-0.5 size-3.5 flex-none" aria-hidden />
          O código é usado uma vez para fazer a conexão e nunca fica guardado.
        </p>
      </div>
    </Dialog>
  )
}
