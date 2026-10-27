// Env do atendente: reusa o schema tipado de @whaviso/shared/config (envAtendenteSchema), que ja
// exige DATABASE_URL (user whaviso_atendente) e aceita MASTER_KEY opcional. O motor-min nao usa
// Meta nem LLM, entao nao ha credencial externa aqui.
import { envAtendenteSchema, type EnvAtendenteTipado } from '@whaviso/shared/config'

export const envSchema = envAtendenteSchema
export type EnvAtendente = EnvAtendenteTipado
