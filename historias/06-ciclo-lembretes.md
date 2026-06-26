# Épico 6: Ciclo de lembretes (D-2 a D+1)

> Este é o coração do pilar **Avisar**: depois que o combinado é aceito, o Whaviso dispara automaticamente uma sequência curta de lembretes por WhatsApp e para sozinho.
> **Quem recebe é sempre o devedor** (`telefone_devedor`), nos dois fluxos (receber e pagar invertido). No invertido o devedor é o próprio criador, mas o alvo dos lembretes não muda.
> **Ciclo padrão de no máximo 4 mensagens:** D-2, D-1, D (no dia) e D+1. Cada etapa tem função e texto distintos; nunca se repete o mesmo texto. O criador também pode definir uma janela/cadência própria (H6.10).
> Convenções de sempre: datas de negócio em **America/Sao_Paulo** (banco em UTC); **etapa e agendamento são calculados no servidor**, nunca no cliente; toda mensagem traz **opt-out visível**; linguagem sem travessão, sem palavras proibidas e **neutra quanto a gênero**.
> O que o devedor faz ao tocar os botões (Já paguei / Chave de Pag. / Desativar lembretes) é detalhado no **Épico 7**; a confirmação do pagamento, no **Épico 8**; as notificações ao cobrador, no **Épico 10**. Aqui o foco é **quando** cada mensagem sai e **com quais botões**.
> **Nomenclatura de estado:** o estado em que o combinado foi aceito e está no ciclo de envios passa a se chamar **`programado`** (no lugar de `pendente`); ver divergências.

---

### H6.1: Programar o ciclo ao aceitar 🟢
Como **sistema (zap/scheduler)**, quero programar os envios assim que o combinado é aceito, para os lembretes saírem nas datas certas sem ninguém agendar na mão.
*Critérios de aceite:*
- [ ] O ciclo só é ativado quando o combinado entra em **`programado`** (após o aceite, Épico 5); antes disso (`aguardando_aceite`, `sem_aviso`) **nada** é programado.
- [ ] As etapas do ciclo padrão são ancoradas na **data combinada** (`America/Sao_Paulo`): D-2 = 2 dias antes, D-1 = 1 dia antes, D = no dia, D+1 = 1 dia depois.
- [ ] A **etapa e o horário de cada envio são calculados no servidor**, nunca recebidos do cliente.
- [ ] Cada envio programado vira uma linha na **outbox (`envios`)**, com a etapa e o **timestamp** de disparo (data da etapa + horário reservado do combinado, ver H6.9).
- [ ] Se o aceite acontecer **depois** de alguma etapa já ter passado (ex.: aceitou em D-1), as etapas vencidas **não são reenviadas em lote**: o ciclo segue a partir da **próxima etapa aplicável** (ver H6.7).
- [ ] A programação respeita o estado: combinado em estado que pausa lembretes (`pausado`, `aguardando_aprovacao_aviso_editado`) ou terminal **não** dispara (ver H6.4).

---

### H6.2: As etapas, seus textos e botões 🟢
Como **devedor**, quero receber lembretes curtos e claros nas datas certas, para lembrar do combinado sem me sentir cobrado.
*Critérios de aceite:*
- [ ] **D-2 (2 dias antes), aviso antecipado, sem urgência.** Texto base: *"Oi, [nome]. [quem recebe] pediu pra te lembrar do combinado: [motivo], R$ X para [data]."*
- [ ] **D-1 (1 dia antes), organização.** Texto base: *"Oi, [nome]. Amanhã é o dia: [motivo], R$ X."*
- [ ] **D (no dia), confirmação.** Texto base: *"Oi, [nome]. Hoje é o dia: [motivo], R$ X."*
- [ ] **D+1 (1 dia depois), último aviso.** Texto base: *"Oi, [nome]. Último aviso: [motivo], R$ X."*
- [ ] **Os três botões aparecem em todas as etapas** (inclusive D-2): **Já paguei**, **Chave de Pag.** e **Desativar lembretes**. Não há etapa sem botão nem botão condicional.
- [ ] **A palavra "Pix" não vai no rótulo do botão:** o padrão é **"Chave de Pag."** (precaução contra bloqueio do WhatsApp por termo sensível). O Pix existe sempre, porque é obrigatório nos dois fluxos (ver H6.divergências e Épicos 2/3).
- [ ] O **valor** é exibido em reais (vindo de centavos) e a **data** no fuso `America/Sao_Paulo`.
- [ ] Os textos são o **padrão**; rótulos e conteúdo são **editáveis pelo owner** via templates (Épico 12). O `zap` é só o transporte.
- [ ] Nenhuma mensagem coleta texto livre: o devedor só interage por botão (Épico 7).

---

### H6.3: Cada mensagem é distinta e traz opt-out 🟢
Como **devedor**, quero que cada lembrete seja diferente e sempre me ofereça sair, para não receber spam repetido e poder me desligar a qualquer hora.
*Critérios de aceite:*
- [ ] As etapas têm **redação distinta** (função diferente: antecipar, organizar, confirmar, encerrar); o sistema nunca manda o mesmo texto duas vezes no mesmo ciclo.
- [ ] O tom é leve e informal quando couber (ex.: *"Só passando pra lembrar..."*), sempre dentro das regras de linguagem.
- [ ] **Toda** mensagem do ciclo traz o **opt-out visível** (botão Desativar lembretes), inclusive a primeira (D-2). Detalhe da saída no Épico 13.
- [ ] As mensagens seguem as regras de linguagem: sem travessão, sem palavras proibidas, **neutras quanto a gênero** (ex.: *"pediu pra te lembrar"*, não *"o/a [nome] pediu"*).

---

### H6.4: Parar o ciclo quando o combinado não deve mais avisar 🟢
Como **sistema (zap/scheduler)**, quero suspender os envios quando o combinado sai do estado de lembrar, para nunca mandar mensagem indevida.
*Critérios de aceite:*
- [ ] Em estado **terminal** (`pago`, `cancelado`, `recusado`, `expirado`), **nenhum** lembrete é enviado, mesmo que ainda haja envio programado na outbox: o envio é descartado/cancelado antes de sair.
- [ ] Em **`pausado`** e em **`aguardando_aprovacao_aviso_editado`**, os lembretes ficam **suspensos** enquanto durar o estado; ao voltar a `programado`, o ciclo retoma a partir da etapa aplicável à data (ver H6.7).
- [ ] O estado é reconferido **no momento do disparo** (não só no agendamento): se mudou entre programar e enviar, vale o estado atual.
- [ ] Desativar lembretes (opt-out do devedor) interrompe o ciclo imediatamente (efeito e estado resultante no Épico 7/13).
- [ ] Ao entrar em estado terminal ou em opt-out, o **horário reservado** do combinado é liberado (ver H6.9).

---

### H6.5: Quando o devedor informa que pagou 🟢
Como **devedor**, quero que os lembretes parem quando eu disser que paguei, mas que ainda haja um empurrãozinho se quem recebe não confirmar, para não ficar uma ponta solta.
*Critérios de aceite:*
- [ ] Ao tocar **Já paguei** (em qualquer etapa), o combinado vai para **`informado_pago`** e o **ciclo normal de lembretes para** (as etapas restantes não saem).
- [ ] **O cobrador é notificado imediatamente** de que o devedor informou pagamento (Épico 10).
- [ ] **Empurrãozinho de D+1:** se chegar em **D+1** e o cobrador **ainda não confirmou** (combinado segue em `informado_pago`), é enviada **uma** mensagem diferente ao devedor, ex.: *"Ei [nome], a data do pagamento foi ontem. Você já informou que pagou, mas [nome de quem recebe] ainda não confirmou. Qualquer coisa, manda um oi pra [nome de quem recebe]."*
- [ ] Essa mensagem de D+1 é a **única** que sai enquanto o combinado está em `informado_pago`; o texto normal das etapas não é usado nesse estado.
- [ ] Depois do empurrãozinho de D+1, nada mais é enviado automaticamente; o acompanhamento segue no painel até o cobrador confirmar (→ `pago`) ou rejeitar (→ `programado`), tratado no Épico 8.
- [ ] **O cobrador não recebe notificação a cada envio do ciclo** (não recebe "o aviso D-2 foi enviado"); só é notificado em **eventos do devedor** (já paguei, dado incorreto, recusa, opt-out), ver Épico 10.

---

### H6.6: Encerrar o ciclo em D+1 (limite de 4 mensagens) 🟢
Como **devedor**, quero que os lembretes parem depois do último aviso, para não ser avisado indefinidamente.
*Critérios de aceite:*
- [ ] No ciclo padrão, **D+1 é o último envio:** no máximo 4 mensagens por combinado (D-2, D-1, D, D+1); não há D+2, D+3, etc. (cadência própria fica na H6.10).
- [ ] Depois de D+1, **se o combinado ainda não foi pago/cancelado**, ele permanece **`programado`** (ou `informado_pago`) no painel, **sem novos lembretes automáticos**; o acompanhamento passa a ser pelo painel (Épico 9).
- [ ] Marcar como pago, cancelar ou rejeitar continua possível após o ciclo terminar (não depende de haver lembrete pendente).

---

### H6.7: Aceite tardio e datas já vencidas (catch-up) 🟢
Como **sistema (zap/scheduler)**, quero lidar com combinados aceitos perto ou depois da data, para enviar só o que ainda faz sentido e nunca disparar etapas vencidas em lote.
*Critérios de aceite:*
- [ ] Se o aceite ocorre **entre etapas** (ex.: em D-1), as etapas anteriores já vencidas **não são enviadas**; o ciclo começa na **próxima etapa cujo horário ainda não passou**.
- [ ] Se o aceite ocorre **no dia (D)** ou **depois (até D+1)**, o sistema envia apenas as etapas restantes aplicáveis (ex.: aceitou em D → manda D e D+1).
- [ ] Se o aceite ocorre **depois de D+1** (data já bem vencida), o sistema **não dispara nenhuma etapa do ciclo** (não há mensagem "atrasada"); o combinado fica `programado` no painel para acompanhamento manual.
- [ ] A mesma lógica de "só a próxima etapa aplicável" vale ao **retomar de uma pausa** (`pausado` / `aguardando_aprovacao_aviso_editado` → `programado`).

---

### H6.8: Entregar pela outbox, sem duplicar 🟢
Como **sistema (zap/scheduler)**, quero drenar a fila de envios com claim exclusivo, para cada lembrete sair uma única vez mesmo com concorrência.
*Critérios de aceite:*
- [ ] Os envios são lidos da outbox (`envios`) e reivindicados com **`FOR UPDATE SKIP LOCKED`** (sem fila externa/Redis).
- [ ] Cada etapa de cada combinado é enviada **no máximo uma vez** (idempotência): reprocessamento ou reinício do `zap` não duplica mensagem.
- [ ] **Retry:** em caso de falha de envio, são feitas **até 3 tentativas**, com intervalo **aleatório de 20 a 60 segundos** entre cada tentativa; esgotadas as 3, o envio é marcado como falho.
- [ ] O resultado de cada envio (enviado / falha / retry) é registrado para auditoria e visível no painel (estado do envio).
- [ ] **Nunca** logar telefone, Pix ou conteúdo sensível ao registrar envios.

---

### H6.9: Horário reservado de disparo (janela 8h-18h, granularidade de segundo) 🟢
Como **sistema (zap/scheduler)**, quero dar a cada combinado um horário próprio dentro da janela comercial e espalhar os envios segundo a segundo, para não disparar tudo no mesmo instante e reduzir risco de bloqueio do WhatsApp.
*Critérios de aceite:*
- [ ] Os lembretes só saem na **janela das 08:00:00 às 18:00:00** (`America/Sao_Paulo`).
- [ ] Cada combinado tem um **horário reservado** com granularidade de **segundo**; **dois combinados ativos nunca compartilham o mesmo segundo** (ex.: combinado 1 às 08:00:00, combinado 2 às 08:00:01).
- [ ] **Distância mínima por devedor:** dois avisos com o **mesmo devedor** (`telefone_devedor`) têm os horários reservados a **no mínimo 10 minutos** um do outro, para o devedor **nunca receber vários alertas quase juntos**. Na busca por segundo livre, segundos a menos de 10 min de outro aviso ativo **do mesmo devedor** são **pulados** (a unicidade global de segundo continua valendo entre todos os devedores).
- [ ] Se não houver janela que respeite os 10 min para aquele devedor (agenda muito cheia), vale o fallback da regra geral (segundo aleatório dentro da janela), registrando que o espaçamento ideal não coube.
- [ ] O horário é **definido no momento do aceite**:
  - [ ] Se o aceite ocorre **dentro da janela (8-18)**: o sistema tenta o **segundo atual**; se já estiver ocupado, procura o **segundo seguinte** livre, avançando um a um.
  - [ ] Se chegar em **18:00:00** sem achar livre, a busca **recomeça do 08:00:00**.
  - [ ] Se **todos** os segundos da janela estiverem ocupados, o sistema escolhe um **segundo aleatório** dentro da janela (colisão aceita só como último recurso).
  - [ ] Se o aceite ocorre **fora da janela**, a busca por segundo livre começa a partir das **08:00:00**.
- [ ] **Todas as etapas** do combinado (D-2, D-1, D, D+1) disparam no **mesmo horário reservado**, cada uma na sua data; no banco cada envio é um **timestamp** (data da etapa + horário reservado).
- [ ] Quando o combinado é **cancelado, concluído (`pago`) ou o devedor sai (opt-out)**, o campo do horário reservado vira **`null`**, liberando aquele segundo para outros combinados. Em **combinados recorrentes**, a liberação só acontece no **fim do período** (não entre ocorrências), ver Épico 8 H8.7.
- [ ] O **valor original** do horário reservado é guardado num **campo recuperável** (não só `null`): se o combinado for **reaberto** (`pago → programado`, Épico 8 H8.6), ele **reusa o mesmo horário**, fora da regra de busca de segundo livre e **mesmo que o segundo já esteja ocupado**.
- [ ] Mudança de horário de verão / fuso **não** desloca a etapa para outro dia civil (D-2 cai sempre 2 dias antes da data combinada no calendário local).

---

### H6.10: Recorrência e cadência de envio configuráveis pelo criador 🟢 (design decidido; em implementação)
Como **criador**, quero definir se o combinado se repete (e em quais datas) e quais lembretes saem em cada ocorrência, para adaptar o aviso a cada combinado.
*Critérios de aceite:*

> Duas coisas distintas: **recorrência** (quantas vezes o combinado se repete) e **cadência configurável** (quais D-avisos saem dentro de cada ocorrência) são **ambas disponíveis para todos** (não há recurso por plano: o modelo é carteira de créditos, Épico 11). O padrão (sem configurar nada) é **um combinado único** com o ciclo **D-2 a D+1** completo.

**Recorrência (datas das ocorrências):**
- [ ] O **padrão** é não repetir (combinado único, comportamento atual). Repetir é **opt-in**, atrás de um controle recolhido por padrão; **disponível em todos os planos** (não é gated). É só um atalho para registrar vários avisos do mesmo cliente.
- [ ] Ligando a recorrência, escolho **por período** (frequência **mensal** ou **semanal** — todo mês ou toda semana, **sempre intervalo 1** — ancorada na "Data combinada", com fim por **N ocorrências**) **ou** **datas específicas** (lista de datas livres, a primeira é a própria "Data combinada").
- [ ] Cada ocorrência tem seu **próprio mini-ciclo de lembretes** ancorado na **data daquela ocorrência** (Épico 8 H8.7); o combinado só vira terminal `pago` no fim (H8.7).
- [ ] A **tela mostra ao vivo** quantos avisos a regra gera e quanto isso consome de **créditos de envio** (cada ocorrência reserva 1 envio, Épico 11 H11.4); a **palavra final é do servidor** (recusa com envelope `{ error: { code, message } }`; sem saldo, ativar/enviar cai na CTA de comprar créditos, mas registrar na agenda é permitido).

**Cadência (quais D-avisos):**
- [ ] O **padrão** é o ciclo D-2, D-1, D, D+1 completo (H6.2); quem não configurar nada usa esse padrão.
- [ ] O criador **escolhe quais etapas** do ciclo saem (um subconjunto de D-2..D+1); o **devedor do fluxo invertido** também pode ajustar como recebe. Sem configurar, usa o padrão. Disponível para todos (não é recurso de plano).

**Sempre:**
- [ ] A quantidade de envios resultante respeita o **saldo de créditos de envio** da conta (Épico 11).
- [ ] Etapa, ocorrência e agendamento são calculados **no servidor**; cada envio entra na outbox (`envios`) com seu `ocorrencia_id`, timestamp e o **mesmo horário reservado** do combinado (compartilhado entre ocorrências, H6.9/H8.7).
- [ ] **Design clean:** o controle oferece a flexibilidade sem poluir, via revelação progressiva (recolhido por padrão); o desenho de UX está nas Decisões.

---

### Divergências com a definição atual

> A sequência de 4 mensagens e seus textos já estão previstos (PROJETO.md §3.3/§3.4) e a maquinaria de outbox + `SKIP LOCKED` já é a arquitetura decidida (CLAUDE.md). As divergências abaixo vêm de mudanças e decisões novas das histórias.

- **Renomear `pendente` → `programado`:** o estado pós-aceite no ciclo passa a se chamar `programado` (palavra que descreve o que está acontecendo). Já varrido nas histórias (épicos 2, 3, 5). Falta no **código** (máquina de estados: trigger no banco + app) e no **PROJETO.md/CLAUDE.md**.
- **`informado_pago` PARA o ciclo (inversão):** CLAUDE.md/PROJETO.md dizem "estado não-terminal, lembretes continuam". A história muda isso: ao informar pagamento, **os lembretes normais param**; a **única** mensagem possível depois é o **empurrãozinho de D+1** (se o cobrador não confirmou). Continua não-terminal (volta a `programado` se rejeitado), mas não dispara o ciclo normal. Refatoração no scheduler + textos.
- **Três botões fixos em toda etapa:** hoje o desenho (PROJETO.md §3.3) faz os botões variarem por etapa (Já paguei só de D, Ver Pix só com chave). Passa a ser **sempre os três** (Já paguei / Chave de Pag. / Desativar lembretes) em todas as etapas. Conferir o código do `zap`.
- **Rótulo sem a palavra "Pix":** o botão de Pix usa **"Chave de Pag."** por precaução de bloqueio do WhatsApp. **Confirmar** se o WhatsApp realmente bloqueia "Pix" em rótulo; se não bloquear, reavaliar o texto. Rótulo editável pelo owner (Épico 12).
- **Pix obrigatório nos dois fluxos:** decorre de "Chave de Pag." sempre presente. O Épico 2 (H2.1) dizia Pix **opcional** no fluxo receber; passa a ser **obrigatório** (já atualizado no Épico 2). No invertido já era obrigatório (Épico 3).
- **Pausa por estados novos:** o ciclo precisa respeitar `pausado` e `aguardando_aprovacao_aviso_editado` (Épico 2/3), que ainda não existem na máquina de estados.
- **Horário reservado por segundo (H6.9):** mecanismo novo de alocação de um segundo único por combinado na janela 8-18, com liberação (`null`) ao encerrar. Precisa de campo no `aviso`/`envios` e da lógica de busca de segundo livre. Não existe hoje.
- **Distância mínima de 10 min por devedor (H6.9):** além da unicidade global de segundo, a busca precisa pular segundos a menos de 10 min de outro aviso ativo do **mesmo devedor**. Lógica nova; soma-se à fila de entrega com cancelamento (Épico 10 H10.9).
- **Recorrência e cadência configurável (H6.10):** hoje o ciclo é fixo D-2..D+1 num combinado único. Permitir recorrência (N ocorrências) e cadência custom (subconjunto de etapas) é construção nova: schema novo (ver Decisões), expansão lazy no scheduler do zap e seletor no front. A `envios` ganha `ocorrencia_id` e o unique `(aviso_id, etapa)` passa a `(ocorrencia_id, etapa)` para o recorrente (via índices parciais).
- **Textos editáveis e neutros:** os textos das etapas e o empurrãozinho de D+1 vêm da tabela `templates` (Épico 12), garantidos neutros de gênero, sem travessão e sem palavras proibidas.

### Decisões tomadas
- **Renomear estado para `programado`** (no lugar de `pendente`).
- **Três botões sempre presentes:** Já paguei, Chave de Pag. (Pix), Desativar lembretes, em todas as etapas. Pix é obrigatório nos dois fluxos.
- **Rótulo do botão de Pix sem a palavra "Pix"** (padrão "Chave de Pag."), por precaução de bloqueio do WhatsApp.
- **`informado_pago` para os lembretes**, com exceção do **empurrãozinho de D+1** se o cobrador não confirmar; ao clicar Já paguei, o **cobrador é notificado**.
- **Cobrador não recebe notificação por envio** do ciclo normal (só em eventos do devedor).
- **Horário de disparo (H6.9):** janela 08:00:00-18:00:00, um segundo único por combinado, busca a partir do horário do aceite avançando segundo a segundo (com wrap e fallback aleatório), liberação do segundo (`null`) ao encerrar/sair.
- **Distância mínima de 10 min por devedor (H6.9):** dois avisos do mesmo devedor ficam a pelo menos 10 min; a busca pula segundos perto demais de outro aviso ativo do mesmo devedor (fallback aleatório se não couber).
- **Retry de envio (H6.8):** 3 tentativas, intervalo aleatório de 20 a 60 segundos.
- **Texto muda em `informado_pago`:** o único texto possível é o empurrãozinho de D+1.
- **Recorrência e cadência (H6.10): design e schema decididos (2026-06-25).**
  - **UX (revelação progressiva, design clean):** a tela de criar continua igual por padrão (combinado único, uma "Data combinada"). Um controle **"Repetir este combinado"** fica recolhido logo abaixo da data, **disponível em todos os planos** (recorrência é facilitador, não diferencial, H11.5; não é bloqueado/CTA). Aberto, oferece duas abas: **Por período** (frequência mensal ou semanal ancorada na Data combinada, fim por **N ocorrências**; lida como frase, ex.: "Todo dia 10, por 3 meses") e **Datas específicas** (lista de datas, a 1ª é a Data combinada). Um resumo **ao vivo** mostra quantos avisos a regra gera e quantas **vagas** consome (cada ocorrência = 1 vaga). A **cadência** (quais D-avisos) é um seletor das etapas D-2..D+1, esse sim habilitado só com `cadencia_configuravel` (Prof/Plus).
  - **Schema `avisos` (colunas novas):** `recorrencia_tipo` (`null` simples | `periodo` | `avulsas`), `recorrencia_freq` (`mensal`|`semanal`, só em `periodo`; o CHECK ainda aceita `diaria` por legado, mas a entrada não usa mais), `recorrencia_intervalo` (int, default 1; **coluna legada: a entrada não configura mais "a cada N", é sempre 1**), `ocorrencias_total` (int, N), `ocorrencia_atual` (int, ponteiro 1..N), `cadencia_etapas` (array de `etapa_envio`, `null` = ciclo completo). Sem coluna de billing: recorrência não é gated.
  - **Tabela nova `aviso_ocorrencias`:** `id`, `aviso_id` (FK avisos), `indice` (1..N), `data_combinada` (date, a data daquela ocorrência), `status` (espelha o subconjunto do ciclo: `programado`/`informado_pago`/`pago`), `confirmado_em`, `confirmado_por`, `criado_em`. `unique (aviso_id, indice)`. Append-only de negócio (sem DELETE; cascade do aviso permitido).
  - **`envios` ganha `ocorrencia_id` (uuid, null para combinado simples).** O `unique (aviso_id, etapa)` de hoje vira **dois índices parciais**: `(aviso_id, etapa) where ocorrencia_id is null` (preserva o simples) e `(ocorrencia_id, etapa) where ocorrencia_id is not null` (um ciclo por ocorrência).
  - **Geração lazy:** ao aceitar/ativar, o servidor calcula e grava as **N linhas** de `aviso_ocorrencias` (datas em America/Sao_Paulo), mas gera o **mini-ciclo só da ocorrência 1**. Ao confirmar a ocorrência k (k<N): avança `ocorrencia_atual` para k+1, o aviso volta a `programado` e o scheduler gera o mini-ciclo da k+1 com o **mesmo horário reservado** (não realoca, não vira `null`). A última confirmação leva a `pago` terminal e libera o horário (`null`).
  - **Por período (cálculo de datas):** a partir da Data combinada, soma **1 unidade da frequência por ocorrência** em SP (sempre intervalo 1). Mensal mantém o **mesmo dia**; se o mês não tiver aquele dia (ex.: 31), usa o **último dia do mês**. Semanal soma 7 dias corridos por ocorrência. Tudo no servidor.
  - **Cadência:** `cadencia_etapas` filtra quais etapas o cálculo de agendamentos gera por ocorrência (`null` = todas). Vale também para o devedor do fluxo invertido.
  - **Servidor é autoridade:** datas, etapas, horário e contagem de vagas no servidor; o front nunca calcula ocorrência (mesma postura de H8.9/H9.8).
  - **Refino de UX (2026-06-25):** a aba "Por período" passou a ler como **frase** com estrutura estável ("Todo dia _DD_, por _N_ meses"; semanal usa o dia da semana da Data combinada, ex.: "Toda terça-feira, por _N_ semanas"). Sem Data combinada ainda, o trecho derivado vira um **"X"** (a frase não troca, para não confundir). Removidos da entrada: o intervalo **"a cada N"** (agora sempre 1), o fim por **"até uma data"** (só **N ocorrências**) e a **frequência diária** (só mensal/semanal); a aba **"Datas avulsas"** virou **"Datas específicas"**. A coluna `recorrencia_intervalo` e o valor `diaria` do CHECK de `recorrencia_freq` permanecem no banco (legados, sem migration); só a entrada/leitura no app deixou de usá-los. Contrato Zod e expansão de datas simplificados de acordo.

### Decisões em aberto
- ~~**H6.10 (cadência configurável)**~~ **resolvida (2026-06-25):** design de UX e schema acima (recorrência por período/datas específicas + cadência por subconjunto de etapas; tabela `aviso_ocorrencias` + `envios.ocorrencia_id`).
- **Confirmar bloqueio do WhatsApp por "Pix" em rótulo** (H6.2): valida se "Chave de Pag." é mesmo necessário.

### Fora de escopo deste épico
- ❌ O que cada botão faz quando tocado (Já paguei / Chave de Pag. / Desativar lembretes) e o evento `solicitou_pix` (Épico 7).
- ❌ Confirmação/rejeição do pagamento pelo cobrador e o estado `informado_pago` em si (Épico 8).
- ❌ Notificações ao cobrador (Épico 10).
- ❌ Layout do painel e estado dos envios na tela (Épico 9).
- ❌ Mecânica e textos do opt-out (Épico 13).
- ❌ Saldo de créditos de envio que limita a recorrência/cadência (Épico 11).
- ❌ Botão "Solicitar chave Pix" no lembrete do devedor quando o invertido está sem chave (Épico 14).
