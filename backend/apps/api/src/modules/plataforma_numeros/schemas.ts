// Contratos de borda das rotas do CONSOLE de numeros. Os corpos e as saidas sao os MESMOS
// contratos publicos do numero (fonte unica em @whaviso/shared/contracts): o console reusa o
// contrato da loja, nao duplica. Aqui ficam apenas os parametros de ROTA (a loja alvo e o id do
// numero vem SEMPRE de params validados, nunca do corpo/query; o operador e global, SEC-002).
import { z } from 'zod'

export {
  numeroConectarEntrada,
  numeroReconectarEntrada,
  numeroStatusEntrada,
  numeroSaida,
  listaNumerosSaida,
} from '@whaviso/shared/contracts'

/** Parametro de rota :lojaId (loja alvo). */
export const lojaIdParam = z.strictObject({ lojaId: z.uuid() })

/** Parametro de rota :id (numero); a loja e resolvida a partir dele. */
export const numeroIdParam = z.strictObject({ id: z.uuid() })
