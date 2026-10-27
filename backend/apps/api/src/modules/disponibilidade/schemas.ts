// Contratos de borda do modulo disponibilidade. Fonte unica: @whaviso/shared/contracts (o codegen
// reemite para o front). Aqui fica apenas o parametro de rota :id (plumbing server-side).
import { z } from 'zod'

export {
  Hhmm,
  DiaSemana,
  DataIso,
  HorarioEntrada,
  HorarioPatch,
  HorarioSaida,
  HorarioListaSaida,
  JanelaAtendenteEntrada,
  JanelaAtendenteSaida,
  JanelaAtendenteGetSaida,
  ExcecaoEntrada,
  ExcecaoSaida,
  ExcecaoListaSaida,
  DisponibilidadeAgoraSaida,
  type HorarioEntrada as THorarioEntrada,
  type HorarioPatch as THorarioPatch,
  type JanelaAtendenteEntrada as TJanelaAtendenteEntrada,
  type ExcecaoEntrada as TExcecaoEntrada,
} from '@whaviso/shared/contracts'

export const IdParams = z.strictObject({ id: z.uuid() })
