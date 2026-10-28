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
  auto_emitir: false,
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
    auto_emitir: m.auto_emitir,
    ultimos4: m.ultimos4,
    criado_em: m.criado_em,
    atualizado_em: m.atualizado_em,
  }
}

/** Regime define qual situacao tributaria o item carrega: CSOSN (Simples/MEI) ou CST (normal). */
function usaCsosn(regime: repo.ConfigMeta['regime']): boolean {
  return regime === 'mei' || regime === 'simples_nacional'
}

type ItemComFiscal = repo.ItemPedidoFiscal
type ItemEmissao = EmitirFiscalEntrada['pedido']['itens'][number]

/**
 * Monta os itens para o emissor. Para NFC-e, cada item PRECISA do dado fiscal (NCM, CFOP, origem,
 * unidade e a situacao tributaria do regime): os incompletos sao devolvidos em `faltando` (por nome)
 * e a emissao e barrada antes de chamar o emissor. Para NFS-e, o item e so o resumo (sem dado por
 * item): o emissor trata o pedido como um servico unico.
 */
function montarItens(
  tipo: TipoDocumentoFiscal,
  regime: repo.ConfigMeta['regime'],
  itens: ItemComFiscal[],
): { itens: ItemEmissao[]; faltando: string[] } {
  if (tipo === 'nfse') {
    return {
      itens: itens.map((i) => ({
        descricao: i.nome.slice(0, 200),
        quantidade: i.quantidade,
        valorUnitarioCentavos: i.unitario,
        valorTotalCentavos: i.total,
      })),
      faltando: [],
    }
  }
  const faltando: string[] = []
  const prontos: ItemEmissao[] = []
  for (const i of itens) {
    const situacao = usaCsosn(regime) ? i.csosn : i.cst
    const completo = i.ncm != null && i.cfop != null && i.origem != null && i.unidade != null && situacao != null
    if (!completo) {
      faltando.push(i.nome.slice(0, 80))
      continue
    }
    prontos.push({
      descricao: i.nome.slice(0, 200),
      quantidade: i.quantidade,
      valorUnitarioCentavos: i.unitario,
      valorTotalCentavos: i.total,
      ncm: i.ncm!,
      cfop: i.cfop!,
      origem: i.origem!,
      unidade: i.unidade!,
      situacaoTributaria: situacao!,
    })
  }
  return { itens: prontos, faltando }
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
  const itens = await repo.itensDoPedidoComFiscal(pool, lojaId, pedido.id)
  if (itens.length === 0) throw regraNegocio('pedido_sem_itens', 'Pedido sem itens nao pode gerar documento fiscal')

  // Dado fiscal por item (NFC-e): barra ANTES de reservar/chamar o emissor, listando os pendentes.
  const { itens: itensEmissao, faltando } = montarItens(entrada.tipo, cfg.regime, itens)
  if (faltando.length > 0) {
    const lista = faltando.slice(0, 10).join(', ')
    const resto = faltando.length > 10 ? ` (+${faltando.length - 10})` : ''
    throw regraNegocio(
      'itens_sem_dado_fiscal',
      `Cadastre os dados fiscais (NCM, CFOP, origem, unidade e situacao tributaria) destes itens antes de emitir: ${lista}${resto}`,
    )
  }

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
        itens: itensEmissao,
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

// ---- Dados fiscais por item (catalogo) ---------------------------------------------------------

/** Um item esta "completo" quando carrega o dado minimo para a NFC-e no regime da loja. */
function itemCompleto(l: repo.ItemFiscalLinha, regime: repo.ConfigMeta['regime'] | null): boolean {
  const base = l.ncm != null && l.cfop != null && l.origem != null && l.unidade != null
  if (!base) return false
  // Sem regime definido ainda: aceita qualquer situacao cadastrada; com regime, exige a correta.
  if (regime == null) return l.csosn != null || l.cst != null
  return (usaCsosn(regime) ? l.csosn : l.cst) != null
}

function linhaFiscalDto(l: repo.ItemFiscalLinha, regime: repo.ConfigMeta['regime'] | null) {
  return {
    item_id: l.item_id,
    nome: l.nome,
    categoria_nome: l.categoria_nome,
    ativo: l.ativo,
    ncm: l.ncm,
    cfop: l.cfop,
    origem: l.origem,
    unidade: l.unidade,
    csosn: l.csosn,
    cst: l.cst,
    completo: itemCompleto(l, regime),
  }
}

export async function listarItensFiscais(exec: Executor, lojaId: string) {
  const cfg = await repo.obterConfig(exec, lojaId)
  const regime = cfg?.regime ?? null
  const linhas = await repo.listarItensComFiscal(exec, lojaId)
  return { itens: linhas.map((l) => linhaFiscalDto(l, regime)) }
}

export async function definirItemFiscal(
  pool: Pool,
  lojaId: string,
  itemId: string,
  e: { ncm: string; cfop: string; origem: number; unidade: string; csosn?: string | null; cst?: string | null },
) {
  const linha = await comTransacao(pool, async (tx) => {
    if (!(await repo.itemPertenceALoja(tx, lojaId, itemId))) {
      throw naoEncontrado('Item do catalogo nao encontrado')
    }
    const atualizada = await repo.upsertItemFiscal(tx, lojaId, itemId, {
      ncm: e.ncm,
      cfop: e.cfop,
      origem: e.origem,
      unidade: e.unidade,
      csosn: e.csosn ?? null,
      cst: e.cst ?? null,
    })
    await repo.registrarEvento(tx, {
      lojaId, tipo: 'item_fiscal.definido', entidade: 'item_fiscal', entidadeId: itemId, detalhes: { item_id: itemId },
    })
    return atualizada!
  })
  const cfg = await repo.obterConfig(pool, lojaId)
  return linhaFiscalDto(linha, cfg?.regime ?? null)
}

// ---- Pedidos elegiveis + emissao automatica ----------------------------------------------------

export async function pedidosEmissiveis(exec: Executor, lojaId: string, limite: number) {
  const itens = await repo.pedidosEmissiveis(exec, lojaId, limite)
  return { itens }
}

/**
 * Emissao automatica em lote: emite NFC-e para os pedidos concluidos sem documento, quando a loja
 * ativou `auto_emitir`. Idempotente (a reserva por pedido+tipo barra duplicata) e tolerante a erro
 * (um pedido com dado fiscal faltando nao derruba os demais). Acionada pelo painel ou por um
 * agendador externo chamando o endpoint; nao importa o modulo pedidos.
 */
export async function emitirAuto(
  pool: Pool,
  deps: DepsFiscal,
  lojaId: string,
  userId: string,
  limite = 50,
): Promise<{ emitidos: number; com_erro: number; pulados: number }> {
  const cfg = await repo.obterConfig(pool, lojaId)
  if (!cfg || !cfg.ativo) {
    throw regraNegocio('fiscal_nao_configurado', 'Configure o emissor fiscal da loja antes de emitir')
  }
  if (!cfg.auto_emitir) {
    throw regraNegocio('auto_emissao_desligada', 'Ative a emissao automatica na configuracao para usar este recurso')
  }
  const pedidos = await repo.pedidosEmissiveis(pool, lojaId, limite)
  let emitidos = 0
  let comErro = 0
  let pulados = 0
  for (const p of pedidos) {
    try {
      const doc = await emitir(pool, deps, lojaId, userId, { pedido_id: p.pedido_id, tipo: 'nfce' })
      if (doc.status === 'emitido' || doc.status === 'pendente') emitidos++
      else comErro++
    } catch {
      // Dado fiscal faltando, corrida (409) ou falha pontual: segue para o proximo pedido.
      pulados++
    }
  }
  return { emitidos, com_erro: comErro, pulados }
}
