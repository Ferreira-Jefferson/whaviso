# Verificação Épico 10: Notificações ao cobrador

## Veredito (38 [x] · 1 [~] · 1 [!] · 0 [+])

Quase tudo implementado e bem coberto por testes. A arquitetura outbox (api enfileira, zap drena com `FOR UPDATE SKIP LOCKED`), a janela de 1 min do opt-out, o coalescing do par opt-out/reativação, o espaçamento de 10 min por destinatário, o limite de plano e os botões "Confirmar pagamento / Ainda não recebi" estão todos presentes. A única falta clara: a CTA discreta de criar conta ao cobrador sem conta (H10.7), que não aparece em nenhum template nem é injetada no render.

## Por história

### H10.1: Entregar notificações pela outbox, no canal certo

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| api só enfileira; zap drena com `FOR UPDATE SKIP LOCKED`, sem Redis | [x] | enfileiramento em `apps/api/src/shared/notificacoes/index.ts:138`; drain `apps/zap/src/modules/notificar_cobrador/repo.ts:59-99` (`for update skip locked`) | `notificar_cobrador.test.ts:289` (2 drainers concorrentes) |
| Entrega única / idempotência (reinício não duplica) | [x] | índice único parcial em `dedupe_key` (migration `0029_notificacoes_generalizada.sql:50-53`); `on conflict ... do nothing` (index.ts:155); `ressuscitarTravados` (repo.ts:40) | `notificar_cobrador.test.ts:238`, `:289` |
| Roteamento canal/telefone: com conta = profile; sem conta = `telefone_cobrador`/`telefone_alvo` | [x] | `resolverAlvo` (index.ts:62-74); `carregarDados` `coalesce(p.telefone, n.telefone_alvo)` (repo.ts:117) | `notificar_cobrador.test.ts:114`, `:131`, `:147` |
| Retry 3 tentativas, 20-60s, esgotado fica falho visível | [x] | `reagendarOuFalhar` (repo.ts:222-240) usa `decidirReagendamento`; `MAX_TENTATIVAS = 3` (`shared/retry.ts:13`) | `notificar_cobrador.test.ts:202` |
| Conteúdo de `templates` (E12), neutro, sem proibidas | [x] | `carregarTemplateAtivo` por chave `cobrador.<tipo>` (index.ts:215); CHECK de linguagem nos templates (migrations) | `:71`, `:86` (gating) |
| Nunca logar telefone/Pix/valor/token | [x] | logs só com `notifId`/`tipo`/`codigo` (index.ts:161,183,210,222); comentários reforçam | n/a |

### H10.2: Notificar quando o devedor informa pagamento ("já paguei")

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Ao tocar "Já paguei" (`informado_pago`), cobrador notificado imediatamente | [x] | webhook `webhook_whatsapp/repo.ts:656`; api `acoes_devedor/service.ts:57`; recebimentos `service.ts:268` | `:238` |
| Notificação no WhatsApp leva botões Confirmar pagamento / Ainda não recebi, p/ qualquer cobrador | [x] | botões na chave `cobrador.pagamento_informado` (migration `0042_confirmacao_pagamento.sql:138-149`); render monta `acao:<aviso_id>` (templates/index.ts:68) | `templates.test.ts:36` |
| Quem tem conta vê em "precisa de você" no painel | [x] | linha gravada com `cobrador_id`; visibilidade do painel é E9, o registro é criado aqui | n/a |
| Texto neutro com nome/motivo/valor | [x] | `valoresNotificacao` expõe `nome_devedor`/`motivo`/`valor` (render.ts:14-25); template em E12 | n/a |
| Idempotente: tocar de novo (já `informado_pago`) não gera nova notificação | [x] | `ja_paguei` só age em `programado` (repo.ts:634); dedupe por `ocorrencia` via `eventos_aviso` (index.ts:83,110) | `:238` |
| Não expõe dado sensível em log | [x] | logs sem PII (index.ts:210) | n/a |

### H10.3: Notificar respostas ao convite (aceite, dado incorreto, recusa)

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Aceite notifica criador; no invertido inclui Pix confirmada | [x] | `convite_aceito` enfileirado (repo.ts:579); variante `revisao` no invertido (notificar_cobrador/index.ts:58-61; templates 0029:76-81) | n/a |
| Dado incorreto: notifica p/ revisar/reenviar, sem texto livre | [x] | `convite_dado_incorreto` (repo.ts:554); template é só sinal (0029:84-89) | n/a |
| Recusa (`recusado`, terminal próprio) notifica criador | [x] | `convite_recusado` em `recusado` (repo.ts:537-542) | n/a |
| Aponta qual combinado e leva ao item (quem tem conta) | [x] | `codigo` (6 dígitos) em todas as variáveis (render.ts:16; templates `{{2}}`) | n/a |
| Invertido: alvo = devedor-criador; receber: cobrador | [x] | `resolverAlvo` por `criador_papel` (index.ts:62-74); `notificacaoAlvo` repassa os 2 telefones (repo.ts:358-367) | `:147` |
| Linguagem neutra, sem proibidas | [x] | textos dos templates (0029); CHECK de linguagem | n/a |

### H10.4: Notificar problemas de convite

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Telefone divergente notifica criador p/ conferir/reenviar | [x] | `notificarTelefoneDivergente` (repo.ts:374-378) chamado em `service.ts:294`; template 0029:100-105 | n/a |
| 3 tentativas, telefone cadastrado: notifica + novo número gerado | [x] | 3º erro com convite pendente: `regenerarNumero` + `convite_tentativas_esgotadas` na mesma tx (repo.ts:334-345); template 0029:108-113 | `convite_aceite.test.ts` (cadastrado/regen) |
| 3 tentativas, telefone não cadastrado: nenhuma notificação | [x] | ramo não-cadastrado só bloqueia, sem enfileirar (repo.ts:347-353); service não notifica (service.ts:316) | `convite_aceite.test.ts:230` |
| Não revelam dados a quem não deve; nada sensível a log | [x] | templates só com `alvo`/`codigo` (0029:104,112); sem PII em log | n/a |

### H10.5: Notificar opt-out (atraso 1 min) e reativação

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Opt-out: notificação agendada ~1 min depois, não na hora | [x] | `agendarAposSeg: OPTOUT_ADIAMENTO_SEG (=60)` (repo.ts:15,757-760; api `acoes_devedor/service.ts:9,78-81`) | `notificar_cobrador.test.ts:361` |
| Reativa dentro do minuto: notificação cancelada, cobrador não recebe nada | [x] | `cancelarOptoutPendente` no `ativar`; se anulou, não enfileira reativação (repo.ts:726-729) | `:361` |
| Reativa depois: cobrador recebe nova notificação "voltou" | [x] | `anuladas === 0` enfileira `reativacao` (repo.ts:727-728) | `:416` |
| Identifica o combinado, neutro, sem tom acusatório | [x] | `{{2}}` = código; textos opt-out/reativação neutros (0029:116-129) | n/a |
| Janela controlada pelo agendamento da outbox; cancelamento idempotente | [x] | `agendar_para` na linha (migration `0041:33`); cancelamento por `status='cancelado'` idempotente (index.ts:177-193) | `:361` |

### H10.6: Silêncio durante o ciclo normal de lembretes

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Cobrador não recebe nada por envio do ciclo | [x] | `enviar_lembretes` envia só ao devedor; nenhum `enfileirarNotificacao(... cobrador ...)` no ciclo | n/a |
| Únicas notificações = eventos do devedor + problemas de convite | [x] | produtores só nos eventos: já paguei, dado incorreto, recusa, opt-out, reativação, telefone divergente, tentativas esgotadas (Grep de `enfileirarNotificacao`) | n/a |
| Falhas de entrega de lembrete não viram notificação ativa ao cobrador | [x] | falha de envio só marca `falhou`/visível no envio (enviar_lembretes/repo.ts:170); sem enfileirar ao cobrador | n/a |
| Vários eventos em sequência: vale espaçamento e cancelamento da fila (H10.9) | [x] | espaçamento de 10 min por destinatário no claim (repo.ts:67-91) | `:320` |

### H10.7: Cobrador sem conta é avisado pelo WhatsApp

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| `cobrador_id` nulo: todas as notificações vão p/ `telefone_cobrador` via WhatsApp | [x] | `resolverAlvo` cai em `telefone_cobrador`/`telefone_alvo` (index.ts:67,72); roteamento no drain (repo.ts:117) | `notificar_cobrador.test.ts:131` |
| Notificações acionáveis ("já paguei") levam botões p/ confirmar/rejeitar pelo WhatsApp | [x] | botões na chave `cobrador.pagamento_informado` valem p/ todas as versões (com/sem conta) (migration `0042:135,148`) | `templates.test.ts:36` |
| CTA discreta de criar conta para ver tudo no painel (nunca obrigatória) | [!] | nenhum template `cobrador.*` traz CTA de criar conta (0029); `renderMensagem` não injeta CTA (templates/index.ts:56-75). O comentário em `0042:115` cita "CTA discreta de criar conta" mas é só comentário; não há texto/template/render implementado | n/a |
| Mesmo risco de canal (botões via Baileys podem exigir fallback numerado) | [~] | infra de botões existe (baileys_client/index.ts:65); não há fallback numerado dedicado p/ a notificação ao cobrador. A própria história trata como risco "até a Meta oficial" (linha 84), não exige fallback agora | n/a |

### H10.8: Notificações seguras, sem ruído; WhatsApp é o canal principal

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Toda notificação idempotente e registrada, sem PII em log | [x] | dedupe único (0029:51); auditoria `notificacao_coalescida` (repo.ts:162-191); logs sem PII | `:238` |
| Eventos repetidos do mesmo tipo no mesmo combinado não duplicam | [x] | `ocorrenciaAtual` por `eventos_aviso` + índice único (index.ts:110-118,155) | `:238` |
| Respeitam limite de envios do plano por WhatsApp, sem deixar de registrar | [x] | `podeEnviarPeloPlano` via `notificacao_pode_enviar` (repo.ts:202; migration `0041:71-87`); bloqueado vira `cancelado/bloqueado_plano` auditado, fora do retry (notificar_cobrador/index.ts:208-212) | `:473` |
| WhatsApp é o core; painel é segunda opção; sem preferência que desligue o WhatsApp | [x] | nenhuma flag de "preferência de canal"; envio sempre tenta WhatsApp; painel só complementar | n/a |

### H10.9: Fila de saída simples: espaçar e cancelar itens superados

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Fila só no banco (`envios` e `notificacoes_cobrador`), sem Redis, `FOR UPDATE SKIP LOCKED` | [x] | claim cobrador (notificar_cobrador/repo.ts:59-99); claim devedor (enviar_lembretes/repo.ts:54-71) | `:289` |
| Espaçamento mínimo de 10 min por destinatário; acúmulo sai em sequência | [x] | `ESPACO_DESTINATARIO_MIN = 10` + subquery "último enviado ao alvo" + "1 linha por destinatário no lote" (repo.ts:15,67-91); devedor `ESPACO_DEVEDOR_MIN = 10` (enviar_lembretes/repo.ts:42,64) | `:320` |
| Coalescing: item não enviado anulado por evento posterior (opt-out/reativa) | [x] | `cancelarOptoutPendente` + reconferência `aindaValida` no drain (notificar_cobrador/index.ts:196-199; repo.ts:177-193) | `:361`, `:508` |
| Cancelamento vale nas duas filas (cobrador e devedor); lembrete obsoleto por estado terminal não sai | [x] | recheck de estado em ambos: notificar_cobrador `aindaValida` (index.ts:49-143); enviar_lembretes `aviso_status !== 'programado'` -> `marcarCanceladoAuditado` (enviar_lembretes/index.ts:42-46) | `:508` (cobrador); recheck devedor coberto |
| Conservador e auditável: só anula obsoleto comprovado; cada cancelamento registrado | [x] | só `agendado`/`processando`; auditoria append-only em `eventos_aviso` (tipo `notificacao_coalescida`, migration `0041:62`; repo.ts:178-182) | `:361`, `:508` |
| Ponto crítico -> testes fortes (corrida, múltiplos itens, limites do intervalo) | [x] | testes dedicados: 2 drainers (`:289`), espaçamento 10 min (`:320`), opt-out/reativa janela (`:361`,`:416`), corrida claim-vs-reabertura (`:508`) | sim |
| Espaçamento de entrega complementa a distância de 10 min/devedor do agendamento (H6.9) | [x] | comentários e código separam runtime (claim) de agendamento (repo.ts:55-57; enviar_lembretes/repo.ts) | n/a |

## O que o código precisa mudar para seguir a história (mudanças de CÓDIGO)

1. **H10.7 (CTA de criar conta) [!]**: adicionar uma CTA discreta de criar conta para passar a ver tudo no painel nas notificações ao cobrador **sem conta** (`cobrador_id` nulo). Hoje nenhum template `cobrador.*` traz essa CTA e o `renderMensagem` não a injeta. Opções de correção: (a) variante de template para alvo sem conta com a CTA no texto; ou (b) acrescentar a CTA no render quando `cobrador_id` for nulo. A história exige "nunca obrigatória", então o ajuste deve permanecer discreto, neutro e sem palavras proibidas.

## Itens que a própria história marca como 🟡/fora de escopo (com a linha)

- Linha 84 (H10.7): "Vale o mesmo risco de canal (botões via Baileys podem exigir fallback numerado até a Meta oficial...)" trata o fallback numerado como risco conhecido, não como exigência imediata. Por isso o critério de canal foi classificado [~] e não [!].
- Linhas 139-143 (Fora de escopo): mensagens ao devedor (E6/7/8), efeito das ações confirmar/rejeitar (E8), aparição no painel (E9), limites de envio por plano (E11), edição dos textos (E12). Coerente com o que o código delega a esses épicos.

## Observações

- Producers de `pagamento_informado` existem em três caminhos (webhook por botão, `acoes_devedor` por link público e `recebimentos`), todos idempotentes pelo mesmo `dedupe_key`. Boa consistência.
- A api `acoes_devedor/service.ts` cobre `ja_paguei` e `optout`, mas o `ativar`/reativação só existe pelo webhook do zap (botão). A história H10.5 não exige reativação por link público, então isso não é divergência: o par opt-out/reativação fecha pelo WhatsApp.
- O limite de plano (H10.8) usa função `SECURITY DEFINER` para o zap não tocar billing direto (privilégio mínimo). Bloqueio vira `cancelado/bloqueado_plano` (visível/auditado), fora do retry, sem contar como falha. Alinhado à história.
- Espaçamento de 10 min implementado nas duas filas com a mesma constante; o claim do cobrador inclui a regra "1 linha por destinatário por lote" para o acúmulo sair em sequência, exatamente como a H10.9 pede.
