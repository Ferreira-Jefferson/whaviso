// Dialog do CONSOLE para anexar uma WABA que a plataforma JA possui, sem Embedded Signup. Usado
// quando o dono do app roda o fluxo (o popup volta vazio porque nao ha o que onboardar): o operador
// informa os ids da WABA/numero e um access_token de system user com acesso a WABA.
// Segredo: o access_token e sensivel (SEC-020) -> autoComplete off, nunca persistido nem exibido de
// volta; limpa ao abrir/fechar. Os ids (waba/phone) sao identificadores da Meta, nao o telefone.
import { useEffect, useState } from 'react'
import { Info, ShieldCheck } from 'lucide-react'
import { Banner, Button, Dialog, Field, Input } from '@/shared/ui'

interface AnexarNumeroDialogProps {
  aberto: boolean
  nomeLoja: string
  carregando: boolean
  erro: string | null
  onConfirmar: (dados: { waba_id: string; phone_number_id: string; access_token: string }) => void
  onFechar: () => void
}

const VAZIO = { waba_id: '', phone_number_id: '', access_token: '' }

export function AnexarNumeroDialog({
  aberto,
  nomeLoja,
  carregando,
  erro,
  onConfirmar,
  onFechar,
}: AnexarNumeroDialogProps) {
  const [form, setForm] = useState(VAZIO)

  // Nunca guarda credencial entre usos: limpa sempre que o dialog abre.
  useEffect(() => {
    if (aberto) setForm(VAZIO)
  }, [aberto])

  const podeEnviar =
    form.waba_id.trim().length > 0 &&
    form.phone_number_id.trim().length > 0 &&
    form.access_token.trim().length > 0 &&
    !carregando

  function enviar() {
    if (!podeEnviar) return
    onConfirmar({
      waba_id: form.waba_id.trim(),
      phone_number_id: form.phone_number_id.trim(),
      access_token: form.access_token.trim(),
    })
  }

  return (
    <Dialog
      aberto={aberto}
      onFechar={carregando ? () => {} : onFechar}
      titulo="Anexar WABA existente"
      acoes={
        <>
          <Button variante="primary" className="w-full" loading={carregando} disabled={!podeEnviar} onClick={enviar}>
            Anexar número
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
            Use quando a conta de WhatsApp Business (WABA) já é da plataforma e não dá para usar o cadastro pela
            Meta (o popup só serve para um cliente externo conceder a WABA dele). Informe os identificadores e um
            token de usuário de sistema com acesso à WABA, para conectar à loja <span className="font-medium text-tinta">{nomeLoja}</span>.
          </p>
        </div>

        <Field label="ID da conta (WABA ID)" dica="Identificador da conta de WhatsApp Business na Meta.">
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

        <Field label="Token de usuário de sistema" dica="Token com acesso à WABA (painel da Meta). É usado para conectar e fica cifrado; nunca é exibido de volta.">
          <Input
            value={form.access_token}
            onChange={(e) => setForm((f) => ({ ...f, access_token: e.target.value }))}
            placeholder="Cole o token aqui"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={1000}
          />
        </Field>

        {erro && <Banner tom="erro">{erro}</Banner>}

        <p className="flex items-start gap-2 text-xs text-tinta-2">
          <ShieldCheck strokeWidth={1.75} className="mt-0.5 size-3.5 flex-none" aria-hidden />
          O token é guardado cifrado e nunca aparece de volta nesta tela.
        </p>

        {/* Submit implicito pelo Enter; o botao visivel fica no rodape do Dialog. */}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  )
}
