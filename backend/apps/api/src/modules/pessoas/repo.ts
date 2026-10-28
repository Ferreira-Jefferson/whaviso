// Leitura do modulo: SO via @whaviso/shared/db, sempre com sql`...` (parametrizado). Tudo filtra
// por loja_id (multi-tenant). Cargos de plataforma (loja_id NULL) sao visiveis a todas as lojas;
// pessoas/escalas sao sempre da loja. Nunca seleciona telefone em claro (so o cifrado).
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'

const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)
const HM = (col: string): Consulta => sqlBruto(`to_char(${col}, 'HH24:MI')`)

export interface CargoLinha {
  id: string
  loja_id: string | null
  chave: string | null
  nome: string
  sistema: boolean
  ativo: boolean
  criado_em: string
  atualizado_em: string
}

export interface PessoaLinha {
  id: string
  nome: string
  cargo_id: string
  cargo_nome: string
  cargo_chave: string | null
  telefone_cifrado: Buffer | null
  observacoes: string | null
  ativo: boolean
  criado_em: string
  atualizado_em: string
}

export interface EscalaLinha {
  id: string
  pessoa_id: string
  dia_semana: number
  entrada: string
  saida: string
  ativo: boolean
  criado_em: string
}

const COLS_CARGO = sql`id, loja_id, chave, nome, sistema, ativo,
  ${TS('criado_em')} as criado_em, ${TS('atualizado_em')} as atualizado_em`

/** Cargos visiveis a loja: presets de plataforma ativos + os cargos proprios da loja (todos). */
export async function listarCargos(exec: Executor, lojaId: string) {
  return consultar<CargoLinha>(
    exec,
    sql`select ${COLS_CARGO} from public.cargos
         where (loja_id is null and ativo) or loja_id = ${lojaId}
         order by sistema desc, nome`,
  )
}

/** Cargo que a loja PODE usar/ver: preset de plataforma ou o proprio cargo da loja. */
export async function obterCargoVisivel(exec: Executor, lojaId: string, id: string) {
  return consultarUm<CargoLinha>(
    exec,
    sql`select ${COLS_CARGO} from public.cargos
         where id = ${id} and (loja_id is null or loja_id = ${lojaId})`,
  )
}

/** Cargo que a loja PODE editar: apenas o proprio (loja_id = loja). Preset nunca entra. */
export async function obterCargoDaLoja(exec: Executor, lojaId: string, id: string) {
  return consultarUm<CargoLinha>(
    exec,
    sql`select ${COLS_CARGO} from public.cargos where id = ${id} and loja_id = ${lojaId}`,
  )
}

const COLS_PESSOA = sql`p.id, p.nome, p.cargo_id, c.nome as cargo_nome, c.chave as cargo_chave,
  p.telefone_cifrado, p.observacoes, p.ativo,
  ${TS('p.criado_em')} as criado_em, ${TS('p.atualizado_em')} as atualizado_em`

export async function listarPessoas(exec: Executor, lojaId: string, incluirInativos: boolean) {
  const filtroAtivo = incluirInativos ? sqlBruto('') : sql` and p.ativo`
  return consultar<PessoaLinha>(
    exec,
    sql`select ${COLS_PESSOA}
          from public.pessoas p
          join public.cargos c on c.id = p.cargo_id
         where p.loja_id = ${lojaId}${filtroAtivo}
         order by p.ativo desc, p.nome`,
  )
}

export async function obterPessoa(exec: Executor, lojaId: string, id: string) {
  return consultarUm<PessoaLinha>(
    exec,
    sql`select ${COLS_PESSOA}
          from public.pessoas p
          join public.cargos c on c.id = p.cargo_id
         where p.id = ${id} and p.loja_id = ${lojaId}`,
  )
}

// --- Dados de entrega (linha 1:1 em public.motoboys; so para a pessoa de cargo 'motoboy') ---
export interface EntregaLinha {
  veiculo: 'moto' | 'bicicleta' | 'carro' | 'a_pe'
  placa: string | null
  pix_tipo: 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria' | null
  pix_cifrado: Buffer | null
  regime_pagamento: 'por_entrega' | 'fixo' | 'fixo_mais_entrega'
  periodicidade_fixo: 'dia' | 'mes'
  valor_fixo_centavos: number
}

/** Linha de entrega da pessoa (null quando ela nao tem cadastro de entrega). */
export async function obterEntrega(exec: Executor, lojaId: string, pessoaId: string) {
  return consultarUm<EntregaLinha>(
    exec,
    sql`select veiculo, placa, pix_tipo, pix_cifrado,
                regime_pagamento, periodicidade_fixo, valor_fixo_centavos
           from public.motoboys where loja_id = ${lojaId} and pessoa_id = ${pessoaId}`,
  )
}

const COLS_ESCALA = sql`id, pessoa_id, dia_semana, ${HM('entrada')} as entrada,
  ${HM('saida')} as saida, ativo, ${TS('criado_em')} as criado_em`

export async function listarEscalas(exec: Executor, lojaId: string, pessoaId: string) {
  return consultar<EscalaLinha>(
    exec,
    sql`select ${COLS_ESCALA} from public.escalas
         where pessoa_id = ${pessoaId} and loja_id = ${lojaId} and ativo
         order by dia_semana, entrada`,
  )
}

export async function obterEscala(exec: Executor, lojaId: string, id: string) {
  return consultarUm<EscalaLinha>(
    exec,
    sql`select ${COLS_ESCALA} from public.escalas where id = ${id} and loja_id = ${lojaId}`,
  )
}
