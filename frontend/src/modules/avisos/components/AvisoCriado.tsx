// Tela de sucesso após criar um aviso (H2.2). Os dois fluxos geram um convite por NÚMERO
// (E5: aceite 100% pelo WhatsApp, sem site):
// - receber: o convidado recebe um NÚMERO de convite (xxx-xxx) e fala com o Whaviso.
// - pagar (invertido): o cobrador convidado recebe o mesmo número e confere a chave Pix.
// A tela mostra o número em destaque + a mensagem pronta + o link wa.me do Whaviso.
// Linguagem segue as Regras de Ouro: sempre combinado/lembrete (ver linguagem.ts).
import { useState } from 'react'
import { Link } from 'react-router'
import { CheckCircle2, Copy, Check, MessageCircle, Plus } from 'lucide-react'
import {
  Button,
  Card,
  MoneyText,
  PageHeader,
} from '@/shared/ui'
import { dataPtBR } from '@/shared/format'
import type { CriarAvisoResposta } from '@/shared/contracts'

interface AvisoCriadoProps {
  resultado: CriarAvisoResposta
  onNovo: () => void
}

export function AvisoCriado({ resultado, onNovo }: AvisoCriadoProps) {
  const { aviso, numero_convite, mensagem_convite, link_whatsapp } = resultado
  const ehReceber = aviso.direcao === 'receber'
  // H4.1: anotação de agenda (nada enviado): sem número/link de convite.
  const ehAgenda = aviso.status === 'sem_aviso'
  const [copiado, setCopiado] = useState(false)

  // Quem recebe o convite: receber → devedor; pagar invertido → cobrador.
  const nomeConvidado = ehReceber ? aviso.nome_devedor : (aviso.nome_cobrador ?? '')

  async function copiarMensagem() {
    if (!mensagem_convite) return
    try {
      await navigator.clipboard.writeText(mensagem_convite)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sem clipboard (contexto inseguro): o texto fica visível para copiar à mão.
    }
  }

  return (
    <div className="animate-rise">
      <PageHeader
        titulo={ehAgenda ? 'Salvo na agenda' : 'Convite pronto'}
        descricao={
          ehAgenda
            ? 'Nada foi enviado. Ative quando quiser para gerar o convite.'
            : 'Compartilhe o convite com a pessoa para ela confirmar o combinado.'
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
              avisar a pessoa, abra o detalhe e toque em <strong className="font-medium">Ativar</strong> para
              gerar o convite.
            </p>
            <Link
              to={`/app/avisos/${aviso.id}`}
              className="inline-flex items-center justify-center gap-2 rounded-pill bg-folha px-5 py-2.5 text-sm font-medium text-papel transition-opacity duration-150 hover:opacity-90"
            >
              Ativar quando quiser
            </Link>
          </div>
        ) : /* H2.2: número de convite em destaque + mensagem pronta para compartilhar. */
        numero_convite ? (
          <div className="flex flex-col gap-4 border-t border-linha pt-4">
            <div className="text-center">
              <p className="mb-1 text-sm text-tinta-2">Número de convite</p>
              <p className="font-mono text-3xl font-semibold tracking-wider text-tinta tabular-nums">
                {numero_convite}
              </p>
            </div>

            {mensagem_convite && (
              <div>
                <p className="mb-1.5 text-sm font-medium text-tinta">Mensagem pronta</p>
                <div className="rounded-card border border-linha bg-areia/40 p-3 text-sm whitespace-pre-line text-tinta-2">
                  {mensagem_convite}
                </div>
                <Button
                  type="button"
                  variante="secondary"
                  className="mt-2"
                  onClick={copiarMensagem}
                >
                  {copiado ? (
                    <Check strokeWidth={1.75} className="size-4" />
                  ) : (
                    <Copy strokeWidth={1.75} className="size-4" />
                  )}
                  {copiado ? 'Mensagem copiada' : 'Copiar mensagem'}
                </Button>
              </div>
            )}

            {link_whatsapp && (
              <a
                href={link_whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-pill bg-folha px-5 py-2.5 text-sm font-medium text-papel transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia"
              >
                <MessageCircle strokeWidth={1.75} className="size-4" />
                Abrir no WhatsApp
              </a>
            )}

            <p className="text-xs text-tinta-2">
              O combinado entra no ciclo de lembretes depois que a pessoa confirma pelo convite.
            </p>
          </div>
        ) : null}

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
