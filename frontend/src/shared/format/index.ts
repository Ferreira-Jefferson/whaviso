// Formatação e rótulos: ÚNICA FONTE da linguagem da UI.
// Regra de Ouro (PROJETO.md): só linguagem permitida, "aviso/lembrete/
// combinado/acordo"; a lista de termos proibidos vive em contracts/linguagem.ts.
// Os rótulos abaixo são auditados pelo teste de linguagem (linguagem.test.ts).
import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type {
  StatusAviso,
  StatusEnvio,
  EtapaEnvio,
  DirecaoAviso,
  PapelAviso,
  TipoEvento,
  AtorEvento,
  StatusMetaTemplate,
  TipoChavePix,
  Envio,
  Aviso,
} from '../contracts'

const FUSO = 'America/Sao_Paulo'

/** Converte centavos (int) em string BRL. Único ponto de conversão de dinheiro. */
export function brl(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

/** Formata uma data de negócio (Date ou 'YYYY-MM-DD') em pt-BR, fuso de SP. */
export function dataPtBR(date: Date | string): string {
  const d =
    typeof date === 'string'
      ? new TZDate(`${date}T12:00:00`, FUSO)
      : new TZDate(date, FUSO)
  return format(d, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
}

/** Formata data + hora (Date ou ISO) em pt-BR, fuso de SP. Para eventos/envios. */
export function dataHoraPtBR(date: Date | string): string {
  const d = typeof date === 'string' ? new TZDate(date, FUSO) : new TZDate(date, FUSO)
  return format(d, "dd 'de' MMM 'de' yyyy 'às' HH:mm", { locale: ptBR })
}

/** Formata só o dia curto (Date ou 'YYYY-MM-DD') em pt-BR, fuso de SP. Para a timeline. */
export function diaCurtoPtBR(date: Date | string): string {
  const d =
    typeof date === 'string'
      ? new TZDate(`${date}T12:00:00`, FUSO)
      : new TZDate(date, FUSO)
  return format(d, "dd 'de' MMM", { locale: ptBR })
}

/** Formata um telefone E.164 (+5511999998888) de forma legível. */
export function telefone(e164: string | null | undefined): string {
  if (!e164) return ''
  const m = /^\+(\d{2})(\d{2})(\d{4,5})(\d{4})$/.exec(e164)
  if (!m) return e164
  const [, pais, ddd, parte1, parte2] = m
  return `+${pais} (${ddd}) ${parte1}-${parte2}`
}

// ---- Rótulos de status do aviso (cores definidas em StatusBadge) ----
// Rótulos canônicos da H9.3. `informado_pago` tem variante por papel: para o COBRADOR
// é "Aguardando sua confirmação" (rotuloStatusAviso(status, papel)); o mapa fixo é a
// versão neutra ("Pagamento informado"). Sem termos proibidos, gênero neutro.
export const ROTULO_STATUS_AVISO: Record<StatusAviso, string> = {
  sem_aviso: 'Sem aviso',
  aguardando_aceite: 'Aguardando aceite',
  programado: 'Programado',
  aguardando_aprovacao_aviso_editado: 'Aguardando aprovação da edição',
  pausado: 'Pausado',
  informado_pago: 'Pagamento informado',
  desregistrado: 'Lembretes desativados',
  pago: 'Recebido',
  cancelado: 'Cancelado',
  recusado: 'Recusado',
  expirado: 'Encerrado sem confirmação',
}

/**
 * Rótulo do estado SENSÍVEL AO PAPEL (H9.3): para o cobrador, `informado_pago` aparece
 * como "Aguardando sua confirmação" (a ação é dele). Demais estados usam o mapa fixo.
 */
export function rotuloStatusAviso(status: StatusAviso, papelDoUsuario?: PapelAviso): string {
  if (status === 'informado_pago' && papelDoUsuario === 'cobrador') {
    return 'Aguardando sua confirmação'
  }
  return ROTULO_STATUS_AVISO[status]
}

// ---- Rótulos de status do envio (processando é exibido como agendado) ----
export const ROTULO_STATUS_ENVIO: Record<StatusEnvio, string> = {
  agendado: 'Agendado',
  processando: 'Agendado',
  enviado: 'Enviado',
  falhou: 'Não enviado',
  cancelado: 'Cancelado',
}

// Situação visível de um envio (H9.7): refina o status cru com a semântica de RETRY.
// `falhou` = falha PERSISTENTE (3 retries esgotados, ver E6 H6.8); enquanto há nova
// tentativa marcada o backend mantém o envio em agendado/processando com tentativas>0
// e proxima_tentativa_em futura -> exibimos "Em nova tentativa". Nada sensível.
export type SituacaoEnvio = 'agendado' | 'em_retry' | 'enviado' | 'falhou' | 'cancelado'

export function situacaoEnvio(envio: Pick<Envio, 'status' | 'tentativas' | 'proxima_tentativa_em'>): SituacaoEnvio {
  if (envio.status === 'enviado') return 'enviado'
  if (envio.status === 'cancelado') return 'cancelado'
  if (envio.status === 'falhou') return 'falhou' // persistente (retries esgotados)
  // agendado/processando: se já tentou e há próxima tentativa futura, é retry.
  const proxima = envio.proxima_tentativa_em
  if (envio.tentativas > 0 && proxima && proxima.getTime() > Date.now()) return 'em_retry'
  return 'agendado'
}

export const ROTULO_SITUACAO_ENVIO: Record<SituacaoEnvio, string> = {
  agendado: 'Agendado',
  em_retry: 'Em nova tentativa',
  enviado: 'Enviado',
  falhou: 'Não enviado',
  cancelado: 'Cancelado',
}

// ---- Rótulos das etapas do ciclo de lembretes ----
export const ROTULO_ETAPA: Record<EtapaEnvio, string> = {
  d_menos_2: 'D-2 · aviso antecipado',
  d_menos_1: 'D-1 · organização',
  d: 'D · no dia',
  d_mais_1: 'D+1 · último lembrete',
}

// ---- Rótulos de direção ----
export const ROTULO_DIRECAO: Record<DirecaoAviso, string> = {
  receber: 'A receber',
  pagar: 'A pagar',
}

/**
 * Papel do USUÁRIO logado NAQUELE combinado (H9.1/H9.4): cobrador se o cobrador_id é
 * dele, devedor se o devedor_profile_id é dele. null se não consegue determinar (sem
 * perfil carregado, ou vínculo só por telefone ainda não materializado). Deriva do
 * banco (ids), nunca recalcula regra de negócio.
 */
export function papelDoUsuario(
  aviso: Pick<Aviso, 'cobrador_id' | 'devedor_profile_id'>,
  profileId: string | null | undefined,
): PapelAviso | null {
  if (!profileId) return null
  if (aviso.cobrador_id === profileId) return 'cobrador'
  if (aviso.devedor_profile_id === profileId) return 'devedor'
  return null
}

// ---- Rótulos de PAPEL (visão do painel, H9.1) ----
// O painel é por PAPEL, não por direção: "A receber" = sou cobrador; "A pagar" = sou
// devedor. Cobre os dois fluxos (receber e pagar invertido).
export const ROTULO_PAPEL: Record<PapelAviso, string> = {
  cobrador: 'A receber',
  devedor: 'A pagar',
}

// ---- Rótulos do tipo de chave Pix ----
export const ROTULO_TIPO_CHAVE: Record<TipoChavePix, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'E-mail',
  telefone: 'Telefone',
  aleatoria: 'Chave aleatória',
}

// ---- Rótulos do status do template na Meta (área admin) ----
// Sem cor aqui (definida no componente que o usa); só o rótulo pt-BR.
export const ROTULO_STATUS_META: Record<StatusMetaTemplate, string> = {
  pendente: 'Aguardando aprovação',
  aprovado: 'Aprovado na Meta',
  rejeitado: 'Recusado pela Meta',
}

// ---- Rótulos dos eventos do aviso (notificações in-app, risco nº 10) ----
// Linguagem das Regras de Ouro: só "aviso/lembrete/combinado" (ver linguagem.ts).
export const ROTULO_EVENTO: Record<TipoEvento, string> = {
  criado: 'Combinado criado',
  convite_gerado: 'Convite gerado',
  aceite: 'Combinado aceito',
  ativado: 'Lembretes ativados',
  editado: 'Combinado editado',
  editado_aprovado: 'Edição aprovada',
  editado_recusado: 'Edição recusada',
  pausado: 'Lembretes pausados',
  reativado: 'Lembretes retomados',
  desregistrado: 'Lembretes desativados',
  reregistrado: 'Lembretes reativados',
  ja_paguei_devedor: 'Informou que pagou',
  confirmado_cobrador: 'Recebimento confirmado',
  marcado_pago_cobrador: 'Marcado como recebido',
  rejeitado_cobrador: 'Recebimento ainda não confirmado',
  desmarcado_cobrador: 'Combinado reaberto',
  reaberto_cobrador: 'Combinado reaberto',
  reengajamento_cobrador: 'Reengajamento enviado',
  pago_manual: 'Marcado como recebido',
  optout: 'Saiu dos lembretes',
  cancelado_cobrador: 'Combinado cancelado',
  cancelado_criador: 'Combinado cancelado',
  expirado: 'Encerrado sem confirmação',
  solicitou_pix: 'Pediu a chave Pix',
  recusado: 'Convite recusado',
}

// ---- Rótulos do ator de um evento ----
// Mapa absoluto (papel do ator, sem perspectiva). Mantido para usos que não conhecem o
// papel do usuário; o painel usa `rotuloAtor` (relativo) para não inverter "Você".
export const ROTULO_ATOR: Record<AtorEvento, string> = {
  cobrador: 'Quem recebe',
  devedor: 'Quem paga',
  sistema: 'Sistema',
  admin: 'Administração',
}

/**
 * Rótulo do ator RELATIVO ao papel do usuário NAQUELE combinado (H9.4). O `ator` do
 * evento é sempre o PAPEL concreto (cobrador/devedor/sistema/admin). Se o usuário é o
 * cobrador, um evento com ator 'cobrador' é "Você" e 'devedor' é "A outra pessoa"; se o
 * usuário é o devedor (visão "A pagar"), inverte. Assim a linha do tempo distingue
 * "pagamento informado pela outra pessoa" de "confirmado por você" nos DOIS lados, sem
 * assumir que o usuário logado é sempre o cobrador. Gênero neutro.
 */
export function rotuloAtor(ator: AtorEvento, papelDoUsuario: PapelAviso | null): string {
  if (ator === 'sistema') return 'Sistema'
  if (ator === 'admin') return 'Administração'
  if (!papelDoUsuario) return ROTULO_ATOR[ator]
  return ator === papelDoUsuario ? 'Você' : 'A outra pessoa'
}
