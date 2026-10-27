// Regra do modulo campanhas. Sem acesso HTTP aqui; erros de dominio via shared/http_errors.
// Nenhum dado pessoal vai a log: o telefone/hash nem e lido aqui (o enfileirar monta o envio em SQL).
// Compliance (SEC-110/111): campanha nunca cruza loja (loja_id do escopo em tudo), exclui opt-out e
// so dispara por TEMPLATE aprovado pela Meta (caminho sancionado fora da janela de 24h).
import type { Pool } from '@whaviso/shared/db'
import { transacao } from '@whaviso/shared/db'
import { naoEncontrado, regraNegocio } from '../../shared/http_errors'
import * as repo from './repo'
import { CampanhaSegmento, type CampanhaNova } from './schemas'

export interface Ator {
  lojaId: string
  userId: string
}

/** Le o segmento do filtro jsonb como enum fechado (a view so grava segmentos validos). */
function segmentoDe(l: repo.CampanhaLinha): CampanhaSegmento | null {
  const r = CampanhaSegmento.safeParse(l.filtro.segmento)
  return r.success ? r.data : null
}

function paraItem(l: repo.CampanhaLinha) {
  const segmento = segmentoDe(l)
  return {
    id: l.id,
    nome: l.nome,
    template_chave: l.template_chave,
    numero_whatsapp_id: l.numero_whatsapp_id,
    filtro: segmento ? { segmento } : {},
    status: l.status,
    total_destinatarios: l.total_destinatarios,
    enfileirado_em: l.enfileirado_em,
    criado_em: l.criado_em,
  }
}

export function criarServicoCampanhas(pool: Pool) {
  return {
    /** Cria uma campanha em rascunho. Valida que o numero de origem e da loja e esta conectado. */
    async criar(a: Ator, d: CampanhaNova) {
      if (!(await repo.numeroConectado(pool, a.lojaId, d.numero_whatsapp_id))) {
        throw regraNegocio('numero_indisponivel', 'Numero de WhatsApp invalido ou nao conectado')
      }
      const l = await repo.criar(pool, {
        lojaId: a.lojaId,
        nome: d.nome,
        templateChave: d.template_chave,
        numeroId: d.numero_whatsapp_id,
        segmento: d.filtro.segmento ?? null,
        variaveis: d.variaveis,
        userId: a.userId,
      })
      await repo.registrarEvento(pool, {
        lojaId: a.lojaId, tipo: 'campanha.criada', campanhaId: l.id, userId: a.userId,
      })
      return paraItem(l)
    },

    async listar(a: Ator) {
      const linhas = await repo.listar(pool, a.lojaId)
      return { itens: linhas.map(paraItem) }
    },

    async detalhe(a: Ator, id: string) {
      const l = await repo.obter(pool, a.lojaId, id)
      if (!l) throw naoEncontrado('Campanha nao encontrada')
      const entrega = await repo.entregaResumo(pool, a.lojaId, id)
      return { ...paraItem(l), variaveis: l.variaveis, entrega }
    },

    /** Estimativa do publico-alvo (quantos recebem, ja excluido o opt-out) antes de disparar. */
    async destinatarios(a: Ator, id: string) {
      const l = await repo.obter(pool, a.lojaId, id)
      if (!l) throw naoEncontrado('Campanha nao encontrada')
      const segmento = segmentoDe(l)
      const total = await repo.contarDestinatarios(pool, a.lojaId, segmento)
      return { total, segmento }
    },

    /**
     * Dispara: valida template aprovado + variaveis completas + numero conectado, enfileira a outbox
     * e marca a campanha. Idempotente: so dispara campanha em `rascunho`. Tudo numa transacao.
     */
    async disparar(a: Ator, id: string) {
      return transacao(pool, async (tx) => {
        const l = await repo.travar(tx, a.lojaId, id)
        if (!l) throw naoEncontrado('Campanha nao encontrada')
        if (l.status !== 'rascunho') {
          throw regraNegocio('campanha_nao_disparavel', 'A campanha ja foi disparada ou cancelada')
        }
        // SEC-111: so sai por template APROVADO pela Meta e ativo (o unico caminho fora da janela).
        const template = await repo.templateAtivo(tx, a.lojaId, l.template_chave)
        if (!template) {
          throw regraNegocio('template_indisponivel', 'Template inexistente ou inativo para a loja')
        }
        if (template.status_meta !== 'aprovado') {
          throw regraNegocio('template_nao_aprovado', 'O template ainda nao foi aprovado pela Meta')
        }
        // Todas as variaveis declaradas no template precisam ter valor fixo na campanha.
        const faltando = template.variaveis.filter((nome) => !(nome in l.variaveis))
        if (faltando.length > 0) {
          throw regraNegocio('variaveis_incompletas', 'Preencha todas as variaveis do template')
        }
        // SEC-110: numero da propria loja e conectado (revalida no disparo).
        if (!(await repo.numeroConectado(tx, a.lojaId, l.numero_whatsapp_id))) {
          throw regraNegocio('numero_indisponivel', 'Numero de WhatsApp nao conectado')
        }
        const enfileirados = await repo.enfileirar(tx, {
          campanhaId: l.id,
          lojaId: a.lojaId,
          numeroId: l.numero_whatsapp_id,
          templateChave: l.template_chave,
          segmento: l.filtro.segmento ?? null,
          variaveis: l.variaveis,
        })
        await repo.marcarEnfileirada(tx, a.lojaId, l.id, enfileirados)
        await repo.registrarEvento(tx, {
          lojaId: a.lojaId, tipo: 'campanha.disparada', campanhaId: l.id, userId: a.userId,
          detalhes: { total: enfileirados },
        })
        return { id: l.id, status: 'enfileirada' as const, total_destinatarios: enfileirados, enfileirados }
      })
    },

    /** Cancela: aborta os envios ainda nao enviados (na outbox) e marca a campanha. */
    async cancelar(a: Ator, id: string) {
      return transacao(pool, async (tx) => {
        const l = await repo.travar(tx, a.lojaId, id)
        if (!l) throw naoEncontrado('Campanha nao encontrada')
        if (l.status === 'cancelada') {
          throw regraNegocio('campanha_ja_cancelada', 'A campanha ja esta cancelada')
        }
        const cancelados = await repo.cancelar(tx, a.lojaId, l.id)
        await repo.registrarEvento(tx, {
          lojaId: a.lojaId, tipo: 'campanha.cancelada', campanhaId: l.id, userId: a.userId,
          detalhes: { cancelados },
        })
        return { id: l.id, status: 'cancelada' as const, cancelados }
      })
    },
  }
}

export type ServicoCampanhas = ReturnType<typeof criarServicoCampanhas>
