// Console do operador: allowlist de login (e-mails liberados para criar conta no Whaviso).
import { PageHeader } from '@/shared/ui'
import { PainelAcessos } from '../components/PainelAcessos'

export default function AcessosLogin() {
  return (
    <div>
      <PageHeader
        titulo="Acessos de login"
        descricao="E-mails liberados para criar conta. Aprovar envia um e-mail de boas-vindas."
      />
      <PainelAcessos />
    </div>
  )
}
