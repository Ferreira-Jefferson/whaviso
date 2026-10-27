// Regra do funil de aquisicao. Sem HTTP aqui; erros de dominio via shared/http_errors. Nenhum
// dado pessoal (telefone, e-mail, nome) e passado a log nem a `eventos`. O telefone do prospecto e
// PII de terceiro: so hash + cifra no banco, mascarado nas listagens, claro apenas no detalhe.
import { comTransacao, type Pool } from '@whaviso/shared/db'
import { fimDoDiaSp, hojeSp } from '@whaviso/shared/datas'
import type { EstagioProspecto } from '@whaviso/shared/contracts'
import { conflito, naoEncontrado, proibido, regraNegocio } from '../../shared/http_errors'
import type { Cifra } from './cripto'
import {
  codificarCursor,
  decodificarCursor,
  descricaoDeConclusao,
  imitaConclusao,
  lerDescricao,
  validarTransicaoManual,
  validarVinculo,
} from './estagios'
import {
  agenda as agendaRepo,
  atividadesDoProspecto,
  contaExiste,
  followUpConcluido,
  listarProspectos,
  obterAtividade,
  obterProspecto,
  operadorAtivoPorId,
  operadorAtivoPorUsuario,
  prospectoDaConta,
  prospectoPorHash,
  quadro as quadroRepo,
  travarProspecto,
  type AtividadeLinha,
  type ProspectoLinha,
} from './repo'
import {
  atualizarEstagio,
  atualizarProspecto,
  inserirAtividade,
  inserirProspecto,
  registrarEvento,
  travarConta,
  travarHash,
  vincularConta,
} from './repo_escrita'
import type {
  AtividadeDto,
  AtividadeNova,
  ProspectoAtualizacao,
  ProspectoDetalheDto,
  ProspectoDto,
  ProspectoFiltros,
  ProspectoNovo,
} from './schemas'

/** Operador que age (resolvido do JWT, nunca do corpo). `id` = operadores.id. */
export interface Ator {
  operadorId: string
}

const ESTAGIOS: readonly EstagioProspecto[] = ['novo', 'contato', 'proposta', 'ativo', 'perdido']
const RE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RE_INT = /^\d{1,18}$/

/** Cursor de keyset valido (t = timestamp com microssegundos, id = uuid ou inteiro) ou 422. */
function lerCursor(cursor: string | undefined, formatoId: RegExp): { t: string; id: string } | undefined {
  if (cursor === undefined) return undefined
  const o = decodificarCursor(cursor)
  const t = o?.['t']
  const id = o?.['id']
  if (typeof t !== 'string' || typeof id !== 'string' || !RE_ISO.test(t) || !formatoId.test(id)) {
    throw regraNegocio('cursor_invalido', 'Cursor invalido')
  }
  return { t, id }
}

/** Soma `dias` a uma data de negocio 'YYYY-MM-DD' (meio-dia UTC evita virada por fuso). */
function somarDias(dataIso: string, dias: number): string {
  const d = new Date(`${dataIso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export function criarServicoFunil(pool: Pool, cifra: Cifra) {
  const mascarar = (cifrado: Buffer | null): string | null =>
    cifrado ? cifra.mascararTelefone(cifra.decifrar(cifrado).toString('utf8')) : null

  function dto(p: ProspectoLinha): ProspectoDto {
    return {
      id: p.id,
      nome_restaurante: p.nome_restaurante,
      contato_nome: p.contato_nome,
      contato_telefone_mascarado: mascarar(p.contato_telefone_cifrado),
      contato_email: p.contato_email,
      cidade: p.cidade,
      origem: p.origem,
      estagio: p.estagio,
      responsavel_operador_id: p.responsavel_operador_id,
      responsavel_nome: p.responsavel_nome,
      conta_id: p.conta_id,
      conta_nome: p.conta_nome,
      observacoes: p.observacoes,
      criado_em: p.criado_em,
      atualizado_em: p.atualizado_em,
    }
  }

  function dtoAtividade(a: AtividadeLinha): AtividadeDto {
    const { concluiId, texto } = lerDescricao(a.descricao)
    return {
      id: Number(a.id),
      prospecto_id: a.prospecto_id,
      operador_id: a.operador_id,
      operador_nome: a.operador_nome,
      tipo: a.tipo,
      descricao: texto,
      agendada_para: a.agendada_para,
      conclui_atividade_id: concluiId,
      criado_em: a.criado_em,
    }
  }

  /** Telefone -> {hash, cifra} sobre o E.164 normalizado. Invalido vira 422. */
  function prepararTelefone(telefone: string): { hash: string; cifrado: Buffer } {
    const e164 = cifra.normalizarTelefoneBR(telefone)
    if (!e164) throw regraNegocio('telefone_invalido', 'Telefone invalido')
    return { hash: cifra.hashTelefone(e164), cifrado: cifra.cifrar(Buffer.from(e164, 'utf8')) }
  }

  async function exigirResponsavel(id: string) {
    if (!(await operadorAtivoPorId(pool, id))) {
      throw regraNegocio('responsavel_invalido', 'Responsavel inexistente ou inativo')
    }
  }

  async function existente(id: string) {
    const p = await obterProspecto(pool, id)
    if (!p) throw naoEncontrado('Prospecto nao encontrado')
    return p
  }

  async function detalhe(id: string): Promise<ProspectoDetalheDto> {
    const p = await existente(id)
    const claro = p.contato_telefone_cifrado
      ? cifra.decifrar(p.contato_telefone_cifrado).toString('utf8')
      : null
    return { ...dto(p), contato_telefone: claro }
  }

  /** Pagina generica: `linhas` veio com limite+1; corta e monta o proximo cursor. */
  function paginar<L extends { id: string; cursor_t: string }, S>(
    linhas: L[],
    limite: number,
    mapear: (l: L) => S,
  ) {
    const temMais = linhas.length > limite
    const itens = temMais ? linhas.slice(0, limite) : linhas
    const ultimo = itens[itens.length - 1]
    return {
      itens: itens.map(mapear),
      proximoCursor: temMais && ultimo ? codificarCursor({ t: ultimo.cursor_t, id: ultimo.id }) : null,
    }
  }

  return {
    /** Resolve o operador ativo do JWT. Falha fechada: sem operador ativo, 403. */
    async resolverAtor(userId: string): Promise<Ator> {
      const o = await operadorAtivoPorUsuario(pool, userId)
      if (!o) throw proibido('Acesso restrito a operadores da plataforma')
      return { operadorId: o.id }
    },

    async listar(f: ProspectoFiltros) {
      const apos = lerCursor(f.cursor, RE_UUID)
      const linhas = await listarProspectos(pool, {
        estagio: f.estagio,
        responsavelId: f.responsavel_id,
        cidade: f.cidade,
        q: f.q,
        apos,
        limite: f.limite,
      })
      return paginar(linhas, f.limite, dto)
    },

    detalhe,

    async criar(a: Ator, e: ProspectoNovo) {
      const tel = e.contato_telefone ? prepararTelefone(e.contato_telefone) : null
      if (e.responsavel_operador_id) await exigirResponsavel(e.responsavel_operador_id)
      const id = await comTransacao(pool, async (tx) => {
        if (tel) {
          await travarHash(tx, tel.hash)
          const dup = await prospectoPorHash(tx, tel.hash)
          if (dup) throw conflito('prospecto_duplicado', `Prospecto ja cadastrado (id ${dup})`)
        }
        const novo = await inserirProspecto(tx, {
          nome: e.nome_restaurante,
          contatoNome: e.contato_nome ?? null,
          hash: tel?.hash ?? null,
          cifrado: tel?.cifrado ?? null,
          email: e.contato_email ?? null,
          cidade: e.cidade ?? null,
          origem: e.origem ?? null,
          observacoes: e.observacoes ?? null,
          responsavelId: e.responsavel_operador_id ?? a.operadorId,
        })
        if (!novo) throw regraNegocio('prospecto_nao_criado', 'Nao foi possivel criar o prospecto')
        await registrarEvento(tx, {
          tipo: 'prospecto.criado',
          prospectoId: novo.id,
          detalhes: { operador_id: a.operadorId, estagio: 'novo' },
        })
        return novo.id
      })
      return detalhe(id)
    },

    async atualizar(_a: Ator, id: string, p: ProspectoAtualizacao) {
      await existente(id)
      if (p.responsavel_operador_id) await exigirResponsavel(p.responsavel_operador_id)
      let telefone: { hash: string; cifrado: Buffer } | null | undefined
      if (p.contato_telefone === null) telefone = null
      else if (p.contato_telefone !== undefined) telefone = prepararTelefone(p.contato_telefone)
      await comTransacao(pool, async (tx) => {
        if (telefone) {
          await travarHash(tx, telefone.hash)
          const dup = await prospectoPorHash(tx, telefone.hash, id)
          if (dup) throw conflito('prospecto_duplicado', `Prospecto ja cadastrado (id ${dup})`)
        }
        const ok = await atualizarProspecto(tx, id, {
          nome: p.nome_restaurante,
          contatoNome: p.contato_nome,
          telefone,
          email: p.contato_email,
          cidade: p.cidade,
          origem: p.origem,
          observacoes: p.observacoes,
          responsavelId: p.responsavel_operador_id,
        })
        if (!ok) throw naoEncontrado('Prospecto nao encontrado')
      })
      return detalhe(id)
    },

    async mudarEstagio(a: Ator, id: string, para: EstagioProspecto, motivo?: string) {
      await comTransacao(pool, async (tx) => {
        const atual = await travarProspecto(tx, id)
        if (!atual) throw naoEncontrado('Prospecto nao encontrado')
        const v = validarTransicaoManual(atual.estagio, para)
        if (!v.ok) throw regraNegocio(v.code, v.message)
        await atualizarEstagio(tx, id, para)
        await inserirAtividade(tx, {
          prospectoId: id,
          operadorId: a.operadorId,
          tipo: 'nota',
          descricao: `Estágio: ${atual.estagio} -> ${para}${motivo ? `. Motivo: ${motivo}` : ''}`,
          agendadaPara: null,
        })
        await registrarEvento(tx, {
          tipo: 'prospecto.estagio_alterado',
          prospectoId: id,
          detalhes: { operador_id: a.operadorId, de: atual.estagio, para },
        })
      })
      return detalhe(id)
    },

    async vincularConta(a: Ator, id: string, contaId: string) {
      if (!(await contaExiste(pool, contaId))) {
        throw regraNegocio('conta_inexistente', 'Conta inexistente')
      }
      await comTransacao(pool, async (tx) => {
        await travarConta(tx, contaId)
        const atual = await travarProspecto(tx, id)
        if (!atual) throw naoEncontrado('Prospecto nao encontrado')
        const v = validarVinculo(atual.estagio)
        if (!v.ok) throw regraNegocio(v.code, v.message)
        const outro = await prospectoDaConta(tx, contaId)
        if (outro) throw conflito('conta_ja_vinculada', 'Conta ja vinculada a outro prospecto')
        await vincularConta(tx, id, contaId)
        await inserirAtividade(tx, {
          prospectoId: id,
          operadorId: a.operadorId,
          tipo: 'nota',
          descricao: `Estágio: ${atual.estagio} -> ativo. Conta vinculada`,
          agendadaPara: null,
        })
        await registrarEvento(tx, {
          tipo: 'prospecto.vinculado',
          prospectoId: id,
          detalhes: { operador_id: a.operadorId, conta_id: contaId, de: atual.estagio },
        })
      })
      return detalhe(id)
    },

    async listarAtividades(id: string, cursor: string | undefined, limite: number) {
      await existente(id)
      const apos = lerCursor(cursor, RE_INT)
      const linhas = await atividadesDoProspecto(pool, id, apos, limite)
      return paginar(linhas, limite, dtoAtividade)
    },

    async criarAtividade(a: Ator, id: string, e: AtividadeNova) {
      let descricao: string | null = e.descricao ?? null
      if (e.conclui_atividade_id === undefined && descricao && imitaConclusao(descricao)) {
        throw regraNegocio('descricao_invalida', 'Descricao invalida')
      }
      const novoId = await comTransacao(pool, async (tx) => {
        if (!(await travarProspecto(tx, id))) throw naoEncontrado('Prospecto nao encontrado')
        if (e.conclui_atividade_id !== undefined) {
          const alvo = await obterAtividade(tx, id, e.conclui_atividade_id)
          if (!alvo || alvo.tipo !== 'follow_up' || !alvo.agendada_para) {
            throw regraNegocio('followup_invalido', 'Follow-up inexistente neste prospecto')
          }
          if (await followUpConcluido(tx, id, e.conclui_atividade_id)) {
            throw regraNegocio('followup_ja_concluido', 'Follow-up ja concluido')
          }
          descricao = descricaoDeConclusao(e.conclui_atividade_id, e.descricao)
        }
        const nova = await inserirAtividade(tx, {
          prospectoId: id,
          operadorId: a.operadorId,
          tipo: e.tipo,
          descricao,
          agendadaPara: e.agendada_para ?? null,
        })
        if (!nova) throw regraNegocio('atividade_nao_criada', 'Nao foi possivel registrar a atividade')
        return nova.id
      })
      // Recompoe com o join do operador (uma linha, a mais recente).
      const pagina = await atividadesDoProspecto(pool, id, undefined, 50)
      const criada = pagina.find((l) => l.id === novoId)
      if (!criada) throw naoEncontrado('Atividade nao encontrada')
      return dtoAtividade(criada)
    },

    async agenda(a: Ator, q: { dias: number; responsavel_id?: string; todos?: 'true' | 'false' }) {
      // Limite = fim do dia (America/Sao_Paulo) de hoje + N dias; atrasados entram sempre.
      const limite = fimDoDiaSp(somarDias(hojeSp(), q.dias))
      const responsavelId = q.todos === 'true' ? null : (q.responsavel_id ?? a.operadorId)
      const linhas = await agendaRepo(pool, { limite, responsavelId })
      return {
        itens: linhas.map((l) => {
          const { texto } = lerDescricao(l.descricao)
          return {
            atividade_id: Number(l.atividade_id),
            prospecto_id: l.prospecto_id,
            nome_restaurante: l.nome_restaurante,
            estagio: l.estagio,
            responsavel_operador_id: l.responsavel_operador_id,
            descricao: texto,
            agendada_para: l.agendada_para,
            atrasado: l.atrasado,
          }
        }),
      }
    },

    async quadro(limitePorEstagio: number) {
      const linhas = await quadroRepo(pool, limitePorEstagio)
      return {
        colunas: ESTAGIOS.map((estagio) => {
          const doEstagio = linhas.filter((l) => l.estagio === estagio)
          return { estagio, total: doEstagio[0]?.total ?? 0, itens: doEstagio.map(dto) }
        }),
      }
    },
  }
}

export type ServicoFunil = ReturnType<typeof criarServicoFunil>
