// Cifra e normalizacao de telefone da pessoa = kernel compartilhado (@whaviso/shared/cifra), o
// MESMO usado por clientes: AES-256-GCM pela MASTER_KEY, mascara e normalizacao E.164. O telefone
// da pessoa e PII: so cifrado no banco, mascarado na saida e revelado sob permissao.
export { criarCifra, cifraPadrao, normalizarTelefoneBR, mascararTelefone, ErroCifra } from '@whaviso/shared/cifra'
export type { Cifra } from '@whaviso/shared/cifra'
