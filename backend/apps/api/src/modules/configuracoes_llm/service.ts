// Regra do modulo configuracoes_llm. Sem acesso HTTP aqui; erros de dominio via shared/http_errors.
//
// Fluxo de segredo (etapa 7): a chave em claro existe SO dentro de `definir`/`testar`, o tempo
// minimo para ser validada e cifrada; nunca e devolvida, logada nem persistida em claro. A api
// valida com a chave EM MAOS (antes de cifrar): como ela nunca le a chave gravada de volta,
// "revalidar a chave salva" nao existe aqui (fica com o atendente, que decifra). `validada_em`
// so marca o momento do set/rotate.
import { comTransacao, type Pool, type Executor } from '@whaviso/shared/db'
import { HttpError, naoEncontrado, regraNegocio } from '../../shared/http_errors'
import type { CredencialMeta } from './repo'
import * as repo from './repo'
import type { CifraLlm } from './cifra'
import type { RegistroValidadores } from './provedores'
import type {
  CredencialLlmEstado,
  CredencialLlmPatch,
  ProvedorLlm,
  ResultadoValidacaoLlm,
  UsoLlmResumo,
} from './schemas'

export interface DepsConfigLlm {
  cifra: CifraLlm
  validadores: RegistroValidadores
}

/** Estado vazio: loja sem credencial (IA desligada). */
const ESTADO_VAZIO: CredencialLlmEstado = {
  configurada: false,
  provedor: null,
  ultimos4: null,
  modelo_preferido: null,
  ativo: false,
  validada_em: null,
  criado_em: null,
  atualizado_em: null,
}

/** `configurada` = existe credencial E esta ativa (a loja so tem IA ligada nesse caso). */
function paraEstado(m: CredencialMeta | null): CredencialLlmEstado {
  if (!m) return ESTADO_VAZIO
  return {
    configurada: m.ativo,
    provedor: m.provedor,
    ultimos4: m.ultimos4,
    modelo_preferido: m.modelo_preferido,
    ativo: m.ativo,
    validada_em: m.validada_em,
    criado_em: m.criado_em,
    atualizado_em: m.atualizado_em,
  }
}

/** Ultimos 4 caracteres alfanumericos da chave (so para exibir "...1234"). Nunca a chave toda. */
function extrairUltimos4(chave: string): string {
  return chave.replace(/[^0-9A-Za-z]/g, '').slice(-4)
}

/** Estado atual da credencial da loja (so metadado). */
export async function obterEstado(exec: Executor, lojaId: string): Promise<CredencialLlmEstado> {
  return paraEstado(await repo.buscarEstado(exec, lojaId))
}

/** Roda o validador do provedor sobre uma chave; mapeia para o resultado (sem rede se o formato ja barra). */
async function validarChave(
  deps: DepsConfigLlm,
  provedor: ProvedorLlm,
  chave: string,
): Promise<ResultadoValidacaoLlm> {
  const validador = deps.validadores[provedor]
  if (!validador) {
    // `outro` (ou provedor sem host allowlisted): nao da para validar sem arriscar SSRF.
    throw regraNegocio(
      'provedor_nao_validavel',
      'Este provedor nao tem validacao automatica; use um provedor suportado',
    )
  }
  if (!validador.formatoPlausivel(chave)) return 'invalida'
  return validador.validar(chave)
}

export interface EntradaDefinir {
  lojaId: string
  provedor: ProvedorLlm
  chave: string
  modeloPreferido?: string | undefined
}

/**
 * Set (primeiro cadastro) ou rotate (troca). Valida a chave no provedor e, SO se valida, cifra,
 * extrai `ultimos4` e grava (upsert por loja). Chave invalida -> 422 (nada gravado); provedor
 * indisponivel -> 502 (nada gravado, retry seguro). A auditoria nao carrega a chave.
 */
export async function definir(
  pool: Pool,
  deps: DepsConfigLlm,
  e: EntradaDefinir,
): Promise<CredencialLlmEstado> {
  const resultado = await validarChave(deps, e.provedor, e.chave)
  if (resultado === 'invalida') {
    throw regraNegocio('chave_invalida', 'A chave nao foi aceita pelo provedor')
  }
  if (resultado === 'indisponivel') {
    throw new HttpError(
      502,
      'provedor_indisponivel',
      'Nao foi possivel validar a chave agora; tente de novo em instantes',
    )
  }

  const chaveCifrada = deps.cifra.cifrar(e.chave)
  const ultimos4 = extrairUltimos4(e.chave)
  // A partir daqui nao se usa mais `e.chave` (claro): so o cifrado e os ultimos4 seguem adiante.

  return comTransacao(pool, async (tx) => {
    const antes = await repo.buscarEstado(tx, e.lojaId)
    const id = await repo.upsert(tx, {
      lojaId: e.lojaId,
      provedor: e.provedor,
      chaveCifrada,
      ultimos4,
      modeloPreferido: e.modeloPreferido ?? null,
    })
    const estado = await repo.marcarValidada(tx, e.lojaId)
    await repo.registrarEvento(tx, {
      lojaId: e.lojaId,
      entidadeId: id,
      detalhes: { provedor: e.provedor, ultimos4, acao: antes ? 'rotate' : 'set' },
    })
    return paraEstado(estado)
  })
}

/** PATCH: ativar/desativar e/ou trocar o modelo, sem reenviar a chave. 404 se nao ha credencial. */
export async function ajustar(
  exec: Executor,
  lojaId: string,
  patch: CredencialLlmPatch,
): Promise<CredencialLlmEstado> {
  const estado = await repo.ajustar(exec, lojaId, {
    ativo: patch.ativo,
    modelo: patch.modelo_preferido,
  })
  if (!estado) throw naoEncontrado('Credencial nao encontrada')
  return paraEstado(estado)
}

/**
 * Revalida uma chave do CORPO (nunca a gravada). Devolve so o resultado; nunca ecoa a chave nem
 * o erro cru do provedor. `provedor_nao_validavel` -> 422 (provedor sem suporte de validacao).
 */
export async function testar(
  deps: DepsConfigLlm,
  provedor: ProvedorLlm,
  chave: string,
): Promise<ResultadoValidacaoLlm> {
  return validarChave(deps, provedor, chave)
}

/** Fator sobre a media movel que caracteriza um pico de consumo (alerta SEC-100). */
const FATOR_PICO = 3
const MIN_DIAS_PICO = 4

/** Pico = dia mais recente acima de FATOR_PICO x a media dos dias anteriores (media movel simples). */
function calcularPico(dias: repo.UsoDiaLinha[]): boolean {
  if (dias.length < MIN_DIAS_PICO) return false
  const ultimo = dias[dias.length - 1]!
  const anteriores = dias.slice(0, -1)
  const media = anteriores.reduce((s, d) => s + d.custo, 0) / anteriores.length
  return media > 0 && ultimo.custo > media * FATOR_PICO
}

/** Resumo de consumo da loja para o painel de gasto (mes corrente + serie diaria + pico). */
export async function obterUso(exec: Executor, lojaId: string): Promise<UsoLlmResumo> {
  const [total, dias, origens, modelos] = await Promise.all([
    repo.totalMes(exec, lojaId),
    repo.porDia(exec, lojaId),
    repo.porOrigem(exec, lojaId),
    repo.porModelo(exec, lojaId),
  ])
  return {
    total_mes_centavos: total.total,
    tokens_entrada_mes: total.te,
    tokens_saida_mes: total.ts,
    por_dia: dias.map((d) => ({
      dia: d.dia,
      custo_estimado_centavos: d.custo,
      tokens_entrada: d.te,
      tokens_saida: d.ts,
    })),
    por_origem: origens.map((o) => ({ rotulo: o.rotulo, custo_estimado_centavos: o.custo })),
    por_modelo: modelos.map((m) => ({ rotulo: m.rotulo, custo_estimado_centavos: m.custo })),
    pico: calcularPico(dias),
  }
}
