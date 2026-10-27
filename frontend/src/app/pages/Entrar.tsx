// Entrar: login por codigo no WhatsApp (OTP). O supabase-js so devolve o JWT; a sessao
// resultante move o app pela RedirectSeLogado. Google fica para o modulo de auth (FR).
import { useState, type FormEvent } from 'react'
import { BellLogo, Banner, Button, Field, Input } from '@/shared/ui'
import { enviarCodigoWhatsapp, verificarCodigoWhatsapp } from '@/shared/supabase'
import { mensagemDeErroAuth } from '@/shared/auth'
import { GoogleLoginButton } from '@/modules/auth'
import { telefoneBrParaE164 } from '@/shared/format'

export default function Entrar() {
  const [telefone, setTelefone] = useState('')
  const [codigo, setCodigo] = useState('')
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function pedirCodigo(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    const e164 = telefoneBrParaE164(telefone)
    if (!e164) return setErro('Telefone inválido. Confira o DDD e o número.')
    setOcupado(true)
    const { error } = await enviarCodigoWhatsapp(e164)
    setOcupado(false)
    if (error) return setErro(mensagemDeErroAuth(error))
    setEnviadoPara(e164)
  }

  async function confirmar(e: FormEvent) {
    e.preventDefault()
    if (!enviadoPara) return
    setErro(null)
    if (!/^\d{6}$/.test(codigo)) return setErro('O código tem 6 dígitos.')
    setOcupado(true)
    const { error } = await verificarCodigoWhatsapp(enviadoPara, codigo)
    setOcupado(false)
    if (error) setErro(mensagemDeErroAuth(error))
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-14 items-center justify-center rounded-pill bg-salvia-claro text-salvia">
          <BellLogo className="size-7 text-dourado" />
        </span>
        <h1 className="font-display text-3xl text-salvia">Entrar no Whaviso</h1>
        <p className="text-sm text-tinta-2">
          {enviadoPara
            ? 'Digite o código que enviamos no seu WhatsApp.'
            : 'Entre com o Google ou receba um código no WhatsApp. O primeiro acesso já cria sua conta.'}
        </p>
      </div>

      <div className="rounded-card border border-linha bg-cartao p-6">
        {erro && (
          <Banner tom="erro" className="mb-4">
            {erro}
          </Banner>
        )}
        {!enviadoPara ? (
          <div className="flex flex-col gap-4">
            <GoogleLoginButton onErro={setErro} />
            <div className="flex items-center gap-3 text-xs text-tinta-2">
              <span className="h-px flex-1 bg-linha" />
              ou
              <span className="h-px flex-1 bg-linha" />
            </div>
            <form onSubmit={pedirCodigo} className="flex flex-col gap-4" noValidate>
              <Field label="Seu WhatsApp" >
                <Input id="telefone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(12) 99999-8888" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
              </Field>
              <Button type="submit" loading={ocupado}>
                Enviar código
              </Button>
            </form>
          </div>
        ) : (
          <form onSubmit={confirmar} className="flex flex-col gap-4" noValidate>
            <Field label="Código de 6 dígitos" >
              <Input id="codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Button type="submit" loading={ocupado}>
              Entrar
            </Button>
            <Button type="button" variante="ghost" onClick={() => { setEnviadoPara(null); setCodigo(''); setErro(null) }}>
              Usar outro número
            </Button>
          </form>
        )}
      </div>
    </main>
  )
}
