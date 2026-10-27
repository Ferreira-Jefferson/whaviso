// Varredura de respostas HTTP (base do SEC-020): injeta cada rota como cada ator, acumula os
// corpos e procura sentinelas de segredo. `acharSentinela` aponta rota + ator + caminho JSON do
// vazamento, NUNCA o valor do segredo. Gerada a partir de uma lista de rotas (o SEC-020 real liga
// no registry da api quando os modulos de dados existirem).
import type { FastifyInstance } from 'fastify'

export interface Rota {
  method: string
  url: string
}

export interface Ator {
  nome: string
  /** Bearer token; ausente = anonimo. */
  token?: string
}

export interface RespostaColetada {
  rota: Rota
  ator: string
  status: number
  corpo: string
}

export interface Vazamento {
  rota: string
  ator: string
  /** Caminho JSON ate o valor que vazou (ex.: `credencial.chave_cifrada`), ou `<corpo bruto>`. */
  caminho: string
}

/** Injeta cada rota como cada ator e devolve os corpos coletados. */
export async function varrerRespostas(
  app: FastifyInstance,
  rotas: readonly Rota[],
  atores: readonly Ator[],
): Promise<RespostaColetada[]> {
  const coletadas: RespostaColetada[] = []
  for (const rota of rotas) {
    for (const ator of atores) {
      const res = await app.inject({
        method: rota.method as 'GET',
        url: rota.url,
        headers: ator.token ? { authorization: `Bearer ${ator.token}` } : {},
      })
      coletadas.push({ rota, ator: ator.nome, status: res.statusCode, corpo: res.body })
    }
  }
  return coletadas
}

/** Procura o caminho JSON de `sentinela` dentro de `valor`; '' se nao achar. */
function caminhoDaSentinela(valor: unknown, sentinela: string, prefixo = ''): string | null {
  if (typeof valor === 'string') return valor.includes(sentinela) ? prefixo || '<raiz>' : null
  if (valor && typeof valor === 'object') {
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      const achou = caminhoDaSentinela(v, sentinela, prefixo ? `${prefixo}.${k}` : k)
      if (achou) return achou
    }
  }
  return null
}

/** Lista os vazamentos de `sentinela` nas respostas coletadas (rota + ator + caminho, sem valor). */
export function acharSentinela(respostas: readonly RespostaColetada[], sentinela: string): Vazamento[] {
  const achados: Vazamento[] = []
  for (const r of respostas) {
    const rotulo = `${r.rota.method} ${r.rota.url}`
    let caminho: string | null = null
    try {
      caminho = caminhoDaSentinela(JSON.parse(r.corpo), sentinela)
    } catch {
      // Corpo nao-JSON: busca no texto bruto.
      caminho = r.corpo.includes(sentinela) ? '<corpo bruto>' : null
    }
    if (caminho) achados.push({ rota: rotulo, ator: r.ator, caminho })
  }
  return achados
}
