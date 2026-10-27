// SEC-040: o verificador de JWT por JWKS recusa token invalido, expirado, com assinatura
// trocada, com alg=none, iss/aud errado, kid desconhecido, e falha FECHADA quando o JWKS
// esta indisponivel. Chaves geradas no proprio teste; nenhuma rede.
import { describe, it, expect, beforeAll } from 'vitest'
import {
  SignJWT,
  UnsecuredJWT,
  generateKeyPair,
  exportJWK,
  createLocalJWKSet,
  type JWK,
  type CryptoKey,
  type JWTVerifyGetKey,
} from 'jose'
import { criarVerificador, ErroJwt } from './verificador'

const ISS = 'https://projeto.supabase.co/auth/v1'
const AUD = 'authenticated'
const KID = 'chave-de-teste-1'
const SUB = '11111111-1111-1111-1111-111111111111'

let priv: CryptoKey
let privIntruso: CryptoKey
let jwks: JWTVerifyGetKey

beforeAll(async () => {
  const par = await generateKeyPair('ES256')
  priv = par.privateKey
  const pubJwk: JWK = { ...(await exportJWK(par.publicKey)), kid: KID, alg: 'ES256', use: 'sig' }
  jwks = createLocalJWKSet({ keys: [pubJwk] })

  // Par intruso: mesma kid, chave diferente, para simular assinatura trocada.
  const intruso = await generateKeyPair('ES256')
  privIntruso = intruso.privateKey
})

function assinar(chave: CryptoKey, over: Record<string, unknown> = {}, kid = KID) {
  const agora = Math.floor(Date.now() / 1000)
  return new SignJWT({ sub: SUB, ...over })
    .setProtectedHeader({ alg: 'ES256', kid })
    .setIssuedAt(agora)
    .setExpirationTime((over.exp as number) ?? agora + 3600)
    .setIssuer((over.iss as string) ?? ISS)
    .setAudience((over.aud as string) ?? AUD)
    .sign(chave)
}

const criar = (jwksUsado: JWTVerifyGetKey = jwks) =>
  criarVerificador({ issuer: ISS, audience: AUD, jwks: jwksUsado })

describe('verificador de JWT (SEC-040)', () => {
  it('aceita um token valido e extrai o sub', async () => {
    const token = await assinar(priv)
    await expect(criar().verificar(token)).resolves.toEqual({ sub: SUB })
  })

  it('recusa token expirado', async () => {
    const agora = Math.floor(Date.now() / 1000)
    const token = await assinar(priv, { exp: agora - 60 })
    await expect(criar().verificar(token)).rejects.toBeInstanceOf(ErroJwt)
  })

  it('recusa assinatura trocada (mesma kid, chave diferente)', async () => {
    const token = await assinar(privIntruso)
    await expect(criar().verificar(token)).rejects.toBeInstanceOf(ErroJwt)
  })

  it('recusa alg=none (token nao assinado)', async () => {
    const token = new UnsecuredJWT({ sub: SUB }).setIssuer(ISS).setAudience(AUD).encode()
    await expect(criar().verificar(token)).rejects.toBeInstanceOf(ErroJwt)
  })

  it('recusa HS256 (algorithm confusion: nao esta na allowlist)', async () => {
    // Monta um JWT HS256 com segredo arbitrario; a allowlist so tem assimetricos.
    const { SignJWT: _SignJWT } = await import('jose')
    const segredo = new TextEncoder().encode('segredo-hmac-qualquer-32-bytes!!')
    const token = await new _SignJWT({ sub: SUB })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .setIssuer(ISS)
      .setAudience(AUD)
      .sign(segredo)
    await expect(criar().verificar(token)).rejects.toBeInstanceOf(ErroJwt)
  })

  it('recusa issuer errado', async () => {
    const token = await assinar(priv, { iss: 'https://atacante.exemplo/auth/v1' })
    await expect(criar().verificar(token)).rejects.toBeInstanceOf(ErroJwt)
  })

  it('recusa audience errado', async () => {
    const token = await assinar(priv, { aud: 'outro-publico' })
    await expect(criar().verificar(token)).rejects.toBeInstanceOf(ErroJwt)
  })

  it('recusa kid desconhecido', async () => {
    const token = await assinar(priv, {}, 'kid-que-nao-existe')
    await expect(criar().verificar(token)).rejects.toBeInstanceOf(ErroJwt)
  })

  it('recusa token sem sub', async () => {
    const agora = Math.floor(Date.now() / 1000)
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: KID })
      .setIssuedAt(agora)
      .setExpirationTime(agora + 3600)
      .setIssuer(ISS)
      .setAudience(AUD)
      .sign(priv)
    await expect(criar().verificar(token)).rejects.toBeInstanceOf(ErroJwt)
  })

  it('falha FECHADA quando o JWKS esta indisponivel', async () => {
    const jwksQuebrado: JWTVerifyGetKey = async () => {
      throw new Error('JWKS fetch failed')
    }
    const token = await assinar(priv)
    await expect(criar(jwksQuebrado).verificar(token)).rejects.toBeInstanceOf(ErroJwt)
  })

  it('recusa string vazia sem tocar no JWKS', async () => {
    await expect(criar().verificar('')).rejects.toBeInstanceOf(ErroJwt)
  })

  it('recusa construir verificador com algoritmo simetrico ou none na allowlist', () => {
    expect(() => criarVerificador({ issuer: ISS, audience: AUD, jwks, algoritmos: ['HS256'] })).toThrow()
    expect(() => criarVerificador({ issuer: ISS, audience: AUD, jwks, algoritmos: ['none'] })).toThrow()
  })
})
