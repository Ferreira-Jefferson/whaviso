// Boot do worker atendente (AT-motor-min): valida env, abre o pool (user whaviso_atendente),
// monta e VALIDA o registry de nodes contra o grafo fixo (crash no boot se inconsistente) e sobe
// o laco do tick: drena o inbound (motor por botao/regra; so o texto livre passa pelo harness de
// LLM, que propoe e o motor efetiva), a fila de importacao de cardapio e a ingestao de conhecimento.
// SEM Meta: o envio e do zap.
import { parseEnv } from '@whaviso/shared/config'
import { criarPool } from '@whaviso/shared/db'
import { criarLogger } from '@whaviso/shared/logger'
import { envSchema } from './env'
import { criarEntendedor } from './modules/entender_mensagem'
import { drenarImportacoes } from './modules/importar_cardapio'
import { criarPixDecifra, criarRegistry, drenarInbound, type LlmMotor } from './modules/motor_fluxo'
import { criarRegistroTools, ferramentasPadrao, selarConversaCtx } from './modules/tools'
import { criarRepoHarness } from './shared/harness'
import { criarServicoLlmProducao } from './shared/llm_client'
import { criarClienteEmbeddingsProducao, criarRerankerNulo, limparCacheExpirado, type DepsRetriever } from './shared/rag'
import { drenarConhecimento } from './drenar_conhecimento'
import { iniciarScheduler } from './scheduler'
import { iniciarSaude } from './saude'

// Fonte unica local: o .env da raiz traz vars prefixadas por servico (ATENDENTE_*).
if (process.env.ATENDENTE_PORT && !process.env.PORT) process.env.PORT = process.env.ATENDENTE_PORT
if (process.env.ATENDENTE_HOST && !process.env.HOST) process.env.HOST = process.env.ATENDENTE_HOST
if (process.env.ATENDENTE_DATABASE_URL && !process.env.DATABASE_URL)
  process.env.DATABASE_URL = process.env.ATENDENTE_DATABASE_URL

const env = parseEnv(envSchema)
const logger = criarLogger('atendente', env.LOG_LEVEL)
const pool = criarPool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  connectTimeoutMs: env.DB_CONNECT_TIMEOUT_MS,
  idleTimeoutMs: env.DB_IDLE_TIMEOUT_MS,
  statementTimeoutMs: env.DB_STATEMENT_TIMEOUT_MS,
})

// Registry validado no boot: todo node do grafo tem implementacao, toda transicao aponta para um
// tipo conhecido e so os nodes de entendimento de texto livre declaram LLM. Inconsistencia derruba o boot.
const registry = criarRegistry()

// Fiacao do LLM (montada uma vez). Credencial de LLM e por loja (decifrada so no uso); embedding e
// rerank usam a credencial da plataforma. Sem credencial/teto/erro o harness devolve `sem_llm` e o
// motor segue por botoes. O harness so PROPOE; o motor efetiva (fronteira sagrada).
const servicoLlm = criarServicoLlmProducao({ logger })
const rag: DepsRetriever = {
  exec: pool,
  embeddings: criarClienteEmbeddingsProducao({ logger }),
  reranker: criarRerankerNulo(),
}
const llm: LlmMotor = {
  harness: {
    servico: servicoLlm,
    registro: criarRegistroTools(ferramentasPadrao({ exec: pool, rag })),
    repo: criarRepoHarness(pool),
    logger,
    exec: pool,
  },
  entendedor: criarEntendedor({ servico: servicoLlm, logger }),
  selar: selarConversaCtx,
}

// Decifra da chave Pix (grant 0058): mesma MASTER_KEY da api (a que cifrou `loja_pix`). Montada no
// boot so se a var existe; sem ela, o nó de pix degrada com aviso ao cliente (nunca quebra o turno).
const pixDecifra = env.MASTER_KEY ? criarPixDecifra(env.MASTER_KEY) : undefined

const intervaloMs = Number(process.env.ATENDENTE_INTERVALO_MS ?? 5000)
// Cada drenagem e independente e nunca lanca (falha fechada): uma nao trava as outras.
const INTERVALO_LIMPEZA_CACHE_MS = 60 * 60 * 1000
let ultimaLimpezaCache = 0
const tick = async () => {
  const resumo = await drenarInbound({ pool, logger, registry, llm, pixDecifra })
  if (resumo.processadas || resumo.suprimidas) logger.info(resumo, 'dreno de inbound')

  const importacoes = await drenarImportacoes({ pool, servico: servicoLlm, logger })
  if (importacoes.rascunhos || importacoes.erros || importacoes.reenfileirados) {
    logger.info(importacoes, 'dreno de importacao de cardapio')
  }

  const conhecimento = await drenarConhecimento({
    exec: pool,
    logger,
    ingestor: { exec: pool, embeddings: rag.embeddings, logger },
  })
  if (conhecimento.ingeridos || conhecimento.arquivados) logger.info(conhecimento, 'dreno de conhecimento')

  // Limpeza do cache semantico vencido: no maximo 1x por hora (nao a cada tick). Nunca lanca.
  if (Date.now() - ultimaLimpezaCache >= INTERVALO_LIMPEZA_CACHE_MS) {
    ultimaLimpezaCache = Date.now()
    try {
      const apagadas = await limparCacheExpirado(pool)
      if (apagadas) logger.info({ apagadas }, 'cache semantico expirado removido')
    } catch (erro) {
      logger.error({ err: erro }, 'limpeza do cache semantico falhou')
    }
  }
}
const scheduler = iniciarScheduler({ logger, intervaloMs, tick })
const saude = iniciarSaude(env.HOST, env.PORT)

// Encerramento limpo e idempotente: para o scheduler antes de fechar o pool.
let encerrando = false
const encerrar = async () => {
  if (encerrando) return
  encerrando = true
  scheduler.parar()
  saude.close()
  await pool.end().catch(() => undefined)
  process.exit(0)
}
process.on('SIGINT', () => void encerrar())
process.on('SIGTERM', () => void encerrar())

logger.info({ porta: env.PORT, intervaloMs }, 'atendente no ar')
