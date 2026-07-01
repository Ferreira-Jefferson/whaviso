import type { Pool, PoolClient } from '@whaviso/shared/db'
import { comTransacao } from '@whaviso/shared/db'
import { aceiteExpiraEm, conviteExpiraEm, expandirOcorrencias } from '@whaviso/shared/datas'
import type { RecorrenciaCfg } from '@whaviso/shared/datas'
import { reprogramarCiclo } from '@whaviso/shared/datas/horario'
import {
  formatarNumeroConvite,
  gerarNumeroConvite,
} from '@whaviso/shared/contracts'
import type {
  AtivarAvisoBody,
  Aviso,
  CriarAvisoBody,
  EditarAvisoBody,
  Envio,
  EtapaEnvio,
  EventoAviso,
  ListarAvisosQuery,
  Ocorrencia,
  PapelAviso,
  RecorrenciaInput,
  StatusAviso,
} from '@whaviso/shared/contracts'
import { gerarToken, sha256Hex } from '../../shared/tokens'
import { conflito, naoEncontrado, proibido, regraNegocio } from '../../shared/http_errors'
import {
  exigirCapacidadeDeAgenda,
  reservarCreditos,
  resolverReservaAoEncerrar,
} from '../../shared/planos'
import { enfileirarConvite, enfileirarNotificacaoDevedor, enfileirarNotificacao } from '../../shared/notificacoes'
import { estadosDoGrupo } from '../../shared/estados'
import * as repo from './repo'

export interface AvisoCriado {
  aviso: Aviso
  /**
   * Número de convite em claro (xxx-xxx); única vez que sai. null no agenda.
   * E5 H5.0: com o auto-envio do convite (o Whaviso inicia a conversa), este número
   * deixa de ser para compartilhamento manual e vale só como identificador de RESERVA
   * (caso a pessoa precise localizar o combinado pelo número, H5.1). A api não devolve
   * mais mensagem pronta nem link wa.me.
   */
  numero_convite: string | null
}

// Quantas vezes regenerar o número de convite ao colidir (unicidade por telefone). Com
// 1M de espaço e poucos avisos por telefone, a colisão é raríssima; 10 tentativas é
// folga enorme. Esgotando, o erro é amigável (cobrador tenta de novo).
const MAX_TENTATIVAS_CONVITE = 10

/**
 * Gera um número de convite de 6 dígitos com RETRY de unicidade POR TELEFONE (loop
 * curto: gera, tenta gravar, em colisão 23505 regenera). `gravar` faz o INSERT (criar)
 * ou o UPDATE (ativar) com o hash do número; em colisão joga UNIQUE_VIOLATION. A
 * unicidade certa é garantida pelo índice parcial do alvo (telefone_devedor no receber,
 * telefone_cobrador no invertido). Retorna a linha gravada + o número em claro (que sai
 * UMA vez na resposta; nunca persiste).
 */
async function gerarConviteComRetry(
  cli: PoolClient,
  gravar: (conviteHash: string) => Promise<Aviso>,
): Promise<{ aviso: Aviso; numeroClaro: string }> {
  for (let tentativa = 0; tentativa < MAX_TENTATIVAS_CONVITE; tentativa++) {
    const numero = gerarNumeroConvite()
    const conviteHash = sha256Hex(numero)
    try {
      await cli.query('savepoint sp_convite')
      const aviso = await gravar(conviteHash)
      await cli.query('release savepoint sp_convite')
      return { aviso, numeroClaro: numero }
    } catch (e) {
      const code = (e as { code?: string }).code
      if (code === repo.UNIQUE_VIOLATION) {
        await cli.query('rollback to savepoint sp_convite')
        continue // colisão do número para este telefone: regenera
      }
      throw e
    }
  }
  throw conflito('convite_indisponivel', 'Não foi possível gerar o convite. Tente novamente.')
}

// E11 H11.2: cadência configurável, recorrência, menu e informado_pago são UNIVERSAIS
// (liberados para todos). Não há mais gating por recurso/plano: o único limite é o saldo
// de créditos (reserva na ativação). Por isso não existe mais guarda de cadência aqui.

/** Mapeia a recorrência do contrato para a config de expansão de datas (shared/datas). */
function cfgRecorrencia(r: RecorrenciaInput): RecorrenciaCfg {
  return r.tipo === 'periodo'
    ? { tipo: 'periodo', freq: r.freq, ocorrencias: r.ocorrencias }
    : { tipo: 'avulsas', datas: r.datas }
}

/**
 * Expande a recorrência em datas (a partir da data combinada, em America/Sao_Paulo) e
 * monta as colunas a gravar no aviso + a lista de datas das ocorrências. Servidor é
 * autoridade: o cliente nunca calcula data de ocorrência (H6.10).
 */
function montarRecorrencia(
  r: RecorrenciaInput,
  dataCombinada: string,
  cadencia: readonly EtapaEnvio[] | null | undefined,
): {
  colunas: {
    recorrencia_tipo: 'periodo' | 'avulsas'
    recorrencia_freq: 'mensal' | 'semanal' | null
    recorrencia_intervalo: number
    ocorrencias_total: number
    ocorrencia_atual: number
    cadencia_etapas: EtapaEnvio[] | null
  }
  datas: string[]
} {
  const datas = expandirOcorrencias(dataCombinada, cfgRecorrencia(r))
  return {
    colunas: {
      recorrencia_tipo: r.tipo,
      recorrencia_freq: r.tipo === 'periodo' ? r.freq : null,
      // Coluna legada: a entrada não configura mais "a cada N" (sempre 1, H6.10).
      recorrencia_intervalo: 1,
      ocorrencias_total: datas.length,
      ocorrencia_atual: 1,
      cadencia_etapas: cadencia ? [...cadencia] : null,
    },
    datas,
  }
}

export async function criarAviso(
  pool: Pool,
  uid: string,
  body: CriarAvisoBody,
): Promise<AvisoCriado> {
  return comTransacao(pool, async (cli) => {
    const ehReceber = body.direcao === 'receber'
    const criadorPapel: PapelAviso = ehReceber ? 'cobrador' : 'devedor'
    const ehAgenda = body.modo === 'agenda'

    // Capacidade de agenda (H11.7), na MESMA transação, com lock na carteira (sem corrida,
    // H11.12). Criar uma anotação é livre para todos (não há mais somente_leitura): só o
    // teto de agenda da conta limita. Vale para agenda E enviar (todo aviso ocupa um item
    // na agenda). A RESERVA de créditos do modo enviar vem depois (precisa do id do aviso).
    await exigirCapacidadeDeAgenda(cli, uid)

    // Recorrência (E6 H6.10): o servidor expande as datas (autoridade). `rec` carrega as
    // colunas a gravar + a lista de datas das ocorrências (vazio = combinado simples).
    // Recorrência/cadência são UNIVERSAIS (H11.2): nada é gated por recurso.
    const rec = body.recorrencia
      ? montarRecorrencia(body.recorrencia, body.data_combinada, body.cadencia_etapas)
      : null

    // Colunas de recorrência/cadência a gravar. A CADÊNCIA vale para simples E recorrente
    // (subconjunto de etapas do ciclo); por isso `cadencia_etapas` entra mesmo sem
    // recorrência. As colunas de recorrência só entram quando `rec` existe.
    const colunasRec = {
      ...(rec?.colunas ?? {}),
      cadencia_etapas: body.cadencia_etapas ? [...body.cadencia_etapas] : null,
    }

    // Custo em créditos da ATIVAÇÃO no modo enviar (H11.4): 1 por combinado simples, N por
    // recorrente (1 por ocorrência). A reserva ocorre após inserir o aviso.
    const custoCreditos = rec ? rec.datas.length : 1

    // No modo agenda os campos da outra ponta são OPCIONAIS (H4.1, cobrados só ao
    // ativar). No modo enviar, valida Pix (H2.1) como defesa do contrato APENAS no
    // receber: no invertido o Pix é OPCIONAL (decisão do dono), pode entrar depois.
    if (!ehAgenda) {
      if (ehReceber && (!body.pix_chave || !body.pix_titular || !body.pix_banco)) {
        throw regraNegocio('pix_obrigatorio', 'A chave Pix, o titular e o banco são obrigatórios.')
      }
    }

    // No invertido, o telefone do devedor (alvo dos lembretes) é o do criador. Na agenda
    // pode ser null (o perfil pode nem ter telefone ainda); resolvido/exigido ao ativar.
    const telefoneCriador = ehReceber ? null : await repo.telefoneDoPerfil(cli, uid)
    const telefoneDevedor = ehReceber ? (body.telefone_devedor ?? null) : telefoneCriador

    const camposComuns = {
      cobrador_id: ehReceber ? uid : null,
      devedor_profile_id: ehReceber ? null : uid,
      direcao: body.direcao,
      criador_papel: criadorPapel,
      nome_devedor: body.nome_devedor,
      telefone_devedor: telefoneDevedor,
      nome_cobrador: ehReceber ? null : (body.nome_cobrador ?? null),
      telefone_cobrador: ehReceber ? null : (body.telefone_cobrador ?? null),
      motivo: body.motivo,
      valor_centavos: body.valor_centavos,
      data_combinada: body.data_combinada,
      pix_chave: body.pix_chave ?? null,
      pix_titular: body.pix_titular ?? null,
      pix_banco: body.pix_banco ?? null,
    }

    // ---- H4.1: modo AGENDA: nasce sem_aviso, SEM convite e SEM envio. ----
    if (ehAgenda) {
      const aviso = await repo.inserirAviso(cli, {
        ...camposComuns,
        ...colunasRec,
        status: 'sem_aviso',
        aceite_token_hash: null,
        aceite_token_expira_em: null,
        acao_token_hash: null,
        convite_hash: null,
        convite_expira_em: null,
      })
      // Materializa as N ocorrências já na agenda (free PODE montar um recorrente na
      // agenda; o envio é que fica barrado, H11.2). Datas em America/Sao_Paulo.
      if (rec) await repo.inserirOcorrencias(cli, aviso.id, rec.datas)
      // Preserva direcao E modo na auditoria (G-B3: não perder a direcao).
      await repo.inserirEvento(cli, aviso.id, 'criado', criadorPapel, {
        direcao: body.direcao,
        modo: 'agenda',
      })
      return { aviso, numero_convite: null }
    }

    // ---- Modo ENVIAR: gera o convite (aguardando_aceite). O aceite é 100% pelo
    // WhatsApp (E5): não há mais link/página de aceite; o convidado responde com o
    // número de 6 dígitos. Mantemos os hashes de token (acao_token_hash é de E7) por
    // compatibilidade, sem expor link de site.
    const aceiteHash = sha256Hex(gerarToken())
    const acaoHash = sha256Hex(gerarToken())
    // H5.7: expiração FIXA de 7 dias (igual p/ todos os planos), não derivada da data.
    const conviteExpira = conviteExpiraEm()

    // H2.2 / H3.2: número de convite de 6 dígitos com retry de unicidade por telefone.
    const { aviso, numeroClaro } = await gerarConviteComRetry(cli, (conviteHash) =>
      repo.inserirAviso(cli, {
        ...camposComuns,
        ...colunasRec,
        status: 'aguardando_aceite',
        aceite_token_hash: aceiteHash,
        aceite_token_expira_em: aceiteExpiraEm(body.data_combinada),
        acao_token_hash: acaoHash,
        convite_hash: conviteHash,
        convite_expira_em: conviteExpira,
      }),
    )

    // E8 H8.7: materializa as N ocorrências do recorrente (lazy no ciclo: só a 1ª vira
    // mini-ciclo, gerado pelo zap no aceite). Datas em America/Sao_Paulo.
    if (rec) await repo.inserirOcorrencias(cli, aviso.id, rec.datas)

    // H11.4: o modo ENVIAR ATIVA o aviso (nasce aguardando_aceite, entra no ciclo). Reserva
    // os créditos JÁ AGORA (saldo_livre -> reservado), na MESMA transação/lock. Sem saldo,
    // recusa com `saldo_insuficiente` (o item NÃO é criado; nada se perde, a UI mostra a CTA
    // de comprar créditos). O consumo só vem no disparo; o não aceito devolve a reserva.
    await reservarCreditos(cli, uid, custoCreditos, aviso.id)

    // G4/H5.9: criar um novo combinado DESBLOQUEIA o telefone-alvo (limpa o anti-brute-force).
    await repo.limparBloqueioTelefone(cli, [telefoneDevedor, camposComuns.telefone_cobrador])

    await repo.inserirEvento(cli, aviso.id, 'criado', criadorPapel, {
      direcao: body.direcao,
      modo: 'enviar',
    })
    // H2.2/H3.2: evento de geração do convite (sem o número/hash nos detalhes).
    await repo.inserirEvento(cli, aviso.id, 'convite_gerado', criadorPapel)

    // E5 H5.0: o Whaviso INICIA a conversa. Enfileira o convite (resumo + botões) ao
    // CONVIDADO na MESMA transação; o zap drena e manda o template convite.resumo. Não
    // há mais compartilhamento manual (link/mensagem) pelo criador.
    await enfileirarConvite(cli, aviso)

    return { aviso, numero_convite: formatarNumeroConvite(numeroClaro) }
  })
}

/**
 * H4.3: ATIVA uma anotação da agenda (sem_aviso -> aguardando_aceite). Gera o número de
 * convite (mesma mecânica da criação) e a mensagem pronta. Consome uma VAGA DE ATIVO; o
 * FREE não ativa (CTA de plano, sem transitar). Pede os dados faltantes ANTES de ativar:
 * telefone da outra ponta e, no invertido, Pix.
 *
 * G-M2 (idempotência/corrida): a revalidação `status='sem_aviso'` ocorre sob FOR UPDATE
 * na MESMA transação que faz o update e consome a vaga. Duplo-tap concorrente do mesmo
 * aviso: o 2º vê status já <> sem_aviso e recebe 409.
 *
 * G-M5 (telefone_devedor no invertido): o alvo dos lembretes é o telefone do CRIADOR
 * (devedor). Como o perfil pode ter mudado desde a criação, RE-RESOLVEMOS do perfil ao
 * ativar; se ainda assim faltar, exigimos antes de ativar (não há ciclo sem ele, E6).
 */
export async function ativarAviso(
  pool: Pool,
  uid: string,
  id: string,
  body: AtivarAvisoBody,
): Promise<AvisoCriado> {
  return comTransacao(pool, async (cli) => {
    const aviso = await repo.buscarComoCriadorParaUpdate(cli, id, uid)
    if (!aviso) throw naoEncontrado('Aviso não encontrado')
    // G-M2: revalida sob o lock; duplo-tap concorrente: o 2º já não está em sem_aviso.
    if (aviso.status !== 'sem_aviso') {
      throw conflito('aviso_nao_ativavel', `Só uma anotação da agenda pode ser ativada (estado atual: "${aviso.status}").`)
    }

    const ehReceber = aviso.direcao === 'receber'

    // Resolve os dados da outra ponta: o que veio no corpo prevalece sobre o já gravado.
    const telefoneDevedorAtivo = ehReceber
      ? (body.telefone_devedor ?? aviso.telefone_devedor)
      // G-M5: no invertido o telefone_devedor é o do CRIADOR (perfil), re-resolvido agora.
      : (await repo.telefoneDoPerfil(cli, uid)) ?? aviso.telefone_devedor
    const telefoneCobradorAtivo = body.telefone_cobrador ?? aviso.telefone_cobrador
    const pixAtivo = body.pix_chave ?? aviso.pix_chave
    const pixTitularAtivo = body.pix_titular ?? aviso.pix_titular
    const pixBancoAtivo = body.pix_banco ?? aviso.pix_banco

    // Dados obrigatórios para ATIVAR (H4.3). Lista o que falta sem logar valores.
    const faltando: string[] = []
    if (ehReceber) {
      if (!telefoneDevedorAtivo) faltando.push('telefone da outra pessoa')
      if (!pixAtivo) faltando.push('chave Pix')
      if (!pixTitularAtivo) faltando.push('titular da chave Pix')
      if (!pixBancoAtivo) faltando.push('banco da chave Pix')
    } else {
      if (!telefoneCobradorAtivo) faltando.push('telefone de quem vai receber')
      // Pix OPCIONAL no invertido (decisão do dono): ativar sem chave é permitido (pode
      // entrar depois via PATCH). Só os telefones são exigidos para ativar.
      // G-M5: alvo dos lembretes no invertido = telefone do criador (perfil).
      if (!telefoneDevedorAtivo) faltando.push('seu telefone no perfil (alvo dos lembretes)')
    }
    if (faltando.length > 0) {
      throw regraNegocio(
        'dado_obrigatorio_ativacao',
        `Para ativar, informe: ${faltando.join(', ')}.`,
      )
    }

    // Recorrência (E6 H6.10): pode ser (re)definida AO ATIVAR; ausente = mantém o que já
    // estava (recorrência da agenda, ou simples). Quando redefinida, expandimos as datas
    // de novo a partir da data combinada do aviso (servidor é autoridade). Recorrência e
    // cadência são UNIVERSAIS (H11.2): nada é gated por recurso/plano.
    const rec = body.recorrencia
      ? montarRecorrencia(body.recorrencia, aviso.data_combinada, body.cadencia_etapas)
      : null

    // Custo em créditos da ATIVAÇÃO (H11.4): 1 por combinado simples, N por recorrente (1
    // por ocorrência). Se a recorrência foi redefinida agora, N = datas expandidas; senão,
    // as ocorrências já materializadas (ou 1 se simples).
    const custoCreditos = rec
      ? rec.datas.length
      : aviso.recorrencia_tipo
        ? (await repo.listarOcorrencias(cli, id)).filter((o) => o.status !== 'pago').length || 1
        : 1

    const aceiteHash = sha256Hex(gerarToken())
    const acaoHash = sha256Hex(gerarToken())
    const conviteExpira = conviteExpiraEm() // H5.7: 7 dias fixo a partir da ativação.

    const { aviso: ativado, numeroClaro } = await gerarConviteComRetry(cli, (conviteHash) =>
      repo.ativarAviso(
        cli,
        id,
        {
          telefone_devedor: telefoneDevedorAtivo,
          nome_cobrador: ehReceber ? null : (body.nome_cobrador ?? aviso.nome_cobrador),
          telefone_cobrador: ehReceber ? null : telefoneCobradorAtivo,
          pix_chave: pixAtivo,
          pix_titular: pixTitularAtivo,
          pix_banco: pixBancoAtivo,
        },
        {
          aceite_token_hash: aceiteHash,
          aceite_token_expira_em: aceiteExpiraEm(aviso.data_combinada),
          acao_token_hash: acaoHash,
          convite_hash: conviteHash,
          convite_expira_em: conviteExpira,
        },
        rec?.colunas,
        // Cadência (vale p/ simples também): grava o que veio no corpo; undefined = mantém.
        body.cadencia_etapas ? [...body.cadencia_etapas] : undefined,
      ),
    )

    // Recorrência redefinida na ativação: materializa as N ocorrências (idempotente).
    if (rec) await repo.inserirOcorrencias(cli, id, rec.datas)

    // H11.4: ativar uma anotação RESERVA os créditos (saldo_livre -> reservado), na MESMA
    // transação/lock. Sem saldo, recusa com `saldo_insuficiente` SEM transitar (o item fica
    // na agenda; a UI mostra a CTA de comprar créditos). Toda a ativação acima já rodou nesta
    // transação: se a reserva falhar, o rollback desfaz a transição.
    await reservarCreditos(cli, uid, custoCreditos, id)

    // G4/H5.9: ativar um combinado DESBLOQUEIA o telefone-alvo (anti-brute-force).
    await repo.limparBloqueioTelefone(cli, [telefoneDevedorAtivo, telefoneCobradorAtivo])

    // Evento de ativação (ator = papel do criador). + convite_gerado, espelho da criação.
    await repo.inserirEvento(cli, id, 'ativado', aviso.criador_papel)
    await repo.inserirEvento(cli, id, 'convite_gerado', aviso.criador_papel)

    // E5 H5.0: espelho da criação. O Whaviso envia o convite ao CONVIDADO direto (o
    // ativado já tem os telefones resolvidos); sem compartilhamento manual pelo criador.
    await enfileirarConvite(cli, ativado)

    return { aviso: ativado, numero_convite: formatarNumeroConvite(numeroClaro) }
  })
}

export async function listarAvisos(
  pool: Pool,
  uid: string,
  query: ListarAvisosQuery,
): Promise<{ itens: Aviso[]; total: number; page: number; per_page: number }> {
  // H9.3/H9.8: o SERVIDOR decide o conjunto de estados de cada faixa (ativos/agenda/
  // historico), para o front não precisar saber quais estados são terminais.
  const estados = query.grupo ? estadosDoGrupo(query.grupo) : undefined
  const { itens, total } = await repo.listarAvisos(pool, {
    uid,
    status: query.status,
    direcao: query.direcao,
    papel: query.papel,
    estados,
    busca: query.busca,
    ordenar: query.ordenar,
    dir: query.dir,
    de: query.de,
    ate: query.ate,
    limit: query.per_page,
    offset: (query.page - 1) * query.per_page,
  })
  return { itens, total, page: query.page, per_page: query.per_page }
}

export async function detalharAviso(pool: Pool, uid: string, id: string): Promise<Aviso> {
  const aviso = await repo.buscarAvisoVisivel(pool, id, uid)
  if (!aviso) throw naoEncontrado('Aviso não encontrado')
  return aviso
}

/** Envios do ciclo. Visível ao cobrador dono OU ao devedor vinculado. */
export async function listarEnvios(pool: Pool, uid: string, id: string): Promise<Envio[]> {
  const aviso = await repo.buscarAvisoVisivel(pool, id, uid)
  if (!aviso) throw naoEncontrado('Aviso não encontrado')
  return repo.listarEnviosDoAviso(pool, id)
}

/** Eventos de auditoria do ciclo. Mesma visibilidade do detalhe. */
export async function listarEventos(pool: Pool, uid: string, id: string): Promise<EventoAviso[]> {
  const aviso = await repo.buscarAvisoVisivel(pool, id, uid)
  if (!aviso) throw naoEncontrado('Aviso não encontrado')
  return repo.listarEventosDoAviso(pool, id)
}

/**
 * E8 H8.7 / E9 H9.6: ocorrências do combinado recorrente (índice 1..N, data, status,
 * confirmação), para o painel mostrar "k de N" e desmembrar por período. Mesma
 * visibilidade do detalhe (cobrador dono OU devedor vinculado). Combinado simples
 * devolve lista vazia (não há linhas em aviso_ocorrencias).
 */
export async function listarOcorrencias(pool: Pool, uid: string, id: string): Promise<Ocorrencia[]> {
  const aviso = await repo.buscarAvisoVisivel(pool, id, uid)
  if (!aviso) throw naoEncontrado('Aviso não encontrado')
  return repo.listarOcorrencias(pool, id)
}

// Estados VIVOS em que o aviso ainda pode ser editado/pausado/cancelado.
const VIVOS: StatusAviso[] = [
  'aguardando_aceite',
  'sem_aviso',
  'programado',
  'pausado',
  'aguardando_aprovacao_aviso_editado',
  'informado_pago',
  'desregistrado',
]

// Estados em que a edição é LIVRE (aplicada direto, sem reaprovação): antes do aceite.
const EDICAO_LIVRE: StatusAviso[] = ['aguardando_aceite', 'sem_aviso']

/**
 * H2.5: edita o combinado. Antes do aceite (aguardando_aceite/sem_aviso) a edição é
 * aplicada DIRETO. Depois do aceite (programado) salva o snapshot, transiciona para
 * `aguardando_aprovacao_aviso_editado` (o trigger pausa os lembretes), enfileira a
 * mensagem ao devedor (alteração a aprovar + lembretes pausados) e grava evento
 * `editado`. O teto de edições por plano (G-C2) é checado aqui (espelho de H2.3).
 */
export async function editarAviso(
  pool: Pool,
  uid: string,
  id: string,
  body: EditarAvisoBody,
): Promise<Aviso> {
  return comTransacao(pool, async (cli) => {
    const aviso = await repo.buscarComoCriadorParaUpdate(cli, id, uid)
    if (!aviso) throw naoEncontrado('Aviso não encontrado')
    if (!VIVOS.includes(aviso.status)) {
      throw conflito('aviso_nao_editavel', `Aviso em estado "${aviso.status}" não pode ser editado.`)
    }
    if (aviso.status === 'aguardando_aprovacao_aviso_editado') {
      // Já há uma edição aguardando decisão do devedor: desfaça ou aguarde antes de reeditar.
      throw conflito('edicao_em_aprovacao', 'Já existe uma edição aguardando aprovação. Desfaça-a antes de editar de novo.')
    }

    const livre = EDICAO_LIVRE.includes(aviso.status)

    // E11 H11.2: editar é UNIVERSAL (não há mais teto de edições por plano). O único
    // limite do produto é o saldo de créditos (consumido só no disparo, não na edição).

    const campos = camposEditados(body)

    if (livre) {
      // Antes do aceite: aplica direto, sem reaprovação nem evento de sub-ciclo.
      await repo.atualizarDados(cli, id, campos)
      await repo.inserirEvento(cli, id, 'editado', aviso.criador_papel, { reaprovacao: false })
      return { ...aviso, ...campos }
    }

    // Pós-aceite: snapshot do "antes", aplica os novos dados, vai para reaprovação.
    const anteriores = await repo.lerDadosEditaveis(cli, id)
    if (!anteriores) throw naoEncontrado('Aviso não encontrado')
    await repo.inserirEdicao(cli, id, anteriores, aviso.status)
    await repo.atualizarDados(cli, id, campos)
    await repo.atualizarStatus(cli, id, 'aguardando_aprovacao_aviso_editado')
    await repo.inserirEvento(cli, id, 'editado', aviso.criador_papel, { reaprovacao: true })
    // Notifica o DEVEDOR (alteração a aprovar + lembretes pausados). Só enfileira.
    await enfileirarNotificacaoDevedor(cli, aviso, 'aviso_edicao_a_aprovar')

    return { ...aviso, ...campos, status: 'aguardando_aprovacao_aviso_editado' }
  })
}

/** Extrai os campos definidos do corpo de edição para o update parcial. */
function camposEditados(body: EditarAvisoBody): Partial<repo.DadosEditaveis> {
  const c: Partial<repo.DadosEditaveis> = {}
  if (body.nome_devedor !== undefined) c.nome_devedor = body.nome_devedor
  if (body.motivo !== undefined) c.motivo = body.motivo
  if (body.valor_centavos !== undefined) c.valor_centavos = body.valor_centavos
  if (body.data_combinada !== undefined) c.data_combinada = body.data_combinada
  if (body.pix_chave !== undefined) c.pix_chave = body.pix_chave
  if (body.pix_titular !== undefined) c.pix_titular = body.pix_titular
  if (body.pix_banco !== undefined) c.pix_banco = body.pix_banco
  return c
}

/**
 * H2.5: o cobrador DESFAZ a edição enquanto está em reaprovação: restaura as condições
 * anteriores e volta a `programado` (o trigger reprograma os lembretes). Evento
 * `editado_aprovado`? Não: é uma reversão -> evento de desfazer reusa `editado` com
 * marcador? Usamos `editado_recusado` apenas para a recusa do devedor; para desfazer
 * gravamos `editado` com {desfeito:true} (não há tipo_evento dedicado a desfazer e o
 * enum é dono de F-STATE). A linha de avisos_edicoes é fechada como 'desfeita'.
 */
export async function desfazerEdicao(pool: Pool, uid: string, id: string): Promise<Aviso> {
  return comTransacao(pool, async (cli) => {
    const aviso = await repo.buscarComoCriadorParaUpdate(cli, id, uid)
    if (!aviso) throw naoEncontrado('Aviso não encontrado')
    if (aviso.status !== 'aguardando_aprovacao_aviso_editado') {
      throw conflito('sem_edicao_pendente', 'Não há edição aguardando aprovação para desfazer.')
    }
    const edicao = await repo.edicaoPendente(cli, id)
    if (!edicao) throw conflito('sem_edicao_pendente', 'Não há edição aguardando aprovação para desfazer.')

    await repo.atualizarDados(cli, id, edicao.dados_anteriores)
    await repo.resolverEdicao(cli, edicao.id, 'desfeita')
    await repo.atualizarStatus(cli, id, 'programado')
    await repo.inserirEvento(cli, id, 'editado', aviso.criador_papel, { desfeito: true })
    // H6.7: retoma o ciclo a partir da etapa aplicável (re-arma os envios suspensos,
    // reusando o horário reservado preservado durante a suspensão).
    await reprogramarCiclo(cli, { avisoId: id, telefoneDevedor: aviso.telefone_devedor })
    return { ...aviso, ...edicao.dados_anteriores, status: 'programado' }
  })
}

/**
 * H2.5: o devedor APROVA a edição (o gatilho real é o webhook do E5; o estado/transição
 * vivem aqui e são reusados). Fecha a edição como 'aprovada' e volta a `programado` com
 * os NOVOS dados (que já estão gravados no aviso). Evento `editado_aprovado`.
 */
export async function aprovarEdicao(cli: PoolClient, id: string): Promise<void> {
  const edicao = await repo.edicaoPendente(cli, id)
  if (!edicao) throw conflito('sem_edicao_pendente', 'Não há edição aguardando aprovação.')
  await repo.resolverEdicao(cli, edicao.id, 'aprovada')
  await repo.atualizarStatus(cli, id, 'programado')
  await repo.inserirEvento(cli, id, 'editado_aprovado', 'devedor')
  // H6.7: retoma o ciclo (horário reservado preservado na suspensão; telefone não é
  // necessário para reusá-lo).
  await reprogramarCiclo(cli, { avisoId: id, telefoneDevedor: null })
}

/**
 * H2.5: o devedor RECUSA a edição. Restaura as condições anteriores, volta a
 * `programado` (reativar nas condições anteriores), fecha a edição como 'recusada',
 * grava `editado_recusado` e NOTIFICA O COBRADOR (que pode reativar-anterior, já
 * feito aqui, ou reeditar). G-M3: "reativar nas condições anteriores" = restaurar
 * snapshot, mesmo efeito do desfazer, mas a partir da recusa do devedor.
 */
export async function recusarEdicao(cli: PoolClient, id: string): Promise<void> {
  // O ator é o DEVEDOR (gatilhado pelo webhook do E5, que já localizou o aviso). Aqui
  // operamos pelo id já validado.
  const edicao = await repo.edicaoPendente(cli, id)
  if (!edicao) throw conflito('sem_edicao_pendente', 'Não há edição aguardando aprovação.')
  await repo.atualizarDados(cli, id, edicao.dados_anteriores)
  await repo.resolverEdicao(cli, edicao.id, 'recusada')
  await repo.atualizarStatus(cli, id, 'programado')
  await repo.inserirEvento(cli, id, 'editado_recusado', 'devedor')
  await reprogramarCiclo(cli, { avisoId: id, telefoneDevedor: null })
  const alvo = await repo.buscarParaNotificar(cli, id)
  if (alvo) await enfileirarNotificacao(cli, alvo, 'edicao_recusada')
}

/**
 * H2.7: PAUSAR um combinado ACEITO (programado -> pausado). O trigger suspende os
 * envios; nenhum lembrete sai. Notifica o devedor. Evento `pausado`.
 */
export async function pausarAviso(pool: Pool, uid: string, id: string): Promise<Aviso> {
  return comTransacao(pool, async (cli) => {
    const aviso = await repo.buscarComoCriadorParaUpdate(cli, id, uid)
    if (!aviso) throw naoEncontrado('Aviso não encontrado')
    if (aviso.status === 'pausado') return aviso // idempotente
    if (aviso.status !== 'programado') {
      throw conflito('aviso_nao_pausavel', `Só um combinado em andamento pode ser pausado (estado atual: "${aviso.status}").`)
    }
    await repo.atualizarStatus(cli, id, 'pausado')
    await repo.inserirEvento(cli, id, 'pausado', aviso.criador_papel)
    await enfileirarNotificacaoDevedor(cli, aviso, 'aviso_pausado')
    return { ...aviso, status: 'pausado' }
  })
}

/**
 * H2.7: REATIVAR (pausado -> programado). O trigger/scheduler retoma o ciclo. Notifica
 * o devedor. Evento `reativado`.
 */
export async function reativarAviso(pool: Pool, uid: string, id: string): Promise<Aviso> {
  return comTransacao(pool, async (cli) => {
    const aviso = await repo.buscarComoCriadorParaUpdate(cli, id, uid)
    if (!aviso) throw naoEncontrado('Aviso não encontrado')
    if (aviso.status === 'programado') return aviso // idempotente
    if (aviso.status !== 'pausado') {
      throw conflito('aviso_nao_reativavel', `Só um combinado pausado pode ser reativado (estado atual: "${aviso.status}").`)
    }
    await repo.atualizarStatus(cli, id, 'programado')
    await repo.inserirEvento(cli, id, 'reativado', aviso.criador_papel)
    // H6.7: retoma o ciclo a partir da etapa aplicável, reusando o horário reservado.
    await reprogramarCiclo(cli, { avisoId: id, telefoneDevedor: aviso.telefone_devedor })
    await enfileirarNotificacaoDevedor(cli, aviso, 'aviso_reativado')
    return { ...aviso, status: 'programado' }
  })
}

/**
 * H2.6: cancela em qualquer fase VIVA (incl. pausado/reaprovação). Se o combinado já
 * tinha sido ACEITO (foi além de aguardando_aceite/sem_aviso), notifica o devedor.
 * `cancelado` é terminal; não apaga (estado). Evento de cancelamento.
 */
export async function cancelarAviso(pool: Pool, uid: string, id: string): Promise<Aviso> {
  return comTransacao(pool, async (cli) => {
    const aviso = await repo.buscarComoCriadorParaUpdate(cli, id, uid)
    if (!aviso) throw naoEncontrado('Aviso não encontrado')
    if (aviso.status === 'cancelado') return aviso // idempotente
    if (!VIVOS.includes(aviso.status)) {
      throw conflito('aviso_nao_cancelavel', `Aviso em estado "${aviso.status}" não pode ser cancelado.`)
    }
    // Já aceito = passou de aguardando_aceite/sem_aviso (devedor já está no combinado).
    const jaAceito = !EDICAO_LIVRE.includes(aviso.status)
    await repo.atualizarStatus(cli, id, 'cancelado')
    // C2: evento de cancelamento pelo CRIADOR, com ator = papel do criador (cobrador no
    // receber, devedor no invertido). `cancelado_criador` (0035) substitui o herdado
    // `cancelado_cobrador`, que era semanticamente errado no invertido (a linha do tempo
    // do E9 mostraria "cobrador" cancelando algo que o devedor cancelou).
    await repo.inserirEvento(cli, id, 'cancelado_criador', aviso.criador_papel)

    // E11 H11.4/H11.5/H11.6: trata os créditos AINDA reservados (não disparados) deste
    // aviso. Disparado nunca volta (já em consumido). O restante reservado: DEVOLVE direto
    // se nada disparou (igual ao convite não aceito); ou põe em HOLD de 24h se já houve
    // disparo (recorrente interrompido no meio, o job do zap devolve depois).
    await resolverReservaAoEncerrar(cli, uid, id)

    if (jaAceito) {
      await enfileirarNotificacaoDevedor(cli, aviso, 'aviso_cancelado')
    }
    return { ...aviso, status: 'cancelado' }
  })
}

/**
 * Arquiva uma anotação da agenda (H11.4): sai da contagem/visão da agenda. SOFT-delete
 * (set arquivado_em), NUNCA DELETE físico. Só o CRIADOR arquiva. Idempotente.
 */
export async function arquivarAviso(pool: Pool, uid: string, id: string): Promise<Aviso> {
  return comTransacao(pool, async (cli) => {
    const aviso = await repo.buscarComoCriador(cli, id, uid)
    if (!aviso) throw naoEncontrado('Aviso não encontrado')
    if (aviso.arquivado_em) return aviso // idempotente
    await repo.arquivarAviso(cli, id)
    return { ...aviso, arquivado_em: new Date() }
  })
}

/**
 * H4.5: marca uma anotação da agenda como paga MANUALMENTE (sem_aviso -> pago), sem
 * nunca ter ativado o envio. Terminal: entra no histórico de recebidos/pagos.
 *
 * D4 (fechada): evento DEDICADO `pago_manual` com ator = `criador_papel`. NÃO reusa
 * `confirmado_cobrador` (que poria ator='cobrador', errado no invertido onde o criador é
 * o devedor) nem o caminho de `recebimentos.confirmarRecebimento` (que exige papel
 * 'cobrador' e quebraria no invertido). Autorização: só o CRIADOR (no invertido, o
 * devedor). Idempotente se já `pago`.
 */
export async function marcarPagoAgenda(pool: Pool, uid: string, id: string): Promise<Aviso> {
  return comTransacao(pool, async (cli) => {
    const aviso = await repo.buscarComoCriadorParaUpdate(cli, id, uid)
    if (!aviso) throw naoEncontrado('Aviso não encontrado')
    if (aviso.status === 'pago') return aviso // idempotente
    if (aviso.status !== 'sem_aviso') {
      throw conflito(
        'aviso_nao_marcavel',
        `Só uma anotação da agenda pode ser marcada como paga aqui (estado atual: "${aviso.status}").`,
      )
    }
    await repo.atualizarStatus(cli, id, 'pago')
    await repo.inserirEvento(cli, id, 'pago_manual', aviso.criador_papel)
    return { ...aviso, status: 'pago' }
  })
}

/** Garante que o ator é o cobrador dono (usado por rotas de mutação direta). */
export async function exigirCobrador(pool: Pool, uid: string, id: string): Promise<Aviso> {
  const aviso = await repo.buscarComoCobrador(pool, id, uid)
  if (!aviso) throw proibido('Apenas o dono do aviso pode fazer isso')
  return aviso
}
