import type { Pool } from '@whaviso/shared/db'
import type {
  BuscarPessoaResposta,
  GrupoPessoa,
  ListaClientesResposta,
  PessoaCombinadosResposta,
  PessoaResumoResposta,
  RenomearClienteResposta,
} from '@whaviso/shared/contracts'
import { naoEncontrado } from '../../shared/http_errors'
import * as repo from './repo'

const PESSOA_INEXISTENTE =
  'Combinado não encontrado, ou ainda sem WhatsApp da outra ponta para agrupar.'

// A4: limiar de inatividade da pessoa (dias). Casa com o default de painel/metricas
// (`inativo_dias`, 60) para a leitura ser coerente entre a visão por pessoa e as métricas.
const INATIVO_DIAS = 60

/**
 * Resumo da pessoa (H15.1/H15.2): resolve o telefone da outra ponta a partir de um
 * combinado do usuário (no servidor, telefone nunca em rota) e devolve os quatro totais.
 */
export async function resumo(
  pool: Pool,
  uid: string,
  avisoId: string,
): Promise<PessoaResumoResposta> {
  const ref = await repo.resolverPessoaPorAviso(pool, uid, avisoId)
  if (!ref) throw naoEncontrado(PESSOA_INEXISTENTE)
  const totais = await repo.totaisPorPessoa(pool, uid, ref.telefone)
  // A4: inativo = já foi cliente (tem última compra), nada ativo a receber agora, e a última
  // venda passou do limiar. Sinal para reativar; nunca marca quem nunca comprou de mim.
  const inativo =
    totais.a_receber_qtd === 0 &&
    totais.dias_desde_ultima_compra !== null &&
    totais.dias_desde_ultima_compra >= INATIVO_DIAS
  return { telefone: ref.telefone, nome_entrada: ref.nome_entrada, ...totais, inativo }
}

/**
 * Combinados da pessoa (H15.3): todos os do mesmo TELEFONE, AGRUPADOS POR NOME no servidor
 * (H15.7). A ordem dos grupos segue a 1ª aparição (a lista já vem por data desc do repo);
 * cada item exibe o nome registrado no próprio combinado (a chave do grupo).
 */
export async function combinados(
  pool: Pool,
  uid: string,
  avisoId: string,
): Promise<PessoaCombinadosResposta> {
  const ref = await repo.resolverPessoaPorAviso(pool, uid, avisoId)
  if (!ref) throw naoEncontrado(PESSOA_INEXISTENTE)
  const linhas = await repo.combinadosPorPessoa(pool, uid, ref.telefone)
  const grupos: GrupoPessoa[] = []
  const indicePorNome = new Map<string, number>()
  for (const { aviso, nome_outra_ponta } of linhas) {
    let i = indicePorNome.get(nome_outra_ponta)
    if (i === undefined) {
      i = grupos.length
      indicePorNome.set(nome_outra_ponta, i)
      grupos.push({ nome: nome_outra_ponta, itens: [] })
    }
    grupos[i]!.itens.push(aviso)
  }
  return { grupos, total: linhas.length }
}

/**
 * E18 H18.4 / E15 H15.8: lista central de clientes (agregada por telefone). Marca `inativo`
 * pelo mesmo critério do resumo (A4): sem nada ativo a receber E última venda além do limiar.
 */
export async function listarClientes(pool: Pool, uid: string): Promise<ListaClientesResposta> {
  const linhas = await repo.listarClientes(pool, uid)
  const itens = linhas.map((c) => ({
    ...c,
    inativo:
      c.a_receber_qtd === 0 &&
      c.dias_desde_ultima_compra !== null &&
      c.dias_desde_ultima_compra >= INATIVO_DIAS,
  }))
  return { itens, total: itens.length }
}

/**
 * E15 H15.8: renomeia o cliente. Resolve o telefone da outra ponta NO SERVIDOR a partir do
 * avisoId (nunca telefone em rota/log, H15.7) e reescreve `nome_devedor` em todos os meus
 * combinados daquele telefone onde sou cobrador. Edição livre (dado interno de exibição).
 */
export async function renomearCliente(
  pool: Pool,
  uid: string,
  avisoId: string,
  nome: string,
): Promise<RenomearClienteResposta> {
  const ref = await repo.resolverPessoaPorAviso(pool, uid, avisoId)
  if (!ref) throw naoEncontrado(PESSOA_INEXISTENTE)
  const afetados = await repo.renomearNomeDevedor(pool, uid, ref.telefone, nome)
  return { telefone: ref.telefone, nome, afetados }
}

/** Autocomplete de pessoa ao criar (H15.6): sugestões por prefixo de telefone. */
export async function buscarPorTelefone(
  pool: Pool,
  uid: string,
  prefixo: string,
): Promise<BuscarPessoaResposta> {
  const itens = await repo.buscarPorPrefixoTelefone(pool, uid, prefixo)
  return { itens }
}
