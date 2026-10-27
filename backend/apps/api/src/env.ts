// Env da api: schema tipado vive em @whaviso/shared/config (fonte unica).
import { envApiSchema, type EnvApiTipado } from '@whaviso/shared/config'

export const envSchema = envApiSchema
export type EnvApi = EnvApiTipado
