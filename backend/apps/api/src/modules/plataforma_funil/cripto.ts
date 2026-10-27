// Cifra e normalizacao de telefone do prospecto = kernel compartilhado (@whaviso/shared/cifra), o
// MESMO de clientes e pessoas: AES-256-GCM pela MASTER_KEY, hash HMAC e mascara. Telefone de
// prospecto e PII de terceiro: so hash + cifrado no banco.
export { criarCifra, cifraPadrao, ErroCifra } from '@whaviso/shared/cifra'
export type { Cifra } from '@whaviso/shared/cifra'
