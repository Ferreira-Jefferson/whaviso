// Cifra, hash e normalizacao de telefone deste modulo = kernel compartilhado.
//
// Antes este arquivo tinha AES e HMAC+pepper locais (chave base64 em PII_CIFRA_CHAVE,
// pepper em PII_HASH_PEPPER). Foi unificado em @whaviso/shared/cifra para que api, zap e
// atendente batam o MESMO hash de telefone (dedupe/busca) e a MESMA cifra. Hoje este modulo
// so reexporta o kernel; o segredo chega pela MASTER_KEY (sem PII_*), injetado via `Cifra`.
export { criarCifra, cifraPadrao, normalizarTelefoneBR, mascararTelefone, ErroCifra } from '@whaviso/shared/cifra'
export type { Cifra } from '@whaviso/shared/cifra'
