// API publica do realtime (F5). Publicar eventos: `notificar` de @whaviso/shared/db.
export { realtimePlugin, type OpcoesRealtime } from './plugin'
export { HubRealtime, LimiteExcedido, lerUltimoId, type MensagemHub, type Assinatura } from './hub'
export { podeVerEvento, PERMISSAO_POR_TIPO } from './permissoes'
export { lerExpDoBearer } from './sse'
