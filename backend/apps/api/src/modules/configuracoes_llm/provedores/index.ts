// Validadores de chave por provedor de LLM. Duas camadas, ambas baratas e SEM nunca logar a
// chave nem ecoar o erro cru do provedor (que poderia conter a chave):
//
//   1. formatoPlausivel: filtro local (prefixo + tamanho) antes de qualquer rede. Barra lixo
//      obvio sem gastar uma chamada.
//   2. validar: UMA chamada de teste barata (endpoint de metadados), com:
//        - host FIXO allowlisted (SEC-070): a URL e constante no codigo, nunca vem do cliente;
//        - `redirect: 'error'` (SEC-070): nao segue redirect para rede interna (169.254/localhost);
//        - timeout curto (AbortSignal): nao trava o request da api num provedor lento;
//        - a chave vai SO no header de autenticacao, nunca no corpo, na URL ou na query (SEC-026);
//        - mapeia a resposta para valida | invalida | indisponivel; qualquer erro de rede/timeout
//          e `indisponivel` (nada e gravado), nunca repassa o detalhe do provedor.
//
// O provedor `outro` nao tem host allowlisted (seria uma URL arbitraria = risco de SSRF), entao
// NAO tem validador: o service recusa gravar uma chave que nao pode validar.
import type { ProvedorLlm, ResultadoValidacaoLlm } from '../schemas'

/** Contrato de um validador de provedor. Injetavel: em teste trocamos por stubs. */
export interface ValidadorProvedor {
  /** Filtro local de formato (prefixo/tamanho plausiveis). Nao faz rede. */
  formatoPlausivel(chave: string): boolean
  /** Chamada de teste (host fixo). Nunca lanca por causa do provedor: mapeia tudo. */
  validar(chave: string): Promise<ResultadoValidacaoLlm>
}

/** Registro provedor -> validador. `undefined` = provedor sem validacao automatica. */
export type RegistroValidadores = Partial<Record<ProvedorLlm, ValidadorProvedor>>

/** Hosts allowlisted (SEC-070). A URL de teste e montada so a partir daqui, nunca do cliente. */
export const HOSTS_PERMITIDOS = {
  openrouter: 'openrouter.ai',
  anthropic: 'api.anthropic.com',
} as const

const TIMEOUT_MS = 8_000

/** fetch injetavel (em teste, sem rede). Assinatura minima do fetch global. */
export type Buscador = typeof globalThis.fetch

/**
 * Executa a chamada de teste com as travas de SSRF e mapeia o status. NUNCA loga a chave nem o
 * corpo da resposta. Host conferido contra a allowlist como defesa em profundidade (a URL ja e
 * constante). 2xx => valida; 401/403 => invalida; qualquer outra coisa => indisponivel.
 */
async function chamarTeste(
  buscador: Buscador,
  url: string,
  headers: Record<string, string>,
): Promise<ResultadoValidacaoLlm> {
  const host = new URL(url).host
  const permitido = (Object.values(HOSTS_PERMITIDOS) as string[]).includes(host)
  if (!permitido) return 'indisponivel' // host fora da allowlist: nunca chama (SEC-070)

  let resp: Response
  try {
    resp = await buscador(url, {
      method: 'GET',
      headers,
      redirect: 'error', // nao segue redirect para rede interna (SEC-070)
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    // Timeout, DNS, redirect barrado, rede fora: tratamos como indisponivel (nada e gravado).
    // Nao propagamos o erro cru: ele poderia carregar a URL/headers com a chave.
    return 'indisponivel'
  }
  if (resp.status >= 200 && resp.status < 300) return 'valida'
  if (resp.status === 401 || resp.status === 403) return 'invalida'
  return 'indisponivel'
}

/** OpenRouter: chaves `sk-or-...`; valida consultando o proprio key-info (exige auth). */
function criarValidadorOpenRouter(buscador: Buscador): ValidadorProvedor {
  return {
    formatoPlausivel: (chave) => /^sk-or-[A-Za-z0-9._-]{8,}$/.test(chave) && chave.length <= 512,
    validar: (chave) =>
      chamarTeste(buscador, `https://${HOSTS_PERMITIDOS.openrouter}/api/v1/key`, {
        authorization: `Bearer ${chave}`,
      }),
  }
}

/** Anthropic: chaves `sk-ant-...`; valida listando modelos (endpoint barato, exige auth). */
function criarValidadorAnthropic(buscador: Buscador): ValidadorProvedor {
  return {
    formatoPlausivel: (chave) => /^sk-ant-[A-Za-z0-9._-]{8,}$/.test(chave) && chave.length <= 512,
    // A Anthropic autentica pelo header `x-api-key` (nao Authorization Bearer): a chave segue
    // no header de auth do provedor, nunca no corpo nem na URL (honra SEC-026).
    validar: (chave) =>
      chamarTeste(buscador, `https://${HOSTS_PERMITIDOS.anthropic}/v1/models`, {
        'x-api-key': chave,
        'anthropic-version': '2023-06-01',
      }),
  }
}

/** Monta o registro de validadores de PRODUCAO (fetch global). `outro` fica sem validador. */
export function criarValidadoresProducao(buscador: Buscador = globalThis.fetch): RegistroValidadores {
  return {
    openrouter: criarValidadorOpenRouter(buscador),
    anthropic: criarValidadorAnthropic(buscador),
  }
}
