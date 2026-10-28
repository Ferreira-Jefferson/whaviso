// Cifra e normalizacao de telefone do fornecedor = kernel compartilhado (@whaviso/shared/cifra), o
// MESMO usado por clientes, pessoas e motoboys: AES-256-GCM pela MASTER_KEY, normalizacao E.164 e
// mascara. O telefone do fornecedor e PII: so cifrado no banco, mascarado na saida (ultimos 4) e
// revelado em claro so sob rota de revelar, com permissao elevada.
export { criarCifra, cifraPadrao, ErroCifra } from '@whaviso/shared/cifra'
export type { Cifra } from '@whaviso/shared/cifra'
