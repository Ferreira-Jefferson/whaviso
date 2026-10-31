// Login de um comando so para o usuario de TESTE (QA), sem colar token no console do navegador.
// Gera a sessao (obterSessaoQa, mesma logica/guardrails de qa_session.mjs), serve ela so em
// 127.0.0.1 numa porta efemera, e abre o navegador padrao direto no front de dev com
// `?qa_session_port=<porta>`. O bootstrap dev-only do front (frontend/src/dev/qaSessionBootstrap.ts,
// so entra no build quando `import.meta.env.DEV`) busca a sessao nessa porta, injeta no
// localStorage e recarrega ja logado. O servidor cai sozinho depois de um tempo curto.
//
// Uso (de dentro de backend/):  node scripts/qa_login.mjs [--permitir-producao]
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { obterSessaoQa } from './qa_lib.mjs'

const ROOT = process.env.WROOT ?? '..'
const FRONT_URL = process.env.QA_FRONT_URL ?? 'http://localhost:5173'
const permitirProducao = process.argv.includes('--permitir-producao')

const sessao = await obterSessaoQa({ root: ROOT, permitirProducao })

const corpo = JSON.stringify({ key: sessao.key, session: sessao.session })
const server = createServer((_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')
  res.end(corpo)
})

server.listen(0, '127.0.0.1', () => {
  const porta = server.address().port
  const alvo = `${FRONT_URL}/?qa_session_port=${porta}`
  console.log('usuario de teste=', sessao.userId, '-> abrindo', alvo)
  const [cmd, args] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', alvo]]
    : process.platform === 'darwin' ? ['open', [alvo]]
    : ['xdg-open', [alvo]]
  execFile(cmd, args, (e) => { if (e) console.error('nao consegui abrir o navegador sozinho; acesse:', alvo) })
})

// Servidor efemero: uma visita basta, a folga e so pra reload/retry manual.
setTimeout(() => server.close(), 2 * 60 * 1000)
