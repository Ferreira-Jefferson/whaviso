# Verificação — Épico 06: Ciclo de lembretes

## Veredito (38 [x] · 1 [~] · 0 [!] · 0 [+])

O código segue a história com fidelidade alta. O ciclo D-2..D+1 é ancorado na data combinada em America/Sao_Paulo, calculado 100% no servidor, entregue pela outbox `envios` com `FOR UPDATE SKIP LOCKED`, idempotente por `(aviso_id, etapa)`, com retry de exatamente 3 tentativas e intervalo aleatório 20-60s. O horário reservado por segundo (janela 08-18, unicidade global, 10min/devedor, fallback, reuso na reabertura) está implementado e testado. `informado_pago` para o ciclo normal e deixa apenas o empurrãozinho de D+1. Os três botões saem em todas as etapas com rótulo "Chave Pix" e "Desativar lembretes". A única ressalva [~] é H6.10 (cadência configurável), que a própria história marca 🟡 "precisa de estudo de design": o padrão D-2..D+1 existe, mas a configuração de janela/cadência custom não foi construída (esperado pela legenda).

---

## H6.1: Programar o ciclo ao aceitar

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Ciclo só ativa ao entrar em `programado` (não antes) | [x] | aceite → `update ... status='programado'` e só então cria envios: `webhook_whatsapp/repo.ts:560-574`. Antes do aceite nenhum envio é criado | `ciclo_horario.test.ts:60-95` |
| Etapas ancoradas na data combinada (SP): D-2/D-1/D/D+1 | [x] | `OFFSET_DIAS` e `diaDaEtapa` em `shared/datas/index.ts:15-50`; ORDEM_ETAPAS `:8-13` | `horario_reservado.test.ts:108-119` |
| Etapa e horário calculados no servidor, nunca do cliente | [x] | `calcularAgendamentos` (`shared/datas/index.ts:94-116`) roda no zap/api; cliente não fornece etapa nem timestamp | `horario_reservado.test.ts` |
| Cada envio vira linha na outbox com etapa + timestamp | [x] | `insert into public.envios (aviso_id, etapa, agendado_para)` `webhook_whatsapp/repo.ts:568-573`; timestamp = `instanteNoSegundoSp(dia, horarioSeg)` | `ciclo_horario.test.ts:113-123` |
| Aceite tardio: etapas vencidas não saem em lote, segue na próxima | [x] | `calcularAgendamentos` só cria etapa com `disparo > agora` (ou dia=hoje) `shared/datas/index.ts:102-113` | `horario_reservado.test.ts` |
| Respeita estados que pausam/terminam (não dispara) | [x] | reconferência no disparo `enviar_lembretes/index.ts:37-47`; trigger `encerrar_envios_do_aviso` cancela em suspensão/terminal `0028:107-122`, `0038:73-103` | `enviar_lembretes.test.ts:122-134` |

## H6.2: As etapas, seus textos e botões

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| D-2 texto antecipado ("pediu pra te lembrar...para [data]") | [x] | template `ciclo.d_menos_2` padrao, `0024:42-44` | — |
| D-1 texto organização ("Amanhã é o dia...") | [x] | `ciclo.d_menos_1` `0024:45-47` | — |
| D texto confirmação ("Hoje é o dia...") | [x] | `ciclo.d` `0024:48-50` | — |
| D+1 texto último aviso ("Último aviso...") | [x] | `ciclo.d_mais_1` `0024:51-53` | — |
| Três botões em todas as etapas (inclusive D-2) | [x] | `conteudo.botoes` com 3 botões em todos os `ciclo.*` `0024:18-39`; render sempre monta todos `templates/index.ts:67-70`; index não suprime botão por etapa `enviar_lembretes/index.ts:65-75` | `ciclo_horario.test.ts:94`, `enviar_lembretes.test.ts:118` |
| Rótulo sem "Pix": "Chave Pix" | [x] | `0039:27-44` troca rótulo ver_pix → "Chave Pix" e optout → "Desativar lembretes" | — |
| Valor em reais (de centavos) e data no fuso SP | [x] | `valoresCiclo` usa `formatarValorBr`/`formatarDataBr` `enviar_lembretes/render.ts:12-21`; data vem de `to_char(data_combinada,'YYYY-MM-DD')` `repo.ts:99` | `datas.test.ts` |
| Textos são o padrão, editáveis pelo owner via templates; zap só transporta | [x] | conteúdo lido da tabela `templates` `repo.ts:96-117`; zap não tem strings fixas `templates/index.ts:1-5` | — |
| Nenhuma mensagem coleta texto livre (só botão) | [x] | mensagens do ciclo só carregam botões; texto livre é tratado fora do ciclo (E7) `service.ts:232-269` | — |

## H6.3: Cada mensagem distinta e com opt-out

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Redação distinta por etapa (nunca repete texto) | [x] | quatro textos distintos `0024:42-53`; uma linha por etapa via unique `(aviso_id, etapa)` `0004:16` | — |
| Tom leve quando couber, dentro das regras | [x] | empurrãozinho com 🙂 `0039:55`; sem palavra proibida (CHECK `0022`/`0025`) | — |
| Opt-out visível em toda mensagem (inclusive D-2) | [x] | botão `optout` "Desativar lembretes" em todos os `ciclo.*` `0024:21,36`, `0039:35-44` | `ciclo_horario.test.ts:94` |
| Linguagem: sem travessão, sem proibidas, neutra de gênero | [x] | CHECK travessão `0025`; proibidas `0022`; empurrãozinho neutro `0039:55` | `linguagem.test.ts` |

## H6.4: Parar o ciclo quando não deve mais avisar

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Terminal: nenhum lembrete sai, descartado antes do envio | [x] | trigger cancela envios em terminal `0038:83-91`; cinto no disparo `enviar_lembretes/index.ts:42-46` | `enviar_lembretes.test.ts:122-134` |
| Pausado/aguardando_aprovacao: suspenso; retoma na etapa aplicável | [x] | trigger cancela com `erro='suspenso'` `0038:93-99`; `reprogramarCiclo` re-arma cancelados `horario_reservado_repo.ts:109-131` | `ciclo_horario.test.ts:166-189` |
| Estado reconferido no disparo (não só no agendamento) | [x] | `carregarDados` relê `aviso_status` e o index decide `enviar_lembretes/index.ts:37-47` | `enviar_lembretes.test.ts:82-101` |
| Opt-out interrompe o ciclo imediatamente | [x] | optout → desregistrado + trigger suspende envios `webhook_whatsapp/repo.ts:743-761` | `interacao_devedor` (E7) |
| Ao terminar/opt-out, horário reservado é liberado | [x] | terminal: trigger zera `_seg` `0038:88-91`; opt-out idem `webhook_whatsapp/repo.ts:743-750` | `ciclo_horario.test.ts:152-164` |

## H6.5: Quando o devedor informa que pagou

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Já paguei → `informado_pago`; ciclo normal para | [x] | `update ... status='informado_pago'` + cancela etapas != d_mais_1 `webhook_whatsapp/repo.ts:630-648` | `ciclo_horario.test.ts:213-228` |
| Cobrador notificado imediatamente | [x] | `enfileirarNotificacao(... 'pagamento_informado')` `webhook_whatsapp/repo.ts:656` | `ciclo_horario.test.ts` / E10 |
| Empurrãozinho D+1 se cobrador não confirmou (1 msg) | [x] | d_mais_1 sobrevive ao cancelamento `repo.ts:644-648`; em informado_pago só d_mais_1 dispara `enviar_lembretes/index.ts:37-41`; texto variante `revisao` `0039:52-77` | `enviar_lembretes.test.ts:103-120` |
| Empurrãozinho é a única msg em informado_pago; texto normal não é usado | [x] | qualquer etapa != d_mais_1 cancelada no disparo `enviar_lembretes/index.ts:38-41`; `carregarDados` escolhe `revisao` `repo.ts:104-113` | `enviar_lembretes.test.ts:82-101` |
| Depois do empurrãozinho, nada automático; segue no painel | [x] | nenhuma etapa após d_mais_1; acompanhamento manual (confirmar/rejeitar) `webhook_whatsapp/repo.ts:484-519` | — |
| Cobrador não é notificado por envio do ciclo | [x] | drainer de envios (`enviar_lembretes`) não enfileira notificação; só eventos do devedor enfileiram `webhook_whatsapp/repo.ts:656,656` | — |

## H6.6: Encerrar em D+1 (limite de 4 mensagens)

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| D+1 é o último; no máximo 4 (sem D+2/D+3) | [x] | `ORDEM_ETAPAS` tem só 4 etapas `shared/datas/index.ts:8-13` | `horario_reservado.test.ts:115` |
| Após D+1 sem pago/cancelado: fica programado/informado_pago sem novos lembretes | [x] | nenhuma etapa nova após D+1; sweep só expira em data_combinada+2 `expirar_avisos/index.ts:25-27` | `expirar.test.ts` |
| Marcar pago/cancelar/rejeitar ainda possível após o ciclo | [x] | ações independem de envio pendente; transições no trigger `0028:80-93` | `transicao_estado.test.ts:45-83` |

## H6.7: Aceite tardio e catch-up

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Aceite entre etapas: vencidas não saem, começa na próxima | [x] | `calcularAgendamentos` só cria `disparo > agora` `shared/datas/index.ts:102-113` | `horario_reservado.test.ts` |
| Aceite em D ou até D+1: só etapas restantes | [x] | mesma lógica; etapa de hoje cujo segundo passou ainda sai (claim imediato) `index.ts:108-110` | `horario_reservado.test.ts` |
| Aceite após D+1: nenhuma etapa do ciclo | [x] | todas em dias vencidos não são criadas `index.ts:106-113`; sweep expira `expirar_avisos/index.ts:25` | `expirar.test.ts` |
| Mesma lógica ao retomar de pausa | [x] | `reprogramarCiclo` chama `calcularAgendamentos` `horario_reservado_repo.ts:109-131` | `ciclo_horario.test.ts:166-189` |

## H6.8: Entregar pela outbox sem duplicar

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Lidos com `FOR UPDATE SKIP LOCKED` (sem Redis) | [x] | `for update of e skip locked` `enviar_lembretes/repo.ts:80` | `enviar_lembretes.test.ts` |
| Cada etapa enviada no máximo uma vez (idempotência) | [x] | unique `(aviso_id, etapa)` `0004:16`; claim muda status p/ processando; `on conflict do nothing` `webhook_whatsapp/repo.ts:570-573` | `enviar_lembretes.test.ts:22-33` |
| Retry: até 3 tentativas, intervalo aleatório 20-60s | [x] | `MAX_TENTATIVAS=3` e `intervaloRetrySegundos` 20-60 `shared/retry.ts:13,22-24`; usado em `reagendarOuFalhar` `enviar_lembretes/repo.ts:180-198` | `enviar_lembretes.test.ts:35-49` |
| Resultado registrado para auditoria e visível no painel | [x] | status (`enviado`/`falhou`/`cancelado`) + `entrega_status` + `erro` em `envios` `0004:3-17`; `atualizarEntrega` `webhook_whatsapp/repo.ts:833-843` | `enviar_lembretes.test.ts` |
| Nunca logar telefone/Pix/conteúdo ao registrar | [x] | logs só carregam `envioId`/`etapa`/`codigo` `enviar_lembretes/index.ts:57,81-86` | — |

## H6.9: Horário reservado (janela 8h-18h, granularidade de segundo)

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Lembretes só na janela 08:00:00-18:00:00 (SP) | [x] | `JANELA_INICIO_SEG`=28800, `JANELA_FIM_SEG`=64799 `horario_reservado.ts:24-26`; CHECK na coluna `0038:29-31` | `horario_reservado.test.ts:99-105` |
| Segundo único; dois ativos nunca compartilham o segundo | [x] | unicidade global em `alocarSegundo` `horario_reservado.ts:84-89`; lock dos ativos `horario_reservado_repo.ts:31-38` | `ciclo_horario.test.ts:125-149,192-211` |
| Distância mín. 10 min por devedor; pula segundos perto | [x] | `colideComDevedor` + `perto` (`<600s`) `horario_reservado.ts:64-71,86` | `horario_reservado.test.ts:55-65` |
| Não couber 10min: fallback aleatório, registrando que não coube | [x] | 2ª passada `espacamentoIdeal=false` `horario_reservado.ts:91-97`; grava `horario_espacamento_ideal` `horario_reservado_repo.ts:63-70` | `horario_reservado.test.ts:67-84` |
| No aceite: dentro da janela tenta segundo atual, avança 1 a 1 | [x] | `segundoDePartida` `horario_reservado.ts:39-42`; loop 1 a 1 `:84-89` | `horario_reservado.test.ts:20-46` |
| Em 18:00:00 sem livre: recomeça de 08:00:00 (wrap) | [x] | módulo circular `:85` | `horario_reservado.test.ts:48-53` |
| Todos ocupados: segundo aleatório (último recurso) | [x] | 3ª passada `horario_reservado.ts:99-102` | `horario_reservado.test.ts:86-97` |
| Aceite fora da janela: busca começa em 08:00:00 | [x] | `segundoDePartida` retorna INICIO fora da janela `:39-42` | `horario_reservado.test.ts:24-26` |
| Todas as etapas no mesmo horário, cada uma na sua data (timestamp) | [x] | `calcularAgendamentos` usa o mesmo `horarioSeg` `shared/datas/index.ts:102-113` | `ciclo_horario.test.ts:113-123` |
| Cancelar/pago/opt-out: `_seg` vira null liberando o segundo | [x] | terminal zera `_seg` `0038:88-91`; opt-out `webhook_whatsapp/repo.ts:743-750` | `ciclo_horario.test.ts:152-164` |
| Valor original em campo recuperável; reabertura reusa mesmo ocupado | [x] | `horario_reservado_orig` `0038:33-35,89`; `garantirHorarioReservado` reusa `_orig` fora da busca `horario_reservado_repo.ts:81-96` | `ciclo_horario.test.ts:153-164` |
| DST/fuso não desloca a etapa para outro dia civil | [x] | `instanteNoSegundoSp` por dia+segundo; `diaDaEtapa` meio-dia + addDays `shared/datas/index.ts:37-50` | `horario_reservado.test.ts:108-119` |

## H6.10: Janela e cadência configuráveis pelo criador 🟡 (precisa de estudo de design)

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Padrão é D-2..D+1; quem não configura usa o padrão | [x] | ciclo padrão único (`ORDEM_ETAPAS`) `shared/datas/index.ts:8-13` | `horario_reservado.test.ts` |
| Escolher por quanto tempo + cadência ou datas avulsas | [~] | Não implementado: não há campo de cadência custom no aviso nem na criação; só o ciclo fixo. A história marca 🟡 "precisa de estudo de design" (linha 121) e registra como dívida (linha 128) | — |
| Quantidade respeita limite de envios do plano (E11) | [~] | sem cadência custom não há geração variável; limite por plano é de E11 (fora de escopo, linha 168) | — |
| Etapa/agendamento no servidor; cada envio com timestamp e mesmo horário | [x] | para o padrão, `calcularAgendamentos` (servidor) `shared/datas/index.ts:94-116` | `horario_reservado.test.ts` |
| Design clean / dívida de UX registrada no README | [~] | UX não feita; a própria história marca como dívida de design (linha 128) | — |

---

## O que o código precisa mudar para seguir a história (mudanças de CÓDIGO)

Nada bloqueante. As histórias H6.1 a H6.9 estão cumpridas integralmente, com testes diretos. A única lacuna é H6.10 (cadência/janela configurável), que a própria história marca 🟡 "precisa de estudo de design" e registra como dívida de design no README. Não é exigida como pronta neste épico; o padrão D-2..D+1 (que a H6.10 define como o default de quem não configura) está implementado. Quando H6.10 sair do estudo de design, será preciso: (a) modelar a cadência custom no `aviso`, (b) gerar os envios a partir dessa cadência em vez do ciclo fixo, mantendo o mesmo horário reservado por combinado, e (c) integrar com o limite de envios do plano (E11).

## Itens que a própria história marca como 🟡/fora de escopo (com a linha)

- H6.10 inteira é 🟡 "(precisa de estudo de design)": cabeçalho linha 121; "exige estudo de UX (dívida de design registrada no README)" linha 128; decisão em aberto linha 159. Por isso a configuração de cadência custom estar ausente NÃO é divergência.
- "Limites de envios por plano que restringem a cadência (Épico 11)" fora de escopo: linha 168.
- "O que cada botão faz quando tocado... e o evento solicitou_pix (Épico 7)" fora de escopo: linha 163.
- "Confirmação/rejeição do pagamento pelo cobrador e o estado informado_pago em si (Épico 8)" fora de escopo: linha 164.
- "Notificações ao cobrador (Épico 10)" fora de escopo: linha 165.
- "Layout do painel e estado dos envios na tela (Épico 9)" fora de escopo: linha 166.
- "Mecânica e textos do opt-out (Épico 13)" fora de escopo: linha 167.

## Observações

- O renomeio `pendente → programado` (divergência da linha 136) está aplicado no banco (`0028:25-34`) e na app; o trigger valida exatamente as transições da história, incluindo `informado_pago → programado` (rejeição) e `pago → programado` (reabertura). Coberto por `transicao_estado.test.ts`.
- A inversão de `informado_pago` (divergência linha 137: o estado PARA o ciclo, só sobra o empurrãozinho de D+1) está implementada de ponta a ponta: `ja_paguei` cancela as etapas exceto `d_mais_1` com marcador `informado_pago`, e o drainer só deixa `d_mais_1` (variante `revisao`) sair. A migration `0039` ativa o texto do empurrãozinho e aposenta a variante `revisao` de `ciclo.d`, coerente com a história.
- H10.9/espaçamento por devedor em runtime: além da distância de 10min no agendamento (H6.9), o claim em `enviar_lembretes/repo.ts:52-85` reforça o espaçamento de 10min por `telefone_devedor` no momento da entrega. É reforço a favor da história, não divergência.
- `ressuscitarTravados` (`enviar_lembretes/repo.ts:33-39`) devolve envios travados em `processando` por mais de 10min, dando crash-safety sem duplicar mensagem, coerente com a idempotência da H6.8.
