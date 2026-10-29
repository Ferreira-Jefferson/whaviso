// Cache CURTO por processo em volta do `LeitorEscopo`. Cada pagina da SPA dispara varias
// requisicoes em paralelo e cada uma resolve o escopo do MESMO usuario antes do handler; sem
// cache isso vira N idas ao banco remoto por pagina (RTT somado). Aqui as chamadas do mesmo
// userId dentro de uma janela curta colapsam em UMA so (a Promise em voo e compartilhada, entao
// o burst simultaneo tambem coalesce).
//
// Seguranca: o TTL e curto de proposito (ver TTL_ESCOPO_MS). `leitor_escopo.ts` documenta que a
// leitura nao cacheia para revogacao imediata; este wrapper troca "imediata" por "em ate TTL",
// mantendo o resto do contrato. FALHA NUNCA e cacheada: a entrada e removida no erro, para a
// proxima tentar de novo e o plugin seguir falhando fechado (503/403), nao servir erro do cache.
import type { LeitorEscopo, OperadorResolvido, VinculoLoja } from './leitor_escopo'

/** Janela do cache de escopo por processo. Curta: limita a janela de revogacao. */
export const TTL_ESCOPO_MS = 3_000

interface Entrada<T> {
  expira: number
  valor: Promise<T>
}

/** Memoiza uma funcao por chave string com TTL; erro evita o cache (remove a entrada). */
function memoizarCurto<T>(
  fn: (chave: string) => Promise<T>,
  ttlMs: number,
): (chave: string) => Promise<T> {
  const mapa = new Map<string, Entrada<T>>()
  return (chave) => {
    const agora = Date.now()
    const atual = mapa.get(chave)
    if (atual && atual.expira > agora) return atual.valor
    const valor = fn(chave)
    mapa.set(chave, { expira: agora + ttlMs, valor })
    void valor.catch(() => {
      // Nao cacheia falha: so remove se a entrada ainda for esta (nao atropela um retry ja em voo).
      if (mapa.get(chave)?.valor === valor) mapa.delete(chave)
    })
    return valor
  }
}

/**
 * Envolve um `LeitorEscopo` com cache curto por processo (chave = userId). Preserva o contrato;
 * so reduz as idas ao banco dentro da janela `ttlMs`.
 */
export function comCacheCurto(base: LeitorEscopo, ttlMs: number = TTL_ESCOPO_MS): LeitorEscopo {
  const lojas = memoizarCurto<VinculoLoja[]>((userId) => base.lojasDoUsuario(userId), ttlMs)
  const operador = memoizarCurto<OperadorResolvido | null>(
    (userId) => base.operadorDoUsuario(userId),
    ttlMs,
  )
  return {
    lojasDoUsuario: (userId) => lojas(userId),
    operadorDoUsuario: (userId) => operador(userId),
  }
}
