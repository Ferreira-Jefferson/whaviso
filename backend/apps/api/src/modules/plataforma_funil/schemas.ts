// Contratos de borda do modulo plataforma_funil. Fonte unica: contracts/plataforma_funil.
// Import relativo ate o barrel ganhar `export * from './plataforma_funil'`; depois trocar por
// '@whaviso/shared/contracts'. Aqui ficam apenas os parametros de rota.
import { z } from 'zod'
import { UuidSchema } from '@whaviso/shared/contracts'

export {
  ProspectoCriar,
  ProspectoPatch,
  ProspectoDTO,
  ProspectoDetalheDTO,
  ProspectoListaQuery,
  ProspectoPagina,
  EstagioMudar,
  VincularConta,
  AtividadeCriar,
  AtividadeDTO,
  AtividadeListaQuery,
  AtividadePagina,
  QuadroQuery,
  FunilQuadro,
  AgendaQuery,
  AgendaFollowUp,
  AgendaFollowUpLista,
  type ProspectoNovo,
  type ProspectoAtualizacao,
  type ProspectoDto,
  type ProspectoDetalheDto,
  type ProspectoFiltros,
  type EstagioMudarEntrada,
  type AtividadeNova,
  type AtividadeDto,
  type FunilQuadroDto,
  type AgendaFollowUpDto,
} from '@whaviso/shared/contracts'

export const IdParams = z.strictObject({ id: UuidSchema })
