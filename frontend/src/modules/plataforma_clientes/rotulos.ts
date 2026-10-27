// Rotulos e tons de exibicao do console de clientes. Significado nunca so por cor: sempre texto.
import type {
  PlataformaSaudeWhatsapp,
  PlataformaSituacaoConta,
} from '@/shared/contracts/_generated/plataforma_clientes'
import type { PapelMembro, PapelOperador, StatusNumero } from '@/shared/contracts/_generated/enums'

export type TomBadge = 'neutro' | 'marca' | 'sucesso' | 'atencao' | 'erro'

export const ROTULO_SITUACAO: Record<PlataformaSituacaoConta, string> = {
  trial: 'Em teste',
  ativa: 'Ativa',
  suspensa: 'Suspensa',
  cancelada: 'Cancelada',
  sem_assinatura: 'Sem assinatura',
}

export const TOM_SITUACAO: Record<PlataformaSituacaoConta, TomBadge> = {
  trial: 'marca',
  ativa: 'sucesso',
  suspensa: 'atencao',
  cancelada: 'erro',
  sem_assinatura: 'neutro',
}

export const ROTULO_SAUDE: Record<PlataformaSaudeWhatsapp, string> = {
  ok: 'WhatsApp em dia',
  atencao: 'WhatsApp pede atenção',
  sem_numero: 'Sem número',
}

export const TOM_SAUDE: Record<PlataformaSaudeWhatsapp, TomBadge> = {
  ok: 'sucesso',
  atencao: 'atencao',
  sem_numero: 'neutro',
}

export const ROTULO_STATUS_NUMERO: Record<StatusNumero, string> = {
  conectado: 'Conectado',
  pausado: 'Pausado',
  removido: 'Removido',
}

export const ROTULO_PAPEL_MEMBRO: Record<PapelMembro, string> = {
  dono: 'Dono',
  gerente: 'Gerente',
  atendente: 'Atendente',
}

export const ROTULO_PAPEL_OPERADOR: Record<PapelOperador, string> = {
  operador: 'Operador',
  admin: 'Administrador',
}

/** Id opaco encurtado para exibicao (o operador nao ve contato; so referencia). */
export function idCurto(id: string): string {
  return id.slice(0, 8)
}
