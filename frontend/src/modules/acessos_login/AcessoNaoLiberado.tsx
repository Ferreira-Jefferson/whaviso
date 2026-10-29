// Tela exibida quando a api responde `acesso_nao_aprovado` ao criar/resolver a conta: o login
// ocorreu, mas o e-mail ainda nao foi liberado na allowlist. Mostramos isto NO LUGAR do app.
import { BellLogo, Banner, Button } from '@/shared/ui'
import { useSessao } from '@/shared/auth'

export function AcessoNaoLiberado() {
  const { signOut } = useSessao()
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <BellLogo className="size-16 text-dourado" />
        <h1 className="font-display text-3xl text-salvia">Seu acesso ainda não foi liberado</h1>
        <p className="text-sm text-tinta-2">
          O login funcionou, mas este e-mail ainda não está liberado para criar uma conta no
          Whaviso. Assim que a liberação for feita, você recebe um e-mail de boas-vindas e já pode
          entrar.
        </p>
      </div>

      <div className="rounded-card border border-linha bg-cartao p-6">
        <Banner tom="info" className="mb-4">
          Se você já conversou com a equipe, a liberação pode levar alguns instantes. Entre de novo
          mais tarde com o mesmo e-mail.
        </Banner>
        <Button type="button" variante="ghost" onClick={() => void signOut()}>
          Sair
        </Button>
      </div>
    </main>
  )
}

export default AcessoNaoLiberado
