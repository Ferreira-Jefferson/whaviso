import { z } from 'zod'
import {
  acaoDevedor,
  categoriaTemplate,
  contextoTemplate,
  direcaoAviso,
  etapaEnvio,
  papelAviso,
  statusAviso,
  statusEnvio,
  statusMetaTemplate,
  tipoChavePix,
} from './enums'
import {
  avisoSchema,
  categoriaSchema,
  chavePixSchema,
  conteudoTemplate,
  dataCombinada,
  envioSchema,
  eventoAvisoSchema,
  itemPedidoSchema,
  motivoAviso,
  ocorrenciaSchema,
  perfilSchema,
  produtoSchema,
  somaItensCentavos,
  telefoneE164,
  templateSchema,
  valorCentavos,
} from './entidades'

// Fase A: teto de itens do pedido por combinado (defesa; venda direta raramente passa disso).
const MAX_ITENS_PEDIDO = 50

// Configuração de RECORRÊNCIA na criação/ativação (E6 H6.10). Ausente = combinado simples.
//  - periodo: repete TODO mês ou toda semana (sempre intervalo 1) ancorado na
//    data_combinada, por N ocorrências (TOTAL, incluindo a 1ª). Mensal mantém o dia;
//    semanal mantém o dia da semana. (Sem frequência diária.)
//  - avulsas (UI: "Datas específicas"): datas ADICIONAIS (ocorrências 2..N); a 1ª é a
//    própria data_combinada.
// O servidor expande em aviso_ocorrencias (datas em America/Sao_Paulo); o cliente NUNCA
// calcula ocorrência. `cadencia_etapas` (separado) escolhe quais etapas do ciclo enviar
// (null = ciclo completo).
export const recorrenciaInput = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('periodo'),
    freq: z.enum(['mensal', 'semanal']),
    ocorrencias: z.number().int().min(2).max(60),
  }),
  z.object({
    tipo: z.literal('avulsas'),
    datas: z.array(dataCombinada).min(1).max(59),
  }),
])
export type RecorrenciaInput = z.infer<typeof recorrenciaInput>

// ---- POST /v1/avisos ----
// Dois fluxos, mesmo endpoint, discriminados por `direcao`:
//  - receber: convido o DEVEDOR (nome/telefone_devedor). Pix é meu (cobrador).
//  - pagar (invertido): EU sou o devedor e convido o COBRADOR
//    (nome/telefone_cobrador). Pix é do cobrador (posso pré-preencher).
export const criarAvisoBody = z
  .object({
    direcao: direcaoAviso,
    // H4.1: `enviar` gera o convite agora (nasce aguardando_aceite); `agenda` só anota
    // (nasce sem_aviso, sem convite/envio). Default `enviar` (comportamento existente).
    modo: z.enum(['enviar', 'agenda']).default('enviar'),
    nome_devedor: z.string().trim().min(1).max(120),
    telefone_devedor: telefoneE164.nullish(),
    nome_cobrador: z.string().trim().min(1).max(120).nullish(),
    telefone_cobrador: telefoneE164.nullish(),
    motivo: motivoAviso,
    data_combinada: dataCombinada,
    // Pix OBRIGATÓRIO no receber (H2.1): chave de quem cria (cobrador). No `pagar`
    // invertido é OPCIONAL (decisão do dono): chave de quem VAI RECEBER (informada pelo
    // devedor-criador), que o cobrador confere/confirma ou aponta incorreta no aceite,
    // ou que pode entrar depois. No modo `agenda` o Pix é DIFERIDO (só ao ativar).
    pix_chave: z.string().trim().max(140).nullish(),
    // Titular + banco da chave (compõem a 2ª msg do Pix, E7 H7.3). Obrigatórios junto
    // da chave no receber; no invertido o cobrador valida/ajusta no aceite (H3.3), por
    // isso aqui são opcionais para o `pagar` (o devedor pode não saber o titular/banco).
    pix_titular: z.string().trim().max(120).nullish(),
    pix_banco: z.string().trim().max(80).nullish(),
    // Recorrência (E6 H6.10): ausente = combinado simples. Gated por plano (permite_recorrente)
    // no servidor. O servidor expande em ocorrências; o cliente nunca calcula data de ocorrência.
    recorrencia: recorrenciaInput.nullish(),
    // Cadência configurável (E6 H6.10): subconjunto das 4 etapas; null = ciclo completo.
    // Gated por plano (cadencia_configuravel) no servidor.
    cadencia_etapas: z.array(etapaEnvio).min(1).max(4).nullish(),
    // E16 H16.3 (multi): categorias (0..N) do combinado. Cada uma precisa ser minha e não
    // arquivada (validado no servidor). Organização interna: nunca vai ao devedor. Ausente/
    // null/[] = sem categoria. Substitui o antigo `categoria_id` único.
    categoria_ids: z.array(z.uuid()).nullish(),
    // Fase A: custo opcional (centavos, >=0). Dado interno do dono; habilita o resultado.
    // Saiu do formulário, mas o contrato segue aceitando (dormente) para não quebrar callers.
    valor_custo_centavos: z.number().int().min(0).nullish(),
    // Composição do pedido (o que foi vendido). OBRIGATÓRIA (>=1 item): o valor do combinado
    // é DERIVADO da soma dos itens (o servidor calcula; ver criarAviso). Interno na parte de
    // custo, mas a soma vira o valor exibido no aceite.
    itens: z.array(itemPedidoSchema).min(1).max(MAX_ITENS_PEDIDO),
  })
  // O valor derivado precisa ser > 0 (a coluna avisos.valor_centavos tem CHECK > 0).
  .refine((b) => somaItensCentavos(b.itens) > 0, {
    message: 'o total dos itens precisa ser maior que zero',
    path: ['itens'],
  })
  // WhatsApp (telefone) da outra ponta é OBRIGATÓRIO em TODOS os modos, inclusive `agenda`
  // (H4.1): é ele que identifica quem combinou e para onde o combinado iria se eu ativar.
  // Por isso os refines de telefone NÃO têm a leniência de `agenda`. Só o Pix segue DIFERIDO
  // na agenda (cobrado apenas ao ativar, H4.3), então os refines de Pix mantêm o `agenda ||`.
  .refine((b) => b.direcao !== 'receber' || b.telefone_devedor != null, {
    message: 'telefone_devedor é obrigatório para receber',
    path: ['telefone_devedor'],
  })
  .refine((b) => b.direcao !== 'pagar' || b.telefone_cobrador != null, {
    message: 'telefone_cobrador é obrigatório para pagar',
    path: ['telefone_cobrador'],
  })
  // O NOME da outra ponta (cobrador) no invertido segue a leniência de agenda: exigido só ao
  // enviar (no `agenda` pode entrar depois, ao ativar). Só o telefone deixou de ser opcional.
  .refine((b) => b.modo === 'agenda' || b.direcao !== 'pagar' || b.nome_cobrador != null, {
    message: 'nome_cobrador é obrigatório para pagar',
    path: ['nome_cobrador'],
  })
  // Pix obrigatório no receber (H2.1): chave + titular + banco juntos.
  .refine((b) => b.modo === 'agenda' || b.direcao !== 'receber' || (b.pix_chave != null && b.pix_chave.length > 0), {
    message: 'a chave Pix é obrigatória',
    path: ['pix_chave'],
  })
  .refine((b) => b.modo === 'agenda' || b.direcao !== 'receber' || (b.pix_titular != null && b.pix_titular.length > 0), {
    message: 'informe o nome do titular da chave Pix',
    path: ['pix_titular'],
  })
  .refine((b) => b.modo === 'agenda' || b.direcao !== 'receber' || (b.pix_banco != null && b.pix_banco.length > 0), {
    message: 'informe o banco da chave Pix',
    path: ['pix_banco'],
  })
  // Pix OPCIONAL no invertido (decisão do dono, sobrepõe H3.1): o devedor-criador PODE
  // informar a chave de quem vai RECEBER, mas não é exigido para gerar o convite. O
  // cobrador valida/ajusta ao confirmar (H3.3) e a chave pode ser preenchida depois via
  // PATCH /avisos/:id. Por isso NÃO há refine de pix no `pagar` (o receber segue exigindo).
export type CriarAvisoBody = z.infer<typeof criarAvisoBody>

// Resposta da criação (H2.1): devolve só o aviso. E5: o Whaviso ENVIA o combinado direto
// ao convidado (resumo + botões, sem compartilhamento manual), e o antigo NÚMERO de
// convite foi removido junto com o caminho de localização por número; não há mais nada
// para o criador repassar.
export const criarAvisoResposta = z.object({
  aviso: avisoSchema,
})
export type CriarAvisoResposta = z.infer<typeof criarAvisoResposta>

// ---- POST /v1/avisos/combinado-preview (autenticado; preview do combinado no fluxo de criar) ----
// Renderiza o template WhatsApp `combinado.resumo` a partir dos dados de RASCUNHO do
// formulário (o aviso ainda não existe), para a UI mostrar como a mensagem vai sair antes
// de criar. Espelha o mapeamento de papéis do onSubmit do front (receber/pagar). Não persiste
// nada; a linha de CTA que o zap anexa em runtime (anexarCta) fica de fora (mostra só o corpo).
export const combinadoPreviewBody = z.object({
  direcao: direcaoAviso,
  nome_devedor: z.string().trim().min(1).max(120),
  valor_centavos: valorCentavos,
  motivo: motivoAviso,
  data_combinada: dataCombinada,
  pix_chave: z.string().trim().max(140).nullish(),
  pix_titular: z.string().trim().max(120).nullish(),
  pix_banco: z.string().trim().max(80).nullish(),
})
export type CombinadoPreviewBody = z.infer<typeof combinadoPreviewBody>

export const combinadoPreviewResposta = z.object({
  render: z.string(),
  botoes: z.array(z.string()),
})
export type CombinadoPreviewResposta = z.infer<typeof combinadoPreviewResposta>

// ---- POST /v1/avisos/:id/ativar (H4.3) ----
// Ativa uma anotação da agenda: sem_aviso -> aguardando_aceite. O Whaviso envia o
// combinado direto ao convidado (resumo + botões). Telefone/Pix faltantes podem vir no
// corpo (preenchidos no momento de ativar); se ainda assim faltarem, o serviço recusa
// com `dado_obrigatorio_ativacao`. A resposta tem o MESMO formato da criação (só o aviso).
export const ativarAvisoBody = z
  .object({
    telefone_devedor: telefoneE164.nullish(),
    nome_cobrador: z.string().trim().min(1).max(120).nullish(),
    telefone_cobrador: telefoneE164.nullish(),
    pix_chave: z.string().trim().max(140).nullish(),
    pix_titular: z.string().trim().max(120).nullish(),
    pix_banco: z.string().trim().max(80).nullish(),
    // Recorrência/cadência podem ser definidas (ou redefinidas) ao ATIVAR uma anotação da
    // agenda. Gated por plano no servidor. Ausentes = mantém o que já estava (ou simples).
    recorrencia: recorrenciaInput.nullish(),
    cadencia_etapas: z.array(etapaEnvio).min(1).max(4).nullish(),
  })
export type AtivarAvisoBody = z.infer<typeof ativarAvisoBody>

// ---- PATCH /v1/avisos/:id (editar, H2.5) ----
// Campos editáveis do combinado. Todos opcionais (edição parcial); pelo menos um.
// A direção e os papéis NÃO mudam por edição (são identidade do combinado).
export const editarAvisoBody = z
  .object({
    nome_devedor: z.string().trim().min(1).max(120).optional(),
    motivo: motivoAviso.optional(),
    data_combinada: dataCombinada.optional(),
    pix_chave: z.string().trim().min(1).max(140).optional(),
    pix_titular: z.string().trim().min(1).max(120).optional(),
    pix_banco: z.string().trim().min(1).max(80).optional(),
    // E16 H16.3 (multi): trocar/limpar as categorias. Edição LIVRE (não abre reaprovação do
    // devedor): categoria é dado interno do dono. `[]`/`null` limpam todas; ausente = mantém.
    categoria_ids: z.array(z.uuid()).nullish(),
    // Fase A: custo (centavos, >=0). Também interno e LIVRE. `null` limpa; ausente = mantém.
    // Dormente (saiu do formulário), mas o contrato segue aceitando para não quebrar callers.
    valor_custo_centavos: z.number().int().min(0).nullish(),
    // Composição do pedido (itens). Presente = substitui (>=1 item); ausente = mantém. Não
    // aceita `null` (limpar quebraria o valor derivado). Como o valor é DERIVADO da soma dos
    // itens, mudar os itens que altere o total segue o caminho do ACORDO (reaprovação); uma
    // edição de itens que mantenha o total (ex.: corrigir descrição) é LIVRE. Ver editarAviso.
    itens: z.array(itemPedidoSchema).min(1).max(MAX_ITENS_PEDIDO).optional(),
  })
  .refine(
    (b) =>
      b.nome_devedor !== undefined ||
      b.motivo !== undefined ||
      b.data_combinada !== undefined ||
      b.pix_chave !== undefined ||
      b.pix_titular !== undefined ||
      b.pix_banco !== undefined ||
      b.categoria_ids !== undefined ||
      b.valor_custo_centavos !== undefined ||
      b.itens !== undefined,
    { message: 'informe ao menos um campo para editar' },
  )
  // Se vierem itens, o total derivado precisa ser > 0 (CHECK avisos.valor_centavos > 0).
  .refine((b) => b.itens === undefined || somaItensCentavos(b.itens) > 0, {
    message: 'o total dos itens precisa ser maior que zero',
    path: ['itens'],
  })
export type EditarAvisoBody = z.infer<typeof editarAvisoBody>

// ---- GET /v1/avisos ----
// Listagem POR PAPEL (H9.1): `papel` filtra por papel do usuário NAQUELE combinado,
// não por direção/fluxo (cobre o invertido). `cobrador` = sou o cobrador
// (cobrador_id = eu); `devedor` = sou o devedor (devedor_profile_id = eu).
// `grupo` (H9.3/H9.8) deixa o SERVIDOR decidir o conjunto de estados da faixa
// (ativos | agenda | historico), em vez de o front saber quais estados são terminais.
// `busca` filtra por nome da outra ponta OU motivo (server-side). `ordenar` permite
// priorizar por data combinada (sem termo acusatório).
export const listarAvisosQuery = z.object({
  status: statusAviso.optional(),
  direcao: direcaoAviso.optional(),
  papel: papelAviso.optional(),
  grupo: z.enum(['ativos', 'agenda', 'historico']).optional(),
  busca: z.string().trim().min(1).max(120).optional(),
  // E16 H16.4: filtro por categoria (uma por vez), combinável com os demais. `categoria_id`
  // filtra por uma categoria específica; `sem_categoria` isola os combinados sem categoria.
  categoria_id: z.uuid().optional(),
  sem_categoria: z.coerce.boolean().optional(),
  ordenar: z.enum(['data_combinada', 'criado_em']).default('criado_em'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  // E9 H9.6: filtro por periodo. Com de/ate, a lista desmembra o recorrente em uma
  // linha por OCORRENCIA daquele periodo (data/status proprios); sem de/ate, uma linha
  // por combinado. Mesmo periodo rege os totais (H9.2) na mesma pagina.
  de: dataCombinada.optional(),
  ate: dataCombinada.optional(),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
})
export type ListarAvisosQuery = z.infer<typeof listarAvisosQuery>

// O ACEITE por SITE foi removido no E5: o aceite acontece 100% pelo WhatsApp (o
// convidado responde com o número de 6 dígitos e toca um dos 3 botões). Os contratos
// `aceiteInfoResposta`/`aceitarBody`/`aceitarResposta` (rotas GET/POST /aceite/:token)
// saíram junto com o módulo `aceite` da api e a página pública do frontend.

// ---- POST /v1/auth/status-telefone (público; H1.2/H1.3) ----
// A UI consulta ANTES de pedir o OTP para escolher a copy: login (número já tem
// cadastro) vs cadastro (número novo). Resposta mínima: só o booleano `existe`
// (a história já exige distinguir a copy; não revelamos mais que isso). Rate-limit
// dedicado contra enumeração de números.
export const statusTelefoneBody = z.object({
  telefone: telefoneE164,
})
export type StatusTelefoneBody = z.infer<typeof statusTelefoneBody>

export const statusTelefoneResposta = z.object({
  existe: z.boolean(),
  // 'phone': tem identidade phone (OTP funciona direto); 'google': conta Google sem identidade
  // phone ainda (OTP vai criar conta temporária que o backend mescla); null: não existe.
  metodo: z.enum(['phone', 'google']).nullable(),
})
export type StatusTelefoneResposta = z.infer<typeof statusTelefoneResposta>

// ---- POST /v1/auth/verificar-sessao (autenticado; chamado logo após OTP login) ----
// Detecta conta split (conta phone recém-criada pelo OTP quando OUTRO user_id já é dono
// daquele telefone) e retorna o magic_token para o frontend trocar a sessão. Casos:
//   'ok': usuário Google (sem phone no JWT) ou phone user que já é dono do número, sem ação.
//   'novo': número sem nenhuma outra conta dona dele, vai para onboarding.
//   'mesclado': split detectado e resolvido, usar magic_token para trocar a sessão.
export const verificarSessaoResposta = z.object({
  tipo: z.enum(['ok', 'novo', 'mesclado']),
  magic_token: z.string().optional(),
})
export type VerificarSessaoResposta = z.infer<typeof verificarSessaoResposta>

// ---- POST /v1/acao/:token (público) ----
export const acaoBody = z.object({
  acao: acaoDevedor,
})
export type AcaoBody = z.infer<typeof acaoBody>

// ---- GET /v1/painel/resumo ----
// Totais POR PAPEL (H9.2), em CENTAVOS, calculados no backend (nunca somados no front):
//  - a_receber: sou cobrador e status ∈ ATIVOS_NAO_PAGOS (programado, aguardando_aceite,
//    informado_pago, pausado, aguardando_aprovacao_aviso_editado, desregistrado);
//  - recebido: sou cobrador e `pago`;
//  - a_pagar: sou devedor e status ∈ ATIVOS_NAO_PAGOS;
//  - pago: sou devedor e `pago`.
// Terminais não-pagos (cancelado/recusado/expirado) NUNCA entram (só no histórico).
// Campos legados (pendentes_centavos/qtd_pendentes/qtd_aguardando_aceite) mantidos para
// compatibilidade (billing.useUsoAtivos), apontando aos mesmos números.
export const painelResumoQuery = z.object({
  de: dataCombinada.optional(),
  ate: dataCombinada.optional(),
})
export const painelResumoResposta = z.object({
  // Totais por papel (H9.2). Soma em centavos + quantidade.
  a_receber_centavos: z.number().int(),
  a_receber_qtd: z.number().int(),
  recebido_centavos: z.number().int(),
  recebido_qtd: z.number().int(),
  a_pagar_centavos: z.number().int(),
  a_pagar_qtd: z.number().int(),
  pago_centavos: z.number().int(),
  pago_qtd: z.number().int(),
  // Legado (compatibilidade): pendentes = a_receber; recebidos = recebido; pagos = pago.
  pendentes_centavos: z.number().int(),
  recebidos_centavos: z.number().int(),
  pagos_centavos: z.number().int(),
  qtd_pendentes: z.number().int(),
  qtd_aguardando_aceite: z.number().int(),
})
export type PainelResumoResposta = z.infer<typeof painelResumoResposta>

// ---- GET /v1/painel/pendencias ("precisa de você", H9.2) ----
// Reúne os combinados que aguardam ação do usuário, por aviso_id e tipo de pendência,
// SEM dado sensível (nada de telefone/Pix/conteúdo; só ids, nome da outra ponta, motivo,
// valor e data combinada para o item ser clicável).
//  - confirmar_pagamento: como cobrador, avisos em `informado_pago` (aguardando sua confirmação);
//  - aprovar_edicao: como CRIADOR, avisos em `aguardando_aprovacao_aviso_editado` (você editou,
//    aguarda a outra ponta; pode desfazer).
// dado_incorreto / telefone_divergente (E5) são GATED: ainda não há evento/flag que os
// registre (o fluxo `dado_incorreto` é gated no E5/E12); entram quando E5 ligar o convite.
export const tipoPendencia = z.enum(['confirmar_pagamento', 'aprovar_edicao'])
export type TipoPendencia = z.infer<typeof tipoPendencia>

export const pendenciaSchema = z.object({
  aviso_id: z.uuid(),
  tipo: tipoPendencia,
  papel: papelAviso,
  nome_outra_ponta: z.string(),
  motivo: z.string(),
  valor_centavos: z.number().int(),
  data_combinada: dataCombinada,
})
export type Pendencia = z.infer<typeof pendenciaSchema>

export const painelPendenciasResposta = z.object({
  itens: z.array(pendenciaSchema),
  total: z.number().int(),
})
export type PainelPendenciasResposta = z.infer<typeof painelPendenciasResposta>

// ---- E15: Combinados por pessoa (visão de contato) ----
// A "pessoa" é a OUTRA PONTA; a IDENTIDADE é o TELEFONE (E.164), nunca o nome. Para não
// vazar telefone em rota/log (H13.8, a redaction do logger não cobre req.url), a pessoa é
// referenciada por um id de COMBINADO (UUID) que o usuário possui: a api resolve o
// telefone da outra ponta no servidor e agrega por ele. Totais dos QUATRO lados (H15.2),
// coerentes com o painel (H9.2). Isolamento por uid.

// GET /v1/pessoas/:avisoId/resumo
// ---- GET /v1/painel/metricas (Fase A: saúde do negócio, papel COBRADOR) ----
// Métricas do que o dono VENDE/RECEBE (não do que paga). Período em data_combinada.
// Lucro só conta combinados com custo informado (honestidade); `lucro_base_qtd` diz
// quantos. Nada sensível em rota/log: telefone só no corpo (para exibir a quem é dono).
export const painelMetricasQuery = z.object({
  de: dataCombinada.optional(),
  ate: dataCombinada.optional(),
  categoria_id: z.uuid().optional(),
  sem_categoria: z.coerce.boolean().optional(),
  // "Inativo" = sem combinado ativo e última data combinada além de N dias (default 60).
  inativo_dias: z.coerce.number().int().min(1).max(3650).default(60),
})
export type PainelMetricasQuery = z.infer<typeof painelMetricasQuery>

export const melhorClienteSchema = z.object({
  nome: z.string(),
  telefone: telefoneE164.nullable(),
  recebido_centavos: z.number().int(),
  qtd: z.number().int(),
})
export const metricaCategoriaSchema = z.object({
  categoria_id: z.uuid().nullable(),
  nome: z.string().nullable(),
  cor: z.string().nullable(),
  recebido_centavos: z.number().int(),
  a_receber_centavos: z.number().int(),
  lucro_centavos: z.number().int(),
  qtd: z.number().int(),
})
export const clienteInativoSchema = z.object({
  nome: z.string(),
  telefone: telefoneE164.nullable(),
  ultima_data: dataCombinada,
  dias: z.number().int(),
})
export const painelMetricasResposta = z.object({
  recebido_centavos: z.number().int(),
  recebido_qtd: z.number().int(),
  a_receber_centavos: z.number().int(),
  a_receber_qtd: z.number().int(),
  custo_pago_centavos: z.number().int(),
  lucro_centavos: z.number().int(),
  lucro_base_qtd: z.number().int(),
  ticket_medio_centavos: z.number().int(),
  melhores_clientes: z.array(melhorClienteSchema),
  por_categoria: z.array(metricaCategoriaSchema),
  inativos: z.array(clienteInativoSchema),
  // E18 H18.2 (item 17, aditivo): engajamento do devedor e conclusão dos combinados.
  // Só TOTAL nesta leva (não por cliente, decisão registrada no plano de implementação).
  // "solicitou_pix" = cliques em "ver chave Pix" (eventos_aviso); "mensagens_lidas" =
  // envios com entrega_status='read' (de um total com QUALQUER status de entrega, o
  // denominador de uma taxa de leitura). "taxa_combinados_concluidos" = pago sobre os
  // que chegaram a um estado final (pago + cancelado + recusado + expirado); null sem
  // nenhum terminal ainda. "tempo_medio_confirmacao_dias" = média em dias entre o
  // "já paguei" do devedor e a confirmação do cobrador; null sem nenhuma confirmação.
  solicitou_pix_qtd: z.number().int(),
  mensagens_lidas_qtd: z.number().int(),
  mensagens_com_status_qtd: z.number().int(),
  taxa_combinados_concluidos: z.number().nullable(),
  tempo_medio_confirmacao_dias: z.number().nullable(),
})
export type PainelMetricasResposta = z.infer<typeof painelMetricasResposta>

export const pessoaResumoResposta = z.object({
  // Telefone da outra ponta (E.164), resolvido no servidor. Dado do próprio usuário
  // (mesma exposição do detalhe do aviso); vai só no CORPO, nunca em rota/log.
  telefone: telefoneE164,
  // Nome pelo qual cheguei = o nome registrado no combinado de ENTRADA. Rótulo, não chave.
  nome_entrada: z.string(),
  // Quatro totais (H15.2): a receber/recebido como cobrador; a pagar/pago como devedor.
  a_receber_centavos: z.number().int(),
  a_receber_qtd: z.number().int(),
  recebido_centavos: z.number().int(),
  recebido_qtd: z.number().int(),
  a_pagar_centavos: z.number().int(),
  a_pagar_qtd: z.number().int(),
  pago_centavos: z.number().int(),
  pago_qtd: z.number().int(),
  // Fase A (A4): "última compra" = data do combinado mais recente em que EU sou o COBRADOR
  // (vendi para a pessoa). null quando nunca vendi (ex.: só relação em que eu pago). Junto,
  // os dias corridos até hoje (calculado no servidor) e o sinal de inatividade: sem nada
  // ativo a receber E última venda além do limiar. Serve para reativar cliente parado.
  ultima_compra: dataCombinada.nullable(),
  dias_desde_ultima_compra: z.number().int().nullable(),
  inativo: z.boolean(),
})
export type PessoaResumoResposta = z.infer<typeof pessoaResumoResposta>

// GET /v1/pessoas/:avisoId/combinados
// Todos os combinados daquele TELEFONE, AGRUPADOS POR NOME (H15.3): cada nome distinto
// registrado para o número vira um grupo (identidade é o número, o nome é rótulo). Itens
// no formato do aviso (avisoSchema), para o front reusar as colunas do painel.
export const grupoPessoaSchema = z.object({
  nome: z.string(),
  itens: z.array(avisoSchema),
})
export type GrupoPessoa = z.infer<typeof grupoPessoaSchema>

export const pessoaCombinadosResposta = z.object({
  grupos: z.array(grupoPessoaSchema),
  total: z.number().int(),
})
export type PessoaCombinadosResposta = z.infer<typeof pessoaCombinadosResposta>

// POST /v1/pessoas/buscar-por-telefone (autocomplete ao criar, H15.6)
// O número (parcial) carrega telefone, então vai no CORPO de um POST, nunca em query/URL
// (H13.8: corpo/resposta não são logados pelo Fastify). `prefixo` = E.164 parcial
// (+<país><dígitos>); o front só dispara a partir do 6º dígito nacional.
export const buscarPessoaBody = z.object({
  prefixo: z
    .string()
    .trim()
    .regex(/^\+\d{4,15}$/, 'prefixo de telefone inválido'),
})
export type BuscarPessoaBody = z.infer<typeof buscarPessoaBody>

export const sugestaoPessoaSchema = z.object({
  nome: z.string(),
  telefone: telefoneE164,
})
export type SugestaoPessoa = z.infer<typeof sugestaoPessoaSchema>

export const buscarPessoaResposta = z.object({
  itens: z.array(sugestaoPessoaSchema),
})
export type BuscarPessoaResposta = z.infer<typeof buscarPessoaResposta>

// ---- E18 H18.4 / E15 H15.8: lista central de clientes + renomear ----
// GET /v1/pessoas: lista agregada por TELEFONE da outra ponta (identidade, E15). A identidade é
// o NÚMERO; o nome é só rótulo e pode variar por combinado, então cada cliente traz a LISTA de
// nomes registrados naquele número (mais recente primeiro, deduplicada), não um nome único.
// Telefone SÓ no corpo (nunca em rota/log, H13.8), os quatro totais da relação (H15.2), sinais
// de última compra/inatividade e um `ref_aviso_id` representativo (rotas por avisoId sem telefone).
export const clienteSchema = z.object({
  ref_aviso_id: z.uuid(),
  telefone: telefoneE164,
  nomes: z.array(z.string()),
  a_receber_centavos: z.number().int(),
  a_receber_qtd: z.number().int(),
  recebido_centavos: z.number().int(),
  recebido_qtd: z.number().int(),
  a_pagar_centavos: z.number().int(),
  a_pagar_qtd: z.number().int(),
  pago_centavos: z.number().int(),
  pago_qtd: z.number().int(),
  ultima_compra: dataCombinada.nullable(),
  dias_desde_ultima_compra: z.number().int().nullable(),
  inativo: z.boolean(),
})
export type Cliente = z.infer<typeof clienteSchema>

export const listaClientesResposta = z.object({
  itens: z.array(clienteSchema),
  total: z.number().int(),
})
export type ListaClientesResposta = z.infer<typeof listaClientesResposta>

// PATCH /v1/pessoas/:avisoId: renomear o cliente. O telefone é resolvido NO SERVIDOR a partir
// do avisoId (nunca telefone na URL/log, H15.7/H15.8). Reescreve `nome_devedor` nos combinados
// daquele telefone onde sou COBRADOR; edição livre (dado interno de exibição). `nome_atual`
// (opcional): escopa a um GRUPO de nome (H15.8), só renomeando os combinados cujo nome bate com
// ele; ausente = número inteiro (retrocompat). Nome não é sensível (pode ir no corpo, H15.7).
export const renomearClienteBody = z.object({
  nome: z.string().trim().min(1).max(120),
  nome_atual: z.string().trim().min(1).max(120).optional(),
})
export type RenomearClienteBody = z.infer<typeof renomearClienteBody>

export const renomearClienteResposta = z.object({
  telefone: telefoneE164,
  nome: z.string(),
  afetados: z.number().int(),
})
export type RenomearClienteResposta = z.infer<typeof renomearClienteResposta>

// POST /v1/itens/buscar-por-nome (autocomplete do nome do item ao montar o pedido).
// Espelha o autocomplete de pessoa: o termo vai no CORPO de um POST (consistência com a
// família de buscas; corpo não é logado). Sugere descrições de itens já usadas pelo criador.
export const buscarItemBody = z.object({
  prefixo: z.string().trim().min(1).max(80),
})
export type BuscarItemBody = z.infer<typeof buscarItemBody>

export const buscarItemResposta = z.object({
  itens: z.array(z.string()),
})
export type BuscarItemResposta = z.infer<typeof buscarItemResposta>

// ---- PATCH /v1/perfil ----
export const atualizarPerfilBody = z.object({
  nome: z.string().trim().min(1).max(120).optional(),
  telefone: telefoneE164.nullish(),
})
export type AtualizarPerfilBody = z.infer<typeof atualizarPerfilBody>

// ---- /v1/perfil/chaves-pix ----
export const listaChavesPixResposta = z.array(chavePixSchema)

// ---- Categorias (E16) ----
const corHex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'cor deve ser um hex #RRGGBB')

// H16.1: criar. nome obrigatório (1..40); cor opcional (hex).
export const criarCategoriaBody = z.object({
  nome: z.string().trim().min(1).max(40),
  cor: corHex.nullish(),
})
export type CriarCategoriaBody = z.infer<typeof criarCategoriaBody>

// H16.2: editar/arquivar (parcial; ao menos um campo). arquivar = soft-delete.
export const atualizarCategoriaBody = z
  .object({
    nome: z.string().trim().min(1).max(40).optional(),
    cor: corHex.nullish(),
    arquivada: z.boolean().optional(),
  })
  .refine((b) => b.nome !== undefined || b.cor !== undefined || b.arquivada !== undefined, {
    message: 'informe ao menos um campo para atualizar',
  })
export type AtualizarCategoriaBody = z.infer<typeof atualizarCategoriaBody>

export const listaCategoriasResposta = z.array(categoriaSchema)
export type ListaChavesPixResposta = z.infer<typeof listaChavesPixResposta>

// ---- Produtos (E17) ----
// Catálogo do dono: nome (1..80) + preço de venda (centavos, >= 0). Sem custo, sem categoria.
// H17.1: criar.
export const criarProdutoBody = z.object({
  nome: z.string().trim().min(1).max(80),
  preco_venda_centavos: z.number().int().min(0),
})
export type CriarProdutoBody = z.infer<typeof criarProdutoBody>

// H17.2/H17.3/H17.4: editar (renomear/preço) ou arquivar (soft-delete). Parcial; ao menos um
// campo. Renomear PROPAGA para a descrição dos itens que referenciam o produto (servidor);
// mudar o preço NÃO propaga (snapshot congelado nos combinados existentes).
export const atualizarProdutoBody = z
  .object({
    nome: z.string().trim().min(1).max(80).optional(),
    preco_venda_centavos: z.number().int().min(0).optional(),
    arquivado: z.boolean().optional(),
  })
  .refine(
    (b) => b.nome !== undefined || b.preco_venda_centavos !== undefined || b.arquivado !== undefined,
    { message: 'informe ao menos um campo para atualizar' },
  )
export type AtualizarProdutoBody = z.infer<typeof atualizarProdutoBody>

export const listaProdutosResposta = z.array(produtoSchema)
export type ListaProdutosResposta = z.infer<typeof listaProdutosResposta>

// POST: cria uma chave; padrao=true torna-a a padrão (zera as outras).
// titular + banco (0044) obrigatórios: a chave precisa carregá-los para o aviso herdar.
export const criarChavePixBody = z.object({
  tipo: tipoChavePix,
  chave: z.string().trim().min(1).max(140),
  rotulo: z.string().trim().max(60).nullish(),
  titular: z.string().trim().min(1).max(120),
  banco: z.string().trim().min(1).max(80),
  padrao: z.boolean().optional(),
})
export type CriarChavePixBody = z.infer<typeof criarChavePixBody>

// PATCH: editar rótulo/titular/banco, tornar padrão, ou arquivar (soft-delete). Ao menos 1 campo.
export const atualizarChavePixBody = z
  .object({
    rotulo: z.string().trim().max(60).nullish(),
    titular: z.string().trim().min(1).max(120).optional(),
    banco: z.string().trim().min(1).max(80).optional(),
    padrao: z.boolean().optional(),
    arquivada: z.boolean().optional(),
  })
  .refine(
    (b) =>
      b.rotulo !== undefined ||
      b.titular !== undefined ||
      b.banco !== undefined ||
      b.padrao !== undefined ||
      b.arquivada !== undefined,
    { message: 'informe rotulo, titular, banco, padrao e/ou arquivada' },
  )
export type AtualizarChavePixBody = z.infer<typeof atualizarChavePixBody>

// ---- GET /v1/avisos/:id/envios (lista nua; autorizado por visibilidade do aviso) ----
export const listaEnviosResposta = z.array(envioSchema)
export type ListaEnviosResposta = z.infer<typeof listaEnviosResposta>

// ---- GET /v1/avisos/:id/combinado-envio (estado REAL do envio do combinado, E5/H5.0) ----
// O combinado é apenas ENFILEIRADO na criação (outbox notificacoes_cobrador, tipo
// 'combinado_enviar'); o zap drena e envia depois, com gate de template. Esta rota expõe um
// ESTADO SEMÂNTICO já computado no servidor (nunca o código interno de erro, sem PII/jargão),
// para a UI ser honesta: nunca afirmar "enviado" antes de o zap enviar de fato.
export const estadoEnvioCombinado = z.enum(['enviando', 'enviado', 'nao_enviado'])
export type EstadoEnvioCombinado = z.infer<typeof estadoEnvioCombinado>

export const combinadoEnvioResposta = z.object({
  estado: estadoEnvioCombinado,
  enviado_em: z.coerce.date().nullable(),
})
export type CombinadoEnvioResposta = z.infer<typeof combinadoEnvioResposta>

// ---- GET /v1/avisos/:id/eventos (auditoria, ordem cronológica) ----
export const listaEventosResposta = z.array(eventoAvisoSchema)
export type ListaEventosResposta = z.infer<typeof listaEventosResposta>

// ---- GET /v1/avisos/:id/ocorrencias (E8 H8.7 / E9 H9.6) ----
// Ocorrências do combinado recorrente, em ordem de índice (1..N). Combinado simples
// devolve []. Para o painel mostrar "k de N" e desmembrar por período.
export const listaOcorrenciasResposta = z.array(ocorrenciaSchema)
export type ListaOcorrenciasResposta = z.infer<typeof listaOcorrenciasResposta>

// ---- POST /v1/avisos/:id/encerrar-lembretes (opt-out do devedor logado) ----
export const encerrarLembretesResposta = z.object({ status: statusAviso })
export type EncerrarLembretesResposta = z.infer<typeof encerrarLembretesResposta>

// ---- Paginação genérica do admin ----
const paginacaoAdmin = {
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
}

// ---- GET /v1/admin/usuarios ----
export const adminUsuariosQuery = z.object({
  busca: z.string().trim().min(1).max(120).optional(),
  ...paginacaoAdmin,
})
export type AdminUsuariosQuery = z.infer<typeof adminUsuariosQuery>

export const adminUsuarioSchema = perfilSchema.extend({
  // perfis nascem com nome '' (trigger) até o onboarding; a listagem admin tolera vazio
  nome: z.string().max(120),
  suspenso: z.boolean(),
  // E11: o que se mostra agora é o SALDO da carteira de créditos (não mais o plano).
  saldo_livre: z.number().int(),
  reservado: z.number().int(),
  em_hold: z.number().int(),
  consumido: z.number().int(),
  ja_comprou: z.boolean(),
})
export type AdminUsuario = z.infer<typeof adminUsuarioSchema>

export const adminUsuariosResposta = z.object({
  itens: z.array(adminUsuarioSchema),
  total: z.number().int(),
  page: z.number().int(),
  per_page: z.number().int(),
})
export type AdminUsuariosResposta = z.infer<typeof adminUsuariosResposta>

// ---- PATCH /v1/admin/usuarios/:id (suspender/reativar) ----
// E11: a troca de plano saiu (não há planos). Creditar envios é endpoint próprio
// (POST /admin/usuarios/:id/creditar). Aqui só a suspensão da conta.
export const adminAtualizarUsuarioBody = z
  .object({
    suspenso: z.boolean(),
  })
export type AdminAtualizarUsuarioBody = z.infer<typeof adminAtualizarUsuarioBody>

// ---- POST /v1/admin/usuarios/:id/creditar (owner credita envios, H11.11) ----
// O owner ATIVA quem pagou via WhatsApp creditando N envios na carteira (aditivo,
// lançamento 'credito_owner', append-only). Quantidade > 0; teto generoso de defesa.
export const adminCreditarBody = z.object({
  quantidade: z.number().int().min(1).max(100000),
})
export type AdminCreditarBody = z.infer<typeof adminCreditarBody>

export const adminCarteiraResposta = z.object({
  saldo_livre: z.number().int(),
  reservado: z.number().int(),
  em_hold: z.number().int(),
  consumido: z.number().int(),
  ja_comprou: z.boolean(),
})
export type AdminCarteiraResposta = z.infer<typeof adminCarteiraResposta>

// ---- Catálogo de créditos (curva de MARCOS + cortesia + tetos de agenda) ----
// A curva é uma tabela de marcos {envios, centavos} onde centavos = R$/envio NAQUELE marco.
// Entre dois marcos o R$/envio é interpolado; o total de n envios é round(n * R$/envio(n)).
// Os marcos vêm ordenados por `envios`, estritamente crescentes (ao menos 2). Fonte única
// do preço (front e back recomputam pela MESMA função). envios_min/max derivam dos marcos.
export const curvaPontoSchema = z.object({
  envios: z.number().int().min(1),
  centavos: z.number().int().min(0),
})
export type CurvaPonto = z.infer<typeof curvaPontoSchema>

export const curvaMarcosSchema = z
  .array(curvaPontoSchema)
  .min(2, { message: 'a curva precisa de ao menos 2 marcos' })
  .refine(
    (pts) =>
      pts.every((p, i) => {
        const ant = pts[i - 1]
        return ant === undefined || p.envios > ant.envios
      }),
    { message: 'os marcos da curva devem ter envios estritamente crescentes' },
  )

export const creditosCatalogoSchema = z.object({
  envios_min: z.number().int().min(1),
  envios_max: z.number().int().min(1),
  curva: curvaMarcosSchema,
  cortesia_inicial: z.number().int().min(0),
  agenda_teto_free: z.number().int().min(0),
  agenda_teto_pago: z.number().int().min(0),
})
export type CreditosCatalogo = z.infer<typeof creditosCatalogoSchema>

// ---- PATCH /v1/admin/creditos-catalogo (owner edita a curva, H11.11) ----
// Atualização PARCIAL: todos os campos opcionais (ao menos um). envios_min/envios_max NÃO
// são editados direto: derivam do primeiro/último marco da curva. Espelha as CHECKs da
// migration (curva com >= 2 marcos crescentes; agenda free <= pago) para erro limpo.
export const adminAtualizarCreditosCatalogoBody = z
  .object({
    curva: curvaMarcosSchema.optional(),
    cortesia_inicial: z.number().int().min(0).optional(),
    agenda_teto_free: z.number().int().min(0).optional(),
    agenda_teto_pago: z.number().int().min(0).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'informe ao menos um campo' })
  .refine(
    (b) =>
      b.agenda_teto_free === undefined ||
      b.agenda_teto_pago === undefined ||
      b.agenda_teto_pago >= b.agenda_teto_free,
    { message: 'o teto de agenda após a compra não pode ser menor que o do free' },
  )
export type AdminAtualizarCreditosCatalogoBody = z.infer<typeof adminAtualizarCreditosCatalogoBody>

// ---- POST /v1/billing/recarga (H11.10) ----
// Confirma a recarga: o servidor valida a quantidade contra o catálogo, recalcula o valor
// (fonte única) e ENFILEIRA a mensagem de compra (template billing.recarga + chave Pix da
// plataforma) para o WhatsApp do próprio usuário. A chave Pix NUNCA volta no HTTP (H13.8).
export const recargaBody = z.object({
  quantidade: z.number().int().min(1),
})
export type RecargaBody = z.infer<typeof recargaBody>

export const recargaResposta = z.object({
  enfileirado: z.boolean(),
  quantidade: z.number().int(),
  valor_centavos: valorCentavos,
  // Número da conversa (só dígitos com DDI) para o front montar o link "abrir conversa":
  // é o próprio número pareado pelo zap (whats_sessao), não uma env. null se desconectado.
  // NÃO é PII de devedor/cobrador: é o número público de atendimento do whaviso.
  telefone_vendas: z.string().nullable(),
})
export type RecargaResposta = z.infer<typeof recargaResposta>

// ---- GET/PATCH /v1/admin/config-plataforma (chave Pix da plataforma, owner) ----
// Config singleton (0059) com a chave Pix do whaviso, no MESMO formato da chave do cobrador
// (tipo/chave/titular/banco) + comentário livre. Todos os campos NULLABLE: nasce vazia e o
// owner preenche pela tela de admin. Só o owner lê/edita; o usuário final nunca a recebe.
export const configPlataformaSchema = z.object({
  pix_tipo: tipoChavePix.nullable(),
  pix_chave: z.string().max(140).nullable(),
  pix_titular: z.string().max(120).nullable(),
  pix_banco: z.string().max(80).nullable(),
  pix_comentario: z.string().max(140).nullable(),
})
export type ConfigPlataforma = z.infer<typeof configPlataformaSchema>

// PATCH parcial (ao menos um campo). nullish permite limpar um campo (set null). Tamanhos
// espelham chaves_pix; tipo é auxiliar (detecção no servidor), não bloqueio.
export const adminAtualizarConfigPlataformaBody = z
  .object({
    pix_tipo: tipoChavePix.nullish(),
    pix_chave: z.string().trim().max(140).nullish(),
    pix_titular: z.string().trim().max(120).nullish(),
    pix_banco: z.string().trim().max(80).nullish(),
    pix_comentario: z.string().trim().max(140).nullish(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'informe ao menos um campo' })
export type AdminAtualizarConfigPlataformaBody = z.infer<typeof adminAtualizarConfigPlataformaBody>

// ---- GET /v1/admin/envios (auditoria, com nome do destinatário) ----
export const adminEnviosQuery = z.object({
  de: dataCombinada.optional(),
  ate: dataCombinada.optional(),
  status: statusEnvio.optional(),
  etapa: etapaEnvio.optional(),
  ...paginacaoAdmin,
})
export type AdminEnviosQuery = z.infer<typeof adminEnviosQuery>

export const adminEnvioSchema = envioSchema.extend({
  nome_devedor: z.string().nullable(),
})
export type AdminEnvio = z.infer<typeof adminEnvioSchema>

export const adminEnviosResposta = z.object({
  itens: z.array(adminEnvioSchema),
  total: z.number().int(),
  page: z.number().int(),
  per_page: z.number().int(),
})
export type AdminEnviosResposta = z.infer<typeof adminEnviosResposta>

// ---- GET /v1/admin/avisos (visão global, auditoria) ----
export const adminAvisosQuery = z.object({
  status: statusAviso.optional(),
  direcao: direcaoAviso.optional(),
  ...paginacaoAdmin,
})
export type AdminAvisosQuery = z.infer<typeof adminAvisosQuery>

export const adminAvisosResposta = z.object({
  itens: z.array(avisoSchema),
  total: z.number().int(),
  page: z.number().int(),
  per_page: z.number().int(),
})
export type AdminAvisosResposta = z.infer<typeof adminAvisosResposta>

// ---- GET /v1/admin/notificacoes (outbox de avisos ao cobrador, auditoria) ----
// Torna VISÍVEL ao owner o estado da fila de notificações ao cobrador, incluindo o
// motivo recuperável 'sem_template_ativo' (linha 'agendado' com erro preenchido)
// quando falta ativar o template (H12.8). SEM PII: nada de telefone/nome/Pix; só
// ids técnicos, status, tentativas e o código de erro.
export const adminNotificacoesQuery = z.object({
  status: statusEnvio.optional(),
  ...paginacaoAdmin,
})
export type AdminNotificacoesQuery = z.infer<typeof adminNotificacoesQuery>

export const adminNotificacaoSchema = z.object({
  id: z.uuid(),
  aviso_id: z.uuid(),
  tipo: z.string(),
  status: statusEnvio,
  tentativas: z.number().int(),
  erro: z.string().nullable(),
  proxima_tentativa_em: z.coerce.date().nullable(),
  criado_em: z.coerce.date(),
})
export type AdminNotificacao = z.infer<typeof adminNotificacaoSchema>

export const adminNotificacoesResposta = z.object({
  itens: z.array(adminNotificacaoSchema),
  total: z.number().int(),
  page: z.number().int(),
  per_page: z.number().int(),
})
export type AdminNotificacoesResposta = z.infer<typeof adminNotificacoesResposta>

// ---- GET /v1/admin/metricas (período opcional + opt-out) ----
export const adminMetricasQuery = z.object({
  de: dataCombinada.optional(),
  ate: dataCombinada.optional(),
})
export type AdminMetricasQuery = z.infer<typeof adminMetricasQuery>

export const adminMetricasResposta = z.object({
  avisos_por_status: z.record(z.string(), z.number().int()),
  envios_por_status: z.record(z.string(), z.number().int()),
  total_usuarios: z.number().int(),
  optout_total: z.number().int(),
  optout_taxa: z.number(),
  // Item 18 (aditivo): resumo financeiro AGREGADO do sistema inteiro (visão do owner),
  // mesmos três números do resumo de resultado do usuário (H9.2/H18.2), mas somando TODOS
  // os cobradores. Só números agregados: nenhum nome/telefone/combinado individual (mesma
  // régua de privilégio do owner-só-vê-templates-de-config, não conteúdo de cliente).
  recebido_centavos: z.number().int(),
  recebido_qtd: z.number().int(),
  a_receber_centavos: z.number().int(),
  a_receber_qtd: z.number().int(),
  ticket_medio_centavos: z.number().int(),
})
export type AdminMetricasResposta = z.infer<typeof adminMetricasResposta>

// ---- /v1/admin/mensagens (templates UNIFICADOS por chave) ----
// Mesma maquinaria do ciclo (propor versão -> aprovar -> ativar), mas sobre a
// tabela `templates`, com conteúdo ESTRUTURADO (texto + botões + mídia) por chave.
export const adminMensagensResposta = z.object({
  mensagens: z.array(templateSchema),
})
export type AdminMensagensResposta = z.infer<typeof adminMensagensResposta>

export const novaMensagemBody = z
  .object({
    chave: z.string().trim().min(1).max(80),
    contexto: contextoTemplate.default('padrao'),
    // nome_meta NÃO vem mais do cliente: o servidor deriva (base + próximo número) para
    // que cada versão vire um template novo na Meta sem colidir. Ver POST /admin/mensagens.
    idioma: z.string().default('pt_BR'),
    conteudo: conteudoTemplate,
    variaveis: z.array(z.string()).default([]),
    // Categoria exigida pela Meta no create (default UTILITY). exemplos = amostras por
    // variável p/ o `example` da Meta (o painel as preenche; placeholder cru pode ser recusado).
    categoria: categoriaTemplate.default('UTILITY'),
    exemplos: z.record(z.string(), z.string()).default({}),
  })
  .refine((b) => b.conteudo.texto.trim().length > 0 || b.conteudo.midia != null, {
    message: 'a mensagem precisa de texto ou mídia',
    path: ['conteudo', 'texto'],
  })
export type NovaMensagemBody = z.infer<typeof novaMensagemBody>

export const novaMensagemResposta = z.object({
  id: z.uuid(),
  chave: z.string(),
  nome_meta: z.string(),
  versao: z.number().int().positive(),
  status_meta: statusMetaTemplate,
  ativo: z.boolean(),
  // Alerta de gênero (heurística, H13.10 🟡): trechos gendered no texto/rótulos
  // que salvaram mesmo assim (não bloqueia). Vazio quando neutro.
  avisos_genero: z.array(z.string()).default([]),
})
export type NovaMensagemResposta = z.infer<typeof novaMensagemResposta>

export const previewMensagemBody = z.object({
  conteudo: conteudoTemplate,
  variaveis: z.array(z.string()).default([]),
  valores: z.record(z.string(), z.string()).default({}),
})
export type PreviewMensagemBody = z.infer<typeof previewMensagemBody>

export const previewMensagemResposta = z.object({
  render: z.string(),
  // lint_ok cai com proibida OU travessão; gênero é só aviso e não afeta lint_ok.
  lint_ok: z.boolean(),
  palavra_proibida: z.string().nullable(),
  travessao: z.string().nullable(),
  // Alerta de gênero (heurística, H13.10 🟡): informa, nunca bloqueia.
  avisos_genero: z.array(z.string()).default([]),
})
export type PreviewMensagemResposta = z.infer<typeof previewMensagemResposta>

// ---- Envelope de erro padrão ----
export const erroResposta = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
})
export type ErroResposta = z.infer<typeof erroResposta>
