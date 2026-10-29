// Regras do modulo acessos: le e edita a grade GLOBAL (papel x permissao). Papeis sao fixos;
// `admin` (console) e `dono` (loja) sao sempre tudo e nao editaveis; `acessos:gerir` nao e
// delegavel (anti-lockout). Cada save audita (so ids/chaves) e invalida o cache da grade.
import { comTransacao, type Pool } from '@whaviso/shared/db'
import { naoEncontrado, regraNegocio } from '../../shared/http_errors'
import {
  PAPEIS_CONSOLE,
  PAPEIS_LOJA,
  PAPEL_FIXO,
  SO_PAPEL_FIXO,
  PERMISSOES,
  garantirGradeFresca,
  papelPermite,
  permite,
  recarregarGrade,
  CANAL_GRADE,
  type EscopoAcesso,
} from '../../shared/tenant'
import * as repo from './repo'
import type { EscopoLoja } from '@whaviso/shared/contracts'
import type { AcessosSaida, CelulaPatch, MinhasPermissoesSaida } from './schemas'

export interface AtorAcessos {
  userId: string
}

const PAPEIS: Record<EscopoAcesso, readonly string[]> = { console: PAPEIS_CONSOLE, loja: PAPEIS_LOJA }

export function criarServicoAcessos(pool: Pool) {
  return {
    /** Catalogo + grade efetiva (o que os guards decidem), relida do banco. */
    async listar(): Promise<AcessosSaida> {
      await recarregarGrade()
      const catalogo = await repo.listarPermissoes(pool)
      const grade: AcessosSaida['grade'] = []
      for (const p of catalogo) {
        for (const papel of PAPEIS[p.escopo]) {
          grade.push({ escopo: p.escopo, papel, permissao: p.chave, permitido: permite(p.escopo, papel, p.chave) })
        }
      }
      return {
        permissoes: catalogo.map((p) => ({ ...p, travada: SO_PAPEL_FIXO.includes(p.chave) })),
        papeis: { console: [...PAPEIS_CONSOLE], loja: [...PAPEIS_LOJA] },
        fixos: { console: PAPEL_FIXO.console!, loja: PAPEL_FIXO.loja! },
        grade,
      }
    },

    /**
     * O que o usuario logado pode em cada loja do escopo (grade viva). So para a UI nao mentir (esconder o
     * que o servidor negaria); quem decide continua sendo o guard de cada rota.
     */
    async minhasPermissoes(escopo: EscopoLoja): Promise<MinhasPermissoesSaida> {
      await garantirGradeFresca()
      const por_loja: MinhasPermissoesSaida['por_loja'] = {}
      for (const lojaId of escopo.loja_ids) {
        const papel = escopo.papel_por_loja[lojaId]
        por_loja[lojaId] = papel ? PERMISSOES.filter((c) => papelPermite(papel, c)) : []
      }
      return { por_loja }
    },

    async alterar(ator: AtorAcessos, d: CelulaPatch): Promise<CelulaPatch> {
      const catalogo = await repo.listarPermissoes(pool)
      const perm = catalogo.find((p) => p.chave === d.permissao)
      if (!perm) throw naoEncontrado('Permissao nao encontrada')
      if (perm.escopo !== d.escopo) throw regraNegocio('escopo_invalido', 'Permissao de outro escopo')
      if (!PAPEIS[d.escopo].includes(d.papel)) throw regraNegocio('papel_invalido', 'Papel invalido')
      if (d.papel === PAPEL_FIXO[d.escopo]) {
        throw regraNegocio('papel_fixo', 'Este papel sempre tem todas as permissoes e nao e editavel')
      }
      if (d.permitido && SO_PAPEL_FIXO.includes(d.permissao)) {
        throw regraNegocio('permissao_travada', 'Esta permissao nao pode ser delegada')
      }
      const antes = permite(d.escopo, d.papel, d.permissao)
      await comTransacao(pool, async (tx) => {
        await repo.gravarCelula(tx, { ...d, userId: ator.userId })
        await repo.registrarEvento(tx, {
          tipo: 'plataforma.acesso_alterado',
          detalhes: {
            por_user_id: ator.userId, escopo: d.escopo, papel: d.papel,
            permissao: d.permissao, de: antes, para: d.permitido,
          },
        })
        // Todas as instancias da api invalidam o cache ao receber (efeito imediato, sem TTL).
        await repo.notificarGrade(tx, CANAL_GRADE)
      })
      // Invalida o cache deste processo ja (as demais recebem o NOTIFY emitido no commit).
      await recarregarGrade()
      return d
    },
  }
}
