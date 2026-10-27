// Regra do console do operador. Sem acesso HTTP aqui; erros de dominio via shared/http_errors.
// O operador enxerga metadado/saude agregada, NUNCA conteudo de loja nem contato. Nenhum dado
// pessoal vai para log/evento (eventos so com ids e papeis).
import { comTransacao, type Pool } from '@whaviso/shared/db'
import { naoEncontrado, proibido, regraNegocio } from '../../shared/http_errors'
import { codificarCursor, decodificarCursor } from './cursor'
import * as repo from './repo'
import * as escrita from './repo_escrita'
import type {
  ContaFicha, ContaResumo, ContasQuery, OperadorAlteracao, OperadorNovo,
} from './schemas'

export interface AtorOperador {
  userId: string
  papel: 'operador' | 'admin'
}

function resumo(l: repo.ContaLinha): ContaResumo {
  return {
    id: l.id,
    nome: l.nome,
    criado_em: l.criado_em,
    situacao: l.situacao,
    qtd_lojas: l.qtd_lojas,
    qtd_lojas_ativas: l.qtd_lojas_ativas,
    saude_whatsapp: l.saude_whatsapp,
  }
}

export function criarServicoPlataformaClientes(pool: Pool) {
  return {
    // --------------------------------------------------------------------- contas (leitura)
    async listarContas(q: ContasQuery) {
      const apos = q.cursor ? decodificarCursor(q.cursor) : null
      const linhas = await repo.listarContas(pool, {
        busca: q.busca ?? null,
        situacao: q.situacao ?? null,
        apos,
        limite: q.limite,
      })
      const pagina = linhas.slice(0, q.limite)
      const ultima = pagina[pagina.length - 1]
      const proximoCursor =
        linhas.length > q.limite && ultima
          ? codificarCursor({ instante: ultima.criado_em, id: ultima.id })
          : null
      return { itens: pagina.map(resumo), proximoCursor }
    },

    async fichaConta(id: string): Promise<ContaFicha> {
      const conta = await repo.obterConta(pool, id)
      if (!conta) throw naoEncontrado('Conta nao encontrada')
      const [lojas, membros, assinatura] = await Promise.all([
        repo.lojasDaConta(pool, id),
        repo.membrosDaConta(pool, id),
        repo.ultimaAssinatura(pool, id),
      ])
      return {
        id: conta.id,
        nome: conta.nome,
        criado_em: conta.criado_em,
        dono_user_id: conta.dono_user_id,
        situacao: conta.situacao,
        saude_whatsapp: conta.saude_whatsapp,
        lojas: lojas.map((l) => ({
          id: l.id,
          nome: l.nome,
          ativo: l.ativo,
          criado_em: l.criado_em,
          numero:
            l.numero_status && l.numero_verificado !== null && l.numero_criado_em
              ? { status: l.numero_status, verificado: l.numero_verificado, criado_em: l.numero_criado_em }
              : null,
        })),
        membros,
        assinatura,
      }
    },

    // --------------------------------------------------------------- operadores (equipe)
    async listarOperadores() {
      return { itens: await repo.listarOperadores(pool) }
    },

    /** Vincula usuario do Auth existente a equipe. Rota ja restrita a admin. */
    async criarOperador(ator: AtorOperador, d: OperadorNovo) {
      return comTransacao(pool, async (tx) => {
        const op = await escrita.inserirOperador(tx, { userId: d.user_id, nome: d.nome, papel: d.papel })
        await escrita.registrarEvento(tx, {
          tipo: 'plataforma.operador_criado',
          entidadeId: op.id,
          detalhes: { por_user_id: ator.userId, papel: op.papel },
        })
        return op
      })
    },

    /** Troca papel e/ou ativa/desativa. Invariante: sempre resta >= 1 admin ativo. */
    async alterarOperador(ator: AtorOperador, id: string, p: OperadorAlteracao) {
      return comTransacao(pool, async (tx) => {
        // Trava os admins ativos: duas desativacoes concorrentes nao zeram a equipe admin.
        const admins = await escrita.travarAdminsAtivos(tx)
        const alvo = await escrita.obterOperadorPorId(tx, id)
        if (!alvo) throw naoEncontrado('Operador nao encontrado')

        // Defesa em profundidade (SEC-041): ninguem se autopromove a admin.
        if (alvo.user_id === ator.userId && p.papel === 'admin' && alvo.papel !== 'admin') {
          throw proibido('Operador nao altera o proprio papel para admin')
        }
        const eraAdminAtivo = alvo.papel === 'admin' && alvo.ativo
        const seraAdminAtivo = (p.papel ?? alvo.papel) === 'admin' && (p.ativo ?? alvo.ativo)
        if (eraAdminAtivo && !seraAdminAtivo && admins.length <= 1) {
          throw regraNegocio('ultimo_admin', 'Deve restar ao menos um admin ativo')
        }

        const novo = await escrita.atualizarOperador(tx, id, p)
        if (!novo) throw naoEncontrado('Operador nao encontrado')
        await escrita.registrarEvento(tx, {
          tipo: 'plataforma.operador_alterado',
          entidadeId: id,
          detalhes: {
            por_user_id: ator.userId,
            papel_de: alvo.papel, papel_para: novo.papel,
            ativo_de: alvo.ativo, ativo_para: novo.ativo,
          },
        })
        return novo
      })
    },
  }
}
