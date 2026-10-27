// Acesso a dados do modulo: SO via @whaviso/shared/db, sempre com sql`...` (parametrizado).
//
// REGRA DE SEGREDO (SEC-020): `token_cifrado` NUNCA aparece nas projecoes de leitura. As
// listas/detalhes selecionam apenas as COLUNAS PUBLICAS. A unica escrita do token acontece
// em `inserir`/`trocarToken`, que mesmo assim fazem `RETURNING` so das colunas publicas.
import { consultar, consultarUm, sql, sqlBruto, type Executor } from '@whaviso/shared/db'
import type { NumeroSaida } from './schemas'
import type { StatusNumero } from '@whaviso/shared/contracts'

/** Linha crua das colunas publicas; `criado_em` chega como Date do pg. */
interface LinhaNumero {
  id: string
  loja_id: string
  phone_number_id: string
  waba_id: string
  status: StatusNumero
  verificado: boolean
  criado_em: Date | string
}

// Projecao publica unica: sem `token_cifrado`, sem `numero_hash`. Fragmento fixo do codigo.
const COLS_PUBLICAS = sqlBruto(
  'id, loja_id, phone_number_id, waba_id, status, verificado, criado_em',
)

function mapear(l: LinhaNumero): NumeroSaida {
  return {
    id: l.id,
    loja_id: l.loja_id,
    phone_number_id: l.phone_number_id,
    waba_id: l.waba_id,
    status: l.status,
    verificado: l.verificado,
    criado_em: l.criado_em instanceof Date ? l.criado_em.toISOString() : String(l.criado_em),
  }
}

export interface DadosInsercao {
  lojaId: string
  phoneNumberId: string
  wabaId: string
  numeroHash: string
  tokenCifrado: Buffer
  verificado: boolean
}

/** Insere o numero conectado. Grava token cifrado e hash; devolve so colunas publicas. */
export async function inserir(exec: Executor, d: DadosInsercao): Promise<NumeroSaida> {
  const linha = await consultarUm<LinhaNumero>(
    exec,
    sql`insert into public.numeros_whatsapp
          (loja_id, phone_number_id, waba_id, numero_hash, token_cifrado, verificado)
        values (${d.lojaId}, ${d.phoneNumberId}, ${d.wabaId}, ${d.numeroHash}, ${d.tokenCifrado}, ${d.verificado})
        returning ${COLS_PUBLICAS}`,
  )
  // RETURNING sempre devolve a linha recem-inserida; o null seria impossivel.
  return mapear(linha!)
}

/** Lista os numeros da loja (apenas colunas publicas). */
export async function listarPorLoja(exec: Executor, lojaId: string): Promise<NumeroSaida[]> {
  const linhas = await consultar<LinhaNumero>(
    exec,
    sql`select ${COLS_PUBLICAS} from public.numeros_whatsapp
         where loja_id = ${lojaId} order by criado_em desc`,
  )
  return linhas.map(mapear)
}

/** Busca um numero por id, restrito a loja ativa (isolamento multi-tenant). */
export async function buscarPorId(
  exec: Executor,
  id: string,
  lojaId: string,
): Promise<NumeroSaida | null> {
  const linha = await consultarUm<LinhaNumero>(
    exec,
    sql`select ${COLS_PUBLICAS} from public.numeros_whatsapp
         where id = ${id} and loja_id = ${lojaId}`,
  )
  return linha ? mapear(linha) : null
}

/** Atualiza so o status; `limparToken` zera `token_cifrado` (usado no remover). */
export async function atualizarStatus(
  exec: Executor,
  id: string,
  lojaId: string,
  status: StatusNumero,
  limparToken: boolean,
): Promise<NumeroSaida | null> {
  const setToken = limparToken ? sqlBruto(', token_cifrado = null') : sqlBruto('')
  const linha = await consultarUm<LinhaNumero>(
    exec,
    sql`update public.numeros_whatsapp
           set status = ${status}${setToken}
         where id = ${id} and loja_id = ${lojaId}
         returning ${COLS_PUBLICAS}`,
  )
  return linha ? mapear(linha) : null
}

/**
 * Metodo DEDICADO e interno de troca de token (rotacao / reconectar). Grava o token cifrado
 * e o hash novos; o `RETURNING` nunca inclui o segredo. So faz efeito dentro da loja ativa.
 */
export async function trocarToken(
  exec: Executor,
  id: string,
  lojaId: string,
  tokenCifrado: Buffer,
  numeroHash: string,
  verificado: boolean,
): Promise<NumeroSaida | null> {
  const linha = await consultarUm<LinhaNumero>(
    exec,
    sql`update public.numeros_whatsapp
           set token_cifrado = ${tokenCifrado}, numero_hash = ${numeroHash},
               verificado = ${verificado}, status = 'conectado'
         where id = ${id} and loja_id = ${lojaId}
         returning ${COLS_PUBLICAS}`,
  )
  return linha ? mapear(linha) : null
}
