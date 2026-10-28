// Contratos de borda do modulo despacho. Fonte unica: @whaviso/shared/contracts (o codegen reemite
// para o front). Aqui ficam apenas os parametros de rota.
import { z } from 'zod'
import { UuidSchema } from '@whaviso/shared/contracts'

export {
  AtribuirMotoboyEntrada,
  CorridaEntrada,
  AdicionarPedidosEntrada,
  ReordenarParadasEntrada,
  PedidoDespachoSaida,
  CorridaSaida,
  DespachoPainelSaida,
  MotoboySeletorSaida,
  MotoboySeletorListaSaida,
  type CorridaSaida as CorridaDto,
  type PedidoDespachoSaida as PedidoDespachoDto,
  type DespachoPainelSaida as DespachoPainelDto,
  type ParadaSaida as ParadaDto,
  type PedidoProntoSaida as PedidoProntoDto,
  type MotoboyCargaSaida as MotoboyCargaDto,
  type MotoboySeletorSaida as MotoboySeletorDto,
  type MotoboySeletorListaSaida as MotoboySeletorListaDto,
} from '@whaviso/shared/contracts'

export const IdParams = z.strictObject({ id: UuidSchema })
export const CorridaPedidoParams = z.strictObject({ id: UuidSchema, pedidoId: UuidSchema })
