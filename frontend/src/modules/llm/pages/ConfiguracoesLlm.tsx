// /llm: chave do atendente (BYO key do provedor) e consumo. A chave e write-only: a tela so mostra
// metadado e nunca a exibe de volta. Rota 'llm' (grupo config).
import { useState, type ReactNode } from 'react'
import { Gauge, KeyRound } from 'lucide-react'
import { ErrorState, PageHeader, Skeleton, Tabs, type TabItem } from '@/shared/ui'
import { useCredencial, useUso } from '../api'
import { CartaoCredencial } from '../components/CartaoCredencial'
import { FormularioChave } from '../components/FormularioChave'
import { PainelUso } from '../components/PainelUso'

type Aba = 'chave' | 'uso'

function Esqueleto() {
  return (
    <div aria-busy="true" aria-label="Carregando" className="flex flex-col gap-3 rounded-card border border-linha bg-cartao p-4">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  )
}

export default function ConfiguracoesLlm() {
  const [aba, setAba] = useState<Aba>('chave')
  const credencial = useCredencial()
  const uso = useUso()

  const itens: TabItem[] = [
    {
      id: 'chave',
      rotulo: 'Chave',
      conteudo: (
        <section className="flex flex-col gap-4">
          <SecaoTitulo
            icone={<KeyRound className="size-5" strokeWidth={1.75} aria-hidden />}
            titulo="A chave do provedor"
            descricao="O atendente usa a chave do seu provedor para responder os clientes. O custo vai direto para a sua conta nele."
          />
          {credencial.isPending && <Esqueleto />}
          {credencial.isError && <ErrorState aoTentarDeNovo={() => void credencial.refetch()} />}
          {credencial.isSuccess && (
            <>
              <CartaoCredencial estado={credencial.data} />
              <h3 className="font-display text-base font-semibold text-tinta">
                {credencial.data.criado_em ? 'Trocar a chave' : 'Cadastrar a chave'}
              </h3>
              <FormularioChave configurada={Boolean(credencial.data.criado_em)} provedorAtual={credencial.data.provedor} />
            </>
          )}
        </section>
      ),
    },
    {
      id: 'uso',
      rotulo: 'Consumo',
      conteudo: (
        <section className="flex flex-col gap-4">
          <SecaoTitulo
            icone={<Gauge className="size-5" strokeWidth={1.75} aria-hidden />}
            titulo="Consumo do mês"
            descricao="Quanto o atendente gastou, por dia, por origem e por modelo."
          />
          {uso.isPending && <Esqueleto />}
          {uso.isError && <ErrorState aoTentarDeNovo={() => void uso.refetch()} />}
          {uso.isSuccess && <PainelUso uso={uso.data} />}
        </section>
      ),
    },
  ]

  return (
    <div>
      <PageHeader titulo="Chave do atendente" descricao="Conecte o provedor que alimenta o atendente e acompanhe o gasto." />
      <Tabs itens={itens} ativa={aba} aoMudar={(id) => setAba(id as Aba)} ariaLabel="Seções da chave do atendente" />
    </div>
  )
}

function SecaoTitulo({ icone, titulo, descricao }: { icone: ReactNode; titulo: string; descricao: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-9 flex-none items-center justify-center rounded-full bg-salvia-claro text-salvia">
        {icone}
      </span>
      <div className="min-w-0">
        <h2 className="font-display text-lg font-semibold text-tinta">{titulo}</h2>
        <p className="mt-0.5 text-sm text-tinta-2">{descricao}</p>
      </div>
    </div>
  )
}
