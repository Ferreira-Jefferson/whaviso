// Servico do modulo plataforma_cobranca (cobranca restaurante -> Whaviso). Sem acesso HTTP aqui;
// erros de dominio via shared/http_errors. Dinheiro sempre em centavos (int). Datas de negocio
// resolvidas em America/Sao_Paulo (hojeSp). A suspensao da loja NAO e escrita aqui: e derivada no
// banco por TRIGGER a partir do status da assinatura (o servico so muda `assinaturas.status`).
// Nenhum dado pessoal vai para log, evento ou auditoria.
import { comTransacao, type Pool } from '@whaviso/shared/db'
import { aprovarDonoPorPagamento } from '../../shared/emails_outbox'
import { hojeSp } from '@whaviso/shared/datas'
import { invalidarCacheTaxas } from '@whaviso/shared/taxas'
import type {
  ApurarAtrasosResultado, AssinaturaDTO, FaturaDTO, FaturaMarcarPaga,
  GerarFaturasResultado, MinhaFaturaDTO, StatusAssinatura,
} from '@whaviso/shared/contracts'
import type {
  AssinaturaCriar, AssinaturaPatch, ConfigTaxaDTO, ConfigTaxaPatch, PlanoCriar, PlanoDTO,
  PlanoPatch, PlanoPublicoDTO,
} from './schemas'
import { conflito, naoEncontrado, regraNegocio } from '../../shared/http_errors'
import * as repo from './repo'
import type { AssinaturaLinha, ConfigTaxaLinha, FaturaLinha, PlanoLinha } from './repo'
import {
  CARENCIA_DIAS_PADRAO, calcularVencimento, deveSuspender, mesCompetenciaDe, transicaoValida,
} from './regras'

/** Ator = operador autenticado (equipe Whaviso). Nunca recebe conta/loja do cliente. */
export interface Ator {
  userId: string
}

/** Evento de transicao de status da assinatura, mapeado a partir do destino. */
const EVENTO_TRANSICAO: Record<StatusAssinatura, string | null> = {
  trial: null,
  ativa: 'assinatura.reativada', // reativacao (saindo de suspensa) ou ativacao (de trial)
  suspensa: 'assinatura.suspensa',
  cancelada: 'assinatura.cancelada',
}

function paraAssinatura(l: AssinaturaLinha): AssinaturaDTO {
  return {
    id: l.id,
    conta_id: l.conta_id,
    loja_id: l.loja_id,
    status: l.status,
    valor_mensal_centavos: l.valor_mensal_centavos,
    dia_vencimento: l.dia_vencimento,
    trial_ate: l.trial_ate,
    inicio_em: l.inicio_em,
    cancelada_em: l.cancelada_em,
    criado_em: l.criado_em,
    atualizado_em: l.atualizado_em,
  }
}

function paraPlano(l: PlanoLinha): PlanoDTO {
  return {
    id: l.id, nome: l.nome, valor_centavos: l.valor_centavos, inclui: l.inclui, ativo: l.ativo,
    taxa_intermediacao_centavos: l.taxa_intermediacao_centavos,
    criado_em: l.criado_em, atualizado_em: l.atualizado_em,
  }
}

/** Projecao de vitrine: campos de marketing + taxa JA RESOLVIDA (override do plano ou o padrao). */
function paraPlanoPublico(l: PlanoLinha, taxaPadrao: number): PlanoPublicoDTO {
  return {
    id: l.id, nome: l.nome, valor_centavos: l.valor_centavos, inclui: l.inclui,
    taxa_intermediacao_centavos: l.taxa_intermediacao_centavos ?? taxaPadrao,
  }
}

function paraConfigTaxa(l: ConfigTaxaLinha): ConfigTaxaDTO {
  return {
    taxa_intermediacao_padrao_centavos: l.taxa_intermediacao_padrao_centavos,
    atualizado_em: l.atualizado_em,
  }
}

function paraFatura(l: FaturaLinha): FaturaDTO {
  return {
    id: l.id,
    assinatura_id: l.assinatura_id,
    conta_id: l.conta_id,
    competencia: l.competencia,
    valor_centavos: l.valor_centavos,
    vencimento: l.vencimento,
    status: l.status,
    pago_em: l.pago_em,
    criado_em: l.criado_em,
    atualizado_em: l.atualizado_em,
  }
}

function paraMinhaFatura(l: FaturaLinha): MinhaFaturaDTO {
  return {
    id: l.id,
    competencia: l.competencia,
    valor_centavos: l.valor_centavos,
    vencimento: l.vencimento,
    status: l.status,
    pago_em: l.pago_em,
  }
}

const VALOR_PADRAO_CENTAVOS = 70000

/** Violacao do indice unico de nome (23505) vira 409; qualquer outro erro segue. */
function traduzirNomeDuplicado(e: unknown): unknown {
  if ((e as { code?: string } | null)?.code === '23505') {
    return conflito('plano_nome_duplicado', 'Ja existe um plano com esse nome')
  }
  return e
}

export function criarServicoCobranca(pool: Pool, carenciaDias: number = CARENCIA_DIAS_PADRAO) {
  /** Plano precisa existir e estar ativo para ser escolhido numa assinatura. */
  async function planoUsavel(id: string): Promise<PlanoLinha> {
    const p = await repo.obterPlano(pool, id)
    if (!p) throw naoEncontrado('Plano nao encontrado')
    if (!p.ativo) throw regraNegocio('plano_inativo', 'O plano escolhido esta inativo')
    return p
  }

  async function criar(_a: Ator, b: AssinaturaCriar): Promise<AssinaturaDTO> {
    const lojaId = b.loja_id ?? null
    if (!(await repo.contaExiste(pool, b.conta_id))) {
      throw naoEncontrado('Conta nao encontrada')
    }
    if (lojaId && !(await repo.lojaDaConta(pool, b.conta_id, lojaId))) {
      // 422 (regra): a loja existe noutra conta ou nao existe; nao confirmamos qual.
      throw regraNegocio('loja_fora_da_conta', 'A loja informada nao pertence a esta conta')
    }
    // Plano escolhido: o valor do plano e COPIADO (congelado) na assinatura, salvo valor manual.
    const plano = b.plano_id ? await planoUsavel(b.plano_id) : null
    const valor = b.valor_mensal_centavos ?? plano?.valor_centavos ?? VALOR_PADRAO_CENTAVOS
    const nova = await comTransacao(pool, async (tx) => {
      const linha = await repo.inserirAssinatura(tx, {
        contaId: b.conta_id,
        lojaId,
        status: b.status,
        planoId: plano?.id ?? null,
        valor,
        diaVencimento: b.dia_vencimento,
        trialAte: b.status === 'trial' ? (b.trial_ate ?? null) : null,
        inicioEm: b.status === 'ativa' ? new Date().toISOString() : null,
      })
      await repo.registrarEvento(tx, {
        tipo: 'assinatura.criada', entidade: 'assinatura', entidadeId: linha!.id, ator: 'operador',
        lojaId, detalhes: { conta_id: b.conta_id, status: b.status, dia_vencimento: b.dia_vencimento },
      })
      return linha!
    })
    return paraAssinatura(nova)
  }

  async function criarPlano(_a: Ator, b: PlanoCriar): Promise<PlanoDTO> {
    try {
      const p = await repo.inserirPlano(pool, {
        nome: b.nome, valor: b.valor_centavos, inclui: b.inclui, ativo: b.ativo,
        taxa: b.taxa_intermediacao_centavos,
      })
      invalidarCacheTaxas()
      return paraPlano(p!)
    } catch (e) {
      throw traduzirNomeDuplicado(e)
    }
  }

  async function listarPlanos(_a: Ator): Promise<PlanoDTO[]> {
    return (await repo.listarPlanos(pool)).map(paraPlano)
  }

  /** Vitrine publica (landing): SO planos ativos; taxa resolvida com o padrao da plataforma. Sem ator. */
  async function listarPlanosPublicos(): Promise<PlanoPublicoDTO[]> {
    const cfg = await repo.obterConfigTaxa(pool)
    const taxaPadrao = cfg?.taxa_intermediacao_padrao_centavos ?? 0
    return (await repo.listarPlanos(pool))
      .filter((p) => p.ativo)
      .map((p) => paraPlanoPublico(p, taxaPadrao))
  }

  async function alterarPlano(_a: Ator, id: string, b: PlanoPatch): Promise<PlanoDTO> {
    // Tri-estado da taxa: chave presente (mesmo com null) = altera; ausente = nao mexe.
    const taxaInformada = 'taxa_intermediacao_centavos' in b
    try {
      const p = await repo.atualizarPlano(pool, id, {
        nome: b.nome ?? null, valor: b.valor_centavos ?? null, inclui: b.inclui ?? null, ativo: b.ativo ?? null,
        taxaInformada, taxa: b.taxa_intermediacao_centavos ?? null,
      })
      if (!p) throw naoEncontrado('Plano nao encontrado')
      if (taxaInformada) invalidarCacheTaxas()
      return paraPlano(p)
    } catch (e) {
      throw traduzirNomeDuplicado(e)
    }
  }

  /** Taxa de intermediacao PADRAO da plataforma (singleton). Semeada na migration 0084. */
  async function obterConfigTaxa(_a: Ator): Promise<ConfigTaxaDTO> {
    const c = await repo.obterConfigTaxa(pool)
    // A linha unica nasce na migration; ausencia so ocorreria se a migration nao rodou.
    if (!c) throw naoEncontrado('Config da plataforma nao encontrada')
    return paraConfigTaxa(c)
  }

  async function alterarConfigTaxa(_a: Ator, b: ConfigTaxaPatch): Promise<ConfigTaxaDTO> {
    const atualizada = await comTransacao(pool, async (tx) => {
      const c = await repo.atualizarConfigTaxa(tx, b.taxa_intermediacao_padrao_centavos)
      if (!c) throw naoEncontrado('Config da plataforma nao encontrada')
      await repo.registrarEvento(tx, {
        tipo: 'taxa.padrao_alterada', entidade: 'config_plataforma', entidadeId: null, ator: 'operador',
        detalhes: { taxa_intermediacao_padrao_centavos: c.taxa_intermediacao_padrao_centavos },
      })
      return c
    })
    invalidarCacheTaxas()
    return paraConfigTaxa(atualizada)
  }

  async function listarAssinaturas(
    _a: Ator,
    f: { contaId?: string; status?: StatusAssinatura },
  ): Promise<AssinaturaDTO[]> {
    return (await repo.listarAssinaturas(pool, f)).map(paraAssinatura)
  }

  async function alterar(_a: Ator, id: string, b: AssinaturaPatch): Promise<AssinaturaDTO> {
    const atual = await repo.obterAssinatura(pool, id)
    if (!atual) throw naoEncontrado('Assinatura nao encontrada')

    const novoStatus = b.status ?? null
    if (novoStatus && !transicaoValida(atual.status, novoStatus)) {
      // SEC: transicao invalida (inclui mexer em assinatura 'cancelada', terminal) -> 409.
      throw conflito('transicao_invalida', `Transicao ${atual.status} -> ${novoStatus} nao e permitida`)
    }

    const plano = b.plano_id ? await planoUsavel(b.plano_id) : null
    const atualizada = await comTransacao(pool, async (tx) => {
      const linha = await repo.atualizarAssinatura(tx, id, atual.status, {
        status: novoStatus,
        planoId: plano?.id ?? null,
        valor: b.valor_mensal_centavos ?? plano?.valor_centavos ?? null,
        diaVencimento: b.dia_vencimento ?? null,
      })
      // null = o status mudou entre a leitura e o UPDATE (corrida): recusa em vez de aplicar cego.
      if (!linha) throw conflito('estado_mudou', 'A assinatura mudou de estado; recarregue e tente de novo')
      if (novoStatus) {
        const tipo = EVENTO_TRANSICAO[novoStatus]
        if (tipo) {
          await repo.registrarEvento(tx, {
            tipo, entidade: 'assinatura', entidadeId: id, ator: 'operador',
            lojaId: linha.loja_id, detalhes: { conta_id: linha.conta_id, de: atual.status, para: novoStatus },
          })
        }
      }
      return linha
    })
    return paraAssinatura(atualizada)
  }

  async function gerarFaturas(_a: Ator, competenciaArg?: string): Promise<GerarFaturasResultado> {
    const competencia = competenciaArg ?? mesCompetenciaDe(hojeSp())
    const ativas = await repo.assinaturasAtivas(pool)
    let geradas = 0
    await comTransacao(pool, async (tx) => {
      for (const a of ativas) {
        const vencimento = calcularVencimento(a.dia_vencimento, competencia)
        const nova = await repo.inserirFaturaSeNova(tx, {
          assinaturaId: a.id,
          contaId: a.conta_id,
          competencia,
          valor: a.valor_mensal_centavos,
          vencimento,
        })
        if (nova) {
          geradas += 1
          await repo.registrarEvento(tx, {
            tipo: 'fatura.emitida', entidade: 'fatura', entidadeId: nova.id, ator: 'sistema',
            lojaId: a.loja_id, detalhes: { assinatura_id: a.id, competencia, vencimento },
          })
        }
      }
    })
    return { competencia, geradas, ja_existiam: ativas.length - geradas }
  }

  async function apurarAtrasos(_a: Ator): Promise<ApurarAtrasosResultado> {
    const hoje = hojeSp()
    return comTransacao(pool, async (tx) => {
      const marcadas = await repo.marcarAtrasadas(tx, hoje)
      for (const f of marcadas) {
        await repo.registrarEvento(tx, {
          tipo: 'fatura.atrasada', entidade: 'fatura', entidadeId: f.id, ator: 'sistema',
          detalhes: { assinatura_id: f.assinatura_id },
        })
      }
      // Reavalia TODAS as assinaturas ativas com atraso (nao so as recem-marcadas): quem passou
      // da carencia e suspenso. A decisao e pura (deveSuspender); o trigger propaga para a loja.
      const atrasos = await repo.atrasosDeAssinaturasAtivas(tx)
      const porAssinatura = new Map<string, { conta_id: string; loja_id: string | null; venc: string[] }>()
      for (const r of atrasos) {
        const g = porAssinatura.get(r.assinatura_id) ?? { conta_id: r.conta_id, loja_id: r.loja_id, venc: [] }
        g.venc.push(r.vencimento)
        porAssinatura.set(r.assinatura_id, g)
      }
      let suspensas = 0
      for (const [assinaturaId, g] of porAssinatura) {
        const faturas = g.venc.map((v) => ({ status: 'atrasada' as const, vencimento: v }))
        if (!deveSuspender(faturas, carenciaDias, hoje)) continue
        const linha = await repo.atualizarAssinatura(tx, assinaturaId, 'ativa', {
          status: 'suspensa', valor: null, diaVencimento: null,
        })
        if (linha) {
          suspensas += 1
          await repo.registrarEvento(tx, {
            tipo: 'assinatura.suspensa', entidade: 'assinatura', entidadeId: assinaturaId, ator: 'sistema',
            lojaId: g.loja_id, detalhes: { conta_id: g.conta_id, motivo: 'atraso', carencia_dias: carenciaDias },
          })
        }
      }
      return { marcadas_atrasadas: marcadas.length, assinaturas_suspensas: suspensas }
    })
  }

  async function marcarPaga(_a: Ator, faturaId: string, b: FaturaMarcarPaga): Promise<FaturaDTO> {
    const paga = await comTransacao(pool, async (tx) => {
      const linha = await repo.marcarFaturaPaga(tx, faturaId)
      if (!linha) {
        const existe = await repo.obterFatura(tx, faturaId)
        if (!existe) throw naoEncontrado('Fatura nao encontrada')
        throw conflito('fatura_estado_invalido', 'So e possivel pagar fatura aberta ou atrasada')
      }
      await repo.registrarEvento(tx, {
        tipo: 'fatura.paga', entidade: 'fatura', entidadeId: linha.id, ator: 'operador',
        detalhes: { assinatura_id: linha.assinatura_id, competencia: linha.competencia },
      })
      // Allowlist de login (0082): a baixa de fatura libera o dono da conta (aprova o e-mail e
      // enfileira o boas-vindas, idempotente). Toda a logica vive no helper compartilhado.
      await aprovarDonoPorPagamento(tx, linha.conta_id)
      // Reativacao SO quando explicitamente pedida E nao resta nenhuma fatura atrasada E a
      // assinatura esta suspensa. Nunca automatica (decisao do operador).
      if (b.reativar) {
        const restantes = await repo.faturasAtrasadasDaAssinatura(tx, linha.assinatura_id)
        if (restantes.length === 0) {
          const assinatura = await repo.obterAssinatura(tx, linha.assinatura_id)
          if (assinatura && assinatura.status === 'suspensa') {
            const reativada = await repo.atualizarAssinatura(tx, assinatura.id, 'suspensa', {
              status: 'ativa', valor: null, diaVencimento: null,
            })
            if (reativada) {
              await repo.registrarEvento(tx, {
                tipo: 'assinatura.reativada', entidade: 'assinatura', entidadeId: assinatura.id,
                ator: 'operador', lojaId: reativada.loja_id,
                detalhes: { conta_id: reativada.conta_id, motivo: 'fatura_paga' },
              })
            }
          }
        }
      }
      return linha
    })
    return paraFatura(paga)
  }

  async function cancelarFatura(_a: Ator, faturaId: string): Promise<FaturaDTO> {
    const cancelada = await comTransacao(pool, async (tx) => {
      const linha = await repo.cancelarFatura(tx, faturaId)
      if (!linha) {
        const existe = await repo.obterFatura(tx, faturaId)
        if (!existe) throw naoEncontrado('Fatura nao encontrada')
        throw conflito('fatura_estado_invalido', 'So e possivel cancelar fatura aberta ou atrasada')
      }
      await repo.registrarEvento(tx, {
        tipo: 'fatura.cancelada', entidade: 'fatura', entidadeId: linha.id, ator: 'operador',
        detalhes: { assinatura_id: linha.assinatura_id, competencia: linha.competencia },
      })
      return linha
    })
    return paraFatura(cancelada)
  }

  async function listarFaturas(
    _a: Ator,
    f: { status?: FaturaDTO['status']; competencia?: string; contaId?: string },
  ): Promise<FaturaDTO[]> {
    return (await repo.listarFaturas(pool, f)).map(paraFatura)
  }

  /** Visao do dono: faturas da PROPRIA conta (conta_id vem do escopo, nunca do cliente). */
  async function minhasFaturas(contaId: string): Promise<MinhaFaturaDTO[]> {
    return (await repo.faturasDaConta(pool, contaId)).map(paraMinhaFatura)
  }

  return {
    criar, listarAssinaturas, alterar, gerarFaturas, apurarAtrasos, marcarPaga, cancelarFatura,
    listarFaturas, minhasFaturas, criarPlano, listarPlanos, listarPlanosPublicos, alterarPlano,
    obterConfigTaxa, alterarConfigTaxa,
  }
}

export type ServicoCobranca = ReturnType<typeof criarServicoCobranca>
