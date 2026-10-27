// Rotulos dos canais externos. O servidor so conhece `ifood` e `outro`.
import type { CanalTipo } from '@/shared/contracts/_generated/canais'

export const CANAIS: ReadonlyArray<{ canal: CanalTipo; nome: string; descricao: string }> = [
  { canal: 'ifood', nome: 'iFood', descricao: 'Receba os pedidos do iFood junto com os pedidos da loja.' },
  { canal: 'outro', nome: 'Outro canal', descricao: 'Outro canal de pedidos compatível com a integração.' },
]

/** Codigos de erro curtos de sincronizacao -> texto para o dono (o servidor nunca manda texto cru do provedor). */
export function descreverErroSync(codigo: string | null): string | null {
  if (!codigo) return null
  if (codigo === 'canal_nao_integrado') return 'Integração ainda não disponível para este canal.'
  return `Falha na última sincronização (${codigo}).`
}
