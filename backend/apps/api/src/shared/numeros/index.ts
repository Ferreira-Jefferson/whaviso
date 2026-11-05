// API publica do kernel compartilhado de numero de WhatsApp.
//
// Dono UNICO da tabela `numeros_whatsapp` na api: as rotas da loja (`modules/numeros_whatsapp`)
// e as do console (`modules/plataforma_numeros`) consomem este kernel; nenhum modulo escreve
// direto na tabela nem importa o outro (fronteira feature-first). O segredo (token_cifrado) e
// write-only: nunca sai em projecao de leitura, resposta ou log (SEC-020/023/024).
export * as servicoNumeros from './service'
export type { DepsNumeros, EntradaConectar, EntradaAnexar } from './service'
export { depsDeProducao } from './config'
export { criarCripto, ErroCifra, type Cripto } from './cripto'
export {
  criarMetaOnboardingHttp,
  ErroMeta,
  type MetaOnboarding,
  type TokenMeta,
  type TelefoneMeta,
} from './meta_onboarding'
