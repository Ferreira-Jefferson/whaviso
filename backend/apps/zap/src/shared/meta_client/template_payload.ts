// Monta o corpo de DEFINIÇÃO de um template para o create/edit na Meta (Graph
// message_templates). Função PURA (sem rede): o módulo sincronizar_templates passa os
// campos da linha `templates` e envia o resultado a criarTemplateGraph/editarTemplateGraph.
//
// Difere de montarBody (que monta o ENVIO de uma mensagem): aqui descrevemos a ESTRUTURA do
// template (corpo com {{n}}, exemplos exigidos pela Meta, botões quick_reply), não os valores.

export interface BotaoTemplateDef {
  /** comportamento (ja_paguei/ver_pix/...); não vai à Meta, só o rótulo importa aqui. */
  acao: string
  rotulo: string
}

export interface ConteudoTemplate {
  texto: string
  botoes?: BotaoTemplateDef[]
}

export interface DefTemplateEntrada {
  nomeMeta: string
  idioma: string
  categoria: string
  conteudo: ConteudoTemplate
  /** variáveis na ordem de {{1}}..{{n}}. */
  variaveis: string[]
  /** amostras por variável (var -> exemplo) p/ o `example` exigido pela Meta. */
  exemplos: Record<string, string>
}

/**
 * Corpo do POST de criação/edição de template. AUTHENTICATION tem formato fixo (corpo
 * automático + botão copiar-código); o resto (UTILITY/MARKETING) é corpo de texto com
 * {{n}} + botões quick_reply. O OTP do login é registrado à parte, mas tratamos o caso
 * AUTHENTICATION aqui também para não falhar silenciosamente se alguém o submeter.
 */
export function montarDefTemplate(e: DefTemplateEntrada): Record<string, unknown> {
  if (e.categoria === 'AUTHENTICATION') {
    return {
      name: e.nomeMeta,
      language: e.idioma,
      category: 'AUTHENTICATION',
      components: [
        { type: 'BODY', add_security_recommendation: true },
        { type: 'FOOTER', code_expiration_minutes: 10 },
        { type: 'BUTTONS', buttons: [{ type: 'OTP', otp_type: 'COPY_CODE' }] },
      ],
    }
  }

  const components: Record<string, unknown>[] = []
  const body: Record<string, unknown> = { type: 'BODY', text: e.conteudo.texto }
  if (e.variaveis.length) {
    // A Meta exige um exemplo por {{n}}, na ordem das variáveis. Sem amostra cadastrada,
    // cai no próprio nome da variável (melhor que vazio, mas o ideal é o owner preencher).
    body.example = { body_text: [e.variaveis.map((v) => e.exemplos[v] ?? v)] }
  }
  components.push(body)

  const botoes = e.conteudo.botoes ?? []
  if (botoes.length) {
    components.push({
      type: 'BUTTONS',
      buttons: botoes.map((b) => ({ type: 'QUICK_REPLY', text: b.rotulo })),
    })
  }

  return { name: e.nomeMeta, language: e.idioma, category: e.categoria, components }
}
