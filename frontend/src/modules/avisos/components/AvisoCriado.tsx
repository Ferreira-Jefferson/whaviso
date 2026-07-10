// Tela de sucesso após criar um aviso (H2.1 / E5). O aceite é 100% pelo WhatsApp e o
// WHAVISO INICIA A CONVERSA: assim que o combinado entra no modo enviar, ele manda o
// combinado (resumo + botões) direto para o WhatsApp do convidado. Não há mais link/mensagem
// para o criador compartilhar à mão, nem número de convite.
// Linguagem segue as Regras de Ouro: sempre combinado/lembrete (ver linguagem.ts).
import { Link } from 'react-router'
import { CheckCircle2, Plus } from 'lucide-react'
import { Button, Card, MoneyText, PageHeader } from '@/shared/ui'
import { dataPtBR } from '@/shared/format'
import type { CriarAvisoResposta } from '@/shared/contracts'

interface AvisoCriadoProps {
  resultado: CriarAvisoResposta
  onNovo: () => void
}

export function AvisoCriado({ resultado, onNovo }: AvisoCriadoProps) {
  const { aviso } = resultado
  const ehReceber = aviso.direcao === 'receber'
  // H4.1: anotação de agenda (nada enviado): combinado não enviado ainda.
  const ehAgenda = aviso.status === 'sem_aviso'

  // Quem recebe o combinado: receber → devedor; pagar invertido → cobrador.
  const nomeConvidado = ehReceber ? aviso.nome_devedor : (aviso.nome_cobrador ?? '')

  return (
    <div className="animate-rise">
      <PageHeader
        titulo={ehAgenda ? 'Salvo na agenda' : 'Combinado enviado'}
        descricao={
          ehAgenda
            ? 'Nada foi enviado. Ative quando quiser para o Whaviso mandar o combinado.'
            : 'O Whaviso já mandou o combinado pelo WhatsApp. É só aguardar a pessoa confirmar.'
        }
      />

      <Card className="mx-auto max-w-xl">
        <div className="mb-4 flex items-start gap-3">
          <CheckCircle2 strokeWidth={1.75} className="mt-0.5 size-6 shrink-0 text-folha" />
          <div>
            <p className="text-tinta">
              {ehReceber ? 'Combinado com ' : 'Combinado de pagar para '}
              <strong className="font-medium">{nomeConvidado}</strong>
            </p>
            <p className="text-sm text-tinta-2">
              <MoneyText centavos={aviso.valor_centavos} /> ·{' '}
              {dataPtBR(aviso.data_combinada)} · {aviso.motivo}
            </p>
          </div>
        </div>

        {/* H4.1: anotação de agenda: nada foi enviado, CTA para ativar depois. */}
        {ehAgenda ? (
          <div className="flex flex-col gap-3 border-t border-linha pt-4">
            <p className="text-sm text-tinta-2">
              Este combinado ficou só na sua agenda. Ninguém recebeu nada. Quando quiser
              avisar a pessoa, abra o detalhe e toque em <strong className="font-medium">Ativar</strong>:
              o Whaviso manda o combinado na hora.
            </p>
            <Link
              to={`/app/avisos/${aviso.id}`}
              className="inline-flex items-center justify-center gap-2 rounded-pill bg-folha px-5 py-2.5 text-sm font-medium text-papel transition-opacity duration-150 hover:opacity-90"
            >
              Ativar quando quiser
            </Link>
          </div>
        ) : /* E5: o Whaviso já enviou o combinado direto ao convidado. */ (
          <div className="flex flex-col gap-4 border-t border-linha pt-4">
            <p className="text-sm text-tinta-2">
              O combinado foi enviado para o WhatsApp de{' '}
              <strong className="font-medium text-tinta">{nomeConvidado}</strong>. A pessoa
              vai ver o resumo e responder por lá com um toque. O combinado entra no ciclo de
              lembretes assim que ela confirmar.
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-linha pt-4">
          <Button variante="secondary" onClick={onNovo}>
            <Plus strokeWidth={1.75} className="size-4" />
            Criar outro
          </Button>
          <Link
            to={`/app/avisos/${aviso.id}`}
            className="rounded-pill px-4 py-2 text-sm font-medium text-salvia hover:underline"
          >
            Ver detalhe
          </Link>
          <Link
            to="/app"
            className="rounded-pill px-4 py-2 text-sm font-medium text-tinta-2 hover:text-salvia hover:underline"
          >
            Ir para o painel
          </Link>
        </div>
      </Card>
    </div>
  )
}
