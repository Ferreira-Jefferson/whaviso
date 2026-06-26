import { z } from 'zod'
import {
  acaoDevedor,
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
  chavePixSchema,
  conteudoTemplate,
  dataCombinada,
  envioSchema,
  eventoAvisoSchema,
  motivoAviso,
  ocorrenciaSchema,
  perfilSchema,
  telefoneE164,
  templateSchema,
  valorCentavos,
} from './entidades'

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
    valor_centavos: valorCentavos,
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
  })
  // No modo `agenda` (H4.1) telefone e Pix são OPCIONAIS (cobrados só ao ativar, H4.3):
  // todos os refines abaixo só valem quando o item já vai enviar (modo `enviar`).
  .refine((b) => b.modo === 'agenda' || b.direcao !== 'receber' || b.telefone_devedor != null, {
    message: 'telefone_devedor é obrigatório para receber',
    path: ['telefone_devedor'],
  })
  .refine((b) => b.modo === 'agenda' || b.direcao !== 'pagar' || (b.nome_cobrador != null && b.telefone_cobrador != null), {
    message: 'nome_cobrador e telefone_cobrador são obrigatórios para pagar',
    path: ['telefone_cobrador'],
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

// Resposta da criação (H2.2): além do aviso e do link de aceite (legado, E5 vai
// reformular), devolve o NÚMERO DE CONVITE em claro (xxx-xxx; única vez que sai), a
// MENSAGEM PRONTA para o cobrador compartilhar (intro + número + link) e o LINK wa.me
// do WhatsApp do Whaviso já com a mensagem inicial pré-preenchida. No invertido/agenda
// (sem número) esses campos vêm null.
export const criarAvisoResposta = z.object({
  aviso: avisoSchema,
  numero_convite: z.string().nullable(),
  mensagem_convite: z.string().nullable(),
  link_whatsapp: z.string().nullable(),
})
export type CriarAvisoResposta = z.infer<typeof criarAvisoResposta>

// ---- POST /v1/avisos/:id/ativar (H4.3) ----
// Ativa uma anotação da agenda: sem_aviso -> aguardando_aceite. GERA o número de
// convite (mesma mecânica da criação) e devolve a mensagem pronta UMA vez (claro nunca
// persiste). Telefone/Pix faltantes podem vir no corpo (preenchidos no momento de
// ativar); se ainda assim faltarem, o serviço recusa com `dado_obrigatorio_ativacao`.
// A resposta tem o MESMO formato da criação (aviso + convite), pois o front reaproveita
// a tela de "convite pronto".
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
    valor_centavos: valorCentavos.optional(),
    data_combinada: dataCombinada.optional(),
    pix_chave: z.string().trim().min(1).max(140).optional(),
    pix_titular: z.string().trim().min(1).max(120).optional(),
    pix_banco: z.string().trim().min(1).max(80).optional(),
  })
  .refine(
    (b) =>
      b.nome_devedor !== undefined ||
      b.motivo !== undefined ||
      b.valor_centavos !== undefined ||
      b.data_combinada !== undefined ||
      b.pix_chave !== undefined ||
      b.pix_titular !== undefined ||
      b.pix_banco !== undefined,
    { message: 'informe ao menos um campo para editar' },
  )
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
})
export type StatusTelefoneResposta = z.infer<typeof statusTelefoneResposta>

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

// ---- PATCH /v1/perfil ----
export const atualizarPerfilBody = z.object({
  nome: z.string().trim().min(1).max(120).optional(),
  telefone: telefoneE164.nullish(),
})
export type AtualizarPerfilBody = z.infer<typeof atualizarPerfilBody>

// ---- /v1/perfil/chaves-pix ----
export const listaChavesPixResposta = z.array(chavePixSchema)
export type ListaChavesPixResposta = z.infer<typeof listaChavesPixResposta>

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

// ---- Catálogo de créditos (curva de preço + cortesia + tetos de agenda) ----
export const creditosCatalogoSchema = z.object({
  envios_min: z.number().int().min(1),
  envios_max: z.number().int().min(1),
  preco_centavos: z.number().int().min(0),
  preco_max_centavos: z.number().int().min(0),
  cortesia_inicial: z.number().int().min(0),
  agenda_teto_free: z.number().int().min(0),
  agenda_teto_pago: z.number().int().min(0),
})
export type CreditosCatalogo = z.infer<typeof creditosCatalogoSchema>

// ---- PATCH /v1/admin/creditos-catalogo (owner edita a curva, H11.11) ----
// Atualização PARCIAL: todos os campos opcionais (ao menos um). Espelha as CHECKs da
// migration 0057 (preço >= 0, piso <= topo, envios_min <= envios_max, agenda free <=
// pago) quando os dois lados vierem juntos, para erro limpo em vez de violar constraint.
export const adminAtualizarCreditosCatalogoBody = z
  .object({
    envios_min: z.number().int().min(1).optional(),
    envios_max: z.number().int().min(1).optional(),
    preco_centavos: z.number().int().min(0).optional(),
    preco_max_centavos: z.number().int().min(0).optional(),
    cortesia_inicial: z.number().int().min(0).optional(),
    agenda_teto_free: z.number().int().min(0).optional(),
    agenda_teto_pago: z.number().int().min(0).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'informe ao menos um campo' })
  .refine(
    (b) => b.envios_min === undefined || b.envios_max === undefined || b.envios_max >= b.envios_min,
    { message: 'envios_max não pode ser menor que envios_min' },
  )
  .refine(
    (b) =>
      b.preco_centavos === undefined ||
      b.preco_max_centavos === undefined ||
      b.preco_max_centavos >= b.preco_centavos,
    { message: 'o topo do preço não pode ser menor que o piso' },
  )
  .refine(
    (b) =>
      b.agenda_teto_free === undefined ||
      b.agenda_teto_pago === undefined ||
      b.agenda_teto_pago >= b.agenda_teto_free,
    { message: 'o teto de agenda após a compra não pode ser menor que o do free' },
  )
export type AdminAtualizarCreditosCatalogoBody = z.infer<typeof adminAtualizarCreditosCatalogoBody>

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
    nome_meta: z.string().trim().min(1).max(120),
    idioma: z.string().default('pt_BR'),
    conteudo: conteudoTemplate,
    variaveis: z.array(z.string()).default([]),
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
