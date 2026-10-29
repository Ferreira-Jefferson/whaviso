// Entrar: login único por conta Google (GIS + signInWithIdToken). O supabase-js só
// devolve o JWT; a sessão resultante move o app pela RedirectSeLogado. O login por
// WhatsApp/OTP foi removido (decisão 2026-10-29): uma conta por pessoa, sempre com e-mail.
import { useState } from 'react'
import { BellLogo, Banner } from '@/shared/ui'
import { GoogleLoginButton } from '@/modules/auth'

export default function Entrar() {
  const [erro, setErro] = useState<string | null>(null)

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <BellLogo className="size-16 text-dourado" />
        <h1 className="font-display text-3xl text-salvia">Entrar no Whaviso</h1>
        <p className="text-sm text-tinta-2">
          Entre com a sua conta Google. O primeiro acesso já cria sua conta.
        </p>
      </div>

      <div className="rounded-card border border-linha bg-cartao p-6">
        {erro && (
          <Banner tom="erro" className="mb-4">
            {erro}
          </Banner>
        )}
        <GoogleLoginButton onErro={setErro} />
      </div>
    </main>
  )
}
