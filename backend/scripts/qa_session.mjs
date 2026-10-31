// Padrao de acesso para AMBIENTE DE TESTE (nao e brecha de seguranca).
//
// Gera uma sessao de um usuario de TESTE sem privilegio, para QA automatizado (ex.: Chrome
// sob controle do MCP, onde o Google recusa o consentimento). NAO adiciona nenhum bypass ao
// app: usa a Admin API oficial do Supabase (admin/generate_link + /verify) server-side, e a
// sessao resultante e identica a de um login real. Modelo de seguranca:
//   * A SUPABASE_SERVICE_ROLE_KEY e lida de secrets/production.env (gitignored) e vive SO aqui,
//     no node; nunca vai para o browser, o bundle do front ou o repo (SEC-025 garante no dist).
//     Quem ja tem a service_role pode tudo: este script nao cria superficie nova de ataque.
//   * O usuario de teste (QA_EMAIL, default qa@whaviso.com) nasce com metadata { qa: true },
//     e um usuario COMUM (dono de uma loja, isolado por RLS/loja_id); nao e operador nem admin
//     por si so (ver scripts/qa_login.mjs para login direto com o navegador ja aberto).
//   * A sessao sai SO para o arquivo em --out (que deve estar fora do repo / gitignored). Nunca
//     imprime o token.
//   * Guardrail de producao: por padrao recusa rodar se a URL alvo parecer producao; passe
//     --permitir-producao so se for intencional (nunca em CI de deploy).
//
// Uso (de dentro de backend/):
//   WROOT=.. OUT=<path fora do repo> node scripts/qa_session.mjs [--permitir-producao]
import { writeFileSync } from 'node:fs'
import { obterSessaoQa } from './qa_lib.mjs'

const ROOT = process.env.WROOT ?? '..'
const OUT = process.env.OUT
if (!OUT) { console.error('faltou OUT=<arquivo fora do repo p/ gravar a sessao>'); process.exit(1) }
const EMAIL = process.env.QA_EMAIL ?? 'qa@whaviso.com'
const permitirProducao = process.argv.includes('--permitir-producao')

try {
  const sessao = await obterSessaoQa({ root: ROOT, email: EMAIL, permitirProducao })
  writeFileSync(OUT, JSON.stringify({
    key: sessao.key, session: sessao.session, userId: sessao.userId, email: sessao.email,
  }))
  console.log('OK usuario de teste=', sessao.userId, 'storageKey=', sessao.key, '(sessao gravada fora do repo, token nao impresso)')
} catch (e) {
  console.error(e.message)
  process.exit(1)
}
