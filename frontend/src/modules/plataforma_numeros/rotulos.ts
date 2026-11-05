// Rotulos e tons de exibicao do console de numeros. Significado nunca so por cor: sempre texto.
// Primitivo LOCAL (replica os rotulos usados do modulo plataforma_usuarios; modulo nunca importa modulo).
import type {
  PlataformaSaudeWhatsapp,
  PlataformaSituacaoConta,
} from '@/shared/contracts/_generated/plataforma_usuarios'

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
