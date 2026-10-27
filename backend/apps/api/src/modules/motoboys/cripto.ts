// Cifra = kernel compartilhado (@whaviso/shared/cifra), o MESMO de clientes e pessoas: AES-256-GCM
// pela MASTER_KEY. Aqui a api DECIFRA o Pix do motoboy (so para pagar, dono/gerente), diferente da
// credencial de LLM (que a api nunca decifra).
export { criarCifra, cifraPadrao, ErroCifra } from '@whaviso/shared/cifra'
export type { Cifra } from '@whaviso/shared/cifra'
