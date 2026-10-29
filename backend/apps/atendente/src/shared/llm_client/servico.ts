// Orquestrador do cliente de LLM, consciente da loja. E o que os modulos do atendente usam. Costura:
//   1. resolver a credencial ATIVA da loja (ou `llm_indisponivel`, falha fechada);
//   2. escolher o adaptador do provedor (ausente => `llm_indisponivel`, falha fechada);
//   3. conferir o TETO de gasto diario da loja (estourado => `limite_excedido`, sem chamar o provedor);
//   4. DECIFRAR a chave SO no instante do uso, numa variavel local da chamada, nunca em cache nem em
//      campo de objeto de vida longa; a decifra vive so dentro desta chamada;
//   5. chamar o adaptador (chave so no header de auth);
//   6. CONTABILIZAR o consumo em `uso_llm` (falha ao gravar uso NUNCA vaza segredo nem derruba a chamada);
//   7. para saida estruturada: validar com o schema Zod do chamador, 1 retentativa de reparo e,
//      persistindo invalido, `saida_invalida`. A saida do modelo e DADO, nunca comando (SEC-061).
//
// FALHA FECHADA e invariante: qualquer duvida sobre a credencial (ausente, inativa, provedor sem
// adaptador, decifra falhou) vira `llm_indisponivel`; nunca ha fallback para outra chave nem global.
import type { z } from 'zod'
import type { Executor } from '@whaviso/shared/db'
import type { Logger } from '@whaviso/shared/logger'
import {
  CredencialResolvida,
  ok,
  falha,
  type ErroProvedor,
  type FerramentaLlm,
  type MensagemLlm,
  type DescreverImagemEntrada,
  type Resultado,
  type RespostaCompletar,
  type RespostaDescreverImagem,
  type RespostaTranscrever,
  type TranscreverEntrada,
  type UsoLlm,
} from '@whaviso/shared/clientes'
import { ErroCifra, type DecifraLlm } from './cifra'
import type { ProvedorLlm, TabelaPrecos } from './config'
import { TETO_DIARIO_CENTAVOS_PADRAO } from './config'
import { lerCredencialAtiva } from './credencial'
import { LimiteExcedido, LlmIndisponivel, SaidaInvalida } from './erros'
import type { AdaptadorProvedor, ResolverAdaptador } from './provedores/porta'
import { gastoDoDiaCentavos, registrarUso } from './uso'
import { idLoja, type Escopo } from '../escopo'

export interface DepsServicoLlm {
  /** Obtem a decifra da chave (lazy): producao usa `decifraPadrao`; teste injeta a sua. */
  obterDecifra: () => DecifraLlm
  resolverAdaptador: ResolverAdaptador
  logger: Logger
  precos: TabelaPrecos
  /** Teto de gasto diario por loja, em centavos. 0 = sem teto. */
  tetoDiarioCentavos?: number
}

/** Campos comuns a toda chamada: executor de banco, loja e o modulo chamador (vai em `uso_llm.origem`). */
export interface BaseChamada {
  exec: Executor
  /** Escopo resolvido no servidor (hoje so 'loja'; a credencial/uso seguem por loja_id). */
  escopo: Escopo
  origem: string
}

export interface CompletarLojaEntrada extends BaseChamada {
  mensagens: MensagemLlm[]
  ferramentas?: FerramentaLlm[]
  modelo?: string
}

export interface TranscreverLojaEntrada extends BaseChamada {
  audio: TranscreverEntrada['audio']
  idioma?: string
}

export interface DescreverImagemLojaEntrada extends BaseChamada {
  imagem: DescreverImagemEntrada['imagem']
  instrucao?: string
}

/** Resultado de uma chamada estruturada: os dados ja validados pelo schema + a resposta bruta. */
export interface RespostaEstruturada<T> {
  dados: T
  resposta: RespostaCompletar
}

export interface ServicoLlm {
  completar(e: CompletarLojaEntrada): Promise<Resultado<RespostaCompletar, ErroProvedor>>
  completarEstruturado<T>(
    e: CompletarLojaEntrada,
    schema: z.ZodType<T>,
  ): Promise<Resultado<RespostaEstruturada<T>, ErroProvedor>>
  transcrever(e: TranscreverLojaEntrada): Promise<Resultado<RespostaTranscrever, ErroProvedor>>
  descreverImagem(e: DescreverImagemLojaEntrada): Promise<Resultado<RespostaDescreverImagem, ErroProvedor>>
}

interface Preparo {
  adaptador: AdaptadorProvedor
  credencial: CredencialResolvida
  provedor: ProvedorLlm
  modeloPreferido: string | null
}

/** Mensagem de reparo (generica, sem segredo, sem ecoar dado sensivel) para a saida estruturada. */
const PEDIDO_REPARO =
  'Sua resposta anterior nao foi um JSON valido conforme o esperado. Responda SOMENTE com um JSON valido, sem nenhum texto fora do JSON.'

export function criarServicoLlm(deps: DepsServicoLlm): ServicoLlm {
  const teto = deps.tetoDiarioCentavos ?? TETO_DIARIO_CENTAVOS_PADRAO

  /** Resolve credencial + adaptador + teto e decifra a chave numa variavel LOCAL (passo 1..4). */
  async function preparar(exec: Executor, lojaId: string): Promise<Resultado<Preparo, ErroProvedor>> {
    const row = await lerCredencialAtiva(exec, lojaId)
    if (!row) return falha(new LlmIndisponivel()) // ausente/inativa: falha fechada

    const adaptador = deps.resolverAdaptador(row.provedor)
    if (!adaptador) return falha(new LlmIndisponivel('provedor sem adaptador')) // falha fechada

    if (teto > 0) {
      const gasto = await gastoDoDiaCentavos(exec, lojaId)
      if (gasto >= teto) return falha(new LimiteExcedido())
    }

    // Decifra SO agora, em variavel local. `chaveClara` nao e guardada em lugar nenhum: so e
    // passada para a CredencialResolvida (que a mantem privada) e some do escopo apos a chamada.
    let chaveClara: string
    try {
      chaveClara = deps.obterDecifra().decifrarParaTexto(row.chave_cifrada)
    } catch (erro) {
      // Decifra falhou (master key errada, bytes adulterados, var ausente): falha fechada. O log
      // nunca carrega a chave nem os bytes; so o id da loja e o erro ja sanitizado.
      deps.logger.error({ loja_id: lojaId, err: erro instanceof ErroCifra ? erro : new ErroCifra() }, 'decifra da chave de llm falhou')
      return falha(new LlmIndisponivel('decifra da chave falhou'))
    }
    const credencial = new CredencialResolvida(chaveClara)
    return ok({ adaptador, credencial, provedor: row.provedor, modeloPreferido: row.modelo_preferido })
  }

  /** Grava `uso_llm`. Falha ao gravar NUNCA derruba a chamada nem vaza segredo (logger ja redige). */
  async function contabilizar(
    exec: Executor,
    lojaId: string,
    provedor: ProvedorLlm,
    origem: string,
    modelo: string | null,
    uso: UsoLlm,
  ): Promise<void> {
    try {
      await registrarUso(exec, {
        lojaId,
        provedor,
        modelo,
        origem,
        tokensIn: uso.tokensIn,
        tokensOut: uso.tokensOut,
        custoCentavos: uso.custoEstimadoCentavos,
      })
    } catch (erro) {
      deps.logger.error({ loja_id: lojaId, origem, err: erro }, 'falha ao registrar uso_llm')
    }
  }

  const servico: ServicoLlm = {
    async completar(e) {
      const prep = await preparar(e.exec, idLoja(e.escopo))
      if (!prep.ok) return prep
      const { adaptador, credencial, provedor, modeloPreferido } = prep.valor
      const r = await adaptador.completar({
        credencial,
        mensagens: e.mensagens,
        ...(e.ferramentas ? { ferramentas: e.ferramentas } : {}),
        ...(e.modelo ?? modeloPreferido ? { modelo: e.modelo ?? modeloPreferido! } : {}),
      })
      if (r.ok) await contabilizar(e.exec, idLoja(e.escopo), provedor, e.origem, r.valor.modelo, r.valor.uso)
      return r
    },

    async completarEstruturado(e, schema) {
      const prep = await preparar(e.exec, idLoja(e.escopo))
      if (!prep.ok) return prep
      const { adaptador, credencial, provedor, modeloPreferido } = prep.valor
      const mensagens: MensagemLlm[] = [...e.mensagens]

      // Ate 2 tentativas: a original e uma retentativa de reparo. A mesma credencial local serve as
      // duas (nao e recacheada); ela some do escopo ao fim desta chamada.
      for (let tentativa = 0; tentativa < 2; tentativa++) {
        const r = await adaptador.completar({
          credencial,
          mensagens,
          ...(e.ferramentas ? { ferramentas: e.ferramentas } : {}),
          ...(e.modelo ?? modeloPreferido ? { modelo: e.modelo ?? modeloPreferido! } : {}),
          formatoSaida: { tipo: 'json' },
        })
        if (!r.ok) return r
        await contabilizar(e.exec, idLoja(e.escopo), provedor, e.origem, r.valor.modelo, r.valor.uso)

        const validado = validarJson(schema, r.valor.texto)
        if (validado.ok) return ok({ dados: validado.valor, resposta: r.valor })
        if (tentativa === 0) {
          mensagens.push({ papel: 'assistant', conteudo: r.valor.texto })
          mensagens.push({ papel: 'user', conteudo: PEDIDO_REPARO })
        }
      }
      return falha(new SaidaInvalida())
    },

    async transcrever(e) {
      const prep = await preparar(e.exec, idLoja(e.escopo))
      if (!prep.ok) return prep
      const { adaptador, credencial, provedor } = prep.valor
      const r = await adaptador.transcrever({
        credencial,
        audio: e.audio,
        ...(e.idioma ? { idioma: e.idioma } : {}),
      })
      if (r.ok) await contabilizar(e.exec, idLoja(e.escopo), provedor, e.origem, prep.valor.modeloPreferido, r.valor.uso)
      return r
    },

    async descreverImagem(e) {
      const prep = await preparar(e.exec, idLoja(e.escopo))
      if (!prep.ok) return prep
      const { adaptador, credencial, provedor } = prep.valor
      const r = await adaptador.descreverImagem({
        credencial,
        imagem: e.imagem,
        ...(e.instrucao ? { instrucao: e.instrucao } : {}),
      })
      if (r.ok) await contabilizar(e.exec, idLoja(e.escopo), provedor, e.origem, prep.valor.modeloPreferido, r.valor.uso)
      return r
    },
  }
  return servico
}

/** Parse + validacao do texto como JSON pelo schema do chamador. A saida e DADO, nunca comando. */
function validarJson<T>(schema: z.ZodType<T>, texto: string): Resultado<T, ErroProvedor> {
  let bruto: unknown
  try {
    bruto = JSON.parse(texto)
  } catch {
    return falha(new SaidaInvalida('resposta nao e JSON'))
  }
  const parsed = schema.safeParse(bruto)
  if (!parsed.success) return falha(new SaidaInvalida())
  return ok(parsed.data)
}
