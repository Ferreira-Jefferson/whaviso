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

/**
 * Corpo de "anexar WABA existente" (console, sem Embedded Signup): ids da WABA/numero + um
 * access_token de system user com acesso a WABA. O `access_token` e segredo (SEC-020): entra so
 * no corpo, e cifrado no servico e nunca volta nem e logado (a redaction cobre `access_token`).
 */
export const numeroAnexarEntrada = z.strictObject({
  waba_id: z.string().trim().min(1).max(200),
  phone_number_id: z.string().trim().min(1).max(200),
  access_token: z.string().trim().min(1).max(1000),
})

/** Parametro de rota :id (numero); a loja e resolvida a partir dele. */
export const numeroIdParam = z.strictObject({ id: z.uuid() })
