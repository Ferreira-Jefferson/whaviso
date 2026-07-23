// Catálogo das mensagens de WhatsApp do produto, agrupadas por FLUXO, para a
// tela /admin/templates. Fonte única da ESTRUTURA de seções (e dos metadados de
// cada mensagem editável: chave, variáveis, ações de botão).
//
// As mensagens com `chave` são EDITÁVEIS no editor único (/admin/mensagens/:chave),
// que lê/escreve na tabela unificada `templates` via /v1/admin/mensagens. Hoje:
// ciclo.* (trilha) e cobrador.* e resposta.*. As sem `chave` ainda não têm editor
// e mostram um estado honesto:
//   - 'em_breve': vai ganhar editor.
//   - 'fixo': texto fixo no sistema, sem edição.
//   - 'planejado': previsto, ainda sem implementação no backend.
//
// Linguagem das Regras de Ouro em toda string (aviso/lembrete/combinado).

import { etapaEnvio, type AcaoBotaoTemplate, type EtapaEnvio, type Template } from '@/shared/contracts'
import { ROTULO_ETAPA } from '@/shared/format'

export type EstadoMensagem = 'em_breve' | 'fixo' | 'planejado'

export interface MensagemItem {
  /** Nome curto e claro da mensagem. */
  nome: string
  /** Quem recebe (devedor, cobrador, convidado, conta). */
  destinatario: string
  /** Em que momento é disparada. */
  quando: string
  estado: EstadoMensagem
  /**
   * Se presente, a mensagem é EDITÁVEL: liga ao template unificado (tabela
   * `templates`) por esta chave. O estado passa a vir do template (ativo/proposta),
   * não do campo `estado` estático.
   */
  chave?: string
  /** Chaves de variáveis disponíveis no editor desta mensagem (paleta). */
  variaveis?: string[]
  /** Ações de botão permitidas nesta mensagem (o rótulo é editável; a ação é código). */
  acoes?: AcaoBotaoTemplate[]
  /**
   * Se true, a mensagem tem a variante de contexto 'revisao' (enviada quando o
   * devedor já tocou em "Já paguei", aguardando confirmação): o editor mostra um
   * alternador padrão/revisão. Vale para o ciclo de lembretes.
   */
  temRevisao?: boolean
}

// Metadados das mensagens do CICLO (a seção é renderizada como TRILHA; estas
// entradas alimentam o editor por chave). Variáveis por etapa espelham o template.
const ACOES_CICLO: AcaoBotaoTemplate[] = ['ja_paguei', 'ver_pix', 'optout']
const VARIAVEIS_CICLO: Record<EtapaEnvio, string[]> = {
  d_menos_2: ['nome_devedor', 'cobrador', 'motivo', 'valor', 'data'],
  d_menos_1: ['nome_devedor', 'motivo', 'valor'],
  d: ['nome_devedor', 'motivo', 'valor'],
  d_mais_1: ['nome_devedor', 'motivo', 'valor'],
}
const MENSAGENS_CICLO: MensagemItem[] = etapaEnvio.options.map((etapa) => ({
  nome: ROTULO_ETAPA[etapa],
  destinatario: 'Devedor',
  quando: 'Lembrete automático do combinado',
  estado: 'fixo',
  chave: `ciclo.${etapa}`,
  variaveis: VARIAVEIS_CICLO[etapa],
  acoes: ACOES_CICLO,
  temRevisao: true,
}))

export interface SecaoMensagens {
  id: string
  titulo: string
  descricao: string
  /** 'ciclo' = trilha editável (vem da API); 'lista' = catálogo de mensagens. */
  variante: 'ciclo' | 'lista'
  /** Vazio para a seção 'ciclo' (as etapas vêm dos templates da API). */
  mensagens: MensagemItem[]
}

export const SECOES_MENSAGENS: SecaoMensagens[] = [
  {
    id: 'ciclo',
    titulo: 'Ciclo de lembretes',
    descricao: 'As quatro mensagens automáticas do combinado, de D-2 a D+1, enviadas ao devedor.',
    variante: 'ciclo',
    mensagens: MENSAGENS_CICLO,
  },
  {
    id: 'cobrador',
    titulo: 'Aviso a quem vai receber',
    descricao: 'Mensagem enviada a quem combinou, quando há novidade do outro lado.',
    variante: 'lista',
    mensagens: [
      {
        nome: 'Pagamento informado',
        destinatario: 'Quem vai receber',
        quando: 'Quando a pessoa toca em “Já paguei”',
        estado: 'em_breve',
        chave: 'cobrador.pagamento_informado',
        variaveis: ['cobrador', 'nome_devedor', 'motivo', 'valor'],
      },
    ],
  },
  {
    id: 'combinado',
    titulo: 'Combinado e aceite',
    descricao: 'Mensagens do envio do combinado para aceite, antes de o ciclo de lembretes começar.',
    variante: 'lista',
    mensagens: [
      {
        // Resumo do combinado + 3 botões (aceitar / dado incorreto / recusar), enviado
        // direto ao convidado pelo Whaviso (H5.0/H5.2). Editável: o corpo é um template
        // aprovado na Meta (Cloud API). A variante 'revisao' inclui a chave Pix para o
        // cobrador conferir no fluxo invertido.
        nome: 'Combinado (Aceitar ou Recusar)',
        destinatario: 'Convidado',
        quando: 'Ao receber o combinado no WhatsApp',
        estado: 'fixo',
        chave: 'combinado.resumo',
        variaveis: ['cobrador', 'nome_devedor', 'motivo', 'valor', 'data', 'pix_chave'],
        acoes: ['aceite', 'dado_incorreto', 'recusa'],
        temRevisao: true,
      },
      {
        nome: 'Confirmação de aceite',
        destinatario: 'Convidado',
        quando: 'Quando o convidado aceita',
        estado: 'fixo',
        chave: 'resposta.aceite',
      },
      {
        nome: 'Confirmação de recusa',
        destinatario: 'Convidado',
        quando: 'Quando o convidado recusa',
        estado: 'fixo',
        chave: 'resposta.recusa',
      },
    ],
  },
  {
    id: 'respostas',
    titulo: 'Respostas automáticas ao devedor',
    descricao: 'Respostas imediatas aos botões que a pessoa toca no WhatsApp. Toque para editar.',
    variante: 'lista',
    mensagens: [
      {
        nome: 'Recebemos seu “Já paguei”',
        destinatario: 'Devedor',
        quando: 'Toca em “Já paguei”',
        estado: 'fixo',
        chave: 'resposta.ja_paguei',
      },
      {
        nome: 'Saída dos lembretes',
        destinatario: 'Devedor',
        quando: 'Toca em “Sair dos lembretes”',
        estado: 'fixo',
        chave: 'resposta.optout',
      },
      {
        nome: 'Envio da chave Pix',
        destinatario: 'Devedor',
        quando: 'Toca em “Ver Pix” (com chave cadastrada)',
        estado: 'fixo',
        chave: 'resposta.ver_pix',
        // pix_tipo (CPF/telefone/etc.) + a chave, e a que combinado/valor ela se refere:
        // o editor oferece os quatro chips. Tipo/motivo/valor são resolvidos pelo zap no
        // envio (snapshot do aviso; inferência no fallback do tipo).
        variaveis: ['pix_tipo', 'pix_chave', 'motivo', 'valor'],
      },
      {
        nome: 'Sem chave Pix cadastrada',
        destinatario: 'Devedor',
        quando: 'Toca em “Ver Pix” (sem chave cadastrada)',
        estado: 'fixo',
        chave: 'resposta.sem_pix',
      },
    ],
  },
  {
    id: 'billing',
    titulo: 'Compra de crédito',
    descricao: 'Mensagem enviada ao WhatsApp de quem recarrega, com o valor e a chave Pix de recebimento.',
    variante: 'lista',
    mensagens: [
      {
        nome: 'Instruções de pagamento (recarga)',
        destinatario: 'Quem recarrega',
        quando: 'Ao confirmar a recarga na tela de Créditos',
        estado: 'fixo',
        chave: 'billing.recarga',
        variaveis: [
          'quantidade',
          'valor',
          'pix_tipo',
          'pix_chave',
          'pix_titular',
          'pix_banco',
          'pix_comentario',
        ],
      },
    ],
  },
  {
    id: 'conta',
    titulo: 'Acesso à conta',
    descricao: 'Mensagens de login e de boas-vindas de quem usa o painel.',
    variante: 'lista',
    mensagens: [
      {
        nome: 'Código de acesso',
        destinatario: 'Conta',
        quando: 'Login por telefone',
        // Entregue pelo nosso WhatsApp via Send SMS Hook (Meta Cloud API, template
        // AUTHENTICATION registrado à parte na Meta).
        estado: 'fixo',
      },
      {
        nome: 'Boas-vindas',
        destinatario: 'Conta',
        quando: 'Ao criar a conta',
        estado: 'planejado',
      },
    ],
  },
]

// Rótulo + estilo de cada estado (pílula). Cores da paleta editorial, calmas.
export const ESTADO_MENSAGEM: Record<
  EstadoMensagem,
  { rotulo: string; classe: string }
> = {
  em_breve: { rotulo: 'Editor em breve', classe: 'bg-ambar-claro text-ambar' },
  fixo: { rotulo: 'Texto fixo', classe: 'bg-papel-2 text-tinta-2' },
  planejado: { rotulo: 'Planejado', classe: 'bg-papel-2 text-cinza-expirado' },
}

/** Encontra a mensagem (editável) do catálogo por sua chave de template. */
export function mensagemPorChave(chave: string): MensagemItem | undefined {
  for (const secao of SECOES_MENSAGENS) {
    const m = secao.mensagens.find((item) => item.chave === chave)
    if (m) return m
  }
  return undefined
}

// ---- Templates FORA do catálogo curado ------------------------------------
// A área do owner lista TODO template da tabela `templates`, nada oculto, não só
// os curados acima. Escopo é estritamente TEMPLATE (configuração de mensagem, texto
// que o owner edita), NÃO conteúdo de cliente (combinados, telefones, etc.), que o
// owner não tem direito de ver. As helpers abaixo derivam metadados a partir da
// própria chave (e das versões existentes) para os templates sem entrada no
// catálogo, ex.: as muitas notificações de estado do devedor/cobrador que o zap
// dispara. Assim, template novo aparece sozinho, sem editar este arquivo.

// destinatário/quando padrão por PREFIXO da chave (parte antes do primeiro ponto).
const PREFIXO_META: Record<string, { destinatario: string; quando: string }> = {
  ciclo: { destinatario: 'Devedor', quando: 'Lembrete automático do combinado' },
  cobrador: { destinatario: 'Quem vai receber', quando: 'Aviso automático em mudança do combinado' },
  devedor: { destinatario: 'Devedor', quando: 'Aviso automático em mudança do combinado' },
  resposta: { destinatario: 'Devedor', quando: 'Resposta imediata a um toque de botão (janela 24h)' },
  pix: { destinatario: 'Devedor', quando: 'Passo do cadastro de chave Pix (wizard)' },
  combinado: { destinatario: 'Convidado', quando: 'Fluxo do combinado' },
  billing: { destinatario: 'Quem recarrega', quando: 'Compra de créditos' },
  botao: { destinatario: 'Devedor', quando: 'Rótulo de botão' },
}

// título/descrição da SEÇÃO por prefixo (agrupa as mensagens fora do catálogo).
const TITULO_PREFIXO: Record<string, { titulo: string; descricao: string }> = {
  cobrador: {
    titulo: 'Outros avisos a quem vai receber',
    descricao: 'Notificações automáticas ao cobrador nas mudanças do combinado.',
  },
  devedor: {
    titulo: 'Avisos ao devedor (mudanças no combinado)',
    descricao: 'Notificações automáticas ao devedor quando o combinado muda de estado.',
  },
  resposta: {
    titulo: 'Outras respostas automáticas',
    descricao: 'Respostas a toques de botão e passos do wizard, enviadas na janela de 24h. Como toda mensagem, só entram no ar depois de aprovadas e ativadas.',
  },
  pix: {
    titulo: 'Cadastro de chave Pix (wizard)',
    descricao: 'Passos do wizard de cadastro da chave Pix, enviados na janela de 24h.',
  },
  combinado: {
    titulo: 'Combinado (outras mensagens)',
    descricao: 'Outras mensagens do fluxo do combinado.',
  },
  billing: { titulo: 'Créditos (outras mensagens)', descricao: 'Outras mensagens de billing.' },
  botao: { titulo: 'Botões', descricao: 'Rótulos e mensagens de botão.' },
}

/** Nome legível derivado da chave (ex.: 'devedor.aviso_cancelado' -> 'Aviso cancelado'). */
export function rotuloDaChave(chave: string): string {
  const parte = chave.includes('.') ? chave.slice(chave.indexOf('.') + 1) : chave
  const texto = parte.replace(/[._]/g, ' ').trim()
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/** Todas as chaves que o catálogo curado já cobre. */
export function chavesDoCatalogo(): Set<string> {
  const s = new Set<string>()
  for (const secao of SECOES_MENSAGENS) {
    for (const m of secao.mensagens) if (m.chave) s.add(m.chave)
  }
  return s
}

/**
 * Metadado para uma mensagem que NÃO está no catálogo curado, derivado da chave e
 * das versões existentes no banco (variáveis/botões/revisão vêm dos próprios
 * templates). Devolve undefined se a chave não existe no banco.
 */
export function metaFallback(chave: string, mensagens: Template[]): MensagemItem | undefined {
  const daChave = mensagens.filter((t) => t.chave === chave)
  if (daChave.length === 0) return undefined
  const prefixo = chave.split('.')[0] ?? chave
  const info = PREFIXO_META[prefixo] ?? {
    destinatario: 'Sistema',
    quando: 'Mensagem do sistema',
  }
  const variaveis = [...new Set(daChave.flatMap((t) => t.variaveis))]
  const acoes = [
    ...new Set(daChave.flatMap((t) => (t.conteudo.botoes ?? []).map((b) => b.acao))),
  ] as AcaoBotaoTemplate[]
  return {
    nome: rotuloDaChave(chave),
    destinatario: info.destinatario,
    quando: info.quando,
    estado: 'fixo',
    chave,
    variaveis,
    acoes: acoes.length ? acoes : undefined,
    temRevisao: daChave.some((t) => t.contexto === 'revisao'),
  }
}

/**
 * Seções (por prefixo de chave) para todo TEMPLATE da tabela `templates` que o
 * catálogo curado ainda não lista. Nenhum template fica oculto do owner (templates
 * são configuração de mensagem, não conteúdo de cliente) e um novo aparece sozinho.
 */
export function construirSecoesExtra(chavesPresentes: string[]): SecaoMensagens[] {
  const conhecidas = chavesDoCatalogo()
  const extras = [...new Set(chavesPresentes)].filter((c) => !conhecidas.has(c)).sort()
  const porPrefixo = new Map<string, MensagemItem[]>()
  for (const chave of extras) {
    const prefixo = chave.split('.')[0] ?? chave
    const info = PREFIXO_META[prefixo] ?? { destinatario: 'Sistema', quando: 'Mensagem do sistema' }
    const arr = porPrefixo.get(prefixo) ?? []
    arr.push({
      nome: rotuloDaChave(chave),
      destinatario: info.destinatario,
      quando: info.quando,
      estado: 'fixo',
      chave,
    })
    porPrefixo.set(prefixo, arr)
  }
  return [...porPrefixo.entries()].map(([prefixo, mensagens]) => {
    const t = TITULO_PREFIXO[prefixo] ?? { titulo: prefixo, descricao: 'Mensagens do sistema.' }
    return { id: `extra-${prefixo}`, titulo: t.titulo, descricao: t.descricao, variante: 'lista', mensagens }
  })
}
