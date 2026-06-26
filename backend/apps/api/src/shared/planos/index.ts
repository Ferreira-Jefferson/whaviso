// Kernel compartilhado de PLANOS (Épico 11). Ponto único que resolve as alavancas
// do plano vigente de uma conta a partir do CATÁLOGO (nunca fixadas no código) e
// conta a AGENDA (balde único). Vive em shared/ porque módulo nunca importa módulo:
// avisos/painel/recebimentos/acoes_devedor chamam estas funções, não umas às outras.
//
// As alavancas e a contagem vêm das funções SQL `alavancas_do_plano(uid)` e
// `contar_agenda(uid)` (migration 0026), para que a regra de limite seja a mesma no
// banco e na api (defesa em profundidade, H11.8).
//
// NOTA DE ESCOPO (E4/F-STATE): o estado `sem_aviso` (modo agenda) ainda não existe.
// Hoje todo aviso do criador nasce já no ciclo; `contar_agenda` conta esses avisos
// não-arquivados. Quando E4 ligar `sem_aviso`, a contagem já fica correta por
// construção (anotações sem_aviso também são linhas em `avisos` do criador).
import type { Pool, PoolClient } from '@whaviso/shared/db'
import { regraNegocio } from '../http_errors'

type Executor = Pool | PoolClient

export interface AlavancasPlano {
  plano_id: string
  /** Capacidade total da agenda (balde único): teto de anotações da conta. */
  capacidade_agenda: number
  /** Vagas de aviso ATIVO. No Start/Profissional = capacidade da agenda (nunca trava). */
  vagas_ativas: number
  /** Free: agenda + visualização, sem ATIVAR envio (guarda antes do limite numérico). */
  somente_leitura: boolean
  /** Recorrência habilitada (Profissional/Plus). Cada ocorrência reserva 1 vaga (H11.5). */
  permite_recorrente: boolean
  cadencia_configuravel: boolean
  menu_texto_livre: boolean
  informado_pago_habilitado: boolean
  totais_periodo: boolean
  /** Teto de reengajamento manual pós-ciclo por combinado (0 = indisponível). */
  reengajamento_max: number
  /** Teto de edições com reaprovação por combinado (H2.5/G-C2). */
  edicoes_max: number
  /** Plus: nº de ENVIOS/mês contratados (migration 0044; capacidade/vagas 1:1); null nos demais. */
  unidades: number | null
}

// NOTAS DE ALAVANCA (donos e regras, fechando M2/M3/M5 do relatório de gaps):
//  - reengajamento_max (M2): DONO é este épico (alavanca de catálogo); a MECÂNICA
//    (até 3 envios, nunca 2 no mesmo dia) é do E8, que LÊ este teto.
//  - cadencia_configuravel (M3): vale para AMBOS os lados (o cobrador escolhe quais
//    D-avisos; o devedor do fluxo invertido configura como recebe). Quem GOVERNA é o
//    plano do CRIADOR do aviso (no invertido, o criador é o devedor). A mecânica é do
//    E6; aqui só a alavanca.
//  - downgrade (M5, H11.9 🟡): a checagem de limite é ">= ao criar/ativar NOVO",
//    NUNCA retroativa. Baixar de plano não desliga o que já existe (regra de
//    não-DELETE); só trava criar/ativar novos até voltar abaixo do teto. A UX/billing
//    da troca de plano fica para o gateway real.

/** Lê as alavancas do plano vigente da conta (default free resolvido no SQL). */
export async function alavancasDoPlano(ex: Executor, uid: string): Promise<AlavancasPlano> {
  const { rows } = await ex.query<{
    plano_id: string
    capacidade_agenda: number
    vagas_ativas: number
    somente_leitura: boolean
    permite_recorrente: boolean
    cadencia_configuravel: boolean
    menu_texto_livre: boolean
    informado_pago_habilitado: boolean
    totais_periodo: boolean
    reengajamento_max: number
    edicoes_max: number
    unidades: number | null
  }>(`select * from public.alavancas_do_plano($1)`, [uid])
  // A função sempre resolve para um plano (free no pior caso). Defesa: se faltar,
  // tratamos como free somente-leitura.
  const r = rows[0]
  if (!r) {
    return {
      plano_id: 'free',
      capacidade_agenda: 0,
      vagas_ativas: 0,
      somente_leitura: true,
      permite_recorrente: false,
      cadencia_configuravel: false,
      menu_texto_livre: false,
      informado_pago_habilitado: false,
      totais_periodo: false,
      reengajamento_max: 0,
      edicoes_max: 0,
      unidades: null,
    }
  }
  return r
}

/**
 * Preço TOTAL (centavos) do Plus por VOLUME DE ENVIOS (migration 0044). Interpola
 * linearmente o total entre o piso (`envios_min` -> `preco_centavos`) e o topo
 * (`envios_max` -> `preco_max_centavos`); o R$/envio cai conforme o volume sobe.
 * Fonte única: a api usa no `assinar` (preço congelado) e o catálogo publica os
 * params p/ a UI espelhar. `n` é grampeado na faixa.
 */
export function precoPorEnvioCentavos(
  curva: { envios_min: number; envios_max: number; preco_centavos: number; preco_max_centavos: number },
  n: number,
): number {
  const { envios_min: lo, envios_max: hi, preco_centavos: pLo, preco_max_centavos: pHi } = curva
  const nn = Math.min(Math.max(n, lo), hi)
  if (hi === lo) return pLo
  return Math.round(pLo + ((pHi - pLo) * (nn - lo)) / (hi - lo))
}

/** Conta a agenda (balde único): anotações não-arquivadas do criador, por papel. */
export async function contarAgenda(ex: Executor, uid: string): Promise<number> {
  const { rows } = await ex.query<{ n: number }>(`select public.contar_agenda($1) as n`, [uid])
  return Number(rows[0]?.n ?? 0)
}

/**
 * Trava a assinatura da conta (lock por conta) DENTRO da transação que cria/ativa,
 * para fechar a janela de corrida do H11.8: dois requests simultâneos na última
 * vaga serializam neste lock e só um passa. Idempotente: se a linha não existir
 * (conta sem assinatura), não trava nada (o default free já barra a criação).
 */
export async function travarConta(cli: PoolClient, uid: string): Promise<void> {
  await cli.query(`select 1 from public.assinaturas where profile_id = $1 for update`, [uid])
}

/**
 * Guarda de CRIAÇÃO de anotação de agenda, na MESMA transação (com lock por conta).
 * Ordem dos erros (E1-C2 / H11.6): primeiro o guard do FREE (código próprio,
 * mensagem própria, nunca "limite atingido com 0 vagas"), depois a capacidade.
 *
 * NOTA DE ESCOPO: enquanto `sem_aviso` não existe, criar um aviso JÁ é colocá-lo no
 * ciclo (envia). Logo, no estágio atual, o guard do free aqui é o portão do gating:
 * free não pode criar um aviso que envia (resolve C3 por construção, ver abaixo).
 * Quando E4 separar criar (agenda) de ativar (envio), o guard do free migra para a
 * ATIVAÇÃO e a criação de anotação fica liberada para o free dentro da capacidade.
 */
export async function exigirVagaDeAgenda(cli: PoolClient, uid: string): Promise<AlavancasPlano> {
  await travarConta(cli, uid)
  const alavancas = await alavancasDoPlano(cli, uid)

  // 1) Guard do free ANTES do limite numérico (nunca cai em limite_plano_atingido
  //    "até 0 avisos"). Free mantém agenda/visualização, mas não cria aviso que envia.
  if (alavancas.somente_leitura) {
    throw regraNegocio(
      'plano_somente_leitura',
      'Seu plano mantém a agenda e a visualização, mas não envia avisos. Escolha um plano para ativar os envios.',
    )
  }

  // 2) Capacidade da agenda (balde único). Ao encher, recusa sem apagar nada.
  const usado = await contarAgenda(cli, uid)
  if (usado >= alavancas.capacidade_agenda) {
    throw regraNegocio(
      'agenda_cheia',
      `Sua agenda está cheia (${alavancas.capacidade_agenda} itens). Arquive um item ou escolha um plano com mais capacidade.`,
    )
  }

  return alavancas
}

/**
 * Guarda de CRIAÇÃO de ANOTAÇÃO DE AGENDA (H4.1, modo agenda): só a CAPACIDADE da
 * agenda (balde único), SEM o guard do free. Divergência do épico: o FREE PODE manter
 * agenda (nada é enviado); o que ele não pode é ATIVAR (gate `exigirVagaDeAtivo`). Roda
 * na MESMA transação (lock por conta) que faz o insert, fechando a corrida (H11.8).
 */
export async function exigirCapacidadeDeAgenda(cli: PoolClient, uid: string): Promise<AlavancasPlano> {
  await travarConta(cli, uid)
  const alavancas = await alavancasDoPlano(cli, uid)
  const usado = await contarAgenda(cli, uid)
  if (usado >= alavancas.capacidade_agenda) {
    throw regraNegocio(
      'agenda_cheia',
      `Sua agenda está cheia (${alavancas.capacidade_agenda} itens). Arquive um item ou escolha um plano com mais capacidade.`,
    )
  }
  return alavancas
}

/**
 * Conta avisos ATIVOS do criador (os que ocupam VAGA DE ATIVO do plano). NÃO conta
 * `sem_aviso` (anotações de agenda; G-M4) nem terminais. Espelho da contagem em SQL,
 * por papel (conta certo no fluxo invertido devedor-criador). Usado pelo gate de
 * ATIVAÇÃO (H4.3): ativar move o item do balde de agenda para o de ativos.
 *
 * NOTA: para combinados RECORRENTES esta contagem (1 por combinado) NÃO é o custo de
 * vaga; use `somarVagasAtivas` (cada ocorrência não-paga reserva 1 vaga, H11.3/H11.5).
 */
export async function contarAtivos(cli: PoolClient, uid: string): Promise<number> {
  const { rows } = await cli.query<{ n: string }>(
    `select count(*) as n from public.avisos
     where status not in ('sem_aviso','pago','cancelado','recusado','expirado')
       and ((criador_papel = 'cobrador' and cobrador_id = $1)
            or (criador_papel = 'devedor' and devedor_profile_id = $1))`,
    [uid],
  )
  return Number(rows[0]!.n)
}

/**
 * SOMA as vagas de aviso ativo consumidas pela conta (H11.3/H11.5, recorrência). A
 * contagem deixa de ser um count(*) de combinados e passa a SOMAR, por aviso ativo
 * (status not in sem_aviso/pago/cancelado/recusado/expirado):
 *   - combinado SIMPLES (recorrencia_tipo null): 1 vaga;
 *   - combinado RECORRENTE: o número de OCORRÊNCIAS ainda não pagas (cada ocorrência é um
 *     "envio de aviso", a moeda do plano; conforme cada vira `pago`, a vaga é liberada).
 * Por papel (conta certo no invertido devedor-criador). Espelha a regra no servidor (H11.8).
 */
export async function somarVagasAtivas(cli: PoolClient, uid: string): Promise<number> {
  const { rows } = await cli.query<{ n: string }>(
    `select coalesce(sum(
              case when a.recorrencia_tipo is null then 1
                   else (select count(*) from public.aviso_ocorrencias o
                          where o.aviso_id = a.id and o.status <> 'pago')
              end
            ), 0) as n
       from public.avisos a
      where a.status not in ('sem_aviso','pago','cancelado','recusado','expirado')
        and ((a.criador_papel = 'cobrador' and a.cobrador_id = $1)
             or (a.criador_papel = 'devedor' and a.devedor_profile_id = $1))`,
    [uid],
  )
  return Number(rows[0]!.n)
}

/**
 * Guarda de ATIVAÇÃO de uma anotação (H4.1/H4.3, divergência do épico): distinta do
 * gate de CRIAÇÃO (`exigirVagaDeAgenda`, que o FREE passa). Aqui ATIVAR consome uma
 * VAGA DE ATIVO, e o FREE (somente leitura) NÃO ativa: cai na CTA de plano, sem erro
 * feio e SEM transitar (o item fica na agenda). Roda na MESMA transação que faz o
 * update (com lock por conta), fechando a janela de corrida (H11.8 / S4).
 *
 * Ordem dos erros (E1-C2): primeiro o guard do FREE (código próprio), depois o limite
 * numérico de vagas. No Start/Profissional `vagas_ativas` = capacidade da agenda, então
 * ativar nunca trava enquanto couber; no Plus é o nº de unidades.
 *
 * `custoVaga` (default 1) é o número de vagas que ESTA ativação reserva: 1 para o
 * combinado simples, N para o recorrente (cada ocorrência = 1 vaga, H11.3/H11.5). A
 * contagem do já-consumido SOMA (`somarVagasAtivas`): por aviso ativo, 1 (simples) ou as
 * ocorrências ainda não pagas (recorrente). Recusa se `consumido + custoVaga > vagas`.
 * Recorrência NUNCA é gated por plano (é facilitador): este gate só mede vagas.
 */
export async function exigirVagaDeAtivo(
  cli: PoolClient,
  uid: string,
  custoVaga = 1,
): Promise<AlavancasPlano> {
  await travarConta(cli, uid)
  const alavancas = await alavancasDoPlano(cli, uid)

  // 1) Free mantém a agenda, mas NÃO ativa (envia). CTA de plano (H1.5/H4.3/E11).
  if (alavancas.somente_leitura) {
    throw regraNegocio(
      'plano_somente_leitura',
      'Seu plano mantém a agenda e a visualização, mas não ativa os envios. Escolha um plano para ativar este combinado.',
    )
  }

  // 2) Vagas de ativo do plano (SOMA por ocorrência no recorrente). Ao não caber, recusa
  //    sem ativar (o item segue na agenda).
  const consumido = await somarVagasAtivas(cli, uid)
  if (consumido + custoVaga > alavancas.vagas_ativas) {
    throw regraNegocio(
      'limite_plano_atingido',
      `Seu plano permite ${alavancas.vagas_ativas} avisos ativos ao mesmo tempo. Encerre um ou escolha um plano maior para ativar este.`,
    )
  }

  return alavancas
}
