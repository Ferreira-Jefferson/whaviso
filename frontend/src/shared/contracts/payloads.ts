// ESPELHO de backend/packages/shared/src/contracts/payloads.ts
// Cópia própria do frontend (standalone). Manter em sincronia com o backend.
import { z } from 'zod'
import {
  acaoDevedor,
  categoriaTemplate,
  contextoTemplate,
  direcaoAviso,
  etapaEnvio,
  papelAviso,
  statusAviso,
  statusMetaTemplate,
  tipoChavePix,
} from './enums'
import {
  avisoSchema,
  chavePixSchema,
  conteudoTemplate,
  dataCombinada,
  motivoAviso,
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
// O servidor expande em ocorrências (datas em America/Sao_Paulo); o cliente NUNCA calcula
// ocorrência. Recorrência NÃO é gated por plano (é facilitador, H11.5).
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
// receber: convido o DEVEDOR. pagar (invertido): EU sou o devedor e convido o COBRADOR.
export const criarAvisoBody = z
  .object({
    direcao: direcaoAviso,
    // H4.1: `enviar` envia o combinado agora; `agenda` só anota (nasce sem_aviso, sem envio).
    modo: z.enum(['enviar', 'agenda']).default('enviar'),
    nome_devedor: z.string().trim().min(1).max(120),
    telefone_devedor: telefoneE164.nullish(),
    nome_cobrador: z.string().trim().min(1).max(120).nullish(),
    telefone_cobrador: telefoneE164.nullish(),
    motivo: motivoAviso,
    valor_centavos: valorCentavos,
    data_combinada: dataCombinada,
    // Pix OBRIGATÓRIO no receber (H2.1): chave + titular + banco. Diferido no modo agenda.
    pix_chave: z.string().trim().max(140).nullish(),
    pix_titular: z.string().trim().max(120).nullish(),
    pix_banco: z.string().trim().max(80).nullish(),
    // Recorrência (E6 H6.10): ausente = combinado simples. NÃO gated por plano (facilitador,
    // H11.5); cada ocorrência reserva 1 vaga, validado no servidor. O servidor expande em
    // ocorrências; o cliente nunca calcula data de ocorrência.
    recorrencia: recorrenciaInput.nullish(),
    // Cadência configurável (E6 H6.10): subconjunto das 4 etapas; null = ciclo completo.
    // Gated por plano (cadencia_configuravel) no servidor.
    cadencia_etapas: z.array(etapaEnvio).min(1).max(4).nullish(),
  })
  // No modo `agenda` (H4.1) telefone e Pix são opcionais (cobrados só ao ativar).
  .refine((b) => b.modo === 'agenda' || b.direcao !== 'receber' || b.telefone_devedor != null, {
    message: 'telefone_devedor é obrigatório para receber',
    path: ['telefone_devedor'],
  })
  .refine((b) => b.modo === 'agenda' || b.direcao !== 'pagar' || (b.nome_cobrador != null && b.telefone_cobrador != null), {
    message: 'nome_cobrador e telefone_cobrador são obrigatórios para pagar',
    path: ['telefone_cobrador'],
  })
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
  // No invertido (pagar) a chave Pix é OPCIONAL ao enviar o combinado: o cobrador (quem vai
  // receber) pode informar/ajustar depois. Sem refine de Pix aqui (espelha o backend).
export type CriarAvisoBody = z.infer<typeof criarAvisoBody>

export const criarAvisoResposta = z.object({
  // E5: o Whaviso ENVIA o combinado direto ao convidado (resumo + botões), sem
  // compartilhamento manual; a api devolve só o aviso.
  aviso: avisoSchema,
})
export type CriarAvisoResposta = z.infer<typeof criarAvisoResposta>

// ---- POST /v1/avisos/:id/ativar (H4.3) ----
// Ativa uma anotação da agenda (sem_aviso -> aguardando_aceite): o Whaviso envia o
// combinado ao convidado. Devolve o MESMO formato da criação (só o aviso). Dados
// faltantes (telefone/Pix) podem vir no corpo.
export const ativarAvisoBody = z
  .object({
    telefone_devedor: telefoneE164.nullish(),
    nome_cobrador: z.string().trim().min(1).max(120).nullish(),
    telefone_cobrador: telefoneE164.nullish(),
    pix_chave: z.string().trim().max(140).nullish(),
    pix_titular: z.string().trim().max(120).nullish(),
    pix_banco: z.string().trim().max(80).nullish(),
    // Recorrência/cadência podem ser (re)definidas ao ATIVAR uma anotação da agenda.
    // Ausentes = mantém o que já estava (ou simples). Gated por plano no servidor.
    recorrencia: recorrenciaInput.nullish(),
    cadencia_etapas: z.array(etapaEnvio).min(1).max(4).nullish(),
  })
export type AtivarAvisoBody = z.infer<typeof ativarAvisoBody>

// ---- PATCH /v1/avisos/:id (editar, H2.5) ----
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
// H9.1/H9.3: filtra POR PAPEL (não direção; cobre o invertido), por `grupo` decidido no
// SERVIDOR (ativos/agenda/historico), busca por nome OU motivo, ordena por data combinada.
export const listarAvisosQuery = z.object({
  status: statusAviso.optional(),
  direcao: direcaoAviso.optional(),
  papel: papelAviso.optional(),
  grupo: z.enum(['ativos', 'agenda', 'historico']).optional(),
  busca: z.string().trim().min(1).max(120).optional(),
  ordenar: z.enum(['data_combinada', 'criado_em']).default('criado_em'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
})
export type ListarAvisosQuery = z.infer<typeof listarAvisosQuery>

// E5: o aceite por SITE saiu (aceite 100% pelo WhatsApp). Os contratos das rotas
// GET/POST /aceite/:token (`aceiteInfoResposta`/`aceitarBody`/`aceitarResposta`) foram
// removidos junto com a página pública. As ações do devedor por link (`/acao/:token`)
// continuam (E7), com seu próprio contrato `acaoResposta`.

// ---- POST /v1/auth/status-telefone (público; H1.2/H1.3) ----
// A UI consulta para escolher a copy do OTP: login (número já cadastrado) vs cadastro
// (número novo). Resposta mínima (só `existe`) para não vazar mais que a história pede.
export const statusTelefoneBody = z.object({
  telefone: z.string(),
})
export type StatusTelefoneBody = z.infer<typeof statusTelefoneBody>

export const statusTelefoneResposta = z.object({
  existe: z.boolean(),
  metodo: z.enum(['phone', 'google']).nullable(),
})
export type StatusTelefoneResposta = z.infer<typeof statusTelefoneResposta>

// ---- POST /v1/auth/verificar-sessao (autenticado; chamado após OTP login) ----
// 'ok': phone user existente ou Google, sem ação.
// 'novo': novo usuário, vai para onboarding.
// 'mesclado': split resolvido, usar magic_token para trocar a sessão para a conta Google.
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

// Resposta da ação pública: `aplicado` = false quando o aviso já estava em
// estado terminal (idempotente). `status` reflete o estado atual do aviso.
export const acaoResposta = z.object({
  status: statusAviso,
  aplicado: z.boolean(),
})
export type AcaoResposta = z.infer<typeof acaoResposta>

// ---- GET /v1/painel/resumo ----
// Totais POR PAPEL (H9.2) em centavos, calculados no backend. Terminais não-pagos fora.
// Campos legados mantidos (billing.useUsoAtivos).
export const painelResumoQuery = z.object({
  de: dataCombinada.optional(),
  ate: dataCombinada.optional(),
})
export const painelResumoResposta = z.object({
  a_receber_centavos: z.number().int(),
  a_receber_qtd: z.number().int(),
  recebido_centavos: z.number().int(),
  recebido_qtd: z.number().int(),
  a_pagar_centavos: z.number().int(),
  a_pagar_qtd: z.number().int(),
  pago_centavos: z.number().int(),
  pago_qtd: z.number().int(),
  // Legado (compatibilidade).
  pendentes_centavos: z.number().int(),
  recebidos_centavos: z.number().int(),
  pagos_centavos: z.number().int(),
  qtd_pendentes: z.number().int(),
  qtd_aguardando_aceite: z.number().int(),
})
export type PainelResumoResposta = z.infer<typeof painelResumoResposta>

// ---- GET /v1/painel/pendencias ("precisa de você", H9.2) ----
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

export const criarChavePixBody = z.object({
  tipo: tipoChavePix,
  chave: z.string().trim().min(1).max(140),
  rotulo: z.string().trim().max(60).nullish(),
  // titular + banco (0044) obrigatórios: a chave os carrega para o aviso herdar.
  titular: z.string().trim().min(1).max(120),
  banco: z.string().trim().min(1).max(80),
  padrao: z.boolean().optional(),
})
export type CriarChavePixBody = z.infer<typeof criarChavePixBody>

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

// ---- GET /v1/admin/metricas (owner) ----
// O backend agrega contagens por status; chaves são os valores dos enums, mas
// nem todo status aparece (group by só traz os existentes) → record parcial.
export const adminMetricasResposta = z.object({
  avisos_por_status: z.record(z.string(), z.number().int()),
  envios_por_status: z.record(z.string(), z.number().int()),
  total_usuarios: z.number().int(),
})
export type AdminMetricasResposta = z.infer<typeof adminMetricasResposta>

// ---- GET /v1/admin/usuarios (owner): perfil + suspensão + SALDO da carteira (E11) ----
export const adminUsuarioSchema = perfilSchema.extend({
  nome: z.string().max(120),
  suspenso: z.boolean(),
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

// ---- PATCH /v1/admin/usuarios/:id (owner): suspende/reativa ----
// E11: a troca de plano saiu (não há planos). Creditar envios é endpoint próprio.
export const adminAtualizarUsuarioBody = z.object({
  suspenso: z.boolean(),
})
export type AdminAtualizarUsuarioBody = z.infer<typeof adminAtualizarUsuarioBody>

// ---- POST /v1/admin/usuarios/:id/creditar (owner credita envios, H11.11) ----
export const adminCreditarBody = z.object({
  quantidade: z.number().int().min(1).max(100000),
})
export type AdminCreditarBody = z.infer<typeof adminCreditarBody>

export const adminCarteiraResposta = z.object({
  id: z.string(),
  saldo_livre: z.number().int(),
  reservado: z.number().int(),
  em_hold: z.number().int(),
  consumido: z.number().int(),
  ja_comprou: z.boolean(),
})
export type AdminCarteiraResposta = z.infer<typeof adminCarteiraResposta>

// Templates de mensagem: a maquinaria de edição (listar/propor/preview/ativar/
// aprovar/apagar) vive em /v1/admin/mensagens (templates unificados por chave),
// mais abaixo neste arquivo. Não há mais /admin/templates.

// ---- Catálogo de créditos (curva de MARCOS + cortesia + tetos de agenda, E11) ----
// 1 linha; o owner edita os valores em runtime. A curva é uma tabela de marcos
// {envios, centavos} onde centavos = R$/envio NAQUELE marco; entre marcos o R$/envio é
// interpolado e o total de n envios é round(n * R$/envio(n)). Marcos ordenados por `envios`,
// estritamente crescentes (>= 2). Mesma função no front e no back (fonte única do preço).
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
  envios_min: z.number().int(),
  envios_max: z.number().int(),
  curva: curvaMarcosSchema,
  cortesia_inicial: z.number().int(),
  agenda_teto_free: z.number().int(),
  agenda_teto_pago: z.number().int(),
})
export type CreditosCatalogo = z.infer<typeof creditosCatalogoSchema>

// ---- PATCH /v1/admin/creditos-catalogo (owner edita a curva, H11.11) ----
// envios_min/max derivam do primeiro/último marco da curva (não editados direto).
export const adminAtualizarCreditosCatalogoBody = z
  .object({
    curva: curvaMarcosSchema.optional(),
    cortesia_inicial: z.number().int().min(0).optional(),
    agenda_teto_free: z.number().int().min(0).optional(),
    agenda_teto_pago: z.number().int().min(0).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'informe ao menos um campo' })
export type AdminAtualizarCreditosCatalogoBody = z.infer<typeof adminAtualizarCreditosCatalogoBody>

// ---- POST /v1/billing/recarga (H11.10) ----
// Confirma a recarga: o servidor valida a quantidade, recalcula o valor e ENFILEIRA a
// mensagem de compra (template + chave Pix da plataforma) ao WhatsApp do próprio usuário.
// A chave Pix NUNCA volta no HTTP (H13.8): ela só vai na mensagem do WhatsApp.
export const recargaBody = z.object({
  quantidade: z.number().int().min(1),
})
export type RecargaBody = z.infer<typeof recargaBody>

export const recargaResposta = z.object({
  enfileirado: z.boolean(),
  quantidade: z.number().int(),
  valor_centavos: valorCentavos,
  // Número da conversa (só dígitos com DDI) para o link "abrir conversa": é o próprio
  // número pareado pelo zap (whats_sessao), não uma env. null se a sessão está desconectada.
  telefone_vendas: z.string().nullable(),
})
export type RecargaResposta = z.infer<typeof recargaResposta>

// ---- GET/PATCH /v1/admin/config-plataforma (chave Pix da plataforma, owner) ----
// Config singleton (0059) com a chave Pix do whaviso (tipo/chave/titular/banco + comentário).
// Todos NULLABLE: nasce vazia e o owner preenche. Só o owner lê/edita.
export const configPlataformaSchema = z.object({
  pix_tipo: tipoChavePix.nullable(),
  pix_chave: z.string().max(140).nullable(),
  pix_titular: z.string().max(120).nullable(),
  pix_banco: z.string().max(80).nullable(),
  pix_comentario: z.string().max(140).nullable(),
})
export type ConfigPlataforma = z.infer<typeof configPlataformaSchema>

// PATCH parcial (ao menos um campo). nullish permite limpar. Tamanhos espelham chaves_pix.
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

// ---- GET /v1/billing/carteira (JWT) ----
// Saldo (espelho do servidor) + curva do catálogo para o slider de compra (H11.8/H11.3).
export const carteiraSchema = z.object({
  saldo_livre: z.number().int(),
  reservado: z.number().int(),
  em_hold: z.number().int(),
  consumido: z.number().int(),
  ja_comprou: z.boolean(),
})
export type Carteira = z.infer<typeof carteiraSchema>

export const carteiraResposta = z.object({
  carteira: carteiraSchema,
  catalogo: creditosCatalogoSchema,
})
export type CarteiraResposta = z.infer<typeof carteiraResposta>

// ---- GET /v1/billing/extrato (JWT) ----
// Lançamentos da conta (compra/crédito/reserva/consumo/devolução/hold), paginado.
export const tipoLancamento = z.enum([
  'cortesia',
  'compra',
  'credito_owner',
  'reserva',
  'consumo',
  'devolucao',
  'hold',
  'estorno',
])
export type TipoLancamento = z.infer<typeof tipoLancamento>

export const lancamentoSchema = z.object({
  id: z.string(),
  tipo: tipoLancamento,
  quantidade: z.number().int(),
  ref_tipo: z.string().nullable(),
  ref_id: z.string().nullable(),
  ator: z.string().nullable(),
  criado_em: z.coerce.date(),
})
export type Lancamento = z.infer<typeof lancamentoSchema>

export const extratoResposta = z.object({
  itens: z.array(lancamentoSchema),
  total: z.number().int(),
  page: z.number().int(),
  per_page: z.number().int(),
})
export type ExtratoResposta = z.infer<typeof extratoResposta>

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
    // Categoria (default UTILITY) + amostras por variável p/ o `example` da Meta.
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
  // Alerta de gênero (heurística, H13.10 🟡): trechos gendered que salvaram mesmo
  // assim (não bloqueia). Vazio quando neutro.
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
