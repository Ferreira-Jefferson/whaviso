// Atendente: a IA que atende, reunida numa tela so (e configuracao da loja). Abas: chave e consumo
// (BYO do provedor), conhecimento (o que a IA sabe sobre a loja) e fluxo (como a conversa anda).
// Rota /llm, grupo Configuracao. Absorve os antigos modulos `conhecimento` e `fluxo` (agora subpastas
// deste modulo); o Fluxo carrega sob demanda para nao puxar o canvas pesado fora da sua aba.
import { lazy, Suspense, useState } from 'react'
import { SegmentedControl, Skeleton } from '@/shared/ui'
import ConfiguracoesLlm from './ConfiguracoesLlm'
import Conhecimento from '../conhecimento/pages/Conhecimento'

const Fluxo = lazy(() => import('../fluxo/pages/Fluxo'))

type Aba = 'chave' | 'conhecimento' | 'fluxo'

const ABAS = [
  { value: 'chave', label: 'Chave e consumo' },
  { value: 'conhecimento', label: 'Conhecimento' },
  { value: 'fluxo', label: 'Fluxo' },
] as const

export default function Atendente() {
  const [aba, setAba] = useState<Aba>('chave')
  return (
    <div>
      <div className="mb-4">
        <SegmentedControl ariaLabel="Seção do atendente" value={aba} onChange={setAba} options={ABAS} />
      </div>
      {aba === 'chave' && <ConfiguracoesLlm />}
      {aba === 'conhecimento' && <Conhecimento />}
      {aba === 'fluxo' && (
        <Suspense fallback={<Skeleton className="h-96" />}>
          <Fluxo />
        </Suspense>
      )}
    </div>
  )
}
