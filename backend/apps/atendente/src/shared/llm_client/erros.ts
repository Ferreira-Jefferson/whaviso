// Erros tipados deste modulo (AT-llm), sobre o ErroProvedor comum das fronteiras externas.
//
// O contrato ClienteLLM devolve sempre Resultado<T, ErroProvedor>; aqui refinamos o `codigo`
// estavel para o chamador decidir o comportamento SEM inspecionar texto de mensagem:
//   - llm_indisponivel: nao ha credencial ativa, provedor sem adaptador ou a decifra falhou.
//     FALHA FECHADA: o chamador degrada para o fluxo sem LLM (botoes), nunca cai em outra chave.
//   - limite_excedido: o teto de gasto diario da loja estourou (antes de chamar o provedor).
//   - saida_invalida: a resposta estruturada nao passou no schema Zod do chamador (apos 1 reparo).
//   - chave_invalida: o provedor recusou a chave (401/403); a credencial pede revisao do dono.
//   - limite: o provedor recusou por saldo/cota (ex.: 402); nao e retentavel.
//   - conteudo: o provedor recusou por politica de conteudo.
// NENHUMA mensagem ou causa destes erros carrega a chave, o header de auth ou o corpo bruto.
import { Permanente, type ErroProvedorOpcoes } from '@whaviso/shared/clientes'

/** Codigos estaveis expostos ao chamador (nunca dado sensivel). */
export const CODIGO = {
  indisponivel: 'llm_indisponivel',
  limiteExcedido: 'limite_excedido',
  saidaInvalida: 'saida_invalida',
  chaveInvalida: 'chave_invalida',
  limite: 'limite',
  conteudo: 'conteudo',
} as const

/** Sem credencial ativa, provedor sem adaptador ou decifra falhou: degrade para o fluxo sem LLM. */
export class LlmIndisponivel extends Permanente {
  constructor(mensagem = 'LLM indisponivel para a loja', op?: ErroProvedorOpcoes) {
    super(mensagem, { ...op, codigo: CODIGO.indisponivel })
    this.name = 'LlmIndisponivel'
  }
}

/** Teto de gasto diario da loja estourado: degrade para o fluxo sem LLM (base do alerta SEC-100). */
export class LimiteExcedido extends Permanente {
  constructor(mensagem = 'teto de gasto diario da loja atingido', op?: ErroProvedorOpcoes) {
    super(mensagem, { ...op, codigo: CODIGO.limiteExcedido })
    this.name = 'LimiteExcedido'
  }
}

/** A resposta estruturada nao bateu com o schema Zod do chamador (mesmo apos a retentativa de reparo). */
export class SaidaInvalida extends Permanente {
  constructor(mensagem = 'saida do modelo invalida para o schema', op?: ErroProvedorOpcoes) {
    super(mensagem, { ...op, codigo: CODIGO.saidaInvalida })
    this.name = 'SaidaInvalida'
  }
}

/** O provedor recusou a chave (401/403): a credencial da loja pede revisao do dono (sem logar a chave). */
export class ChaveInvalida extends Permanente {
  constructor(mensagem = 'chave recusada pelo provedor', op?: ErroProvedorOpcoes) {
    super(mensagem, { ...op, codigo: CODIGO.chaveInvalida })
    this.name = 'ChaveInvalida'
  }
}

/** O provedor recusou por saldo/cota (ex.: 402 sem creditos): nao retentavel. */
export class LimiteProvedor extends Permanente {
  constructor(mensagem = 'limite/cota do provedor atingido', op?: ErroProvedorOpcoes) {
    super(mensagem, { ...op, codigo: CODIGO.limite })
    this.name = 'LimiteProvedor'
  }
}

/** O provedor recusou por politica de conteudo. */
export class ConteudoRecusado extends Permanente {
  constructor(mensagem = 'conteudo recusado pelo provedor', op?: ErroProvedorOpcoes) {
    super(mensagem, { ...op, codigo: CODIGO.conteudo })
    this.name = 'ConteudoRecusado'
  }
}
