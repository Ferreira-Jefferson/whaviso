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
//   - 'gated': depende de aprovação na Meta / fase ainda não ligada.
//   - 'planejado': previsto, ainda sem implementação no backend.
//
// Linguagem das Regras de Ouro em toda string (aviso/lembrete/combinado).

import { etapaEnvio, type AcaoBotaoTemplate, type EtapaEnvio } from '@/shared/contracts'
import { ROTULO_ETAPA } from '@/shared/format'

export type EstadoMensagem = 'em_breve' | 'fixo' | 'gated' | 'planejado'

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
    id: 'convite',
    titulo: 'Convite e aceite',
    descricao: 'Mensagens da etapa de convite, antes de o ciclo de lembretes começar.',
    variante: 'lista',
    mensagens: [
      {
        nome: 'Convite (Aceitar ou Recusar)',
        destinatario: 'Convidado',
        quando: 'Ao criar o combinado',
        estado: 'gated',
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
        variaveis: ['pix_chave'],
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
        estado: 'gated',
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
  gated: { rotulo: 'Depende da Meta', classe: 'bg-revisao-claro text-revisao' },
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
