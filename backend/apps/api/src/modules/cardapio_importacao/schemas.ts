// Contratos de borda do modulo cardapio_importacao. Fonte unica: contracts/cardapio_importacao do
// @whaviso/shared (o codegen reemite para o front). Aqui so o parametro de rota :id.
// TODO(integrador): depois de `export * from './cardapio_importacao'` no barrel de contracts, trocar
// o import relativo abaixo por '@whaviso/shared/contracts' (padrao do projeto; ver o modulo campanhas).
import { z } from 'zod'

export {
  ImportacaoCardapioCriar,
  ImportacaoCardapioEditar,
  ImportacaoCardapioCriada,
  ImportacaoCardapioEstado,
  ImportacoesCardapioSaida,
  ImportacaoCardapioAprovadaSaida,
  ImportacaoCardapioDescartadaSaida,
  RascunhoCardapio,
  IMPORTACAO_ARQUIVO_MAX_BYTES,
  type CardapioLote,
  type ImportacaoCardapioStatus,
  type ImportacaoTipoArquivo,
} from '@whaviso/shared/contracts'

export const IdParams = z.strictObject({ id: z.uuid() })
