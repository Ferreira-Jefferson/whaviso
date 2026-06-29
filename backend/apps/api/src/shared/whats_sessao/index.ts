// Leitura do NÚMERO conectado do WhatsApp (sessão da Meta Cloud API, whats_sessao 0020) no lado da api.
// O zap grava o número ao conectar (status='conectado'); aqui a api só LÊ para devolver ao front
// o número da conversa de recarga (link wa.me). Isso elimina a env VITE_WHATSAPP_VENDAS: a conversa
// passa a ser sempre o número que o zap está DE FATO usando, sem configurar nada à mão. Vive em
// shared/ porque módulo nunca importa módulo (billing chama daqui; admin lê a sessão por conta).
import type { Pool, PoolClient } from '@whaviso/shared/db'

type Executor = Pool | PoolClient

/**
 * Número do WhatsApp pareado (só dígitos com DDI, ex.: 5511999999999), ou null se não há
 * sessão conectada. É o número que o zap usa para enviar a mensagem de compra e onde o
 * usuário responde com o comprovante, então o link "abrir conversa" sempre bate com ele.
 */
export async function lerNumeroVendas(ex: Executor): Promise<string | null> {
  const { rows } = await ex.query<{ numero: string | null }>(
    `select numero from public.whats_sessao where id = 1 and status = 'conectado'`,
  )
  return rows[0]?.numero ?? null
}
