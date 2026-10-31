// Console do operador: configuracoes da PLATAFORMA (segredos/credenciais que nao sao de loja).
import { useState } from 'react'
import { PageHeader, Tabs, type TabItem } from '@/shared/ui'
import { CartaoAsaas } from '../components/CartaoAsaas'
import { CartaoEmail } from '../components/CartaoEmail'
import { CartaoWhatsappOficial } from '../components/CartaoWhatsappOficial'
import { PainelPoolLlm } from '../components/PainelPoolLlm'

const ABAS: ReadonlyArray<TabItem> = [
  { id: 'asaas', rotulo: 'Asaas', conteudo: <CartaoAsaas /> },
  { id: 'whatsapp', rotulo: 'WhatsApp oficial', conteudo: <CartaoWhatsappOficial /> },
  { id: 'email', rotulo: 'E-mail', conteudo: <CartaoEmail /> },
  { id: 'pool-ia', rotulo: 'Pool de IA', conteudo: <PainelPoolLlm /> },
]

export default function Configuracoes() {
  const [aba, setAba] = useState('asaas')
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        titulo="Configurações"
        descricao="Credenciais e segredos da plataforma: não são de uma loja específica, só quem administra o whaviso mexe aqui."
      />
      <Tabs itens={ABAS} ativa={aba} aoMudar={setAba} ariaLabel="Áreas de configuração da plataforma" />
    </div>
  )
}
