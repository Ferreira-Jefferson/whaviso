// Regras da roteirizacao. Sem Fastify aqui: recebe pool, mapas e dados ja validados na borda.
// SUGERIR nao persiste nada de corrida (so geocodifica enderecos); ACEITAR cria a corrida
// (`sugerida = true`) e grava corrida_id/ordem_parada de forma atomica. O `status` do pedido NUNCA muda.
// Nenhum dado pessoal (endereco, lat/lng, consulta de geocode) vai a log, evento ou auditoria.
import type { ClienteMapas } from '@whaviso/shared/clientes'
import { comTransacao, notificar, type Executor, type Pool } from '@whaviso/shared/db'
import type {
  DespachoConfigEntrada, GeocodificarPendentesEntrada, RoteirizacaoAceitarEntrada,
  RoteirizacaoReordenarEntrada, RoteirizacaoSugerirEntrada, StatusPedido,
} from '@whaviso/shared/contracts'
import { conflito, naoEncontrado, regraNegocio } from '../../shared/http_errors'
import { agrupar, type Candidato } from './agrupar'
import {
  dentroDaArea, geocodificarEnderecos, MAX_GEOCODES_POR_SUGESTAO, type ResultadoGeocode,
} from './geocode'
import { centroide, type Matrizes, type PontoGeo } from './geo'
import { obterMatrizes } from './matriz'
import { custoCaminho, ordenarParadas } from './ordenar'
import { prontoPrevistoEm } from './preparo'
import * as repo from './repo'
import type {
  CorridaDto, CorridaSugerida, DespachoConfigDto, GeocodificarPendentesDto, ReordenarDto, SemLocalizacao, SugerirDto,
} from './schemas'

export interface Ator {
  lojaId: string
  userId: string
}

export interface OpcoesServico {
  /** Pausa entre geocodes (provedor publico limita ~1 req/s). Padrao 1100ms; 0 nos testes. */
  pausaGeocodeMs?: number
  agora?: () => Date
  /** Multiplicador dos rate limits das rotas (testes de carga/integracao); padrao 1. */
  rateLimitFator?: number
}

/** Compor corrida: so pedido que ainda nao saiu. */
const COMPONIVEIS: ReadonlySet<string> = new Set(['novo', 'em_preparo'])

const paraConfigDto = (c: repo.ConfigLinha): DespachoConfigDto => ({ ...c })

export function criarServicoRoteirizacao(pool: Pool, mapas: ClienteMapas, op: OpcoesServico = {}) {
  const pausaMs = op.pausaGeocodeMs ?? 1100
  const agora = op.agora ?? (() => new Date())

  const config = async (ex: Executor, lojaId: string) => (await repo.buscarConfig(ex, lojaId)) ?? repo.CONFIG_PADRAO
  const origemDe = (c: repo.ConfigLinha): PontoGeo | null =>
    c.origem_lat !== null && c.origem_lng !== null ? { lat: c.origem_lat, lng: c.origem_lng } : null

  // ----------------------------------------------------------------------------- config

  async function obterConfig(a: Ator): Promise<DespachoConfigDto> {
    return paraConfigDto(await config(pool, a.lojaId))
  }

  async function atualizarConfig(a: Ator, patch: DespachoConfigEntrada): Promise<DespachoConfigDto> {
    const atual = await config(pool, a.lojaId)
    const novo: repo.ConfigLinha = { ...atual }
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) (novo as unknown as Record<string, unknown>)[k] = v
    }
    return paraConfigDto(await repo.gravarConfig(pool, a.lojaId, novo))
  }

  // ----------------------------------------------------------------------------- geocode

  async function geocodificarPendentes(a: Ator, e: GeocodificarPendentesEntrada): Promise<GeocodificarPendentesDto> {
    const cfg = await config(pool, a.lojaId)
    const pendentes = await repo.enderecosPendentes(pool, a.lojaId, e.limite)
    const r = await geocodificarEnderecos({ pool, mapas, pausaMs }, a, pendentes, origemDe(cfg))
    let geocodificados = 0
    let falhas = 0
    let interrompido = false
    for (const v of r.values()) {
      if (v.tipo === 'ok') geocodificados++
      else if (v.tipo === 'falha') falhas++
      else interrompido = true
    }
    return {
      processados: pendentes.length, geocodificados, falhas, interrompido,
      restantes: await repo.contarPendentes(pool, a.lojaId),
    }
  }

  // ----------------------------------------------------------------------------- sugerir

  async function sugerir(a: Ator, e: RoteirizacaoSugerirEntrada): Promise<SugerirDto> {
    const cfg = await config(pool, a.lojaId)
    const origemCfg = origemDe(cfg)
    const linhas = await repo.elegiveis(pool, a.lojaId, e.pedido_ids ?? null)

    // 1) geocode sob demanda (so quem tem logradouro e ainda nao tem coordenada nem falha registrada)
    const resultados = new Map<string, ResultadoGeocode>()
    if (e.geocodificar) {
      const vistos = new Set<string>()
      const alvo = linhas
        .filter((l) => l.endereco_id && l.logradouro && l.lat === null && !l.geocode_falhou)
        .filter((l) => (vistos.has(l.endereco_id!) ? false : (vistos.add(l.endereco_id!), true)))
        .slice(0, MAX_GEOCODES_POR_SUGESTAO)
        .map((l) => ({ id: l.endereco_id!, logradouro: l.logradouro, numero: l.numero, bairro: l.bairro, cidade: l.cidade, uf: l.uf, cep: l.cep }))
      const r = await geocodificarEnderecos({ pool, mapas, pausaMs }, a, alvo, origemCfg)
      for (const [id, v] of r) resultados.set(id, v)
    }

    // 2) separa quem tem localizacao de quem nao tem
    const semLocalizacao: SemLocalizacao[] = []
    const aptos: { l: repo.ElegivelLinha; ponto: PontoGeo }[] = []
    for (const l of linhas) {
      if (!l.endereco_id || !l.logradouro) {
        semLocalizacao.push({ pedido_id: l.pedido_id, codigo: l.codigo, motivo: 'sem_endereco' })
        continue
      }
      const novo = resultados.get(l.endereco_id)
      const ponto: PontoGeo | null =
        novo?.tipo === 'ok' ? novo.ponto : l.lat !== null && l.lng !== null ? { lat: l.lat, lng: l.lng } : null
      if (ponto) {
        if (dentroDaArea(ponto, origemCfg)) aptos.push({ l, ponto })
        else semLocalizacao.push({ pedido_id: l.pedido_id, codigo: l.codigo, motivo: 'fora_da_area' })
      } else if (l.geocode_falhou || novo?.tipo === 'falha') {
        semLocalizacao.push({ pedido_id: l.pedido_id, codigo: l.codigo, motivo: 'geocode_falhou' })
      } else {
        semLocalizacao.push({ pedido_id: l.pedido_id, codigo: l.codigo, motivo: 'pendente' })
      }
    }

    const base = { gerado_em: agora().toISOString(), origem_configurada: origemCfg !== null, sem_localizacao: semLocalizacao }
    if (aptos.length === 0) return { ...base, estimado: false, corridas: [] }

    // 3) matriz (loja + paradas) e agrupamento
    const origem = origemCfg ?? centroide(aptos.map((x) => x.ponto))
    const m = await obterMatrizes(mapas, [origem, ...aptos.map((x) => x.ponto)], cfg.velocidade_media_kmh)
    const prontos = aptos.map((x) =>
      prontoPrevistoEm(new Date(x.l.criado_em), x.l.itens, {
        preparoBaseMin: cfg.preparo_base_min, preparoPorItemMin: cfg.preparo_por_item_min,
      }),
    )
    const candidatos: Candidato[] = aptos.map((x, i) => ({
      no: i + 1, prontoMin: prontos[i]!.getTime() / 60_000, chave: x.l.pedido_id,
    }))
    const grupos = agrupar(candidatos, m.tempoMin, {
      janelaSaidaMin: cfg.janela_saida_min, desvioMaxMin: cfg.desvio_max_min,
      maxPedidos: cfg.max_pedidos_corrida, voltaALoja: cfg.volta_a_loja,
    })

    // 4) ordena as paradas de cada grupo e monta a saida
    const montadas = grupos.map((g) => {
      const ordem = ordenarParadas(g, m.tempoMin, cfg.volta_a_loja)
      return montarCorrida(ordem, m, cfg.volta_a_loja, (no) => ({ ...aptos[no - 1]!, pronto: prontos[no - 1]! }))
    })
    montadas.sort(
      (x, y) => x.saidaMs - y.saidaMs || (x.corrida.paradas[0]!.pedido_id < y.corrida.paradas[0]!.pedido_id ? -1 : 1),
    )
    const corridas: CorridaSugerida[] = montadas.map((x, i) => ({
      ...x.corrida,
      ordem_saida: i + 1,
      sem_motoboy: e.motoboys_disponiveis !== undefined && i + 1 > e.motoboys_disponiveis,
    }))
    return { ...base, estimado: m.estimado, corridas }
  }

  // ----------------------------------------------------------------------------- aceitar

  async function motoboyAtivo(ex: Executor, lojaId: string, id: string) {
    const m = await repo.buscarMotoboy(ex, lojaId, id)
    if (!m) throw naoEncontrado('Motoboy nao encontrado')
    if (!m.ativo) throw regraNegocio('motoboy_inativo', 'Motoboy inativo nao pode receber entregas')
    return { id: m.id, nome: m.nome }
  }

  /** Aceitar uma corrida sugerida: tudo ou nada, com os pedidos travados (FOR UPDATE). */
  async function aceitar(a: Ator, e: RoteirizacaoAceitarEntrada): Promise<CorridaDto> {
    if (new Set(e.pedido_ids).size !== e.pedido_ids.length) {
      throw regraNegocio('pedidos_repetidos', 'Informe cada pedido uma unica vez')
    }
    const corridaId = await comTransacao(pool, async (tx) => {
      const pedidos = await repo.travarPedidos(tx, a.lojaId, e.pedido_ids)
      // De outra loja ou inexistente: 404 (nao confirma existencia).
      if (pedidos.length !== e.pedido_ids.length) throw naoEncontrado('Pedido nao encontrado')
      const indisponiveis = pedidos.filter(
        (p) => p.modalidade !== 'entrega' || !COMPONIVEIS.has(p.status) || p.corrida_id !== null || p.motoboy_id !== null,
      )
      if (indisponiveis.length > 0) {
        throw conflito(
          'pedidos_indisponiveis',
          `Pedidos que ja nao estao disponiveis para a corrida: ${indisponiveis.map((p) => p.codigo).join(', ')}`,
        )
      }
      const motoboy = e.motoboy_id ? await motoboyAtivo(tx, a.lojaId, e.motoboy_id) : null
      const id = await repo.criarCorridaSugerida(tx, a.lojaId, motoboy?.id ?? null)
      let ordem = 1
      for (const pedidoId of e.pedido_ids) {
        const linha = await repo.entrarNaCorrida(tx, a.lojaId, pedidoId, id, ordem++, motoboy)
        // Guarda de concorrencia: o UPDATE so pega pedido ainda sem corrida e sem motoboy.
        if (!linha) throw conflito('pedidos_indisponiveis', 'Algum pedido ja esta numa corrida')
        await notificar(tx, {
          tipo: 'pedido.atualizado', loja_id: a.lojaId,
          payload: { pedido_id: pedidoId, loja_id: a.lojaId, status: linha.status as StatusPedido },
        })
      }
      await repo.registrarEvento(tx, {
        lojaId: a.lojaId, tipo: 'corrida.sugerida_aceita', entidade: 'corrida', entidadeId: id,
        detalhes: { user_id: a.userId, pedidos: e.pedido_ids.length, motoboy_id: motoboy?.id ?? null },
      })
      return id
    })
    return obterCorrida(a, corridaId)
  }

  async function obterCorrida(a: Ator, id: string): Promise<CorridaDto> {
    const c = await repo.buscarCorrida(pool, a.lojaId, id)
    if (!c) throw naoEncontrado('Corrida nao encontrada')
    const paradas = await repo.paradasDaCorrida(pool, a.lojaId, id)
    return {
      id: c.id,
      status: c.status,
      cancelada: c.status === 'concluida' && c.despachada_em === null,
      sugerida: c.sugerida,
      motoboy_id: c.motoboy_id,
      motoboy_nome: c.motoboy_nome,
      despachada_em: c.despachada_em,
      concluida_em: c.concluida_em,
      criado_em: c.criado_em,
      valor_motoboy_total_centavos: paradas.reduce((s, p) => s + p.valor_motoboy_centavos, 0),
      paradas: paradas.map((p) => ({
        pedido_id: p.pedido_id, codigo: p.codigo, status: p.status as StatusPedido, ordem_parada: p.ordem_parada,
        total_centavos: p.total_centavos, zona_id: p.zona_id, zona_nome: p.zona_nome,
        valor_motoboy_centavos: p.valor_motoboy_centavos,
        endereco: { resumo: p.endereco_resumo, bairro: p.bairro, lat: p.lat, lng: p.lng },
      })),
    }
  }

  // ----------------------------------------------------------------------------- reordenar

  /** Recalcula so a ORDEM de uma lista manual de pedidos (nao persiste: o despacho persiste a ordem). */
  async function reordenar(a: Ator, e: RoteirizacaoReordenarEntrada): Promise<ReordenarDto> {
    if (new Set(e.pedido_ids).size !== e.pedido_ids.length) {
      throw regraNegocio('pedidos_repetidos', 'Informe cada pedido uma unica vez')
    }
    const cfg = await config(pool, a.lojaId)
    const pontos = await repo.coordenadasDosPedidos(pool, a.lojaId, e.pedido_ids)
    if (pontos.length !== e.pedido_ids.length) throw naoEncontrado('Pedido nao encontrado')
    if (pontos.some((p) => p.lat === null || p.lng === null)) {
      throw regraNegocio('pedidos_sem_localizacao', 'Ha pedidos sem endereco geocodificado: geocodifique antes de reordenar')
    }
    const porId = new Map(pontos.map((p) => [p.pedido_id, { lat: p.lat!, lng: p.lng! }]))
    const lista = e.pedido_ids.map((id) => ({ id, ponto: porId.get(id)! }))
    const origem = origemDe(cfg) ?? centroide(lista.map((x) => x.ponto))
    const m = await obterMatrizes(mapas, [origem, ...lista.map((x) => x.ponto)], cfg.velocidade_media_kmh)
    const ordem = ordenarParadas(lista.map((_, i) => i + 1), m.tempoMin, cfg.volta_a_loja)
    const { tempo, dist } = totais(ordem, m, cfg.volta_a_loja)
    return {
      pedido_ids: ordem.map((no) => lista[no - 1]!.id),
      tempo_total_min: Math.ceil(tempo - 1e-9),
      distancia_total_m: Math.round(dist),
      estimado: m.estimado,
    }
  }

  return { obterConfig, atualizarConfig, geocodificarPendentes, sugerir, aceitar, reordenar }
}

export type ServicoRoteirizacao = ReturnType<typeof criarServicoRoteirizacao>

// ------------------------------------------------------------------------------- auxiliares puros

function totais(ordem: readonly number[], m: Matrizes, volta: boolean): { tempo: number; dist: number } {
  const tempo = custoCaminho(ordem, m.tempoMin, volta)
  const dist = custoCaminho(ordem, m.distM, volta)
  return { tempo, dist }
}

function montarCorrida(
  ordem: readonly number[], m: Matrizes, volta: boolean,
  dado: (no: number) => { l: repo.ElegivelLinha; ponto: PontoGeo; pronto: Date },
): { corrida: Omit<CorridaSugerida, 'ordem_saida' | 'sem_motoboy'>; saidaMs: number } {
  let acumulado = 0
  let atual = 0
  let saidaMs = 0
  const paradas = ordem.map((no, i) => {
    acumulado += m.tempoMin[atual]![no]!
    atual = no
    const { l, pronto } = dado(no)
    saidaMs = Math.max(saidaMs, pronto.getTime())
    return {
      pedido_id: l.pedido_id,
      codigo: l.codigo,
      ordem_parada: i + 1,
      bairro: l.bairro,
      endereco_resumo: [l.logradouro, l.numero].filter(Boolean).join(', ') || null,
      pronto_previsto_em: pronto.toISOString(),
      chegada_min: Math.round(acumulado),
    }
  })
  const { tempo, dist } = totais(ordem, m, volta)
  return {
    saidaMs,
    corrida: {
      saida_prevista_em: new Date(saidaMs).toISOString(),
      paradas,
      tempo_total_min: Math.ceil(tempo - 1e-9),
      distancia_total_m: Math.round(dist),
      estimado: m.estimado,
    },
  }
}
