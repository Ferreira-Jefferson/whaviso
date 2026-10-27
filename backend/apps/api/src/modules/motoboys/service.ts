// Regra do modulo motoboys. Sem acesso HTTP aqui; erros de dominio via shared/http_errors.
// Pix e telefone sao PII: nunca vao a log nem a evento; a saida traz so mascara (ultimos 4) e o
// claro do Pix so em `revelarPix` (dono/gerente). Dinheiro em centavos; totais sempre derivados.
import { comTransacao, ErroBanco, type Executor, type Pool } from '@whaviso/shared/db'
import { hojeSp } from '@whaviso/shared/datas'
import { conflito, naoEncontrado, regraNegocio } from '../../shared/http_errors'
import type { Cifra } from './cripto'
import { hashPix, normalizarPix, normalizarPlaca, ultimos4 } from './protecao'
import * as repo from './repo'
import * as escrita from './repo_escrita'
import type {
  FechamentoDiaDto, FechamentoLinhaDto, LancamentoDto, LancamentoNovo, MotoboyDto, MotoboyNovo,
  MotoboyPatch, MotoboyResumoPeriodoDto, MotoboySeletorDto,
} from './schemas'

export interface Ator {
  lojaId: string
  userId: string
}

/** Janela maxima do resumo por periodo (dias corridos, inclusive). */
export const RESUMO_MAX_DIAS = 92

const DIA_MS = 86_400_000
const diaParaMs = (d: string): number => Date.parse(`${d}T00:00:00Z`)

export function criarServicoMotoboys(pool: Pool, cifra: Cifra) {
  const evento = (
    exec: Executor, a: Ator, tipo: string, entidade: string, entidadeId: string,
    detalhes: Record<string, unknown> = {},
  ) =>
    escrita.registrarEvento(exec, {
      lojaId: a.lojaId, tipo, entidade, entidadeId, detalhes: { user_id: a.userId, ...detalhes },
    })

  /** Ultimos 4 caracteres do valor decifrado (telefone E.164 ou chave Pix normalizada); nunca o valor. */
  const mascara = (cifrado: Buffer | null): string | null => {
    if (!cifrado) return null
    try {
      return ultimos4(cifra.decifrar(cifrado).toString('utf8'))
    } catch {
      return null
    }
  }

  const saida = (m: repo.MotoboyLinha): MotoboyDto => ({
    id: m.id,
    pessoa_id: m.pessoa_id,
    nome: m.nome,
    telefone_ultimos4: mascara(m.telefone_cifrado),
    veiculo: m.veiculo,
    placa: m.placa,
    pix_tipo: m.pix_tipo,
    pix_ultimos4: mascara(m.pix_cifrado),
    ativo: m.ativo,
    criado_em: m.criado_em,
    atualizado_em: m.atualizado_em,
  })

  async function existente(a: Ator, id: string): Promise<repo.MotoboyLinha> {
    const m = await repo.obterMotoboy(pool, a.lojaId, id)
    if (!m) throw naoEncontrado('Motoboy nao encontrado')
    return m
  }

  /** Pix valido do tipo informado -> campos prontos para gravar (hash + cifra). */
  function protegerPix(tipo: Parameters<typeof normalizarPix>[0], bruto: string) {
    const norm = normalizarPix(tipo, bruto, cifra)
    if (!norm) throw regraNegocio('pix_invalido', 'Chave Pix invalida para o tipo informado')
    return { tipo, hash: hashPix(tipo, norm), cifrado: cifra.cifrar(Buffer.from(norm, 'utf8')) }
  }

  function placaValida(bruto: string): string {
    const p = normalizarPlaca(bruto)
    if (!p) throw regraNegocio('placa_invalida', 'Placa invalida (formato antigo ou Mercosul)')
    return p
  }

  /** Linhas do fechamento com os lancamentos do dia agrupados por motoboy. */
  function montarLinhas(
    linhas: repo.FechamentoLinhaDb[], lancs: repo.LancamentoDb[],
  ): FechamentoLinhaDto[] {
    return linhas.map((l) => ({
      id: l.id,
      motoboy_id: l.motoboy_id,
      motoboy_nome: l.motoboy_nome,
      data: l.data,
      status: l.status,
      pago_em: l.pago_em,
      qtd_entregas: l.qtd_entregas,
      entregas_centavos: l.entregas_centavos,
      ajustes_centavos: l.ajustes_centavos,
      total_centavos: l.entregas_centavos + l.ajustes_centavos,
      lancamentos: lancs
        .filter((x) => x.motoboy_id === l.motoboy_id)
        .map<LancamentoDto>((x) => ({
          id: x.id, data: x.data, tipo: x.tipo, pedido_id: x.pedido_id,
          valor_centavos: x.valor_centavos, descricao: x.descricao, criado_em: x.criado_em,
        })),
    }))
  }

  async function linhaPorId(a: Ator, id: string): Promise<FechamentoLinhaDto> {
    const l = await repo.fechamentoPorId(pool, a.lojaId, id)
    if (!l) throw naoEncontrado('Fechamento nao encontrado')
    const lancs = await repo.lancamentosDoDia(pool, a.lojaId, l.data)
    return montarLinhas([l], lancs)[0]!
  }

  return {
    async listar(a: Ator, incluirInativos: boolean) {
      const linhas = await repo.listarMotoboys(pool, a.lojaId, incluirInativos)
      return { itens: linhas.map(saida) }
    },

    /** Listagem leve para o seletor de despacho: sem telefone, placa nem Pix. */
    async seletor(a: Ator, incluirInativos: boolean): Promise<{ itens: MotoboySeletorDto[] }> {
      const linhas = await repo.listarMotoboys(pool, a.lojaId, incluirInativos)
      return {
        itens: linhas.map((m) => ({ id: m.id, nome: m.nome, veiculo: m.veiculo, ativo: m.ativo })),
      }
    },

    async obter(a: Ator, id: string) {
      return saida(await existente(a, id))
    },

    async criar(a: Ator, e: MotoboyNovo) {
      const pessoa = await repo.pessoaDaLoja(pool, a.lojaId, e.pessoa_id)
      if (!pessoa) throw naoEncontrado('Pessoa nao encontrada')
      if (pessoa.cargo_chave !== 'motoboy') {
        throw regraNegocio('pessoa_nao_motoboy', 'A pessoa nao tem o cargo motoboy')
      }
      if (!pessoa.ativo) throw regraNegocio('pessoa_inativa', 'A pessoa esta inativa')
      if (await repo.motoboyDaPessoa(pool, a.lojaId, pessoa.id)) {
        throw conflito('motoboy_ja_cadastrado', 'Esta pessoa ja tem cadastro de motoboy')
      }
      const placa = e.placa !== undefined ? placaValida(e.placa) : null
      const pix = e.pix_tipo !== undefined && e.pix !== undefined ? protegerPix(e.pix_tipo, e.pix) : null
      try {
        const id = await comTransacao(pool, async (tx) => {
          const novo = await escrita.inserirMotoboy(tx, a.lojaId, {
            pessoaId: pessoa.id,
            nome: pessoa.nome,
            veiculo: e.veiculo ?? 'moto',
            placa,
            pixTipo: pix?.tipo ?? null,
            pixHash: pix?.hash ?? null,
            pixCifrado: pix?.cifrado ?? null,
          })
          await evento(tx, a, 'motoboy.criado', 'motoboy', novo, { pessoa_id: pessoa.id })
          return novo
        })
        return saida(await existente(a, id))
      } catch (err) {
        if (err instanceof ErroBanco && err.tipo === 'unique') {
          throw conflito('motoboy_ja_cadastrado', 'Esta pessoa ja tem cadastro de motoboy')
        }
        throw err
      }
    },

    async atualizar(a: Ator, id: string, p: MotoboyPatch) {
      await existente(a, id)
      const pix =
        p.pix_tipo === undefined || p.pix === undefined
          ? undefined
          : p.pix_tipo === null || p.pix === null
            ? null
            : protegerPix(p.pix_tipo, p.pix)
      const placa = p.placa === undefined ? undefined : p.placa === null ? null : placaValida(p.placa)
      const campos = [
        p.veiculo !== undefined && 'veiculo', p.placa !== undefined && 'placa', pix !== undefined && 'pix',
      ].filter(Boolean)
      await comTransacao(pool, async (tx) => {
        await escrita.atualizarMotoboy(tx, a.lojaId, id, { veiculo: p.veiculo, placa, pix })
        await evento(tx, a, 'motoboy.atualizado', 'motoboy', id, { campos })
      })
      return saida(await existente(a, id))
    },

    async alterarAtivo(a: Ator, id: string, ativar: boolean) {
      const m = await existente(a, id)
      if (m.ativo === ativar) {
        throw conflito(ativar ? 'motoboy_ja_ativo' : 'motoboy_ja_inativo',
          ativar ? 'Motoboy ja esta ativo' : 'Motoboy ja esta inativo')
      }
      if (ativar && m.pessoa_ativa === false) {
        throw regraNegocio('pessoa_inativa', 'A pessoa esta inativa; reative-a em pessoas')
      }
      await comTransacao(pool, async (tx) => {
        await escrita.definirAtivo(tx, a.lojaId, id, ativar)
        await evento(tx, a, ativar ? 'motoboy.ativado' : 'motoboy.desativado', 'motoboy', id)
      })
      return saida(await existente(a, id))
    },

    /** Chave Pix decifrada, so para pagar (dono/gerente na rota). Auditado SEM o valor. */
    async revelarPix(a: Ator, id: string) {
      await existente(a, id)
      const r = await repo.pixDoMotoboy(pool, a.lojaId, id)
      if (!r?.pix_cifrado || !r.pix_tipo) {
        throw regraNegocio('pix_nao_cadastrado', 'Motoboy sem chave Pix cadastrada')
      }
      const pix = cifra.decifrar(r.pix_cifrado).toString('utf8')
      await evento(pool, a, 'motoboy.pix_revelado', 'motoboy', id)
      return { pix_tipo: r.pix_tipo, pix }
    },

    /** Ajuste manual append-only (valor com sinal). Dia ja pago = 409: lance no dia corrente. */
    async lancamentoManual(a: Ator, motoboyId: string, e: LancamentoNovo): Promise<LancamentoDto> {
      await existente(a, motoboyId)
      const hoje = hojeSp()
      const data = e.data ?? hoje
      if (data > hoje) throw regraNegocio('data_futura', 'A data do lancamento nao pode ser futura')
      const id = await comTransacao(pool, async (tx) => {
        const status = await escrita.travarFechamentoDoDia(tx, a.lojaId, motoboyId, data)
        if (status === 'pago') {
          throw conflito('dia_ja_pago', 'Dia ja pago: faca o lancamento no dia corrente')
        }
        const novo = await escrita.inserirLancamentoManual(tx, {
          lojaId: a.lojaId, motoboyId, data, valorCentavos: e.valor_centavos,
          descricao: e.descricao, userId: a.userId,
        })
        await evento(tx, a, 'motoboy.lancamento_manual', 'motoboy', motoboyId, {
          lancamento_id: novo, data, valor_centavos: e.valor_centavos,
        })
        return novo
      })
      return {
        id, data, tipo: 'ajuste', pedido_id: null, valor_centavos: e.valor_centavos,
        descricao: e.descricao, criado_em: new Date().toISOString(),
      }
    },

    /** Fechamento do dia: materializa as entregas, abre as linhas e devolve o total DERIVADO. */
    async fechamentoDia(a: Ator, dataEntrada?: string): Promise<FechamentoDiaDto> {
      const data = dataEntrada ?? hojeSp()
      await comTransacao(pool, async (tx) => {
        await escrita.materializarEntregas(tx, a.lojaId, data)
        await escrita.garantirFechamentos(tx, a.lojaId, data)
      })
      const [linhas, lancs] = await Promise.all([
        repo.fechamentosDoDia(pool, a.lojaId, data),
        repo.lancamentosDoDia(pool, a.lojaId, data),
      ])
      const montadas = montarLinhas(linhas, lancs)
      return {
        data,
        total_centavos: montadas.reduce((s, l) => s + l.total_centavos, 0),
        linhas: montadas,
      }
    },

    /** Marca o dia como pago. Idempotente; recusa se o total mudou desde o que o dono viu. */
    async pagar(a: Ator, id: string, totalVisto: number): Promise<FechamentoLinhaDto> {
      await comTransacao(pool, async (tx) => {
        const f = await escrita.travarFechamento(tx, a.lojaId, id)
        if (!f) throw naoEncontrado('Fechamento nao encontrado')
        if (f.status === 'pago') return
        const l = await repo.fechamentoPorId(tx, a.lojaId, id)
        if (l!.entregas_centavos + l!.ajustes_centavos !== totalVisto) {
          throw conflito('total_divergente', 'O total do dia mudou; revise antes de pagar')
        }
        await escrita.marcarPago(tx, a.lojaId, id, a.userId)
        await evento(tx, a, 'fechamento.pago', 'fechamento', id, { total_centavos: totalVisto })
      })
      return linhaPorId(a, id)
    },

    /** Total por motoboy entre datas (read-only; nao materializa). */
    async resumo(a: Ator, de: string, ate: string): Promise<MotoboyResumoPeriodoDto> {
      const dias = (diaParaMs(ate) - diaParaMs(de)) / DIA_MS + 1
      if (dias < 1) throw regraNegocio('periodo_invalido', 'A data final nao pode ser anterior a inicial')
      if (dias > RESUMO_MAX_DIAS) {
        throw regraNegocio('periodo_invalido', `Periodo maximo de ${RESUMO_MAX_DIAS} dias`)
      }
      const linhas = await repo.resumoPorPeriodo(pool, a.lojaId, de, ate)
      const itens = linhas.map((l) => ({
        ...l, total_centavos: l.entregas_centavos + l.ajustes_centavos,
      }))
      return { de, ate, total_centavos: itens.reduce((s, i) => s + i.total_centavos, 0), itens }
    },
  }
}
