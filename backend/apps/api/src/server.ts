import { parseEnv } from '@whaviso/shared/config'
import { criarPool } from '@whaviso/shared/db'
import { criarLogger } from '@whaviso/shared/logger'
import { envSchema } from './env'
import { criarApp } from './app'

// Fonte única local: o .env da raiz traz vars prefixadas por serviço (API_*).
// Em prod o host pode definir PORT/DATABASE_URL direto; o alias só preenche se faltarem.
if (process.env.API_PORT && !process.env.PORT) process.env.PORT = process.env.API_PORT
if (process.env.API_DATABASE_URL && !process.env.DATABASE_URL)
  process.env.DATABASE_URL = process.env.API_DATABASE_URL

const env = parseEnv(envSchema)
const logger = criarLogger('api', env.LOG_LEVEL)
const pool = criarPool({ connectionString: env.DATABASE_URL, max: 5 })

const app = await criarApp({ env, pool, logger })

const encerrar = async () => {
  await app.close()
  await pool.end()
  process.exit(0)
}
process.on('SIGINT', () => void encerrar())
process.on('SIGTERM', () => void encerrar())

await app.listen({ port: env.PORT, host: '0.0.0.0' })
