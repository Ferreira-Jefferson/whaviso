// Rotulos do modulo fluxo (so apresentacao). O catalogo do servidor traz rotulos sem acento; aqui
// ficam as versoes em pt-BR. Tipo desconhecido cai no rotulo do servidor.
import type { FluxoErroCodigo, FluxoVersaoStatus } from '@/shared/contracts/_generated/fluxo'
import { ApiError } from '@/shared/api_client'

export const ROTULO_TIPO_NODE: Record<string, string> = {
  saudacao: 'Saudação',
  pedir_categoria: 'Escolher categoria',
  montar_pedido: 'Montar pedido',
  confirmar: 'Confirmar pedido',
  endereco: 'Endereço de entrega',
  pagamento: 'Pagamento',
  acompanhar: 'Acompanhar pedido',
}

export function rotuloNode(tipo: string, rotuloServidor?: string): string {
  return ROTULO_TIPO_NODE[tipo] ?? rotuloServidor ?? tipo
}

export const ROTULO_HANDLE: Record<string, string> = {
  proximo: 'Seguir',
  repetir: 'Repetir',
  encerrar: 'Encerrar',
  mais: 'Adicionar mais',
  voltar: 'Alterar pedido',
}

export const ROTULO_CONFIG: Record<string, string> = {
  mensagem: 'Mensagem',
  max_tentativas: 'Máximo de tentativas',
  permitir_observacao: 'Permitir observação do cliente',
  max_itens: 'Máximo de itens por pedido',
  metodos: 'Formas de pagamento aceitas',
}

export const ROTULO_OPCAO: Record<string, string> = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão' }

export const ROTULO_VERSAO: Record<FluxoVersaoStatus, string> = {
  rascunho: 'Rascunho',
  publicada: 'Publicada',
  arquivada: 'Arquivada',
}

export const TOM_VERSAO: Record<FluxoVersaoStatus, 'atencao' | 'sucesso' | 'neutro'> = {
  rascunho: 'atencao',
  publicada: 'sucesso',
  arquivada: 'neutro',
}

export const ROTULO_PROBLEMA: Record<FluxoErroCodigo, string> = {
  limite_excedido: 'Limite do fluxo excedido',
  id_duplicado: 'Identificador repetido',
  no_desconhecido: 'Etapa de tipo desconhecido',
  config_invalida: 'Configuração inválida',
  aresta_invalida: 'Ligação inválida',
  sem_inicio: 'Sem etapa inicial',
  no_inalcancavel: 'Etapa que nunca é alcançada',
  sem_saida: 'Etapa sem saída',
  ciclo_sem_saida: 'Ciclo sem saída',
  no_obrigatorio_ausente: 'Etapa obrigatória ausente',
  acao_irreversivel_sem_confirmacao: 'Ação sem confirmação antes',
}

export function mensagemErro(e: unknown, padrao: string): string {
  if (!(e instanceof ApiError)) return padrao
  if (e.status === 409) return 'Outra pessoa alterou este rascunho. Recarregue o fluxo para ver a versão mais nova.'
  if (e.status === 403) return 'Só dono e gerente podem alterar o fluxo.'
  if (e.code === 'grafo_invalido') return 'O fluxo tem problemas e não pôde ser publicado. Veja a lista abaixo.'
  return e.message || padrao
}
