// Transporte WhatsApp pela Meta Cloud API oficial, atras do contrato ClienteWhats
// (@whaviso/shared/clientes). Implementacao endurecida e multi-numero (credencial por chamada):
// ZAP-enviar envia por aqui; ZAP-webhook usa so `verificarAssinatura` (HMAC do corpo cru). Sem
// socket, sem QR: "conectado" = token + phone_id validos, confirmados no proprio envio. O inbound
// (texto/botoes/recibos) chega por HTTP e e tratado pelo modulo webhook_whatsapp.
export { criarClienteWhatsMeta, type OpcoesClienteMeta } from './cliente_meta'
