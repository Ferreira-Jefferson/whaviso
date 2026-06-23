// E6/H6.9: Alocação do HORÁRIO RESERVADO por combinado (segundo único na janela
// comercial). Núcleo PURO (sem banco) da busca de segundo livre; a parte que consulta
// os segundos ocupados (global + por devedor) vive no repo `horario_reservado_repo.ts`,
// chamado pela api (reativações/reabertura) e pelo zap (aceite). Módulo nunca importa
// módulo; isto é shared, permitido.
//
// Regras (H6.9 + D-HORARIO do plano mestre):
//  - Janela 08:00:00..17:59:59 (SP) = 28800..64799 segundos desde a meia-noite SP.
//  - Dois combinados ATIVOS nunca compartilham o mesmo segundo (unicidade GLOBAL,
//    garantida AQUI na lógica, não por índice único: a reabertura E8 reusa segundo
//    mesmo ocupado, e um índice único quebraria isso).
//  - Distância mínima de 10min (600s) por DEVEDOR (telefone_devedor): a busca pula
//    segundos a menos de 10min de outro aviso ativo do MESMO devedor.
//  - Busca a partir do segundo do ACEITE (se dentro da janela) ou das 08:00:00 (fora),
//    avançando 1 a 1; ao chegar nas 18:00:00 recomeça das 08:00:00 (wrap).
//  - Se todos ocupados: segundo aleatório na janela (colisão último recurso).
//  - Se não couber a distância de 10min para aquele devedor: fallback aleatório,
//    registrando que o espaçamento ideal não coube (G8: `espacamentoIdeal=false`).

import { TZDate } from '@date-fns/tz'
import { TZ } from './index'

/** 08:00:00 SP em segundos desde a meia-noite. */
export const JANELA_INICIO_SEG = 8 * 3600 // 28800
/** 17:59:59 SP (último segundo válido; 18:00:00 está fora). */
export const JANELA_FIM_SEG = 18 * 3600 - 1 // 64799
/** Total de segundos da janela [08:00:00, 18:00:00). */
export const JANELA_TAMANHO = JANELA_FIM_SEG - JANELA_INICIO_SEG + 1 // 36000
/** Distância mínima por devedor: 10 minutos. */
export const DISTANCIA_MIN_SEG = 10 * 60 // 600

/** Segundo do dia (0..86399) em America/Sao_Paulo do instante `agora`. */
export function segundoDoDiaSp(agora: Date = new Date()): number {
  const d = new TZDate(agora.getTime(), TZ)
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()
}

/** Segundo de partida da busca: o atual se dentro da janela; senão o início (08:00:00). */
export function segundoDePartida(agora: Date = new Date()): number {
  const s = segundoDoDiaSp(agora)
  return s >= JANELA_INICIO_SEG && s <= JANELA_FIM_SEG ? s : JANELA_INICIO_SEG
}

export interface EntradaAlocacao {
  /** Segundo de partida da busca (use `segundoDePartida`). */
  partida: number
  /** Segundos já ocupados por QUALQUER aviso ativo (unicidade global). */
  ocupadosGlobais: ReadonlySet<number>
  /** Segundos de avisos ativos do MESMO devedor (para a distância de 10min). */
  ocupadosDevedor: readonly number[]
  /** Sorteio determinístico nos testes; default Math.random. */
  aleatorio?: () => number
}

export interface ResultadoAlocacao {
  /** Segundo alocado (28800..64799). */
  seg: number
  /** false quando o segundo veio do fallback aleatório (G8: espaçamento ideal não coube). */
  espacamentoIdeal: boolean
}

/** Distância circular (em segundos) entre dois segundos da MESMA janela diária. Como os
 *  lembretes saem 1x/dia no mesmo segundo, a proximidade é medida só pelo segundo do dia. */
function perto(a: number, b: number): boolean {
  return Math.abs(a - b) < DISTANCIA_MIN_SEG
}

/** Algum aviso ativo do mesmo devedor está a menos de 10min deste segundo? */
function colideComDevedor(seg: number, ocupadosDevedor: readonly number[]): boolean {
  return ocupadosDevedor.some((o) => perto(seg, o))
}

/**
 * Encontra o segundo reservado seguindo as regras de H6.9. Função PURA: recebe os
 * segundos ocupados já lidos do banco e devolve o segundo + se respeitou os 10min.
 */
export function alocarSegundo(entrada: EntradaAlocacao): ResultadoAlocacao {
  const { ocupadosGlobais, ocupadosDevedor } = entrada
  const aleatorio = entrada.aleatorio ?? Math.random
  // Normaliza a partida para dentro da janela.
  const inicio = Math.min(Math.max(entrada.partida, JANELA_INICIO_SEG), JANELA_FIM_SEG)

  // 1ª passada: respeita unicidade global E os 10min do devedor (segundo IDEAL).
  for (let i = 0; i < JANELA_TAMANHO; i++) {
    const seg = JANELA_INICIO_SEG + ((inicio - JANELA_INICIO_SEG + i) % JANELA_TAMANHO)
    if (!ocupadosGlobais.has(seg) && !colideComDevedor(seg, ocupadosDevedor)) {
      return { seg, espacamentoIdeal: true }
    }
  }

  // 2ª passada: relaxa os 10min (não coube p/ este devedor), mas mantém a unicidade global.
  for (let i = 0; i < JANELA_TAMANHO; i++) {
    const seg = JANELA_INICIO_SEG + ((inicio - JANELA_INICIO_SEG + i) % JANELA_TAMANHO)
    if (!ocupadosGlobais.has(seg)) {
      return { seg, espacamentoIdeal: false }
    }
  }

  // 3ª: janela inteira ocupada (mesmo sem a regra dos 10min): segundo aleatório (colisão
  // global aceita só como último recurso). Também não respeita os 10min → espacamentoIdeal=false.
  const seg = JANELA_INICIO_SEG + Math.floor(aleatorio() * JANELA_TAMANHO)
  return { seg: Math.min(seg, JANELA_FIM_SEG), espacamentoIdeal: false }
}
