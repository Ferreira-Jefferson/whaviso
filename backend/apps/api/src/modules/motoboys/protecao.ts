// Normalizacao e protecao dos campos sensiveis do motoboy (Pix) e da placa. Estas funcoes puras
// migraram para o kernel compartilhado @whaviso/shared/pix_credencial (segundo consumidor: o modulo
// pessoas passou a gravar a mesma credencial). Aqui so reexportamos o kernel para manter o modulo
// motoboys funcionando sem mudar quem o consome. O formato do hash (sha256 de `${tipo}:${norm}`, 64
// hex) e preservado pelo kernel: a constraint motoboys_pix_hash_fmt depende disso.
export { normalizarPix, hashPix, ultimos4, normalizarPlaca } from '@whaviso/shared/pix_credencial'
