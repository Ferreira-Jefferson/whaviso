// Regras de zonas de entrega. Sem Fastify aqui: recebe pool e dados ja validados na borda.
// Erros de dominio via shared/http_errors. Nenhum dado pessoal vai a log nem a evento.
import { comTransacao, type Executor, type Pool } from '@whaviso/shared/db'
import { ZonaAreaPoligono, ZonaAreaRaio } from '@whaviso/shared/contracts'
import { conflito, naoEncontrado, regraNegocio } from '../../shared/http_errors'
import { normalizarBairro, pontoNoPoligono, pontoNoRaio, type Ponto } from './geo'
import * as repo from './repo'
import type {
  ResolverZonaDto,
  ZonaAreaPoligonoDto,
  ZonaAreaRaioDto,
  ZonaDto,
  ZonaLote,
  ZonaNova,
  ZonaPatch,
} from './schemas'

export interface Ator {
  lojaId: string
  userId: string
}

type AreaZona = ZonaAreaPoligonoDto | ZonaAreaRaioDto

// jsonb sempre lido via schema (SEC-081); dado fora do contrato vira null, nunca vaza cru.
function lerArea(tipo: repo.ZonaLinha['tipo'], area: unknown): AreaZona | null {
  if (area === null || area === undefined) return null
  const schema = tipo === 'poligono' ? ZonaAreaPoligono : tipo === 'raio' ? ZonaAreaRaio : null
  if (!schema) return null
  const r = schema.safeParse(area)
  return r.success ? (r.data as AreaZona) : null
}

export function paraSaida(z: repo.ZonaLinha): ZonaDto {
  return {
    id: z.id,
    nome: z.nome,
    tipo: z.tipo,
    bairro: z.bairro,
    area: lerArea(z.tipo, z.area),
    taxa_cliente_centavos: z.taxa_cliente_centavos,
    valor_motoboy_centavos: z.valor_motoboy_centavos,
    pedido_minimo_centavos: z.pedido_minimo_centavos,
    frete_gratis_acima_centavos: z.frete_gratis_acima_centavos,
    ativo: z.ativo,
    pedidos_em_aberto: z.pedidos_em_aberto,
    criado_em: z.criado_em,
    atualizado_em: z.atualizado_em,
  }
}

export async function listar(pool: Pool, a: Ator, incluirInativas: boolean) {
  const linhas = await repo.listar(pool, a.lojaId, incluirInativas)
  return { itens: linhas.map(paraSaida) }
}

export async function obter(pool: Pool, a: Ator, id: string): Promise<ZonaDto> {
  const z = await repo.buscar(pool, a.lojaId, id)
  if (!z) throw naoEncontrado('Zona nao encontrada')
  return paraSaida(z)
}

/** 409 se algum bairro (normalizado) ja esta em zona ativa da loja, exceto `ignorarId`. */
async function exigirBairrosLivres(tx: Executor, lojaId: string, bairros: string[], ignorarId?: string) {
  const vistos = new Set<string>()
  for (const b of bairros) {
    const chave = normalizarBairro(b)
    if (vistos.has(chave)) throw conflito('bairro_duplicado', 'Bairro repetido na lista')
    vistos.add(chave)
  }
  const existentes = await repo.bairrosAtivos(tx, lojaId)
  for (const e of existentes) {
    if (e.id !== ignorarId && vistos.has(normalizarBairro(e.bairro))) {
      throw conflito('bairro_duplicado', 'Ja existe zona ativa para este bairro')
    }
  }
}

const minimoFrete = (e: {
  pedido_minimo_centavos?: number | null | undefined
  frete_gratis_acima_centavos?: number | null | undefined
}) => ({
  pedido_minimo_centavos: e.pedido_minimo_centavos ?? null,
  frete_gratis_acima_centavos: e.frete_gratis_acima_centavos ?? null,
})

function paraNova(e: ZonaNova): repo.NovaZona {
  const base = {
    nome: e.nome,
    taxa_cliente_centavos: e.taxa_cliente_centavos,
    valor_motoboy_centavos: e.valor_motoboy_centavos,
    ...minimoFrete(e),
  }
  if (e.tipo === 'bairro') return { ...base, tipo: 'bairro', bairro: e.bairro, area: null }
  if (e.tipo === 'poligono') return { ...base, tipo: 'poligono', bairro: null, area: e.area }
  return { ...base, tipo: 'raio', bairro: null, area: { centro: e.centro, metros: e.metros } }
}

export async function criar(pool: Pool, a: Ator, e: ZonaNova): Promise<ZonaDto> {
  const id = await comTransacao(pool, async (tx) => {
    await repo.travarLoja(tx, a.lojaId)
    if (e.tipo === 'bairro') await exigirBairrosLivres(tx, a.lojaId, [e.bairro])
    const novo = await repo.inserir(tx, a.lojaId, paraNova(e))
    await repo.registrarEvento(tx, {
      lojaId: a.lojaId,
      tipo: 'zona.criada',
      zonaId: novo,
      detalhes: { user_id: a.userId, tipo: e.tipo },
    })
    return novo
  })
  return obter(pool, a, id)
}

/** Importacao rapida de bairros: transacional, rejeita o lote inteiro se houver duplicata. */
export async function criarLote(pool: Pool, a: Ator, l: ZonaLote) {
  const ids = await comTransacao(pool, async (tx) => {
    await repo.travarLoja(tx, a.lojaId)
    await exigirBairrosLivres(tx, a.lojaId, l.bairros)
    const criados: string[] = []
    for (const bairro of l.bairros) {
      const id = await repo.inserir(tx, a.lojaId, {
        nome: bairro,
        tipo: 'bairro',
        bairro,
        area: null,
        taxa_cliente_centavos: l.taxa_cliente_centavos,
        valor_motoboy_centavos: l.valor_motoboy_centavos,
        ...minimoFrete(l),
      })
      await repo.registrarEvento(tx, {
        lojaId: a.lojaId,
        tipo: 'zona.criada',
        zonaId: id,
        detalhes: { user_id: a.userId, tipo: 'bairro', lote: true },
      })
      criados.push(id)
    }
    return criados
  })
  const todas = await repo.listar(pool, a.lojaId, false)
  const conjunto = new Set(ids)
  return { itens: todas.filter((z) => conjunto.has(z.id)).map(paraSaida) }
}

export async function atualizar(pool: Pool, a: Ator, id: string, p: ZonaPatch): Promise<ZonaDto> {
  await comTransacao(pool, async (tx) => {
    await repo.travarLoja(tx, a.lojaId)
    const z = await repo.buscar(tx, a.lojaId, id)
    if (!z) throw naoEncontrado('Zona nao encontrada')
    if (p.bairro !== undefined && z.tipo !== 'bairro') {
      throw regraNegocio('campo_incompativel_com_tipo', 'Bairro so vale para zona do tipo bairro')
    }
    if (p.area !== undefined) {
      const ehPoligono = 'type' in p.area
      const compativel = z.tipo === 'poligono' ? ehPoligono : z.tipo === 'raio' ? !ehPoligono : false
      if (!compativel) {
        throw regraNegocio('campo_incompativel_com_tipo', 'Area incompativel com o tipo da zona')
      }
    }
    if (p.bairro !== undefined && z.ativo) await exigirBairrosLivres(tx, a.lojaId, [p.bairro], id)
    const afetou = await repo.atualizar(tx, a.lojaId, id, p)
    if (!afetou) throw naoEncontrado('Zona nao encontrada')
    const campos = Object.keys(p).filter((k) => p[k as keyof ZonaPatch] !== undefined)
    await repo.registrarEvento(tx, {
      lojaId: a.lojaId,
      tipo: 'zona.atualizada',
      zonaId: id,
      detalhes: { user_id: a.userId, campos },
    })
  })
  return obter(pool, a, id)
}

/** Ativar/desativar. Desativar nao bloqueia por pedidos em aberto: devolve o aviso no DTO. */
export async function alterarAtivo(pool: Pool, a: Ator, id: string, ativar: boolean): Promise<ZonaDto> {
  await comTransacao(pool, async (tx) => {
    await repo.travarLoja(tx, a.lojaId)
    const z = await repo.buscar(tx, a.lojaId, id)
    if (!z) throw naoEncontrado('Zona nao encontrada')
    if (z.ativo === ativar) {
      throw conflito(ativar ? 'zona_ja_ativa' : 'zona_ja_inativa', ativar ? 'Zona ja esta ativa' : 'Zona ja esta inativa')
    }
    if (ativar && z.tipo === 'bairro' && z.bairro) await exigirBairrosLivres(tx, a.lojaId, [z.bairro], id)
    await repo.definirAtivo(tx, a.lojaId, id, ativar)
    await repo.registrarEvento(tx, {
      lojaId: a.lojaId,
      tipo: ativar ? 'zona.ativada' : 'zona.desativada',
      zonaId: id,
      detalhes: { user_id: a.userId },
    })
  })
  return obter(pool, a, id)
}

/** Casamento da zona com o endereco, ja na ordem de precedencia (1 bairro, 2 poligono, 3 raio). */
function casaCom(z: repo.ZonaLinha, bairroNorm: string | null, ponto: Ponto | null): 1 | 2 | 3 | null {
  if (z.tipo === 'bairro') {
    return bairroNorm !== null && z.bairro !== null && normalizarBairro(z.bairro) === bairroNorm ? 1 : null
  }
  if (ponto === null) return null
  const area = lerArea(z.tipo, z.area)
  if (!area) return null
  if ('type' in area) return pontoNoPoligono(ponto, area.coordinates[0]!) ? 2 : null
  return pontoNoRaio(ponto, area.centro, area.metros) ? 3 : null
}

/**
 * Resolve o endereco para uma zona ativa. Desempate fixo: (1) bairro exato, (2) poligono contendo
 * o ponto, (3) raio contendo o ponto; entre iguais, menor taxa do cliente e depois a mais antiga.
 * Sem zona: `fora_da_area` (nunca erro).
 */
export async function resolver(
  pool: Pool,
  a: Ator,
  e: { bairro?: string | undefined; lat?: number | undefined; lng?: number | undefined },
): Promise<ResolverZonaDto> {
  const bairroNorm = e.bairro !== undefined ? normalizarBairro(e.bairro) : null
  const ponto: Ponto | null = e.lat !== undefined && e.lng !== undefined ? { lat: e.lat, lng: e.lng } : null
  const ativas = await repo.listarAtivas(pool, a.lojaId) // ja vem da mais antiga para a mais nova
  let melhor: { z: repo.ZonaLinha; nivel: number } | null = null
  for (const z of ativas) {
    const nivel = casaCom(z, bairroNorm, ponto)
    if (nivel === null) continue
    if (
      melhor === null ||
      nivel < melhor.nivel ||
      (nivel === melhor.nivel && z.taxa_cliente_centavos < melhor.z.taxa_cliente_centavos)
    ) {
      melhor = { z, nivel }
    }
  }
  if (!melhor) return { fora_da_area: true }
  const z = melhor.z
  return {
    fora_da_area: false,
    zona_id: z.id,
    nome: z.nome,
    taxa_cliente_centavos: z.taxa_cliente_centavos,
    valor_motoboy_centavos: z.valor_motoboy_centavos,
    pedido_minimo_centavos: z.pedido_minimo_centavos,
    frete_gratis_acima_centavos: z.frete_gratis_acima_centavos,
  }
}
