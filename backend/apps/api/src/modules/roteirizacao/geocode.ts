// Geocodificacao sob demanda de enderecos. Este modulo e o UNICO escritor de lat/lng/geocodificado_em.
// LGPD/SEC-070: a consulta enviada ao provedor tem SO campos de endereco (logradouro, numero, bairro,
// cidade, UF, CEP), nunca nome ou telefone, e sai SO pela interface ClienteMapas (a allowlist de host e
// o bloqueio de SSRF vivem na implementacao em shared/clientes). Nada disso vai a log.
// O cache e o proprio `enderecos.lat/lng`: so busca no provedor quem ainda nao tem coordenada.
import type { ClienteMapas, ErroProvedor } from '@whaviso/shared/clientes'
import { comTransacao, type Pool } from '@whaviso/shared/db'
import { haversineM, type PontoGeo } from './geo'
import * as repo from './repo'

/** Raio (km) em torno da origem da loja em que uma coordenada e plausivel. Fora disso: falha. */
export const RAIO_PLAUSIVEL_KM = 80
/** Teto de geocodes por chamada de `sugerir` (o provedor publico limita ~1 req/s). */
export const MAX_GEOCODES_POR_SUGESTAO = 10

export interface EnderecoTexto {
  logradouro: string | null
  numero: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  cep: string | null
}

/** Texto da consulta, so com campos de endereco. null quando nao ha logradouro utilizavel. */
export function consultaEndereco(e: EnderecoTexto): string | null {
  const logradouro = e.logradouro?.trim()
  if (!logradouro) return null
  const rua = [logradouro, e.numero?.trim()].filter(Boolean).join(', ')
  const cidadeUf = [e.cidade?.trim(), e.uf?.trim()].filter(Boolean).join(' - ')
  const q = [rua, e.bairro?.trim(), cidadeUf, e.cep?.trim(), 'Brasil'].filter(Boolean).join(', ')
  return q.length >= 3 ? q.slice(0, 500) : null
}

export function dentroDaArea(p: PontoGeo, origem: PontoGeo | null): boolean {
  return origem === null || haversineM(p, origem) <= RAIO_PLAUSIVEL_KM * 1000
}

export type ResultadoGeocode =
  | { tipo: 'ok'; ponto: PontoGeo }
  | { tipo: 'falha' }
  /** Limite/indisponibilidade do provedor: nao marca falha, tenta de novo depois. */
  | { tipo: 'interrompido' }

export interface DepsGeocode {
  pool: Pool
  mapas: ClienteMapas
  /** Pausa entre chamadas (provedor publico: ~1 req/s). 0 nos testes. */
  pausaMs: number
}

const dormir = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve())

/**
 * Geocodifica em serie (respeita o limite do provedor) e grava `lat/lng/geocodificado_em`. Falha
 * permanente do provedor ou coordenada fora da area marca `geocode_falha_em` e registra evento SEM
 * dado de endereco. Erro retentavel (rate limit/transitorio) interrompe o lote sem marcar falha.
 */
export async function geocodificarEnderecos(
  d: DepsGeocode,
  a: { lojaId: string; userId: string },
  enderecos: readonly (EnderecoTexto & { id: string })[],
  origem: PontoGeo | null,
): Promise<Map<string, ResultadoGeocode>> {
  const out = new Map<string, ResultadoGeocode>()
  let primeiro = true
  let parar = false
  for (const e of enderecos) {
    if (parar) {
      out.set(e.id, { tipo: 'interrompido' })
      continue
    }
    const consulta = consultaEndereco(e)
    if (consulta === null) {
      await marcarFalha(d.pool, a, e.id, 'endereco_incompleto')
      out.set(e.id, { tipo: 'falha' })
      continue
    }
    if (!primeiro) await dormir(d.pausaMs)
    primeiro = false
    let r
    try {
      r = await d.mapas.geocodificar(consulta)
    } catch {
      parar = true
      out.set(e.id, { tipo: 'interrompido' })
      continue
    }
    if (!r.ok) {
      const erro: ErroProvedor = r.erro
      if (erro.retentavel) {
        parar = true
        out.set(e.id, { tipo: 'interrompido' })
      } else {
        await marcarFalha(d.pool, a, e.id, erro.codigo)
        out.set(e.id, { tipo: 'falha' })
      }
      continue
    }
    const ponto = { lat: Math.round(r.valor.lat * 1e6) / 1e6, lng: Math.round(r.valor.lng * 1e6) / 1e6 }
    if (!dentroDaArea(ponto, origem)) {
      await marcarFalha(d.pool, a, e.id, 'fora_da_area')
      out.set(e.id, { tipo: 'falha' })
      continue
    }
    await repo.gravarGeocode(d.pool, a.lojaId, e.id, ponto.lat, ponto.lng)
    out.set(e.id, { tipo: 'ok', ponto })
  }
  return out
}

async function marcarFalha(pool: Pool, a: { lojaId: string; userId: string }, id: string, motivo: string) {
  await comTransacao(pool, async (tx) => {
    await repo.marcarFalhaGeocode(tx, a.lojaId, id)
    await repo.registrarEvento(tx, {
      lojaId: a.lojaId, tipo: 'endereco.geocode_falhou', entidade: 'endereco', entidadeId: id,
      detalhes: { user_id: a.userId, motivo },
    })
  })
}
