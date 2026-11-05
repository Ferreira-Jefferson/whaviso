// Contratos de borda do modulo `suporte`. Fonte unica: contracts/suporte (o codegen reemite para
// o front). Aqui so os parametros de rota (plumbing server-side). Reexporta os schemas publicos.
import { z } from 'zod'

export {
  ChamadoResumo,
  ChamadoMensagem,
  ChamadoFicha,
  ListaChamados,
  ChamadoPagina,
  NovoChamado,
  NovaMensagem,
  PatchChamado,
  SuporteChamadosQuery,
  AcessoSuporte,
  ListaAcessos,
  NovoAcesso,
} from '@whaviso/shared/contracts'

/** Parametro de rota `:id` (chamado ou acesso). */
export const IdParams = z.strictObject({ id: z.uuid() })

/** Parametro de rota `:lojaId` do console (loja alvo vem SEMPRE de params, nunca do corpo). */
export const LojaIdParams = z.strictObject({ lojaId: z.uuid() })
