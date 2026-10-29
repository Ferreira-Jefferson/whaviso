// Coalescencia (single-flight) por processo em volta do `LeitorEscopo`. Cada pagina da SPA dispara
// varias requisicoes em paralelo e cada uma resolve o escopo do MESMO usuario antes do handler; sem
// isto vira N idas ao banco por pagina (RTT somado). Aqui as chamadas simultaneas do mesmo userId
// compartilham a MESMA Promise em voo e colapsam numa ida so.
//
// Seguranca: NAO ha janela de staleness (por isso dispensa invalidacao). A entrada vive SO enquanto
// a Promise esta pendente e e removida assim que ela assenta (sucesso OU falha). Entao qualquer
// chamada que comece depois de a leitura anterior ter respondido rele o banco fresco: a revogacao
// continua imediata (um membro removido perde acesso ja na proxima requisicao nao concorrente) e a
// falha nunca fica cacheada (mantem fail-closed). O ganho e so coalescer o burst concorrente, que
// por definicao ja comecou antes de qualquer mutacao poder ser observada.
import type { LeitorEscopo, OperadorResolvido, VinculoLoja } from './leitor_escopo'

/** Compartilha a Promise em voo por chave; remove a entrada quando ela assenta (sem TTL). */
function coalescer<T>(fn: (chave: string) => Promise<T>): (chave: string) => Promise<T> {
  const emVoo = new Map<string, Promise<T>>()
  return (chave) => {
    const atual = emVoo.get(chave)
    if (atual) return atual
    const valor = fn(chave)
    emVoo.set(chave, valor)
    // Remove a entrada ao assentar, mas so se ainda for esta Promise (nao atropela um retry ja em
    // voo). O `.then(limpar, limpar)` tambem absorve a rejeicao desta cadeia auxiliar; quem chamou
    // recebe a `valor` original, que segue rejeitando normalmente.
    const limpar = (): void => {
      if (emVoo.get(chave) === valor) emVoo.delete(chave)
    }
    void valor.then(limpar, limpar)
    return valor
  }
}

/**
 * Envolve um `LeitorEscopo` coalescendo as chamadas SIMULTANEAS do mesmo userId numa ida so.
 * Preserva o contrato: nenhuma leitura e reusada entre requisicoes nao concorrentes, entao a
 * revogacao segue imediata (sem a janela de TTL que exigiria invalidacao em cada mutacao).
 */
export function comCoalescencia(base: LeitorEscopo): LeitorEscopo {
  const lojas = coalescer<VinculoLoja[]>((userId) => base.lojasDoUsuario(userId))
  const operador = coalescer<OperadorResolvido | null>((userId) => base.operadorDoUsuario(userId))
  return {
    lojasDoUsuario: (userId) => lojas(userId),
    operadorDoUsuario: (userId) => operador(userId),
  }
}
