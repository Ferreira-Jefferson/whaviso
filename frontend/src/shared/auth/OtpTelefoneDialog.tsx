// Item 3 (leva 2026-07-22 1D): dialog compartilhado de cadastro/verificação de WhatsApp por
// OTP. Extrai o passo "enviar código -> confirmar código" hoje DUPLICADO em
// modules/conta/pages/Conta.tsx e modules/auth/pages/Onboarding.tsx, para o novo fluxo de
// recarga (Creditos.tsx, quando POST /billing/recarga falha com telefone_ausente) reusar sem
// repetir a lógica. Fronteira: módulo nunca importa módulo, então este componente vive em
// shared/auth (Conta e Onboarding já consomem shared/auth) e só sabe verificar o telefone;
// quem chama decide o que fazer depois (salvar no perfil, disparar de novo uma ação, etc.).
//
// Onboarding.tsx e Conta.tsx NÃO foram tocados nesta leva (fora do escopo desta tarefa neles
// dois específicos além da erros.ts/Conta.tsx já listados): este componente fica pronto para
// eles adotarem numa leva futura, sem editá-los agora.
import { useState } from 'react'
import { Banner, Button, Dialog, Field, Input, PhoneInput } from '@/shared/ui'
import { atualizarTelefone, verificarNovoTelefone } from '@/shared/supabase'
import { mensagemDeErroAuth } from './erros'

interface OtpTelefoneDialogProps {
  aberto: boolean
  onFechar: () => void
  /** Chamado com o telefone (E.164) já confirmado por OTP. O chamador decide o que salvar. */
  onVerificado: (telefoneE164: string) => void | Promise<void>
  titulo?: string
  descricao?: string
}

/**
 * Dialog de 2 passos: (1) telefone -> envia o código via `atualizarTelefone`; (2) código ->
 * confirma via `verificarNovoTelefone`. Só verifica POSSE do número; não persiste nada no
 * perfil (quem chama faz isso em `onVerificado`, junto do que mais precisar salvar).
 */
export function OtpTelefoneDialog({
  aberto,
  onFechar,
  onVerificado,
  titulo = 'Cadastrar WhatsApp',
  descricao = 'Informe seu WhatsApp para receber o código de confirmação.',
}: OtpTelefoneDialogProps) {
  const [telefone, setTelefone] = useState<string | null>(null)
  const [telefoneVerificando, setTelefoneVerificando] = useState<string | null>(null)
  const [codigo, setCodigo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function reiniciar() {
    setTelefone(null)
    setTelefoneVerificando(null)
    setCodigo('')
    setErro(null)
  }

  function fechar() {
    reiniciar()
    onFechar()
  }

  async function enviarCodigo() {
    if (!telefone) {
      setErro('Informe um WhatsApp válido.')
      return
    }
    setErro(null)
    setEnviando(true)
    try {
      const { error } = await atualizarTelefone(telefone)
      if (error) {
        setErro(mensagemDeErroAuth(error))
        return
      }
      setTelefoneVerificando(telefone)
    } finally {
      setEnviando(false)
    }
  }

  async function confirmarCodigo() {
    if (!telefoneVerificando) return
    setErro(null)
    setConfirmando(true)
    try {
      const { error } = await verificarNovoTelefone(telefoneVerificando, codigo)
      if (error) {
        setErro(mensagemDeErroAuth(error))
        return
      }
      await onVerificado(telefoneVerificando)
      reiniciar()
    } finally {
      setConfirmando(false)
    }
  }

  return (
    <Dialog
      aberto={aberto}
      onFechar={fechar}
      titulo={titulo}
      acoes={
        telefoneVerificando ? (
          <>
            <Button variante="primary" className="w-full" loading={confirmando} onClick={() => void confirmarCodigo()}>
              Confirmar
            </Button>
            <Button variante="secondary" className="w-full" disabled={confirmando} onClick={() => setTelefoneVerificando(null)}>
              Usar outro número
            </Button>
          </>
        ) : (
          <>
            <Button variante="primary" className="w-full" loading={enviando} onClick={() => void enviarCodigo()}>
              Enviar código
            </Button>
            <Button variante="secondary" className="w-full" disabled={enviando} onClick={fechar}>
              Cancelar
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-3">
        {erro && <Banner tom="erro">{erro}</Banner>}
        {telefoneVerificando ? (
          <Field label="Código recebido no WhatsApp">
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
            />
            <p className="mt-1 text-xs text-tinta-2">Enviamos um código para {telefoneVerificando}.</p>
          </Field>
        ) : (
          <Field label="Seu WhatsApp">
            <PhoneInput value={telefone} onChange={setTelefone} autoComplete="tel" />
            <p className="mt-1 text-xs text-tinta-2">{descricao}</p>
          </Field>
        )}
      </div>
    </Dialog>
  )
}
