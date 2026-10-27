// Registry de tools (AT-tools): a superficie de AUTORIZACAO do agente. Regras:
//  - o modelo so enxerga nome/descricao/JSON Schema dos ARGUMENTOS (nunca loja_id/cliente_id: o
//    registro RECUSA, no cadastro, tool cujo schema declare esses campos, SEC-063);
//  - o argumento cru do modelo e DADO: passa por Zod estrito (chave extra, como um loja_id forjado,
//    e rejeitada) antes de chegar ao handler (SEC-061/065);
//  - o handler recebe o ConversaCtx selado pelo servidor e o resultado e validado por Zod antes de
//    voltar ao modelo; erro vira envelope acionavel sem stack nem dado sensivel.
import { z } from 'zod'
import type { ConversaCtx, ToolContract } from '@whaviso/shared/contracts'
import type { FerramentaLlm } from '@whaviso/shared/clientes'
import { ErroTool } from './erros'

/** Chamada de tool como vem do modelo: nome + argumentos (objeto ou JSON em string). */
export interface ChamadaTool {
  id: string
  nome: string
  argumentos: unknown
}

export type ResultadoTool =
  | { ok: true; dados: unknown }
  | { ok: false; erro: { codigo: string; mensagem: string } }

/** Nomes de campo que NUNCA podem aparecer no schema de argumento (autorizacao e do servidor). */
export const CAMPOS_PROIBIDOS_NO_ARGS: readonly string[] = ['loja_id', 'cliente_id', 'conversa_id', 'lojaId', 'clienteId', 'conversaId']

function nomesDeCampo(node: unknown, acc: Set<string> = new Set()): Set<string> {
  if (Array.isArray(node)) node.forEach((n) => nomesDeCampo(n, acc))
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'properties' && v && typeof v === 'object') for (const p of Object.keys(v)) acc.add(p)
      nomesDeCampo(v, acc)
    }
  }
  return acc
}

/** Tool tipada apagada para guardar num Map sem `any`: o parse do arg acontece dentro do closure. */
interface ToolRegistrada {
  readonly name: string
  readonly description: string
  readonly efeito: ToolContract['efeito']
  readonly parametros: Record<string, unknown>
  rodar(ctx: ConversaCtx, bruto: unknown): Promise<ResultadoTool>
}

function registrar<A, R>(tool: ToolContract<A, R>): ToolRegistrada {
  const parametros = z.toJSONSchema(tool.args) as Record<string, unknown>
  const proibidos = [...nomesDeCampo(parametros)].filter((n) => CAMPOS_PROIBIDOS_NO_ARGS.includes(n))
  if (proibidos.length > 0) {
    throw new Error(`tool ${tool.name} declara campo de autorizacao no schema de argumentos (SEC-063): ${proibidos.join(',')}`)
  }
  return {
    name: tool.name,
    description: tool.description,
    efeito: tool.efeito,
    parametros,
    async rodar(ctx, bruto) {
      let candidato = bruto
      if (typeof candidato === 'string') {
        try {
          candidato = candidato.trim() === '' ? {} : JSON.parse(candidato)
        } catch {
          return { ok: false, erro: { codigo: 'argumentos_invalidos', mensagem: 'Argumentos nao sao um JSON valido.' } }
        }
      }
      const args = tool.args.safeParse(candidato ?? {})
      if (!args.success) {
        // Mensagem enxuta e fixa: nao ecoa o valor recebido (pode ser injecao/PII).
        const campos = [...new Set(args.error.issues.map((i) => i.path.join('.') || '(raiz)'))].slice(0, 5)
        return { ok: false, erro: { codigo: 'argumentos_invalidos', mensagem: `Argumentos invalidos nos campos: ${campos.join(', ')}.` } }
      }
      try {
        const r = await tool.executar(ctx, args.data)
        const saida = tool.result.safeParse(r)
        if (!saida.success) return { ok: false, erro: { codigo: 'erro_interno', mensagem: 'Falha ao montar o resultado da ferramenta.' } }
        return { ok: true, dados: saida.data }
      } catch (e) {
        if (e instanceof ErroTool) return { ok: false, erro: { codigo: e.codigo, mensagem: e.message } }
        return { ok: false, erro: { codigo: 'erro_interno', mensagem: 'Falha ao executar a ferramenta. Tente outra abordagem ou chame um atendente.' } }
      }
    },
  }
}

export interface RegistroTools {
  /** Specs (nome, descricao, JSON Schema) para o ServicoLlm. Nenhum loja_id/cliente_id. */
  specs(): FerramentaLlm[]
  tem(nome: string): boolean
  efeitoDe(nome: string): ToolContract['efeito'] | undefined
  /** Executa uma chamada do modelo com o ctx selado do servidor. Nunca lanca. */
  executar(chamada: ChamadaTool, ctx: ConversaCtx): Promise<ResultadoTool>
}

// Parametro de tipo apagado so na fronteira do registro (cada tool segue tipada na definicao).
export type ToolQualquer = ToolContract<never, unknown>

export function criarRegistroTools(tools: readonly ToolContract<never, unknown>[]): RegistroTools {
  const mapa = new Map<string, ToolRegistrada>()
  for (const t of tools) {
    if (mapa.has(t.name)) throw new Error(`tool duplicada: ${t.name}`)
    mapa.set(t.name, registrar(t as unknown as ToolContract<unknown, unknown>))
  }
  return {
    specs: () => [...mapa.values()].map((t) => ({ nome: t.name, descricao: t.description, parametros: t.parametros })),
    tem: (n) => mapa.has(n),
    efeitoDe: (n) => mapa.get(n)?.efeito,
    async executar(chamada, ctx) {
      const t = mapa.get(chamada.nome)
      // Nome desconhecido (modelo alucinou ou foi induzido): erro acionavel, nada executa.
      if (!t) return { ok: false, erro: { codigo: 'ferramenta_desconhecida', mensagem: 'Ferramenta inexistente. Use apenas as ferramentas oferecidas.' } }
      return t.rodar(ctx, chamada.argumentos)
    },
  }
}
