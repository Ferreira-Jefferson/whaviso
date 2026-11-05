// Aba "Acesso da equipe" do suporte da loja: concede, lista e revoga o acesso assistido. Explica em
// linguagem simples o que o acesso permite e deixa a revogacao sempre a um clique.
import { useState } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Badge, Banner, Button, Card, ConfirmDialog, EmptyState, ErrorState, Skeleton, useToast } from '@/shared/ui'
import { formatarDataHora } from '@/shared/format'
import type { AcessoSuporte } from '@/shared/contracts/_generated/suporte'
import { useAcessos, useConcederAcesso, useRevogarAcesso } from '../api'
import { ConcederAcessoDialog } from './ConcederAcessoDialog'

export function PainelAcessos() {
  const lista = useAcessos()
  const conceder = useConcederAcesso()
  const revogar = useRevogarAcesso()
  const { mostrarToast } = useToast()

  const [abrirConceder, setAbrirConceder] = useState(false)
  const [erroConceder, setErroConceder] = useState<string | null>(null)
  const [aRevogar, setARevogar] = useState<AcessoSuporte | null>(null)

  const itens = lista.data?.itens ?? []
  const temAtivo = itens.some((a) => a.ativo)

  function confirmarConceder(dados: { duracao_horas: number; motivo?: string }) {
    setErroConceder(null)
    conceder.mutate(dados, {
      onSuccess: () => {
        setAbrirConceder(false)
        mostrarToast('Acesso concedido à equipe Whaviso.', { tom: 'sucesso' })
      },
      onError: (e) => setErroConceder(e instanceof ApiError ? e.message : 'Não foi possível conceder o acesso.'),
    })
  }

  function confirmarRevogar() {
    const acesso = aRevogar
    if (!acesso) return
    revogar.mutate(acesso.id, {
      onSuccess: () => {
        setARevogar(null)
        mostrarToast('Acesso revogado.', { tom: 'sucesso' })
      },
      onError: (e) =>
        mostrarToast(e instanceof ApiError ? e.message : 'Não foi possível revogar o acesso.', { tom: 'erro' }),
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <Banner tom="info">
        O acesso assistido deixa a equipe Whaviso ver as conversas da sua loja (somente leitura) por tempo limitado,
        só enquanto você autorizar. Tudo que a equipe acessa fica registrado, e você pode revogar quando quiser.
      </Banner>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold text-tinta">Acessos concedidos</h2>
        <Button variante="primary" onClick={() => { setErroConceder(null); setAbrirConceder(true) }}>
          <KeyRound strokeWidth={1.75} className="size-4" aria-hidden />
          Conceder acesso
        </Button>
      </div>

      {temAtivo && (
        <Banner tom="atencao">
          A equipe Whaviso tem acesso ativo às suas conversas agora. Se não precisar mais, revogue abaixo.
        </Banner>
      )}

      {lista.isPending && (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando acessos">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {lista.isError && <ErrorState aoTentarDeNovo={() => void lista.refetch()} />}

      {lista.isSuccess && itens.length === 0 && (
        <EmptyState
          icone={<ShieldCheck className="size-7" aria-hidden />}
          titulo="Nenhum acesso concedido"
          descricao="A equipe Whaviso não tem acesso às suas conversas. Conceda um acesso temporário só quando precisar de ajuda."
        />
      )}

      {lista.isSuccess && itens.length > 0 && (
        <ul className="flex flex-col gap-3">
          {itens.map((a) => (
            <li key={a.id}>
              <Card className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tom={a.ativo ? 'sucesso' : 'neutro'}>{a.ativo ? 'Ativo' : 'Encerrado'}</Badge>
                    <span className="text-sm text-tinta-2">
                      {a.ativo ? `Expira em ${formatarDataHora(a.expira_em)}` : rotuloEncerrado(a)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-tinta">
                    Concedido em {formatarDataHora(a.criado_em)}
                  </p>
                  {a.motivo && <p className="mt-0.5 text-sm text-tinta-2">Motivo: {a.motivo}</p>}
                </div>
                {a.ativo && (
                  <Button variante="secondary" onClick={() => setARevogar(a)}>
                    Revogar
                  </Button>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ConcederAcessoDialog
        aberto={abrirConceder}
        carregando={conceder.isPending}
        erro={erroConceder}
        onConfirmar={confirmarConceder}
        onFechar={() => setAbrirConceder(false)}
      />

      <ConfirmDialog
        aberto={aRevogar != null}
        titulo="Revogar acesso?"
        variante="destructive"
        textoConfirmar="Revogar"
        textoCancelar="Voltar"
        carregando={revogar.isPending}
        onConfirmar={confirmarRevogar}
        onCancelar={() => setARevogar(null)}
      >
        A equipe Whaviso deixa de ver suas conversas na hora. Você pode conceder de novo quando precisar.
      </ConfirmDialog>
    </div>
  )
}

/** Texto do estado encerrado: revogado pela loja ou expirado por tempo. */
function rotuloEncerrado(a: AcessoSuporte): string {
  if (a.revogado_em) return `Revogado em ${formatarDataHora(a.revogado_em)}`
  return `Expirou em ${formatarDataHora(a.expira_em)}`
}
