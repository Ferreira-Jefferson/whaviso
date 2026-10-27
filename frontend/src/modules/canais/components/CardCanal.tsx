// Card de um canal: estado (conectado/ativo), metadado da credencial (so ultimos 4), sincronizar
// e ativar/desativar. Sincronizar pode responder 501 (provedor ainda nao integrado): vira aviso.
import { Link2, RefreshCw } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Badge, Button, Card, Banner, useToast } from '@/shared/ui'
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

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg text-salvia">{estado?.config.rotulo ?? info.nome}</h2>
          <p className="mt-0.5 text-sm text-tinta-2">{info.descricao}</p>
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
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-tinta-2">Credencial</dt>
          <dd className="tabular text-tinta">{estado.ultimos4 ? `•••• ${estado.ultimos4}` : 'Cadastrada'}</dd>
          {estado.config.merchant_id && (
            <>
              <dt className="text-tinta-2">Loja no canal</dt>
              <dd className="text-tinta">{estado.config.merchant_id}</dd>
            </>
          )}
          <dt className="text-tinta-2">Última sincronização</dt>
          <dd className="text-tinta">
            {estado.ultima_sincronizacao_em ? formatarDataHora(estado.ultima_sincronizacao_em) : 'Nunca'}
          </dd>
        </dl>
      )}
      {erroSync && <Banner tom="erro">{erroSync}</Banner>}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variante={estado ? 'secondary' : 'primary'} onClick={aoConectar}>
          <Link2 strokeWidth={1.75} className="size-4" aria-hidden />
          {estado ? 'Trocar credencial' : 'Conectar'}
        </Button>
        {estado && (
          <>
            <Button variante="secondary" loading={sincronizar.isPending} disabled={!estado.ativo} onClick={() => void sincronizarAgora()}>
              <RefreshCw strokeWidth={1.75} className="size-4" aria-hidden />
              Sincronizar agora
            </Button>
            <Button variante="ghost" loading={ajustar.isPending} onClick={() => void alternarAtivo()}>
              {estado.ativo ? 'Desativar' : 'Ativar'}
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}
