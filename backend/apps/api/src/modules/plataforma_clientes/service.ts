// Regra do console do operador. Sem acesso HTTP aqui; erros de dominio via shared/http_errors.
// O operador enxerga metadado/saude agregada, NUNCA conteudo de loja nem contato. Nenhum dado
// pessoal vai para log/evento (eventos so com ids e papeis).
import { comTransacao, type Pool } from '@whaviso/shared/db'
import { conflito, naoEncontrado, proibido, regraNegocio } from '../../shared/http_errors'
import { codificarCursor, decodificarCursor } from './cursor'
import * as repo from './repo'
import * as escrita from './repo_escrita'
import type {
  ContaFicha, ContaResumo, ContasQuery, MetodoLogin, NovoCliente, OperadorAlteracao, OperadorDTO, OperadorNovo,
} from './schemas'

const MSG_SEM_ACESSO = 'Esta pessoa ainda não acessou o Whaviso. Peça para ela entrar uma vez e tente de novo.'

/** Metodo de login a partir dos provedores do Auth (google > whatsapp/phone > email). */
function metodoDe(provedores: string[]): MetodoLogin | null {
  if (provedores.includes('google')) return 'google'
  if (provedores.includes('phone')) return 'whatsapp'
  if (provedores.includes('email')) return 'email'
  return null
}

function comAuth(o: repo.OperadorLinha, info: repo.AuthInfo | undefined): OperadorDTO {
  return { ...o, email: info?.email ?? null, metodo: info ? metodoDe(info.provedores) : null }
}

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
      const ops = await repo.listarOperadores(pool)
      const info = await repo.authInfoDeUsuarios(pool, ops.map((o) => o.user_id))
      return { itens: ops.map((o) => comAuth(o, info.get(o.user_id))) }
    },

    /** Vincula a equipe o usuario do Auth com este e-mail. Rota ja restrita a admin. */
    async criarOperador(ator: AtorOperador, d: OperadorNovo): Promise<OperadorDTO> {
      const userId = await repo.userIdPorEmail(pool, d.email)
      if (!userId) throw regraNegocio('usuario_sem_acesso', MSG_SEM_ACESSO)
      const op = await comTransacao(pool, async (tx) => {
        const op = await escrita.inserirOperador(tx, { userId, nome: d.nome, papel: d.papel })
        await escrita.registrarEvento(tx, {
          tipo: 'plataforma.operador_criado',
          entidadeId: op.id,
          detalhes: { por_user_id: ator.userId, papel: op.papel },
        })
        return op
      })
      const info = await repo.authInfoDeUsuarios(pool, [userId])
      return comAuth(op, info.get(userId))
    },

    /** Troca papel e/ou ativa/desativa. Invariante: sempre resta >= 1 admin ativo. */
    async alterarOperador(ator: AtorOperador, id: string, p: OperadorAlteracao): Promise<OperadorDTO> {
      const novo = await comTransacao(pool, async (tx) => {
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
      const info = await repo.authInfoDeUsuarios(pool, [novo.user_id])
      return comAuth(novo, info.get(novo.user_id))
    },

    // ------------------------------------------------------------ provisionamento de cliente
    /**
     * Cria conta + primeira loja + dono para um restaurante cliente. O dono e resolvido por e-mail
     * no Auth (precisa ja ter entrado uma vez). Cruza por banco, sem importar outro modulo; o
     * bootstrap (conta + membro dono) espelha o de `conta`, com a loja inicial junto.
     */
    async provisionarCliente(ator: AtorOperador, d: NovoCliente) {
      const donoId = await repo.userIdPorEmail(pool, d.email_dono)
      if (!donoId) throw regraNegocio('usuario_sem_acesso', MSG_SEM_ACESSO)
      return comTransacao(pool, async (tx) => {
        await escrita.travarUsuario(tx, donoId)
        if (await repo.usuarioTemVinculo(tx, donoId)) {
          throw conflito('ja_possui_conta', 'Esta pessoa já pertence a uma conta no Whaviso.')
        }
        const r = await escrita.inserirContaCliente(tx, { donoUserId: donoId, nomeRestaurante: d.nome_restaurante })
        await escrita.registrarEvento(tx, {
          tipo: 'plataforma.cliente_provisionado',
          entidade: 'conta',
          entidadeId: r.contaId,
          detalhes: { por_user_id: ator.userId, loja_id: r.lojaId },
        })
        return { conta_id: r.contaId, loja_id: r.lojaId }
      })
    },
  }
}
