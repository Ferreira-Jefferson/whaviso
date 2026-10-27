// Disponibilidade (liga/desliga, esgotado) e leitura da arvore resolvida. Sem acesso HTTP.
import { comTransacao, type Pool } from '@whaviso/shared/db'
import { fimDoDiaSp, hojeSp } from '@whaviso/shared/datas'
import { naoEncontrado, regraNegocio } from '../../shared/http_errors'
import { montarArvore } from './arvore'
import { estaDisponivel } from './resolvedor'
import { carregarDados, gruposDependentes, obterItem, obterOpcao } from './repo'
import { auditar, gravarItem, gravarOpcao } from './repo_escrita'
import type { CardapioResolvidoSaida, DisponibilidadeEntrada, Impacto } from './schemas'

export interface DisponibilidadeResultado {
  id: string
  ativo: boolean
  esgotado_ate: string | null
  disponivel: boolean
  impactos: Impacto[]
}

/** Resolve o novo `esgotado_ate`: undefined = nao mexe; null = limpa; Date = instante futuro. */
export function resolverEsgotado(e: DisponibilidadeEntrada, agora: Date): Date | null | undefined {
  if (e.esgotado_hoje !== undefined) return e.esgotado_hoje ? fimDoDiaSp(hojeSp(agora)) : null
  if (e.esgotado_ate === undefined) return undefined
  if (e.esgotado_ate === null) return null
  const alvo = new Date(e.esgotado_ate)
  if (alvo.getTime() <= agora.getTime()) {
    throw regraNegocio('esgotado_ate_no_passado', 'O instante de retorno deve estar no futuro')
  }
  return alvo
}

export async function alterarDisponibilidadeItem(
  pool: Pool,
  lojaId: string,
  id: string,
  e: DisponibilidadeEntrada,
  agora: Date = new Date(),
): Promise<DisponibilidadeResultado> {
  const esgotado = resolverEsgotado(e, agora)
  return comTransacao(pool, async (tx) => {
    const atual = await obterItem(tx, lojaId, id)
    if (!atual) throw naoEncontrado()
    const novo = {
      ...atual,
      ativo: e.ativo ?? atual.ativo,
      esgotado_ate: esgotado === undefined ? atual.esgotado_ate : esgotado,
    }
    await gravarItem(tx, lojaId, novo)
    await auditar(tx, lojaId, 'cardapio.disponibilidade_alterada', 'item', id, {
      ativo: novo.ativo,
      esgotado_ate: novo.esgotado_ate ? novo.esgotado_ate.toISOString() : null,
    })
    return {
      id,
      ativo: novo.ativo,
      esgotado_ate: novo.esgotado_ate ? novo.esgotado_ate.toISOString() : null,
      disponivel: estaDisponivel(novo, agora),
      impactos: [],
    }
  })
}

export async function alterarDisponibilidadeOpcao(
  pool: Pool,
  lojaId: string,
  id: string,
  e: DisponibilidadeEntrada,
  agora: Date = new Date(),
): Promise<DisponibilidadeResultado> {
  const esgotado = resolverEsgotado(e, agora)
  return comTransacao(pool, async (tx) => {
    const atual = await obterOpcao(tx, lojaId, id)
    if (!atual) throw naoEncontrado()
    const novo = {
      ...atual,
      ativo: e.ativo ?? atual.ativo,
      esgotado_ate: esgotado === undefined ? atual.esgotado_ate : esgotado,
    }
    await gravarOpcao(tx, lojaId, novo)
    await auditar(tx, lojaId, 'cardapio.disponibilidade_alterada', 'opcao', id, {
      ativo: novo.ativo,
      esgotado_ate: novo.esgotado_ate ? novo.esgotado_ate.toISOString() : null,
    })
    const disponivel = estaDisponivel(novo, agora)
    // Opcao de tamanho fora do ar deixa os add-ons presos a ela inalcancaveis: avisa.
    const impactos = disponivel ? [] : await gruposDependentes(tx, lojaId, [id])
    return {
      id,
      ativo: novo.ativo,
      esgotado_ate: novo.esgotado_ate ? novo.esgotado_ate.toISOString() : null,
      disponivel,
      impactos,
    }
  })
}

export async function cardapioResolvido(
  pool: Pool,
  lojaId: string,
  modo: 'painel' | 'pedivel',
  agora: Date = new Date(),
): Promise<CardapioResolvidoSaida> {
  return montarArvore(await carregarDados(pool, lojaId), agora, modo)
}
