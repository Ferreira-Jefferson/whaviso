// Contratos de borda do cardapio. Fonte unica: @whaviso/shared/contracts (o codegen
// reemite para o front). Aqui fica apenas o parametro de rota :id.
import { z } from 'zod'
import { UuidSchema } from '@whaviso/shared/contracts'

export {
  type TipoGrupo,
  Janela,
  Programacao,
  ReordenarEntrada,
  OpcaoCriar,
  OpcaoAtualizar,
  OpcaoSaida,
  GrupoCriar,
  GrupoAtualizar,
  Impacto,
  GrupoSaida,
  GrupoMutacaoSaida,
  OpcaoMutacaoSaida,
  GruposSaida,
  CategoriaCriar,
  CategoriaAtualizar,
  VinculoCategoria,
  CategoriaGruposEntrada,
  CategoriaSaida,
  ImagemUrl,
  ItemCriar,
  ItemAtualizar,
  ExcecaoItem,
  ItemGruposEntrada,
  ItemSaida,
  ItemMutacaoSaida,
  DisponibilidadeEntrada,
  DisponibilidadeSaida,
  GrupoResolvido,
  ItemResolvido,
  CategoriaResolvida,
  CardapioResolvidoSaida,
} from '@whaviso/shared/contracts'

export const ParamId = z.strictObject({ id: UuidSchema })
