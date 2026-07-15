// Catálogo FIXO de variáveis de template (lado do editor, módulo admin).
//
// O usuário NÃO cria variáveis: só escolhe destas e define o valor de exemplo
// que aparece na pré-visualização. As `chave`s são exatamente as que o `zap`
// sabe resolver na hora do envio (VALOR_POR_VARIAVEL em
// apps/zap/.../enviar_lembretes/render.ts); incluir um nome fora dessa lista
// faria o envio quebrar. Mantenha os dois lados em sincronia.
//
// Mecânica de armazenamento (não muda): o corpo é salvo com {{1}}, {{2}}… e o
// array `variaveis` mapeia posição -> chave (variaveis[0] = {{1}}). No EDITOR o
// corpo usa tokens nomeados ({{NOME_DEVEDOR}}); a conversão para {{n}} acontece
// só na borda (preview/submit), via paraIndexado().

export interface VariavelCatalogo {
  /** Nome que vai no array `variaveis` enviado ao backend (o zap conhece). */
  chave: string
  /** Token exibido no editor entre chaves: {{TOKEN}}. */
  token: string
  /** Nome amigável para o usuário escolher na paleta. */
  rotulo: string
  /** Valor de exemplo padrão (editável), usado só na pré-visualização. */
  exemplo: string
}

export const CATALOGO_VARIAVEIS: VariavelCatalogo[] = [
  { chave: 'nome_devedor', token: 'NOME_DEVEDOR', rotulo: 'Nome do devedor', exemplo: 'Ana' },
  { chave: 'cobrador', token: 'NOME_COBRADOR', rotulo: 'Nome do cobrador', exemplo: 'João' },
  { chave: 'motivo', token: 'MOTIVO', rotulo: 'Motivo', exemplo: 'a aula de violão' },
  { chave: 'valor', token: 'VALOR', rotulo: 'Valor', exemplo: 'R$ 120,00' },
  { chave: 'data', token: 'DATA', rotulo: 'Data', exemplo: '12 de junho' },
  { chave: 'pix_chave', token: 'PIX', rotulo: 'Chave Pix', exemplo: 'ana@email.com' },
  // Compra de crédito (billing.recarga): quantidade de envios + dados da chave da plataforma.
  { chave: 'quantidade', token: 'QUANTIDADE', rotulo: 'Quantidade de envios', exemplo: '50' },
  { chave: 'pix_tipo', token: 'PIX_TIPO', rotulo: 'Tipo da chave Pix', exemplo: 'Chave aleatória' },
  { chave: 'pix_titular', token: 'PIX_TITULAR', rotulo: 'Titular da chave Pix', exemplo: 'Whaviso' },
  { chave: 'pix_banco', token: 'PIX_BANCO', rotulo: 'Banco da chave Pix', exemplo: 'Banco X' },
  { chave: 'pix_comentario', token: 'PIX_COMENTARIO', rotulo: 'Comentário do Pix', exemplo: 'confirmamos em até 1 dia útil' },
  // Notificações de estado ao devedor/cobrador (devedor.* / cobrador.*): `alvo` é o nome
  // de quem recebe a mensagem e `codigo` identifica o combinado (ex.: "ABC-123"). O zap
  // resolve ambos no envio (notificar_cobrador/render.ts); sem exemplo aqui o preview
  // mostrava o token cru "[alvo]"/"[codigo]".
  { chave: 'alvo', token: 'ALVO', rotulo: 'Nome de quem recebe', exemplo: 'Maria' },
  { chave: 'codigo', token: 'CODIGO', rotulo: 'Código do combinado', exemplo: 'ABC-123' },
  // Wizard de cadastro de chave Pix (E14, pix.*) e devedor.pix_chave_recebida: nomes
  // "curtos" da chave, distintos dos pix_* (que vêm do config da plataforma/aviso).
  { chave: 'titular', token: 'TITULAR', rotulo: 'Titular da chave', exemplo: 'Maria Silva' },
  { chave: 'banco', token: 'BANCO', rotulo: 'Banco da chave', exemplo: 'Nubank' },
  { chave: 'chave', token: 'CHAVE', rotulo: 'Chave Pix', exemplo: 'maria@pix.com' },
  { chave: 'tipo', token: 'TIPO', rotulo: 'Tipo da chave', exemplo: 'CPF' },
]

const POR_TOKEN = new Map(CATALOGO_VARIAVEIS.map((v) => [v.token, v]))
const POR_CHAVE = new Map(CATALOGO_VARIAVEIS.map((v) => [v.chave, v]))

/** Token entre chaves duplas, só letras maiúsculas e underscore: {{NOME_DEVEDOR}}. */
const PADRAO_TOKEN = /\{\{([A-Z_]+)\}\}/g

/** Token indexado do backend: {{1}}, {{2}}… (posição -> chave via `variaveis`). */
const PADRAO_INDICE = /\{\{(\d+)\}\}/g

export function variavelPorChave(chave: string): VariavelCatalogo | undefined {
  return POR_CHAVE.get(chave)
}

/**
 * Chaves das variáveis presentes no corpo NOMEADO, na ordem de 1ª aparição.
 * É a fonte do array `variaveis` (some o campo manual separado por vírgula).
 * Tokens fora do catálogo são ignorados.
 */
export function variaveisDoCorpo(corpoNomeado: string): string[] {
  const vistas: string[] = []
  for (const m of corpoNomeado.matchAll(PADRAO_TOKEN)) {
    const cat = m[1] ? POR_TOKEN.get(m[1]) : undefined
    if (cat && !vistas.includes(cat.chave)) vistas.push(cat.chave)
  }
  return vistas
}

/**
 * Converte o corpo NOMEADO ({{NOME_DEVEDOR}}) para o INDEXADO ({{1}}) que o
 * backend espera, usando a ordem de `variaveis`. Tokens desconhecidos ficam
 * intactos (o lint/preview do backend é a defesa final).
 */
export function paraIndexado(corpoNomeado: string, variaveis: string[]): string {
  return corpoNomeado.replace(PADRAO_TOKEN, (inteiro, token: string) => {
    const cat = POR_TOKEN.get(token)
    if (!cat) return inteiro
    const i = variaveis.indexOf(cat.chave)
    return i >= 0 ? `{{${i + 1}}}` : inteiro
  })
}

/**
 * Inverso de paraIndexado: converte o corpo INDEXADO ({{1}}) de volta ao NOMEADO
 * ({{NOME_DEVEDOR}}), usando a ordem de `variaveis` (variaveis[0] = {{1}}). Serve
 * para semear o editor a partir de uma versão já salva. Índices fora de
 * `variaveis` ou chaves fora do catálogo ficam intactos.
 */
export function paraNomeado(corpoIndexado: string, variaveis: string[]): string {
  return corpoIndexado.replace(PADRAO_INDICE, (inteiro, num: string) => {
    const chave = variaveis[Number(num) - 1]
    const cat = chave ? POR_CHAVE.get(chave) : undefined
    return cat ? `{{${cat.token}}}` : inteiro
  })
}

/** Valores de exemplo padrão (Record<chave, exemplo>) para as chaves dadas. */
export function exemplosPadrao(variaveis: string[]): Record<string, string> {
  return Object.fromEntries(
    variaveis.map((chave) => [chave, POR_CHAVE.get(chave)?.exemplo ?? `[${chave}]`]),
  )
}
