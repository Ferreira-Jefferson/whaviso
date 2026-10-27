// Card de um canal: estado (conectado/ativo), metadado da credencial (so ultimos 4), sincronizar
// e ativar/desativar. Sincronizar pode responder 501 (provedor ainda nao integrado): vira aviso.
import { Link2, RefreshCw, Store, UtensilsCrossed } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Badge, Button, Card, Banner, cn, useToast } from '@/shared/ui'
import { formatarDataHora } from '@/shared/format'
import type { CanalEstado } from '@/shared/contracts/_generated/canais'
import { useAjustarCanal, useSincronizarCanal } from '../api'
import { descreverErroSync, type CANAIS } from '../estados'

interface Props {
  info: (typeof CANAIS)[number]
  estado: CanalEstado | undefined
  aoConectar: () => void
}

export function CardCanal({ info, estado, aoConectar }: Props) {
  const ajustar = useAjustarCanal()
  const sincronizar = useSincronizarCanal()
  const { mostrarToast } = useToast()

  async function alternarAtivo() {
    if (!estado) return
    try {
      await ajustar.mutateAsync({ canal: info.canal, body: { ativo: !estado.ativo } })
      mostrarToast(estado.ativo ? 'Canal desativado.' : 'Canal ativado.', { tom: 'sucesso' })
    } catch (e) {
      mostrarToast(e instanceof ApiError ? e.message : 'Não foi possível alterar o canal.', { tom: 'erro' })
    }
  }

  async function sincronizarAgora() {
    try {
      const r = await sincronizar.mutateAsync(info.canal)
      const partes = [
        r.importados === 1 ? '1 pedido importado' : `${r.importados} pedidos importados`,
        r.duplicados > 0 ? `${r.duplicados} já existiam` : null,
        r.rejeitados > 0 ? `${r.rejeitados} rejeitados` : null,
      ].filter(Boolean)
      mostrarToast(`${partes.join(', ')}.`, { tom: r.rejeitados > 0 ? 'info' : 'sucesso' })
    } catch (e) {
      if (e instanceof ApiError && e.status === 501) {
        mostrarToast('A sincronização com este canal ainda não está disponível.', { tom: 'info' })
      } else {
        mostrarToast(e instanceof ApiError ? e.message : 'Não foi possível sincronizar.', { tom: 'erro' })
      }
    }
  }

  const erroSync = descreverErroSync(estado?.ultimo_erro ?? null)

  // Avatar da marca do canal, tingido pelo estado: reforca conectado/ativo/desativado de relance.
  const Icone = info.canal === 'ifood' ? UtensilsCrossed : Store
  const tomAvatar = !estado
    ? 'bg-papel-2 text-tinta-2'
    : estado.ativo
      ? 'bg-salvia-claro text-salvia'
      : 'bg-ambar-claro text-ambar'

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden
            className={cn('mt-0.5 flex size-10 flex-none items-center justify-center rounded-full', tomAvatar)}
          >
            <Icone strokeWidth={1.75} className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-lg text-salvia">{estado?.config.rotulo ?? info.nome}</h2>
            <p className="mt-0.5 text-sm text-tinta-2">{info.descricao}</p>
          </div>
        </div>
        {!estado ? (
          <Badge>Não conectado</Badge>
        ) : estado.ativo ? (
          <Badge tom="sucesso">Ativo</Badge>
        ) : (
          <Badge tom="atencao">Desativado</Badge>
        )}
      </div>

      {estado && (
        <dl className="grid gap-2.5 border-t border-linha pt-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="flex-none text-tinta-2">Credencial</dt>
            <dd className="tabular text-tinta">{estado.ultimos4 ? `•••• ${estado.ultimos4}` : 'Cadastrada'}</dd>
          </div>
          {estado.config.merchant_id && (
            <div className="flex items-center justify-between gap-3">
              <dt className="flex-none text-tinta-2">Loja no canal</dt>
              <dd className="min-w-0 truncate text-right text-tinta">{estado.config.merchant_id}</dd>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <dt className="flex-none text-tinta-2">Última sincronização</dt>
            <dd className="text-right text-tinta">
              {estado.ultima_sincronizacao_em ? formatarDataHora(estado.ultima_sincronizacao_em) : 'Nunca'}
            </dd>
          </div>
        </dl>
      )}
      {erroSync && <Banner tom="erro">{erroSync}</Banner>}

      <div className={cn('flex flex-col gap-2 sm:flex-row sm:flex-wrap', estado && 'border-t border-linha pt-4')}>
        <Button variante={estado ? 'secondary' : 'primary'} className="w-full sm:w-auto" onClick={aoConectar}>
          <Link2 strokeWidth={1.75} className="size-4" aria-hidden />
          {estado ? 'Trocar credencial' : 'Conectar'}
        </Button>
        {estado && (
          <>
            <Button
              variante="secondary"
              className="w-full sm:w-auto"
              loading={sincronizar.isPending}
              disabled={!estado.ativo}
              onClick={() => void sincronizarAgora()}
            >
              <RefreshCw strokeWidth={1.75} className="size-4" aria-hidden />
              Sincronizar agora
            </Button>
            <Button
              variante="ghost"
              className="w-full sm:ml-auto sm:w-auto"
              loading={ajustar.isPending}
              onClick={() => void alternarAtivo()}
            >
              {estado.ativo ? 'Desativar' : 'Ativar'}
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}
