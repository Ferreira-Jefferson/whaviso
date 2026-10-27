// Regras de cargos (funcoes). O cargo 'motoboy' (sistema=true) e fixo: nunca apagado, desativado
// nem com a chave alterada. A loja so edita/arquiva os cargos PROPRIOS (loja_id = loja); presets de
// plataforma (loja_id NULL) sao catalogo compartilhado e read-only para a loja. Sem acesso HTTP
// aqui; erros de dominio via shared/http_errors. Nenhum dado pessoal e passado a log.
import type { Pool } from '@whaviso/shared/db'
import { conflito, naoEncontrado, regraNegocio } from '../../shared/http_errors'
import { listarCargos as listarCargosRepo, obterCargoDaLoja, obterCargoVisivel, type CargoLinha } from './repo'
import { atualizarCargo as atualizarCargoRepo, inserirCargo } from './repo_escrita'
import type { CargoDto, CargoPatch } from './schemas'

function saida(c: CargoLinha): CargoDto {
  return {
    id: c.id,
    loja_id: c.loja_id,
    chave: c.chave,
    nome: c.nome,
    sistema: c.sistema,
    ativo: c.ativo,
    criado_em: c.criado_em,
    atualizado_em: c.atualizado_em,
  }
}

export async function listarCargos(pool: Pool, lojaId: string): Promise<{ itens: CargoDto[] }> {
  return { itens: (await listarCargosRepo(pool, lojaId)).map(saida) }
}

export async function criarCargo(pool: Pool, lojaId: string, nome: string): Promise<CargoDto> {
  const c = await inserirCargo(pool, lojaId, nome)
  if (!c) throw regraNegocio('cargo_nao_criado', 'Nao foi possivel criar o cargo')
  return saida(c)
}

export async function atualizarCargo(
  pool: Pool,
  lojaId: string,
  id: string,
  p: CargoPatch,
): Promise<CargoDto> {
  const proprio = await obterCargoDaLoja(pool, lojaId, id)
  if (!proprio) {
    // Diferencia "preset read-only" de "nao existe", sem vazar cargo de outra loja.
    const visivel = await obterCargoVisivel(pool, lojaId, id)
    if (visivel) {
      throw regraNegocio(
        'cargo_nao_editavel',
        'Cargos da plataforma nao podem ser editados; crie um cargo proprio da loja',
      )
    }
    throw naoEncontrado('Cargo nao encontrado')
  }
  if (proprio.sistema) {
    throw conflito('cargo_sistema', 'Cargo de sistema nao pode ser alterado')
  }
  const atualizado = await atualizarCargoRepo(pool, lojaId, id, p)
  if (!atualizado) throw naoEncontrado('Cargo nao encontrado')
  return saida(atualizado)
}
