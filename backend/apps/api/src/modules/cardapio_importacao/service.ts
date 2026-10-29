// Regra do modulo cardapio_importacao. Sem acesso HTTP; erros de dominio via shared/http_errors.
// Nada aqui toca a chave de LLM nem chama o provedor (isso e do atendente, AT-importar): a api so
// valida o arquivo, enfileira, expoe/edita o rascunho e, na APROVACAO, devolve o lote a criar no
// cardapio (a importacao nunca escreve nas tabelas do cardapio). A saida do modelo e nao confiavel:
// o rascunho e revalidado contra o schema Zod em toda leitura e antes de aprovar (SEC-060/061).
// Nenhum conteudo de arquivo vai a log; o erro do job e so um codigo com mensagem fixa.
import type { Pool } from '@whaviso/shared/db'
import { transacao } from '@whaviso/shared/db'
import { conflito, HttpError, naoEncontrado, regraNegocio } from '../../shared/http_errors'
import { detectarTipo, hashArquivo } from './arquivo'
import { rascunhoParaLote } from './mapeador'
import * as repo from './repo'
import { IMPORTACAO_ARQUIVO_MAX_BYTES, RascunhoCardapio, type CardapioLote } from './schemas'

export interface Ator {
  lojaId: string
  userId: string
}

/** Janela de idempotencia do duplo envio, timeout de job preso e tentativas maximas. */
const JANELA_DUPLO_ENVIO_MIN = 10
const TIMEOUT_PRESO_MIN = 15
const MAX_TENTATIVAS = 3

/** Mensagens FIXAS por codigo de erro (nunca o texto cru do provedor). */
const MENSAGENS_ERRO: Record<string, string> = {
  llm_sem_visao: 'O modelo configurado nao le imagens. Escolha um modelo com visao.',
  llm_nao_configurada: 'A chave de IA da loja nao esta configurada ou foi desativada.',
  tempo_esgotado: 'A leitura do cardapio demorou demais. Envie o arquivo novamente.',
  extracao_invalida: 'Nao foi possivel ler o cardapio deste arquivo. Tente uma foto mais nitida.',
}
const MENSAGEM_ERRO_GENERICA = 'Nao foi possivel ler o cardapio deste arquivo.'

function mensagemErro(codigo: string | null): string | null {
  if (codigo == null) return null
  return MENSAGENS_ERRO[codigo] ?? MENSAGEM_ERRO_GENERICA
}

function resumo(l: Omit<repo.ImportacaoLinha, 'rascunho'>) {
  return {
    id: l.id,
    status: l.status,
    tipo_arquivo: l.tipo_arquivo,
    tamanho_bytes: l.tamanho_bytes,
    erro: mensagemErro(l.erro),
    criado_em: l.criado_em,
    atualizado_em: l.atualizado_em,
  }
}

/** Rascunho do banco revalidado: saida do modelo nunca e confiada; invalido vira null. */
function rascunhoDe(l: repo.ImportacaoLinha): RascunhoCardapio | null {
  if (l.rascunho == null) return null
  const r = RascunhoCardapio.safeParse(l.rascunho)
  return r.success ? r.data : null
}

const naoSuportado = () =>
  new HttpError(415, 'tipo_arquivo_nao_suportado', 'Envie uma imagem (JPEG, PNG, WebP) ou PDF')

export function criarServicoImportacao(pool: Pool) {
  return {
    /**
     * Enfileira a importacao. Ordem: tamanho (413) -> assinatura (415) -> credencial de LLM (422)
     * -> duplo envio -> insert. Sem credencial ativa nada e enfileirado.
     */
    async criar(a: Ator, arquivoBase64: string) {
      const bytes = Buffer.from(arquivoBase64, 'base64')
      if (bytes.length === 0) throw naoSuportado()
      if (bytes.length > IMPORTACAO_ARQUIVO_MAX_BYTES) {
        throw new HttpError(413, 'arquivo_grande_demais', 'O arquivo passa do limite de 10 MB')
      }
      const tipo = detectarTipo(bytes)
      if (!tipo) throw naoSuportado()
      if (!(await repo.llmAtiva(pool, a.lojaId))) {
        throw regraNegocio('llm_nao_configurada', 'Configure a chave de IA da loja para importar cardapio')
      }
      const hash = hashArquivo(bytes)
      const recente = await repo.recentePorHash(pool, a.lojaId, hash, JANELA_DUPLO_ENVIO_MIN)
      if (recente) return { id: recente.id, status: recente.status, reaproveitada: true }

      const l = await repo.inserir(pool, {
        lojaId: a.lojaId, tipo: tipo.tipo, mime: tipo.mime, bytes, hash, userId: a.userId,
      })
      await repo.registrarEvento(pool, {
        lojaId: a.lojaId, tipo: 'cardapio_importacao.criada', importacaoId: l.id, userId: a.userId,
        detalhes: { tipo_arquivo: tipo.tipo, tamanho_bytes: bytes.length },
      })
      return { id: l.id, status: l.status, reaproveitada: false }
    },

    async listar(a: Ator) {
      await repo.recuperarPresos(pool, a.lojaId, TIMEOUT_PRESO_MIN, MAX_TENTATIVAS)
      const linhas = await repo.listar(pool, a.lojaId)
      return { itens: linhas.map(resumo) }
    },

    async detalhe(a: Ator, id: string) {
      await repo.recuperarPresos(pool, a.lojaId, TIMEOUT_PRESO_MIN, MAX_TENTATIVAS)
      const l = await repo.obter(pool, a.lojaId, id)
      if (!l) throw naoEncontrado('Importacao nao encontrada')
      const rascunho = rascunhoDe(l)
      // Rascunho pronto porem ilegivel (consumidor gravou lixo): trata como falha sanitizada.
      const invalido = l.status === 'rascunho_pronto' && rascunho == null
      return {
        ...resumo(l),
        erro: invalido ? mensagemErro('extracao_invalida') : mensagemErro(l.erro),
        rascunho,
      }
    },

    /** Edicao do rascunho pelo dono (so em `rascunho_pronto`); o schema ja foi validado na borda. */
    async editar(a: Ator, id: string, rascunho: RascunhoCardapio) {
      return transacao(pool, async (tx) => {
        const l = await repo.travar(tx, a.lojaId, id)
        if (!l) throw naoEncontrado('Importacao nao encontrada')
        if (l.status !== 'rascunho_pronto') {
          throw regraNegocio('importacao_nao_editavel', 'So e possivel editar um rascunho pronto')
        }
        await repo.gravarRascunho(tx, a.lojaId, id, rascunho)
        await repo.registrarEvento(tx, {
          lojaId: a.lojaId, tipo: 'cardapio_importacao.editada', importacaoId: id, userId: a.userId,
        })
        const atual = await repo.obter(tx, a.lojaId, id)
        return { ...resumo(atual!), rascunho: rascunhoDe(atual!) }
      })
    },

    /**
     * Aprova: revalida o rascunho, marca `aprovada`, zera o arquivo e devolve o LOTE a criar no
     * cardapio. Reaprovar e 409 (idempotente: nao gera o lote duas vezes).
     */
    async aprovar(a: Ator, id: string): Promise<{ id: string; status: 'aprovada'; lote: CardapioLote }> {
      return transacao(pool, async (tx) => {
        const l = await repo.travar(tx, a.lojaId, id)
        if (!l) throw naoEncontrado('Importacao nao encontrada')
        if (l.status === 'aprovada') throw conflito('importacao_ja_aprovada', 'Esta importacao ja foi aprovada')
        if (l.status !== 'rascunho_pronto') {
          throw regraNegocio('importacao_nao_aprovavel', 'So e possivel aprovar um rascunho pronto')
        }
        const rascunho = rascunhoDe(l)
        if (!rascunho) throw regraNegocio('rascunho_invalido', 'O rascunho esta invalido; edite antes de aprovar')
        if (rascunho.categorias.every((c) => c.itens.length === 0)) {
          throw regraNegocio('rascunho_vazio', 'O rascunho nao tem itens para criar')
        }
        await repo.finalizar(tx, a.lojaId, id, 'aprovada')
        await repo.registrarEvento(tx, {
          lojaId: a.lojaId, tipo: 'cardapio_importacao.aprovada', importacaoId: id, userId: a.userId,
          detalhes: {
            categorias: rascunho.categorias.length,
            itens: rascunho.categorias.reduce((n, c) => n + c.itens.length, 0),
          },
        })
        return { id, status: 'aprovada' as const, lote: rascunhoParaLote(rascunho) }
      })
    },

    /** Descarta (fila, rascunho pronto ou erro) e zera o arquivo. Em processamento: 422. */
    async descartar(a: Ator, id: string) {
      return transacao(pool, async (tx) => {
        const l = await repo.travar(tx, a.lojaId, id)
        if (!l) throw naoEncontrado('Importacao nao encontrada')
        if (l.status === 'descartada') throw conflito('importacao_ja_descartada', 'Esta importacao ja foi descartada')
        if (l.status === 'processando') {
          throw regraNegocio('importacao_em_processamento', 'Aguarde o fim da leitura para descartar')
        }
        if (l.status === 'aprovada') {
          throw regraNegocio('importacao_ja_aprovada', 'Uma importacao aprovada nao pode ser descartada')
        }
        await repo.finalizar(tx, a.lojaId, id, 'descartada')
        await repo.registrarEvento(tx, {
          lojaId: a.lojaId, tipo: 'cardapio_importacao.descartada', importacaoId: id, userId: a.userId,
        })
        return { id, status: 'descartada' as const }
      })
    },
  }
}
