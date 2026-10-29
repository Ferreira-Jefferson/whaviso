// Regras de chaves_api (so admin da plataforma). O valor claro existe somente na resposta da
// criacao: persiste-se apenas prefixo, ultimos4 e o hash sha256. Nunca logar o valor.
import { randomBytes } from 'node:crypto'
import { comTransacao, type Pool } from '@whaviso/shared/db'
import { naoEncontrado, regraNegocio } from '../../shared/http_errors'
import { sha256Hex } from '../../shared/tokens'
import * as repo from './repo'
import type { ChaveApiDTO, NovaChave, SituacaoChave } from './schemas'

const PREFIXO_SEGREDO = 'whv_live_'
/** Quantos caracteres do corpo aleatorio ficam visiveis no prefixo. */
const VISIVEIS_PREFIXO = 4

export interface AtorChave {
  userId: string
}

export function gerarSegredo(): { valor: string; prefixo: string; ultimos4: string; hash: string } {
  const valor = PREFIXO_SEGREDO + randomBytes(32).toString('base64url') // 256 bits de entropia
  return {
    valor,
    prefixo: valor.slice(0, PREFIXO_SEGREDO.length + VISIVEIS_PREFIXO),
    ultimos4: valor.slice(-4),
    hash: sha256Hex(valor),
  }
}

function situacao(l: repo.ChaveLinha): SituacaoChave {
  if (l.revogada_em) return 'revogada'
  return l.expirada ? 'expirada' : 'ativa'
}

function paraDto(l: repo.ChaveLinha): ChaveApiDTO {
  return {
    id: l.id,
    nome: l.nome,
    prefixo: l.prefixo,
    ultimos4: l.ultimos4,
    mascara: `${l.prefixo}...${l.ultimos4}`,
    criado_em: l.criado_em,
    expira_em: l.expira_em,
    revogada_em: l.revogada_em,
    situacao: situacao(l),
  }
}

export function criarServicoChavesApi(pool: Pool) {
  return {
    async listar(contaId: string): Promise<{ itens: ChaveApiDTO[] }> {
      if (!(await repo.contaExiste(pool, contaId))) throw naoEncontrado()
      return { itens: (await repo.listar(pool, contaId)).map(paraDto) }
    },

    async criar(ator: AtorChave, contaId: string, d: NovaChave): Promise<{ chave: ChaveApiDTO; valor: string }> {
      if (d.expira_em && Date.parse(d.expira_em) <= Date.now()) {
        throw regraNegocio('validade_no_passado', 'A validade precisa estar no futuro')
      }
      const seg = gerarSegredo()
      const linha = await comTransacao(pool, async (tx) => {
        if (!(await repo.contaExiste(tx, contaId))) throw naoEncontrado()
        const l = await repo.inserir(tx, {
          contaId, nome: d.nome, prefixo: seg.prefixo, ultimos4: seg.ultimos4, hash: seg.hash,
          expiraEm: d.expira_em ? new Date(d.expira_em).toISOString() : null,
        })
        await repo.registrarEvento(tx, {
          tipo: 'plataforma.chave_api_criada', chaveId: l.id,
          detalhes: { por_user_id: ator.userId, conta_id: contaId, com_validade: l.expira_em !== null },
        })
        return l
      })
      return { chave: paraDto(linha), valor: seg.valor }
    },

    /** Soft: seta revogada_em. Idempotente. */
    async revogar(ator: AtorChave, contaId: string, id: string): Promise<ChaveApiDTO> {
      const linha = await comTransacao(pool, async (tx) => {
        const l = await repo.revogar(tx, contaId, id)
        if (!l) throw naoEncontrado()
        await repo.registrarEvento(tx, {
          tipo: 'plataforma.chave_api_revogada', chaveId: l.id,
          detalhes: { por_user_id: ator.userId, conta_id: contaId },
        })
        return l
      })
      return paraDto(linha)
    },
  }
}
