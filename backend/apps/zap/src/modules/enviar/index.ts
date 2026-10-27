// Modulo enviar (ZAP-enviar): drena a outbox `envios` e entrega cada item a Meta pelo
// ClienteWhats, com claim FOR UPDATE SKIP LOCKED, janela de 24h, retentativa com backoff e
// gravacao so das colunas de outbox/saude (SEC-031). Biblioteca de drenagem chamada pelo
// scheduler (app-root); este modulo nunca importa outro modulo.
export { drenarEnvios } from './service'
export { CONFIG_PADRAO } from './tipos'
export type { ConfigDreno, DepsDreno, ResumoDreno } from './tipos'
