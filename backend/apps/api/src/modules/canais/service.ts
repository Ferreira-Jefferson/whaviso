// Regra do modulo canais. Sem HTTP aqui; erros de dominio via shared/http_errors.
//
// Fluxo de segredo: a credencial em claro existe SO dentro de `conectar` (para cifrar) e de
// `sincronizar` (decifrada, embrulhada em CredencialResolvida e entregue ao ClienteCanal); nunca
// e devolvida, logada nem persistida em claro. A saida do provedor e entrada NAO confiavel: cada
// pedido e revalidado (Zod estrito + conferencia de totais) antes de virar pedido interno.
// Pedidos importados nao carregam PII do consumidor (fica no canal). Sem rede aqui: quem fala
// com o provedor e o ClienteCanal injetado (producao = stub ate a decisao do provedor).
import { randomBytes } from 'node:crypto'
import { comTransacao, ErroBanco, type Pool } from '@whaviso/shared/db'
import { HttpError, naoEncontrado, regraNegocio } from '../../shared/http_errors'
import { CredencialResolvida } from './cliente'
import type { DepsCanais } from './config'
import * as repo from './repo'
import {
  PedidoExterno,
  type CanalConectarEntrada,
  type CanalPatch,
  type CanalTipo,
} from './schemas'

export type { DepsCanais }

/** Origem do pedido por canal: 'ifood' tem valor proprio no enum; 'outro' entra como 'manual'. */
const ORIGEM: Record<CanalTipo, 'ifood' | 'manual'> = { ifood: 'ifood', outro: 'manual' }
const PREFIXO: Record<CanalTipo, string> = { ifood: 'IF', outro: 'EX' }

const ultimos4 = (s: string) => s.replace(/[^0-9A-Za-z]/g, '').slice(-4)

function paraEstado(m: repo.CanalMeta) {
  return {
    canal: m.canal,
    ativo: m.ativo,
    ultimos4: m.ultimos4,
    config: m.config,
    ultima_sincronizacao_em: m.ultima_sincronizacao_em,
    ultimo_erro: m.ultimo_erro,
    criado_em: m.criado_em,
    atualizado_em: m.atualizado_em,
  }
}

export async function listar(pool: Pool, lojaId: string) {
  return { canais: (await repo.listar(pool, lojaId)).map(paraEstado) }
}

/** Conecta ou troca a credencial (upsert por loja+canal). A credencial so segue cifrada. */
export async function conectar(pool: Pool, deps: DepsCanais, lojaId: string, e: CanalConectarEntrada) {
  const cifrada = deps.cifra.cifrar(Buffer.from(e.credencial, 'utf8'))
  const meta = await comTransacao(pool, async (tx) => {
    const m = await repo.upsert(tx, {
      lojaId,
      canal: e.canal,
      credencialCifrada: cifrada,
      ultimos4: ultimos4(e.credencial),
      config: e.config ?? {},
    })
    await repo.registrarEvento(tx, {
      lojaId,
      tipo: 'canal.conectado',
      entidadeId: m.id,
      detalhes: { canal: e.canal, ultimos4: m.ultimos4 },
    })
    return m
  })
  return paraEstado(meta)
}

export async function ajustar(pool: Pool, lojaId: string, canal: CanalTipo, patch: CanalPatch) {
  const m = await repo.ajustar(pool, lojaId, canal, { ativo: patch.ativo, config: patch.config })
  if (!m) throw naoEncontrado('Canal nao conectado')
  return paraEstado(m)
}

export async function pedidosImportados(pool: Pool, lojaId: string) {
  return { pedidos: await repo.listarPedidos(pool, lojaId) }
}

/** Totais coerentes: subtotal = soma dos itens e total = subtotal + taxa (mesma regra do banco). */
function totaisConferem(p: PedidoExterno): boolean {
  const soma = p.itens.reduce((s, i) => s + i.preco_unitario_centavos * i.quantidade, 0)
  return soma === p.subtotal_centavos && p.total_centavos === p.subtotal_centavos + p.taxa_entrega_centavos
}

const codigoAleatorio = (canal: CanalTipo) =>
  `${PREFIXO[canal]}-${randomBytes(4).toString('hex').slice(0, 5).toUpperCase()}`

type Importacao = 'importado' | 'duplicado'

/** Importa UM pedido numa transacao propria (idempotente por canal_loja + id_externo). */
async function importarUm(pool: Pool, lojaId: string, canalLojaId: string, canal: CanalTipo, p: PedidoExterno, jaImportado: boolean): Promise<Importacao> {
  if (jaImportado) return 'duplicado'
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    try {
      await comTransacao(pool, async (tx) => {
        const pedidoId = await repo.criarPedido(tx, {
          lojaId,
          codigo: codigoAleatorio(canal),
          origem: ORIGEM[canal],
          modalidade: p.modalidade,
          subtotal: p.subtotal_centavos,
          taxa: p.taxa_entrega_centavos,
          total: p.total_centavos,
          observacao: p.observacao ?? null,
          criadoEm: p.criado_em,
        })
        await repo.criarItens(tx, {
          pedidoId,
          lojaId,
          itens: p.itens.map((i) => ({
            nome: i.nome,
            preco: i.preco_unitario_centavos,
            qtd: i.quantidade,
            total: i.preco_unitario_centavos * i.quantidade,
            obs: i.observacao ?? null,
          })),
        })
        await repo.mapear(tx, { lojaId, canalLojaId, idExterno: p.id_externo, pedidoId })
      })
      return 'importado'
    } catch (e) {
      if (!(e instanceof ErroBanco) || e.tipo !== 'unique') throw e
      // Corrida de idempotencia: outro processo ja mapeou este pedido.
      if (await repo.pedidoJaImportado(pool, canalLojaId, p.id_externo)) return 'duplicado'
      // Senao foi colisao do codigo curto: tenta outro.
    }
  }
  throw new HttpError(500, 'codigo_pedido_indisponivel', 'Nao foi possivel gerar o codigo do pedido')
}

/**
 * Puxa pedidos do canal e os importa para `pedidos` (origem marcada). Provedor nao integrado -> 501;
 * falha do provedor -> 502 (so o codigo curto e gravado em `ultimo_erro`). Pedido invalido e
 * descartado (conta como rejeitado) sem derrubar o lote. Confirma ao canal os importados e os
 * duplicados (evita reentrega); falha na confirmacao nao desfaz a importacao.
 */
export async function sincronizar(pool: Pool, deps: DepsCanais, lojaId: string, canal: CanalTipo) {
  const c = await repo.buscarCredencial(pool, lojaId, canal)
  if (!c) throw naoEncontrado('Canal nao conectado')
  if (!c.ativo) throw regraNegocio('canal_inativo', 'Canal desativado')

  let cred: CredencialResolvida
  try {
    cred = new CredencialResolvida(deps.cifra.decifrar(c.credencial_cifrada).toString('utf8'))
  } catch {
    await repo.marcarSincronizacao(pool, c.id, 'credencial_ilegivel')
    throw regraNegocio('credencial_ilegivel', 'Reconecte o canal com uma nova credencial')
  }

  const cliente = deps.clientes[canal]
  const r = await cliente.buscarPedidos(cred, c.ultima_sincronizacao_em ? { desde: c.ultima_sincronizacao_em } : {})
  if (!r.ok) {
    await repo.marcarSincronizacao(pool, c.id, r.erro.codigo)
    if (r.erro.codigo === 'canal_nao_integrado') {
      throw new HttpError(501, 'canal_nao_integrado', 'A integracao com este canal ainda nao esta disponivel')
    }
    throw new HttpError(502, 'canal_indisponivel', 'Nao foi possivel consultar o canal agora; tente de novo')
  }

  const saida = { importados: 0, duplicados: 0, rejeitados: 0 }
  // Valida tudo primeiro e checa duplicados em lote (uma query), em vez de uma por pedido.
  const validos = r.valor.map((bruto) => {
    const v = PedidoExterno.safeParse(bruto)
    return v.success && totaisConferem(v.data) ? v.data : null
  })
  const jaImportados = await repo.idsJaImportados(
    pool,
    c.id,
    validos.filter((p): p is PedidoExterno => p !== null).map((p) => p.id_externo),
  )
  for (const p of validos) {
    if (!p) {
      saida.rejeitados++
      continue
    }
    const res = await importarUm(pool, lojaId, c.id, canal, p, jaImportados.has(p.id_externo))
    if (res === 'importado') saida.importados++
    else saida.duplicados++
    await cliente.confirmar(cred, p.id_externo)
  }

  await repo.marcarSincronizacao(pool, c.id, null)
  await repo.registrarEvento(pool, { lojaId, tipo: 'canal.sincronizado', entidadeId: c.id, detalhes: { canal, ...saida } })
  return saida
}
