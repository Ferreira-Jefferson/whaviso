// Regra do modulo. Sem acesso HTTP aqui; erros de dominio via shared/http_errors.
// Nenhum dado pessoal (telefone, nome, endereco) e passado a log.
import { z } from 'zod'
import type { Pool } from '@whaviso/shared/db'
import { HttpError, naoEncontrado, regraNegocio } from '../../shared/http_errors'
import type { Cifra } from './cripto'
import * as repo from './repo'
import type { ClienteBusca, ClienteBuscaTelefone, EnderecoNovo, EnderecoPatch } from './schemas'

export interface Ator {
  lojaId: string
  userId: string
}

const CursorSchema = z.tuple([z.string().min(1).max(40), z.uuid()])
const PARECE_TELEFONE = /^[\d\s()+\-.]+$/

function codificarCursor(ts: string, id: string): string {
  return Buffer.from(JSON.stringify([ts, id])).toString('base64url')
}
function decodificarCursor(c: string): { ts: string; id: string } {
  try {
    const [ts, id] = CursorSchema.parse(JSON.parse(Buffer.from(c, 'base64url').toString('utf8')))
    if (Number.isNaN(Date.parse(ts))) throw new Error('ts')
    return { ts, id }
  } catch {
    throw new HttpError(400, 'cursor_invalido', 'Cursor invalido')
  }
}

export function criarServicoClientes(pool: Pool, cifra: Cifra) {
  const mascarar = (cifrado: Buffer | null): string | null =>
    cifrado ? cifra.mascararTelefone(cifra.decifrar(cifrado).toString('utf8')) : null

  const evento = (a: Ator, tipo: string, entidade: string, entidadeId: string) =>
    repo.registrarEvento(pool, { lojaId: a.lojaId, tipo, entidade, entidadeId, userId: a.userId })

  async function existente(a: Ator, id: string) {
    const c = await repo.obter(pool, a.lojaId, id)
    if (!c) throw naoEncontrado('Cliente nao encontrado')
    return c
  }
  async function enderecoDaLoja(a: Ator, id: string) {
    const e = await repo.obterEndereco(pool, a.lojaId, id)
    if (!e) throw naoEncontrado('Endereco nao encontrado')
    return e
  }

  async function pagina(
    a: Ator,
    f: { nome?: string; hash?: string; cursor?: string; limite: number },
  ) {
    const linhas = await repo.listar(pool, a.lojaId, {
      nome: f.nome,
      hash: f.hash,
      cursor: f.cursor ? decodificarCursor(f.cursor) : undefined,
      limite: f.limite,
    })
    const itens = linhas.slice(0, f.limite)
    const ultima = itens[itens.length - 1]
    return {
      itens: itens.map((l) => ({
        id: l.id,
        nome: l.nome,
        telefone_mascarado: mascarar(l.telefone_cifrado),
        pedidos_total: l.pedidos_total,
        ultima_atividade: l.ultima,
      })),
      proximoCursor:
        linhas.length > f.limite && ultima ? codificarCursor(ultima.ultima, ultima.id) : null,
    }
  }

  return {
    /** Busca por nome. Telefone na query string e recusado (iria para o log de acesso). */
    async listar(a: Ator, q: ClienteBusca) {
      if (q.q && PARECE_TELEFONE.test(q.q)) {
        throw regraNegocio(
          'busca_telefone_use_post',
          'Busca por telefone usa POST /clientes/buscar (o numero nao pode ir na URL)',
        )
      }
      return pagina(a, { nome: q.q, cursor: q.cursor, limite: q.limite })
    },

    /** Busca por telefone completo: normaliza e compara o hash (sem parcial). */
    async buscarPorTelefone(a: Ator, b: ClienteBuscaTelefone) {
      const e164 = cifra.normalizarTelefoneBR(b.telefone)
      if (!e164) {
        throw regraNegocio(
          'telefone_invalido',
          'Busca por telefone exige o numero completo; busca parcial so por nome',
        )
      }
      return pagina(a, { hash: cifra.hashTelefone(e164), cursor: b.cursor, limite: b.limite })
    },

    async detalhe(a: Ator, id: string) {
      const c = await existente(a, id)
      const [enderecos, resumo_pedidos] = await Promise.all([
        repo.listarEnderecos(pool, a.lojaId, id),
        repo.resumoPedidos(pool, a.lojaId, id),
      ])
      return {
        id: c.id,
        nome: c.nome,
        telefone_mascarado: mascarar(c.telefone_cifrado),
        criado_em: c.criado_em,
        enderecos,
        resumo_pedidos,
      }
    },

    /** `{ criado: false, id }` quando o telefone ja existe na loja (vira 409 na rota). */
    async criar(a: Ator, entrada: { telefone: string; nome?: string }) {
      const e164 = cifra.normalizarTelefoneBR(entrada.telefone)
      if (!e164) throw regraNegocio('telefone_invalido', 'Telefone invalido')
      const hash = cifra.hashTelefone(e164)
      const novo = await repo.inserirCliente(pool, a.lojaId, {
        hash,
        cifrado: cifra.cifrar(Buffer.from(e164, 'utf8')),
        nome: entrada.nome ?? null,
      })
      if (!novo) {
        const ja = await repo.achaPorHash(pool, a.lojaId, hash)
        return { criado: false as const, id: ja?.id ?? null }
      }
      await evento(a, 'cliente.criado', 'cliente', novo.id)
      return {
        criado: true as const,
        cliente: {
          id: novo.id,
          nome: novo.nome,
          telefone_mascarado: cifra.mascararTelefone(e164),
          criado_em: novo.criado_em,
        },
      }
    },

    async atualizar(a: Ator, id: string, nome: string) {
      const c = await repo.atualizarNome(pool, a.lojaId, id, nome)
      if (!c) throw naoEncontrado('Cliente nao encontrado')
      await evento(a, 'cliente.atualizado', 'cliente', id)
      return {
        id: c.id,
        nome: c.nome,
        telefone_mascarado: mascarar(c.telefone_cifrado),
        criado_em: c.criado_em,
      }
    },

    async revelarTelefone(a: Ator, id: string) {
      const c = await existente(a, id)
      if (!c.telefone_cifrado) throw naoEncontrado('Telefone nao disponivel')
      const telefone = cifra.decifrar(c.telefone_cifrado).toString('utf8')
      await evento(a, 'cliente.telefone_revelado', 'cliente', id)
      return { telefone }
    },

    async listarEnderecos(a: Ator, clienteId: string) {
      await existente(a, clienteId)
      return { itens: await repo.listarEnderecos(pool, a.lojaId, clienteId) }
    },

    async criarEndereco(a: Ator, clienteId: string, e: EnderecoNovo) {
      await existente(a, clienteId)
      const end = await repo.inserirEndereco(pool, a.lojaId, clienteId, e)
      await evento(a, 'endereco.alterado', 'endereco', end.id)
      return end
    },

    async atualizarEndereco(a: Ator, id: string, p: EnderecoPatch) {
      await enderecoDaLoja(a, id)
      const end = await repo.atualizarEndereco(pool, a.lojaId, id, p)
      if (!end) throw regraNegocio('endereco_inativo', 'Endereco desativado nao pode ser editado')
      await evento(a, 'endereco.alterado', 'endereco', id)
      return end
    },

    async desativarEndereco(a: Ator, id: string) {
      await enderecoDaLoja(a, id)
      const end = await repo.desativarEndereco(pool, a.lojaId, id)
      await evento(a, 'endereco.alterado', 'endereco', id)
      return end!
    },

    async ultimoEndereco(a: Ator, clienteId: string) {
      await existente(a, clienteId)
      return { endereco: await repo.ultimoEndereco(pool, a.lojaId, clienteId) }
    },
  }
}

export type ServicoClientes = ReturnType<typeof criarServicoClientes>
