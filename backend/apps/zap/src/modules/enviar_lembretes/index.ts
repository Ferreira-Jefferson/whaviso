import type { Pool } from '@whaviso/shared/db'
import type { Logger } from '@whaviso/shared/logger'
import { janelaPerdida } from '@whaviso/shared/datas'
import { ErroEnvio, type ClienteWhats, type MensagemWhats } from '../../shared/whats'
import { carregarTemplateAtivo, renderMensagem } from '../../shared/templates'
import { consumirNoDisparo } from '../../shared/creditos'
import * as repo from './repo'
import { valoresCiclo } from './render'

export interface DepsEnviarLembretes {
  pool: Pool
  logger: Logger
  whats: ClienteWhats
}

/** Processa um lote de envios devidos. Retorna quantos foram efetivamente enviados. */
export async function processarEnviosDevidos(deps: DepsEnviarLembretes): Promise<number> {
  const { pool, logger, whats } = deps
  await repo.ressuscitarTravados(pool)

  const lote = await repo.reivindicar(pool)
  let enviados = 0

  for (const envio of lote) {
    try {
      const dados = await repo.carregarDados(pool, envio.aviso_id, envio.etapa)
      if (!dados) {
        await repo.marcarCancelado(pool, envio.id, 'aviso_inexistente')
        continue
      }

      // Cinto extra ao trigger de encerramento (reconfere o estado NO DISPARO, H6.4):
      // - `programado`: ciclo normal, qualquer etapa.
      // - `informado_pago` (H6.5): o ciclo normal PARA; a ÚNICA mensagem possível é o
      //   empurrãozinho de D+1 (etapa d_mais_1, template variante revisao). Qualquer outra
      //   etapa remanescente é cancelada (não polui o painel com texto normal nesse estado).
      // - terminais e suspensos: nunca enviam.
      //
      // Item 20: o par ('ciclo.d_mais_1', 'revisao') é o ÚNICO par etapa/contexto
      // autorizado a mencionar encerramento de ciclo (o texto "ainda não confirmou" do
      // empurrãozinho). Nenhuma outra etapa, nem a variante 'padrao' de d_mais_1, pode
      // sair enquanto o aviso está em informado_pago; ver repo.carregarDados (a busca do
      // template já restringe a variante 'revisao' a esse estado) e o teste de regressão
      // em tests/enviar_lembretes.test.ts que varre todas as etapas.
      if (dados.aviso_status === 'informado_pago') {
        if (envio.etapa !== 'd_mais_1') {
          await repo.marcarCancelado(pool, envio.id, 'informado_pago')
          continue
        }
      } else if (dados.aviso_status !== 'programado') {
        // H10.9: lembrete na fila para um devedor que virou TERMINAL/saiu não é enviado
        // (coalescing por estado terminal), cancelamento auditado (M5), sem PII.
        await repo.marcarCanceladoAuditado(pool, envio.id, envio.aviso_id, envio.etapa, 'aviso_nao_ativo')
        continue
      }

      // Janela da etapa: nunca enviar o texto de uma etapa no dia errado.
      if (janelaPerdida(dados.data_combinada, envio.etapa, new Date())) {
        await repo.marcarCancelado(pool, envio.id, 'janela_perdida')
        continue
      }

      if (!dados.template_conteudo || !dados.template_variaveis) {
        // Sem template ativo: recuperável (devolve agendado, sem queimar tentativa);
        // volta a drenar quando o owner ativar, bounded pela janela da etapa.
        await repo.devolverAguardandoTemplate(pool, envio.id, 'sem_template_ativo')
        logger.error({ etapa: envio.etapa }, 'sem template ativo para a etapa')
        continue
      }
      if (dados.template_status_meta !== 'aprovado') {
        // GATED na Meta: template ativo ainda não aprovado (enviar daria erro permanente).
        await repo.devolverAguardandoTemplate(pool, envio.id, 'template_meta_nao_aprovado')
        logger.warn({ etapa: envio.etapa }, 'template não aprovado na Meta para a etapa')
        continue
      }
      if (!dados.telefone_devedor) {
        await repo.marcarFalhou(pool, envio.id, 'sem_telefone')
        continue
      }

      // H6.2: os TRÊS botões (Já paguei / Chave Pix / Desativar lembretes) aparecem em
      // TODAS as etapas, sem supressão condicional. O Pix é obrigatório nos dois fluxos
      // (E2/E3), então o botão "Chave Pix" sempre faz sentido.
      // H7.7: o refId leva a ETAPA junto do aviso_id ("<aviso>:<etapa>") para o botão
      // identificar de QUAL mensagem do ciclo veio; só os botões do último aviso enviado
      // agem. O webhook parseia "acao:<aviso>:<etapa>".
      const mensagem = renderMensagem(
        {
          conteudo: dados.template_conteudo,
          variaveis: dados.template_variaveis,
          nome_meta: dados.template_nome_meta ?? undefined,
          idioma: dados.template_idioma ?? undefined,
        },
        dados.telefone_devedor,
        { valores: valoresCiclo(dados), refId: `${dados.aviso_id}:${envio.etapa}`, comoTemplate: true },
      )
      // E14: invertido SEM chave -> o devedor não tem o que "ver"; troca o botão
      // "Chave Pix" (ver_pix) por "Solicitar chave pix" (solicitar_pix), que
      // pede a chave a quem vai receber (Gatilho B). Quando a chave passa a existir, volta
      // o ver_pix normal (H7.3). Rótulo editável pelo owner (template botao.solicitar_pix).
      if (dados.direcao === 'pagar' && !dados.pix_chave) {
        await trocarVerPixPorSolicitar(pool, mensagem, `${dados.aviso_id}:${envio.etapa}`)
      }
      const { wamid } = await whats.enviarMensagem(mensagem)
      await repo.marcarEnviado(pool, envio.id, wamid)
      // E11 H11.5: o lembrete saiu -> CONSOME 1 crédito (reservado -> consumido),
      // idempotente por UNIDADE (ocorrência no recorrente, aviso no simples): as 4 etapas
      // de uma mesma ocorrência consomem 1 só vez (no 1º envio). Disparado nunca volta.
      await consumirNoDisparo(pool, envio.aviso_id, envio.ocorrencia_id)
      enviados++
    } catch (erro) {
      if (erro instanceof ErroEnvio && erro.permanente) {
        await repo.marcarFalhou(pool, envio.id, `envio_${erro.codigo}: ${erro.message}`)
        logger.warn({ envioId: envio.id, codigo: erro.codigo }, 'erro permanente no envio')
      } else {
        const msg = erro instanceof Error ? erro.message : String(erro)
        const r = await repo.reagendarOuFalhar(pool, envio.id, envio.tentativas, msg)
        logger.warn({ envioId: envio.id, resultado: r }, 'falha transitória no envio')
      }
    }
  }

  return enviados
}

/**
 * E14 (Gatilho B): troca o botão "Chave Pix" (ver_pix) do lembrete pelo "Solicitar
 * chave pix" (solicitar_pix), mantendo a etapa no payload (H7.7, só o último
 * aviso age). O rótulo vem do template `botao.solicitar_pix` (editável pelo owner). Sem
 * esse template ativo, mantém o ver_pix (que responde resposta.sem_pix; degrada sem
 * quebrar). Idempotente: não faz nada se não houver um botão ver_pix na mensagem.
 */
async function trocarVerPixPorSolicitar(pool: Pool, mensagem: MensagemWhats, refId: string): Promise<void> {
  const botoes = mensagem.botoes
  if (!botoes) return
  const idx = botoes.findIndex((b) => b.id.startsWith('ver_pix:'))
  if (idx < 0) return
  const t = await carregarTemplateAtivo(pool, 'botao.solicitar_pix', 'padrao')
  const rotulo = t?.conteudo.texto
  if (!rotulo) return
  botoes[idx] = { id: `solicitar_pix:${refId}`, rotulo }
}
