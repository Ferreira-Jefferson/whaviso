// Dialog de conectar/reconectar um numero de WhatsApp (Meta Cloud API, Embedded Signup).
// A conexao e por CREDENCIAIS (code + ids), sem QR nem pareamento (ver CLAUDE.md / historias).
//   - modo 'conectar':   code do Embedded Signup + phone_number_id + waba_id (POST /numeros).
//   - modo 'reconectar':  so um novo code para rotacionar o token (POST /numeros/:id/reconectar).
// Segredo: o `codigo` e sensivel (SEC-020) -> autoComplete off, nunca persistido nem exibido
// de volta; o token nunca aparece nesta tela.
import { useEffect, useState } from 'react'
import { Info, ShieldCheck } from 'lucide-react'
import { Banner, Button, Dialog, Field, Input } from '@/shared/ui'

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
  const [form, setForm] = useState(VAZIO)

  // Limpa o formulario sempre que o dialog abre (nao guarda credencial entre usos).
  useEffect(() => {
    if (aberto) setForm(VAZIO)
  }, [aberto, modo])

  const reconectar = modo === 'reconectar'
  const codigoOk = form.codigo.trim().length > 0
  const idsOk = reconectar || (form.phone_number_id.trim().length > 0 && form.waba_id.trim().length > 0)
  const podeEnviar = codigoOk && idsOk && !carregando

  function enviar() {
    if (!podeEnviar) return
    onConfirmar({
      codigo: form.codigo.trim(),
      phone_number_id: form.phone_number_id.trim(),
      waba_id: form.waba_id.trim(),
    })
  }

  return (
    <Dialog
      aberto={aberto}
      onFechar={carregando ? () => {} : onFechar}
      titulo={reconectar ? 'Reconectar número' : 'Conectar número'}
      acoes={
        <>
          <Button variante="primary" className="w-full" loading={carregando} onClick={enviar} disabled={!podeEnviar}>
            {reconectar ? 'Reconectar' : 'Conectar'}
          </Button>
          <Button variante="secondary" className="w-full" disabled={carregando} onClick={onFechar}>
            Cancelar
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4 text-left"
        onSubmit={(e) => {
          e.preventDefault()
          enviar()
        }}
      >
        <div className="flex items-start gap-2.5 rounded-input border border-linha bg-papel-2 px-3.5 py-3 text-sm text-tinta-2">
          <Info strokeWidth={1.75} className="mt-0.5 size-4 flex-none text-salvia" aria-hidden />
          <p>
            {reconectar
              ? 'Cole o novo código do cadastro da Meta para renovar a conexão deste número. O número e os identificadores continuam os mesmos.'
              : 'A conexão é pela Meta (WhatsApp Cloud API), por credenciais e sem QR. Conclua o cadastro no painel da Meta e cole aqui o código e os identificadores.'}
          </p>
        </div>

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

        <p className="flex items-start gap-2 text-xs text-tinta-2">
          <ShieldCheck strokeWidth={1.75} className="mt-0.5 size-3.5 flex-none" aria-hidden />
          O código é usado uma vez para fazer a conexão e nunca fica guardado.
        </p>

        {/* Submit implicito pelo Enter dentro do form; o botao visivel fica no rodape do Dialog. */}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  )
}
