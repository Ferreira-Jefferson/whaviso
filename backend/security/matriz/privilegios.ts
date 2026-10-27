// Matriz de privilegio como DADO (SEC-021, 022, 030, 031, 032, 033 + excecao de templates).
//
// Cada linha e um caso: (role, tabela, coluna?, operacao, esperado). O executor
// (test/matriz_privilegios.test.ts) gera um `it` por linha. Tabela/coluna novas entram na
// verificacao acrescentando uma linha aqui, nunca mexendo no executor.
//
// Fonte da verdade dos grants: backend/supabase/migrations/0001..0012. Se um grant mudar, a
// matriz tem que mudar junto (e o revisor Opus confere contra docs/pivot/BANCO.md e SEGURANCA.md).
import type { Role } from '../helpers/db_roles'

export type Operacao = 'select' | 'insert' | 'update' | 'delete'
export type Esperado = 'permitido' | 'negado'

export interface LinhaMatriz {
  role: Role
  tabela: string
  /** Coluna especifica (grant por coluna); ausente = privilegio no nivel da tabela. */
  coluna?: string
  operacao: Operacao
  esperado: Esperado
  /** id SEC que esta linha cobre (vai para o titulo do caso). */
  sec: string
  nota?: string
}

// ---------------------------------------------------------------------------------------------
// Catalogo de tabelas conhecidas de `public`. O teste de completude compara ESTE conjunto com
// o que existe no banco: uma tabela nova (migration) que nao esteja aqui FALHA o gate, forcando
// uma decisao explicita de privilegio antes do merge. `apiDelete` encoda SEC-030: whaviso_api
// nao tem DELETE em nenhuma tabela de negocio/auditoria, exceto `templates` (config).
// ---------------------------------------------------------------------------------------------
export const TABELAS_CONHECIDAS: Readonly<Record<string, { apiDelete: Esperado }>> = {
  assinaturas: { apiDelete: 'negado' },
  base_conhecimento: { apiDelete: 'negado' },
  cache_semantico: { apiDelete: 'negado' },
  caixas: { apiDelete: 'negado' },
  cargos: { apiDelete: 'negado' },
  categoria_grupos: { apiDelete: 'negado' },
  categorias: { apiDelete: 'negado' },
  cliente_consentimento: { apiDelete: 'negado' },
  clientes: { apiDelete: 'negado' },
  comanda_itens: { apiDelete: 'negado' },
  comandas: { apiDelete: 'negado' },
  contas: { apiDelete: 'negado' },
  conversas: { apiDelete: 'negado' },
  convites: { apiDelete: 'negado' },
  corridas: { apiDelete: 'negado' },
  credenciais_llm: { apiDelete: 'negado' },
  enderecos: { apiDelete: 'negado' },
  envios: { apiDelete: 'negado' },
  escalas: { apiDelete: 'negado' },
  eventos: { apiDelete: 'negado' },
  eventos_auth: { apiDelete: 'negado' },
  excecoes_disponibilidade: { apiDelete: 'negado' },
  faturas: { apiDelete: 'negado' },
  fechamentos: { apiDelete: 'negado' },
  fichas_tecnicas: { apiDelete: 'negado' },
  grupos_opcoes: { apiDelete: 'negado' },
  horarios_funcionamento: { apiDelete: 'negado' },
  insumos: { apiDelete: 'negado' },
  item_grupos: { apiDelete: 'negado' },
  itens: { apiDelete: 'negado' },
  itens_pedido: { apiDelete: 'negado' },
  itens_pedido_opcoes: { apiDelete: 'negado' },
  janela_atendente: { apiDelete: 'negado' },
  loja_pix: { apiDelete: 'negado' },
  lojas: { apiDelete: 'negado' },
  membros: { apiDelete: 'negado' },
  mensagens: { apiDelete: 'negado' },
  mesas: { apiDelete: 'negado' },
  motoboy_lancamentos: { apiDelete: 'negado' },
  motoboys: { apiDelete: 'negado' },
  movimentos_caixa: { apiDelete: 'negado' },
  movimentos_insumo: { apiDelete: 'negado' },
  movimentos_item_estoque: { apiDelete: 'negado' },
  numeros_whatsapp: { apiDelete: 'negado' },
  opcoes: { apiDelete: 'negado' },
  operadores: { apiDelete: 'negado' },
  pagamentos: { apiDelete: 'negado' },
  pedidos: { apiDelete: 'negado' },
  pessoas: { apiDelete: 'negado' },
  prospecto_atividades: { apiDelete: 'negado' },
  prospectos: { apiDelete: 'negado' },
  // Unica excecao documentada (SEC-030): templates e configuracao, nao auditoria.
  templates: { apiDelete: 'permitido' },
  uso_llm: { apiDelete: 'negado' },
  webhook_eventos_processados: { apiDelete: 'negado' },
  zonas_entrega: { apiDelete: 'negado' },
} as const

/** Tabelas em que whaviso_api PODE dar DELETE (lista fixa; SEC-030 falha se crescer). */
export const EXCECOES_DELETE_API: readonly string[] = Object.entries(TABELAS_CONHECIDAS)
  .filter(([, v]) => v.apiDelete === 'permitido')
  .map(([t]) => t)

/** SEC-030: para TODA tabela conhecida, whaviso_api delete = negado, exceto as excecoes. */
export function matrizDeleteApi(): LinhaMatriz[] {
  return Object.entries(TABELAS_CONHECIDAS).map(([tabela, cfg]) => ({
    role: 'whaviso_api',
    tabela,
    operacao: 'delete',
    esperado: cfg.apiDelete,
    sec: 'SEC-030',
    nota: cfg.apiDelete === 'permitido' ? 'excecao: templates e config' : undefined,
  }))
}

// ---------------------------------------------------------------------------------------------
// Casos especificos por coluna/operacao. Cada negacao tem seu espelho de permissao (o ator
// legitimo passa), para o verde nao vir de um ambiente quebrado.
// ---------------------------------------------------------------------------------------------
export const CASOS_ESPECIFICOS: readonly LinhaMatriz[] = [
  // SEC-021 / SEC-022: credenciais_llm.chave_cifrada e write-only para a api; so o atendente le.
  { role: 'whaviso_api', tabela: 'credenciais_llm', coluna: 'chave_cifrada', operacao: 'select', esperado: 'negado', sec: 'SEC-021' },
  { role: 'whaviso_api', tabela: 'credenciais_llm', coluna: 'chave_cifrada', operacao: 'insert', esperado: 'permitido', sec: 'SEC-021', nota: 'write-only: api grava a cifra' },
  { role: 'whaviso_api', tabela: 'credenciais_llm', coluna: 'chave_cifrada', operacao: 'update', esperado: 'permitido', sec: 'SEC-021', nota: 'write-only: api rotaciona a cifra' },
  { role: 'whaviso_api', tabela: 'credenciais_llm', coluna: 'provedor', operacao: 'select', esperado: 'permitido', sec: 'SEC-021', nota: 'metadado liberado' },
  { role: 'whaviso_zap', tabela: 'credenciais_llm', coluna: 'chave_cifrada', operacao: 'select', esperado: 'negado', sec: 'SEC-022' },
  { role: 'whaviso_zap', tabela: 'credenciais_llm', coluna: 'provedor', operacao: 'select', esperado: 'negado', sec: 'SEC-022', nota: 'zap nao tem grant algum na tabela' },
  { role: 'whaviso_atendente', tabela: 'credenciais_llm', coluna: 'chave_cifrada', operacao: 'select', esperado: 'permitido', sec: 'SEC-022', nota: 'unico role que le a chave' },
  { role: 'whaviso_atendente', tabela: 'credenciais_llm', coluna: 'provedor', operacao: 'select', esperado: 'permitido', sec: 'SEC-022' },
  { role: 'whaviso_atendente', tabela: 'credenciais_llm', coluna: 'ativo', operacao: 'update', esperado: 'negado', sec: 'SEC-022', nota: 'atendente so le; nao escreve credencial' },

  // SEC-022 / SEC-032: numeros_whatsapp.token_cifrado. zap le (precisa enviar), atendente nao.
  { role: 'whaviso_zap', tabela: 'numeros_whatsapp', coluna: 'token_cifrado', operacao: 'select', esperado: 'permitido', sec: 'SEC-022' },
  { role: 'whaviso_atendente', tabela: 'numeros_whatsapp', coluna: 'token_cifrado', operacao: 'select', esperado: 'negado', sec: 'SEC-032' },
  { role: 'whaviso_atendente', tabela: 'numeros_whatsapp', coluna: 'phone_number_id', operacao: 'select', esperado: 'permitido', sec: 'SEC-032', nota: 'metadado de roteamento' },
  { role: 'whaviso_api', tabela: 'numeros_whatsapp', coluna: 'token_cifrado', operacao: 'select', esperado: 'permitido', sec: 'SEC-022', nota: 'api e dona do cadastro' },

  // SEC-031: whaviso_zap so escreve as colunas do outbox / saude da conexao.
  { role: 'whaviso_zap', tabela: 'envios', coluna: 'status', operacao: 'update', esperado: 'permitido', sec: 'SEC-031' },
  { role: 'whaviso_zap', tabela: 'envios', coluna: 'enviado_em', operacao: 'update', esperado: 'permitido', sec: 'SEC-031' },
  { role: 'whaviso_zap', tabela: 'envios', coluna: 'wamid', operacao: 'update', esperado: 'permitido', sec: 'SEC-031' },
  { role: 'whaviso_zap', tabela: 'envios', coluna: 'loja_id', operacao: 'update', esperado: 'negado', sec: 'SEC-031', nota: 'fora do conjunto do outbox' },
  { role: 'whaviso_zap', tabela: 'envios', coluna: 'template_chave', operacao: 'update', esperado: 'negado', sec: 'SEC-031' },
  { role: 'whaviso_zap', tabela: 'envios', operacao: 'insert', esperado: 'negado', sec: 'SEC-031', nota: 'quem enfileira e a api/atendente' },
  { role: 'whaviso_zap', tabela: 'numeros_whatsapp', coluna: 'status', operacao: 'update', esperado: 'permitido', sec: 'SEC-031', nota: 'saude da conexao' },
  { role: 'whaviso_zap', tabela: 'numeros_whatsapp', coluna: 'verificado', operacao: 'update', esperado: 'permitido', sec: 'SEC-031' },
  { role: 'whaviso_zap', tabela: 'numeros_whatsapp', coluna: 'loja_id', operacao: 'update', esperado: 'negado', sec: 'SEC-031' },
  { role: 'whaviso_api', tabela: 'envios', coluna: 'loja_id', operacao: 'update', esperado: 'permitido', sec: 'SEC-031', nota: 'api tem update pleno (espelho)' },

  // SEC-032: whaviso_atendente fora de billing/plataforma e da chave Pix da loja.
  { role: 'whaviso_atendente', tabela: 'assinaturas', operacao: 'select', esperado: 'negado', sec: 'SEC-032' },
  { role: 'whaviso_atendente', tabela: 'faturas', operacao: 'select', esperado: 'negado', sec: 'SEC-032' },
  { role: 'whaviso_atendente', tabela: 'operadores', operacao: 'select', esperado: 'negado', sec: 'SEC-032' },
  { role: 'whaviso_atendente', tabela: 'prospectos', operacao: 'select', esperado: 'negado', sec: 'SEC-032' },
  { role: 'whaviso_atendente', tabela: 'prospecto_atividades', operacao: 'select', esperado: 'negado', sec: 'SEC-032' },
  // loja_pix hoje NAO tem grant para atendente (o acesso ao BR Code sera habilitado no modulo
  // de pagamentos, com revisao Opus). Enquanto isso, a negacao e o estado correto.
  { role: 'whaviso_atendente', tabela: 'loja_pix', coluna: 'chave_cifrada', operacao: 'select', esperado: 'negado', sec: 'SEC-032', nota: 'BR Code ainda nao habilitado para atendente' },
  // Espelhos de permissao: o escopo legitimo do atendente passa.
  { role: 'whaviso_atendente', tabela: 'itens', operacao: 'select', esperado: 'permitido', sec: 'SEC-032', nota: 'cardapio' },
  { role: 'whaviso_atendente', tabela: 'clientes', operacao: 'select', esperado: 'permitido', sec: 'SEC-032' },
  { role: 'whaviso_atendente', tabela: 'pedidos', operacao: 'insert', esperado: 'permitido', sec: 'SEC-032', nota: 'monta o rascunho' },
  { role: 'whaviso_atendente', tabela: 'uso_llm', operacao: 'insert', esperado: 'permitido', sec: 'SEC-032', nota: 'grava consumo' },

  // SEC-033: trilhas append-only recusam UPDATE/DELETE por privilegio para TODO role de servico.
  // (A recusa por TRIGGER, mesmo para o dono/superusuario, e provada a parte no executor.)
  { role: 'whaviso_api', tabela: 'eventos', coluna: 'detalhes', operacao: 'update', esperado: 'negado', sec: 'SEC-033' },
  { role: 'whaviso_api', tabela: 'eventos', operacao: 'delete', esperado: 'negado', sec: 'SEC-033' },
  { role: 'whaviso_api', tabela: 'eventos', operacao: 'insert', esperado: 'permitido', sec: 'SEC-033', nota: 'append e permitido' },
  { role: 'whaviso_zap', tabela: 'eventos_auth', coluna: 'detalhes', operacao: 'update', esperado: 'negado', sec: 'SEC-033' },
  { role: 'whaviso_zap', tabela: 'eventos_auth', operacao: 'delete', esperado: 'negado', sec: 'SEC-033' },
  { role: 'whaviso_api', tabela: 'motoboy_lancamentos', coluna: 'descricao', operacao: 'update', esperado: 'negado', sec: 'SEC-033' },
  { role: 'whaviso_api', tabela: 'motoboy_lancamentos', operacao: 'delete', esperado: 'negado', sec: 'SEC-033' },
  { role: 'whaviso_atendente', tabela: 'uso_llm', coluna: 'modelo', operacao: 'update', esperado: 'negado', sec: 'SEC-033' },
  { role: 'whaviso_atendente', tabela: 'uso_llm', operacao: 'delete', esperado: 'negado', sec: 'SEC-033' },
  { role: 'whaviso_api', tabela: 'uso_llm', operacao: 'insert', esperado: 'negado', sec: 'SEC-033', nota: 'so o atendente grava consumo' },

  // SEC-030 espelho: um role sem o grant de delete em templates e negado.
  { role: 'whaviso_zap', tabela: 'templates', operacao: 'delete', esperado: 'negado', sec: 'SEC-030' },

  // convites (API-conta, migration 0013): whaviso_api so grava estado; papel/token imutaveis apos
  // criado; zap/atendente sem grant algum. (UPDATE por coluna: so aceito_em/aceito_por_user_id/revogado_em.)
  { role: 'whaviso_api', tabela: 'convites', operacao: 'insert', esperado: 'permitido', sec: 'SEC-041' },
  { role: 'whaviso_api', tabela: 'convites', coluna: 'aceito_em', operacao: 'update', esperado: 'permitido', sec: 'SEC-041', nota: 'estado do convite' },
  { role: 'whaviso_api', tabela: 'convites', coluna: 'papel', operacao: 'update', esperado: 'negado', sec: 'SEC-041', nota: 'convite imutavel apos criado' },
  { role: 'whaviso_zap', tabela: 'convites', operacao: 'select', esperado: 'negado', sec: 'SEC-041', nota: 'zap nao toca convites' },
  { role: 'whaviso_atendente', tabela: 'convites', operacao: 'select', esperado: 'negado', sec: 'SEC-041', nota: 'atendente nao toca convites' },

  // mensagens (migration 0015): o atendente so marca a coluna de claim (processada_em) para
  // reivindicar o inbound; o conteudo e append-only e nao ha DELETE (SEC-033/030/024).
  { role: 'whaviso_atendente', tabela: 'mensagens', coluna: 'processada_em', operacao: 'update', esperado: 'permitido', sec: 'SEC-033', nota: 'claim do inbound (0015)' },
  { role: 'whaviso_atendente', tabela: 'mensagens', coluna: 'conteudo', operacao: 'update', esperado: 'negado', sec: 'SEC-033', nota: 'conteudo imutavel' },
  { role: 'whaviso_atendente', tabela: 'mensagens', operacao: 'delete', esperado: 'negado', sec: 'SEC-030' },

  // estoque_itens (0023): api e dona do painel; atendente decrementa na venda (UPDATE so de
  // quantidade_disponivel em itens + append no diario). Diario append-only (trigger).
  { role: 'whaviso_api', tabela: 'movimentos_item_estoque', operacao: 'insert', esperado: 'permitido', sec: 'SEC-033' },
  { role: 'whaviso_api', tabela: 'movimentos_item_estoque', operacao: 'select', esperado: 'permitido', sec: 'SEC-033' },
  { role: 'whaviso_api', tabela: 'movimentos_item_estoque', coluna: 'motivo', operacao: 'update', esperado: 'negado', sec: 'SEC-033', nota: 'diario append-only' },
  { role: 'whaviso_atendente', tabela: 'movimentos_item_estoque', operacao: 'insert', esperado: 'permitido', sec: 'SEC-032', nota: 'decremento da venda' },
  { role: 'whaviso_atendente', tabela: 'movimentos_item_estoque', operacao: 'select', esperado: 'permitido', sec: 'SEC-032', nota: 'idempotencia da venda' },
  { role: 'whaviso_atendente', tabela: 'movimentos_item_estoque', operacao: 'delete', esperado: 'negado', sec: 'SEC-030' },
  { role: 'whaviso_atendente', tabela: 'itens', coluna: 'quantidade_disponivel', operacao: 'update', esperado: 'permitido', sec: 'SEC-032', nota: 'venda decrementa a contagem' },
  { role: 'whaviso_atendente', tabela: 'itens', coluna: 'nome', operacao: 'update', esperado: 'negado', sec: 'SEC-032', nota: 'atendente so escreve quantidade_disponivel em itens' },

  // disponibilidade (0024): api e dona do cadastro; atendente LE as tres para decidir atendimento; zap nao toca.
  { role: 'whaviso_api', tabela: 'horarios_funcionamento', operacao: 'insert', esperado: 'permitido', sec: 'SEC-032', nota: 'api dona do cadastro' },
  { role: 'whaviso_api', tabela: 'janela_atendente', operacao: 'update', esperado: 'permitido', sec: 'SEC-032', nota: 'api dona do cadastro' },
  { role: 'whaviso_api', tabela: 'excecoes_disponibilidade', operacao: 'select', esperado: 'permitido', sec: 'SEC-032', nota: 'api dona do cadastro' },
  { role: 'whaviso_atendente', tabela: 'horarios_funcionamento', operacao: 'select', esperado: 'permitido', sec: 'SEC-032', nota: 'le horario para decidir atendimento' },
  { role: 'whaviso_atendente', tabela: 'janela_atendente', operacao: 'select', esperado: 'permitido', sec: 'SEC-032', nota: 'le a janela de resposta' },
  { role: 'whaviso_atendente', tabela: 'excecoes_disponibilidade', operacao: 'select', esperado: 'permitido', sec: 'SEC-032', nota: 'le feriados/excecoes' },
  { role: 'whaviso_atendente', tabela: 'horarios_funcionamento', operacao: 'insert', esperado: 'negado', sec: 'SEC-032', nota: 'atendente so le' },
  { role: 'whaviso_atendente', tabela: 'janela_atendente', operacao: 'update', esperado: 'negado', sec: 'SEC-032', nota: 'atendente so le' },
  { role: 'whaviso_zap', tabela: 'horarios_funcionamento', operacao: 'select', esperado: 'negado', sec: 'SEC-032', nota: 'zap nao toca disponibilidade' },
  { role: 'whaviso_zap', tabela: 'excecoes_disponibilidade', operacao: 'select', esperado: 'negado', sec: 'SEC-032', nota: 'zap nao toca disponibilidade' },

  // estoque_insumos (0026): api dona do cadastro; atendente consome na venda (le insumo, UPDATE so
  // quantidade_atual, append no movimento). movimentos_insumo append-only (trigger).
  { role: 'whaviso_api', tabela: 'insumos', operacao: 'insert', esperado: 'permitido', sec: 'SEC-032', nota: 'cadastro de insumo' },
  { role: 'whaviso_api', tabela: 'insumos', coluna: 'quantidade_atual', operacao: 'update', esperado: 'permitido', sec: 'SEC-032' },
  { role: 'whaviso_api', tabela: 'movimentos_insumo', operacao: 'insert', esperado: 'permitido', sec: 'SEC-033', nota: 'append do movimento' },
  { role: 'whaviso_api', tabela: 'movimentos_insumo', coluna: 'quantidade', operacao: 'update', esperado: 'negado', sec: 'SEC-033', nota: 'movimento imutavel' },
  { role: 'whaviso_atendente', tabela: 'insumos', operacao: 'select', esperado: 'permitido', sec: 'SEC-032', nota: 'le saldo p/ consumir' },
  { role: 'whaviso_atendente', tabela: 'insumos', coluna: 'quantidade_atual', operacao: 'update', esperado: 'permitido', sec: 'SEC-032', nota: 'baixa de insumo por venda' },
  { role: 'whaviso_atendente', tabela: 'insumos', coluna: 'nome', operacao: 'update', esperado: 'negado', sec: 'SEC-032', nota: 'atendente nao edita cadastro' },
  { role: 'whaviso_atendente', tabela: 'insumos', operacao: 'insert', esperado: 'negado', sec: 'SEC-032', nota: 'atendente nao cria insumo' },
  { role: 'whaviso_atendente', tabela: 'movimentos_insumo', operacao: 'insert', esperado: 'permitido', sec: 'SEC-032', nota: 'enfileira o consumo' },
  { role: 'whaviso_atendente', tabela: 'movimentos_insumo', operacao: 'delete', esperado: 'negado', sec: 'SEC-030' },
  { role: 'whaviso_zap', tabela: 'insumos', operacao: 'select', esperado: 'negado', sec: 'SEC-032', nota: 'zap nao toca estoque' },

  // ficha_tecnica (0027): api e dona da ficha; atendente so le para dar baixa na venda.
  { role: 'whaviso_api', tabela: 'fichas_tecnicas', operacao: 'insert', esperado: 'permitido', sec: 'SEC-030', nota: 'api e dona da ficha' },
  { role: 'whaviso_atendente', tabela: 'fichas_tecnicas', operacao: 'select', esperado: 'permitido', sec: 'SEC-032', nota: 'le a ficha p/ baixa na venda' },
  { role: 'whaviso_atendente', tabela: 'fichas_tecnicas', operacao: 'insert', esperado: 'negado', sec: 'SEC-032', nota: 'atendente so le' },
  { role: 'whaviso_atendente', tabela: 'fichas_tecnicas', operacao: 'update', esperado: 'negado', sec: 'SEC-032' },

  // caixa (0028): api abre/fecha a sessao (UPDATE em caixas) e so faz append em movimentos_caixa
  // (append-only via ausencia de grant de UPDATE, igual a pagamentos; sem trigger).
  { role: 'whaviso_api', tabela: 'caixas', operacao: 'insert', esperado: 'permitido', sec: 'SEC-032', nota: 'abre a sessao' },
  { role: 'whaviso_api', tabela: 'caixas', coluna: 'status', operacao: 'update', esperado: 'permitido', sec: 'SEC-032', nota: 'fecha a sessao' },
  { role: 'whaviso_api', tabela: 'movimentos_caixa', operacao: 'insert', esperado: 'permitido', sec: 'SEC-032', nota: 'lancamento do caixa' },
  { role: 'whaviso_api', tabela: 'movimentos_caixa', coluna: 'valor_centavos', operacao: 'update', esperado: 'negado', sec: 'SEC-033', nota: 'movimento e append-only' },

  // salao (0029): api e dona das mesas e comandas (SELECT/INSERT/UPDATE, sem DELETE).
  { role: 'whaviso_api', tabela: 'mesas', operacao: 'insert', esperado: 'permitido', sec: 'SEC-032', nota: 'salao' },
  { role: 'whaviso_api', tabela: 'mesas', operacao: 'update', esperado: 'permitido', sec: 'SEC-032' },
  { role: 'whaviso_api', tabela: 'comandas', operacao: 'insert', esperado: 'permitido', sec: 'SEC-032' },
  { role: 'whaviso_api', tabela: 'comandas', operacao: 'update', esperado: 'permitido', sec: 'SEC-032' },
  { role: 'whaviso_api', tabela: 'comanda_itens', operacao: 'insert', esperado: 'permitido', sec: 'SEC-032' },

  // pessoas (0025): cadastro de quem trabalha a favor da loja (nao so CLT); cargo = funcao, motoboy
  // fixo. api e dona; atendente nao gere equipe.
  { role: 'whaviso_api', tabela: 'cargos', operacao: 'insert', esperado: 'permitido', sec: 'SEC-030' },
  { role: 'whaviso_api', tabela: 'pessoas', operacao: 'insert', esperado: 'permitido', sec: 'SEC-030' },
  { role: 'whaviso_api', tabela: 'escalas', operacao: 'insert', esperado: 'permitido', sec: 'SEC-030' },
  { role: 'whaviso_atendente', tabela: 'pessoas', operacao: 'select', esperado: 'negado', sec: 'SEC-032', nota: 'atendente nao gere equipe' },
] as const

/** Tabelas (append-only) cujo UPDATE deve ser barrado pelo TRIGGER mesmo para o dono da tabela. */
export const TABELAS_APPEND_ONLY: readonly string[] = [
  'eventos',
  'eventos_auth',
  'motoboy_lancamentos',
  'movimentos_insumo',
  'movimentos_item_estoque',
  'uso_llm',
]

/** Matriz completa: regra de DELETE (SEC-030, cobre toda tabela) + casos especificos. */
export function matrizCompleta(): LinhaMatriz[] {
  return [...matrizDeleteApi(), ...CASOS_ESPECIFICOS]
}
