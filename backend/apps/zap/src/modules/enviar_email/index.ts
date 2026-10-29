// Modulo enviar_email (ZAP-enviar-email): drena a outbox `emails_outbox` e entrega cada item por
// e-mail (Resend) atras da interface ClienteEmail, com claim FOR UPDATE SKIP LOCKED, retentativa com
// backoff e gravacao so das colunas de transporte (SEC-031). Biblioteca de drenagem chamada pelo
// scheduler (app-root); este modulo nunca importa outro modulo. Sem cliente, o dreno fica idle.
export { drenarEmails } from './service'
export { criarClienteResend, type ClienteEmail, type EmailParaEnviar, type ResultadoEmail } from './cliente_resend'
export { CONFIG_PADRAO } from './tipos'
export type { ConfigDrenoEmail, DepsDrenoEmail, ResumoDrenoEmail } from './tipos'
