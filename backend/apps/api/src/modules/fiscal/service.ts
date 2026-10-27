// Regra do modulo fiscal. Sem HTTP aqui; erros de dominio via shared/http_errors.
//
// Emissao SINCRONA contra o emissor de terceiro (ClienteFiscal): reserva o documento no banco
// (idempotente), chama o emissor com a credencial decifrada so durante a chamada e grava o
// resultado. Falha de transporte do emissor vira documento `erro` com motivo curto (nunca o erro
// cru do provedor); o usuario pode tentar de novo (a reserva reaproveita a linha em `erro`).
import { comTransacao, type Executor, type Pool } from '@whaviso/shared/db'
import type { ClienteFiscal, EmitirFiscalEntrada } from '@whaviso/shared/clientes'
import { naoEncontrado, regraNegocio, conflito } from '../../shared/http_errors'
import type { CifraFiscal } from './cifra'
import * as repo from './repo'
import type {
  DocumentoFiscalDto,
  DocumentosFiscaisBusca,
  FiscalConfigEntrada,
  FiscalConfigEstado,
  FiscalConfigPatch,
  TipoDocumentoFiscal,
} from './schemas'

export interface DepsFiscal {
  cifra: CifraFiscal
  emissor: ClienteFiscal
}

const ESTADO_VAZIO: FiscalConfigEstado = {
  configurada: false,
  ativo: false,
  cnpj: null,
  regime: null,
  serie_nfce: null,
  serie_nfse: null,
  ambiente: null,
  ultimos4: null,
  criado_em: null,
  atualizado_em: null,
}

function paraEstado(m: repo.ConfigMeta | null): FiscalConfigEstado {
  if (!m) return ESTADO_VAZIO
  return {
    configurada: m.ativo,
    ativo: m.ativo,
    cnpj: m.cnpj,
    regime: m.regime,
    serie_nfce: m.serie_nfce,
    serie_nfse: m.serie_nfse,
    ambiente: m.ambiente,
    ultimos4: m.ultimos4,
    criado_em: m.criado_em,
    atualizado_em: m.atualizado_em,
  }
}

const ultimos4De = (s: string) => s.replace(/[^0-9A-Za-z]/g, '').slice(-4)

export async function obterConfig(exec: Executor, lojaId: string): Promise<FiscalConfigEstado> {
  return paraEstado(await repo.obterConfig(exec, lojaId))
}

/** Set ou rotate da configuracao (a credencial e cifrada aqui, nunca guardada em claro). */
export async function definirConfig(
  pool: Pool,
  deps: DepsFiscal,
  lojaId: string,
  e: FiscalConfigEntrada,
): Promise<FiscalConfigEstado> {
  const meta = await comTransacao(pool, async (tx) => {
    const m = await repo.upsertConfig(tx, {
      lojaId,
      credencialCifrada: deps.cifra.cifrar(e.credencial),
      ultimos4: ultimos4De(e.credencial),
      cnpj: e.cnpj,
      regime: e.regime,
      serieNfce: e.serie_nfce,
      serieNfse: e.serie_nfse,
      ambiente: e.ambiente,
    })
    await repo.registrarEvento(tx, {
      lojaId, tipo: 'fiscal_config.definida', entidade: 'fiscal_config', entidadeId: null,
      detalhes: { ambiente: e.ambiente, regime: e.regime },
    })
    return m
  })
  return paraEstado(meta)
}

export async function ajustarConfig(pool: Pool, lojaId: string, p: FiscalConfigPatch): Promise<FiscalConfigEstado> {
  const m = await repo.ajustarConfig(pool, lojaId, p)
  if (!m) throw naoEncontrado('Configuracao fiscal nao encontrada')
  return paraEstado(m)
}

/** Motivo curto e seguro a partir do erro de provedor (codigo estavel, nunca a mensagem crua). */
function motivoSeguro(codigo: string): string {
  return `emissor: ${codigo.replace(/[^a-z0-9_]/gi, '').slice(0, 60) || 'falha'}`
}

export async function emitir(
  pool: Pool,
  deps: DepsFiscal,
  lojaId: string,
  userId: string,
  entrada: { pedido_id: string; tipo: TipoDocumentoFiscal },
): Promise<DocumentoFiscalDto> {
  const cfg = await repo.obterConfigComCredencial(pool, lojaId)
  if (!cfg || !cfg.ativo) {
    throw regraNegocio('fiscal_nao_configurado', 'Configure o emissor fiscal da loja antes de emitir')
  }
  const pedido = await repo.obterPedido(pool, lojaId, entrada.pedido_id)
  if (!pedido) throw naoEncontrado('Pedido nao encontrado')
  if (pedido.status === 'rascunho') {
    throw regraNegocio('pedido_nao_emissivel', 'Pedido em rascunho nao pode gerar documento fiscal')
  }
  const itens = await repo.itensDoPedido(pool, lojaId, pedido.id)
  if (itens.length === 0) throw regraNegocio('pedido_sem_itens', 'Pedido sem itens nao pode gerar documento fiscal')

  const id = await repo.reservar(pool, {
    lojaId, pedidoId: pedido.id, tipo: entrada.tipo, valorTotalCentavos: pedido.total_centavos,
  })
  if (!id) throw conflito('documento_ja_existe', 'Este pedido ja tem documento fiscal emitido ou em emissao')

  let resultado: { status: 'pendente' | 'emitido' | 'erro'; chave: string | null; link: string | null; erro: string | null }
  try {
    const emitente: EmitirFiscalEntrada['emitente'] = {
      cnpj: cfg.cnpj,
      regime: cfg.regime,
      serie: entrada.tipo === 'nfce' ? cfg.serie_nfce : cfg.serie_nfse,
      ambiente: cfg.ambiente,
      credencial: deps.cifra.decifrar(cfg.credencial_cifrada),
    }
    const r = await deps.emissor.emitir({
      referencia: id,
      tipo: entrada.tipo,
      emitente,
      pedido: {
        codigo: pedido.codigo,
        totalCentavos: pedido.total_centavos,
        itens: itens.map((i) => ({
          descricao: i.nome.slice(0, 200),
          quantidade: i.quantidade,
          valorUnitarioCentavos: i.unitario,
          valorTotalCentavos: i.total,
        })),
      },
    })
    if (!r.ok) {
      resultado = { status: 'erro', chave: null, link: null, erro: motivoSeguro(r.erro.codigo) }
    } else {
      const v = r.valor
      const link = v.link && v.link.startsWith('https://') ? v.link.slice(0, 2048) : null
      if (v.status === 'emitido' && !v.chave) {
        resultado = { status: 'erro', chave: null, link: null, erro: 'emissor: resposta_invalida' }
      } else {
        resultado = {
          status: v.status,
          chave: v.chave ? v.chave.slice(0, 120) : null,
          link,
          erro: v.status === 'erro' ? (v.erro ?? 'rejeitado pelo emissor').slice(0, 500) : null,
        }
      }
    }
  } catch {
    // Falha local (ex.: cifra/decifra): sem detalhe, para nunca vazar segredo.
    resultado = { status: 'erro', chave: null, link: null, erro: 'falha_interna_na_emissao' }
  }

  await repo.registrarResultado(pool, lojaId, id, resultado)
  await repo.registrarEvento(pool, {
    lojaId, tipo: 'documento_fiscal.emissao', entidade: 'documento_fiscal', entidadeId: id,
    detalhes: { tipo: entrada.tipo, status: resultado.status, pedido_id: pedido.id, user_id: userId },
  })
  return (await repo.obterDocumento(pool, lojaId, id))!
}

export async function listar(exec: Executor, lojaId: string, q: DocumentosFiscaisBusca) {
  const itens = await repo.listarDocumentos(exec, lojaId, { status: q.status, pedidoId: q.pedido_id, limite: q.limite })
  return { itens }
}

export async function detalhe(exec: Executor, lojaId: string, id: string) {
  const d = await repo.obterDocumento(exec, lojaId, id)
  if (!d) throw naoEncontrado('Documento fiscal nao encontrado')
  return d
}
