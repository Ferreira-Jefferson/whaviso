// Contratos de borda do modulo canais. Fonte unica: contracts/canais do @whaviso/shared.
// TODO(integrador): depois de `export * from './canais'` no barrel de contracts, trocar o import
// relativo abaixo por '@whaviso/shared/contracts' (padrao do projeto; ver o modulo campanhas).
import { z } from 'zod'

export {
  canalTipo,
  CanalConectarEntrada,
  CanalPatch,
  CanalConfig,
  CanalEstado,
  CanaisSaida,
  CanalSincronizarSaida,
  CanalPedidosSaida,
  PedidoExterno,
  type CanalTipo,
} from '@whaviso/shared/contracts'

import { canalTipo } from '@whaviso/shared/contracts'

export const CanalParams = z.strictObject({ canal: canalTipo })
