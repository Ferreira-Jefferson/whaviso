# Plano de desenvolvimento — Épico 6: Ciclo de lembretes (D-2 a D+1)

> Fonte da verdade: `historias/06-ciclo-lembretes.md`. Onde o código/PROJETO.md/CLAUDE.md divergem, o plano muda o código/doc. Estado atual aferido lendo o código real (zap `enviar_lembretes`, `webhook_whatsapp`, `expirar_avisos`, `notificar_cobrador`; api `aceite`; `packages/shared/datas`; migrations 0001/0003/0004/0011/0024; frontend `CycleTimeline`/`PreviaCiclo`/`Envios`).

---

## 1. Resumo do épico e escopo

**Coração do pilar Avisar:** depois do aceite (Épico 5), o zap dispara uma sequência curta de lembretes por WhatsApp e para sozinho. Quem recebe é sempre o **devedor** (`telefone_devedor`), nos dois fluxos.

**MVP 🟢 (este épico):**
- H6.1 programar ciclo ao aceitar (estado `programado`).
- H6.2/H6.3 quatro etapas (D-2, D-1, D, D+1), textos distintos, **três botões fixos** em todas (Já paguei / Chave de Pag. / Desativar lembretes), opt-out visível, valor em reais, data em SP, linguagem neutra.
- H6.4 parar o ciclo (terminal, `pausado`, `aguardando_aprovacao_aviso_editado`, opt-out), reconferência no disparo, liberação do horário reservado.
- H6.5 `informado_pago` **para** o ciclo normal; única mensagem possível depois é o **empurrãozinho de D+1**; cobrador notificado ao clicar Já paguei (mecanismo no Épico 10).
- H6.6 D+1 é o último envio (máx. 4); depois permanece `programado`/`informado_pago` sem novos envios.
- H6.7 aceite tardio / catch-up: só a próxima etapa aplicável; nunca etapas vencidas em lote; mesma lógica ao retomar de pausa.
- H6.8 outbox `envios` com `FOR UPDATE SKIP LOCKED`, idempotência por etapa, **retry 3x com intervalo aleatório 20-60s**, auditoria, sem logar dado sensível.
- H6.9 **horário reservado por segundo** (janela 08:00:00-18:00:00 SP, segundo único global, distância mínima 10 min por devedor, wrap 18h→8h, fallback aleatório, liberação `null` ao encerrar, campo recuperável para reabertura).

**Gated 🟡 (fica como dívida / passos finais sinalizados, não implementa agora):**
- H6.10 janela e cadência configuráveis pelo criador (precisa estudo de UX + modelagem de cadência custom).

**Fora de escopo (outros épicos):** o que cada botão faz (E7), confirmação/rejeição do cobrador e o estado `informado_pago` em si (E8), notificações ao cobrador (E10), painel/estado dos envios na tela (E9), mecânica/texto do opt-out (E13), limites por plano que restringem cadência (E11).

---

## 2. Estado atual vs história (por critério, baseado no código real)

Legenda: `[x]` ok · `[~]` parcial · `[!]` diverge (refatorar) · `[+]` não existe.

### H6.1 Programar o ciclo ao aceitar
- `[!]` Ativa no estado **`pendente`** (api `aceite/repo.ts` `vincularEAtivar`, zap `webhook_whatsapp/repo.ts` aceite) — história exige renomear para **`programado`**.
- `[x]` Etapas ancoradas na data combinada em SP (`calcularAgendamentos`/`diaDaEtapa` em `shared/datas`).
- `[x]` Etapa/horário calculados no servidor (`calcularAgendamentos`).
- `[~]` Cada envio vira linha em `envios` com etapa + timestamp (`inserirEnvios`), **mas** o timestamp é fixo `HORA_ENVIO=09:00` + carência 10 min, **não** o horário reservado de H6.9.
- `[~]` Aceite tardio não reenvia em lote (`calcularAgendamentos` pula etapa passada salvo "hoje") — lógica existe mas será reescrita junto com H6.9 (ver H6.7).
- `[!]` Programação respeita estado, mas só conhece terminal; `pausado`/`aguardando_aprovacao_aviso_editado` **não existem** ainda.

### H6.2 Etapas, textos e botões
- `[x]` Textos base D-2/D-1/D/D+1 estão na migration 0024 (templates `ciclo.<etapa>`), batem com a história.
- `[!]` **Botões NÃO são fixos:** `enviar_lembretes/index.ts` remove `ver_pix` quando não há `pix_chave`. História: três botões sempre (Pix é obrigatório nos dois fluxos). A supressão deixa de existir.
- `[!]` Rótulo do botão Pix hoje é **"Ver chave Pix"** (migration 0024); história pede **"Chave de Pag."** (precaução de bloqueio). Rótulo de opt-out hoje é "Não quero mais lembretes"; história usa "Desativar lembretes". Editável pelo owner (E12).
- `[x]` Valor em reais (`formatarValorBr`) e data em SP (`formatarDataBr`).
- `[x]` Textos vêm de `templates`, zap é só transporte (`shared/templates`).
- `[x]` Nenhuma mensagem coleta texto livre (`inbound.ts` só lê botão).

### H6.3 Mensagens distintas + opt-out
- `[x]` Redação distinta por etapa (4 textos diferentes na 0024).
- `[~]` Tom leve: textos atuais são corretos mas mais secos que os exemplos da história; refinar copy (E12/E13).
- `[!]` Opt-out visível em toda etapa: hoje o botão opt-out existe nos templates, mas a etapa D-2 e as demais só têm os 3 botões garantidos depois de tornar os botões fixos (ver H6.2). Garantir botão presente em **todas** inclusive D-2.
- `[~]` Linguagem neutra/sem travessão: textos atuais ok; revisar empurrãozinho de D+1 (novo) e novos rótulos.

### H6.4 Parar o ciclo
- `[~]` Terminal não envia: trigger `encerrar_envios_do_aviso` (0004) cancela envios em `pago/cancelado/expirado`; falta incluir `recusado` (E5). E o cinto no `enviar_lembretes/index.ts` reconfere status.
- `[+]` `pausado` / `aguardando_aprovacao_aviso_editado` não existem (enum, trigger, app).
- `[x]` Estado reconferido no disparo (`carregarDados` + checagem em `index.ts`).
- `[~]` Opt-out interrompe: hoje opt-out vai a `cancelado` (terminal). História/E7 querem `desregistrado` reversível — fora deste épico, mas o ciclo precisa parar nesse estado.
- `[+]` Liberação do horário reservado ao encerrar/opt-out (campo não existe).

### H6.5 Devedor informa que pagou
- `[!]` Hoje em `informado_pago` os **lembretes continuam** (comentário explícito em `enviar_lembretes/index.ts` e `carregarDados` usa variante `revisao`). História inverte: ciclo normal **para**; única mensagem é o **empurrãozinho de D+1**.
- `[~]` Cobrador notificado ao Já paguei: `notificacoes_cobrador` é enfileirada (`webhook_whatsapp/repo.ts`), só quando há `cobrador_id` (TODO fallback telefone). Mecanismo detalhado no E10.
- `[+]` Empurrãozinho de D+1 (texto único e dedicado em `informado_pago`) não existe como conceito separado.
- `[x]` Cobrador não recebe notificação por envio do ciclo (não há tal código).

### H6.6 Encerrar em D+1 (máx 4)
- `[x]` Só 4 etapas no enum `etapa_envio` (0001); sem D+2.
- `[~]` Após D+1 permanece `pendente` sem novos envios (não há reagendamento); precisa renomear para `programado`.
- `[x]` Marcar pago/cancelar/rejeitar não depende de lembrete pendente (transições no trigger).

### H6.7 Aceite tardio / catch-up
- `[~]` `calcularAgendamentos` pula etapa cujo horário passou, exceto "hoje" (agenda +10min). Cobre boa parte, **mas** usa hora fixa 09:00, não o horário reservado, e a regra "aceite depois de D+1 → nenhum envio" depende do sweep de expiração, não da função.
- `[+]` "Mesma lógica ao retomar de pausa": não existe (não há pausa).

### H6.8 Outbox sem duplicar
- `[x]` Claim `FOR UPDATE SKIP LOCKED` (`enviar_lembretes/repo.ts reivindicar`).
- `[x]` Idempotência por etapa: `unique (aviso_id, etapa)` (0004) + `on conflict do nothing`.
- `[!]` **Retry diverge:** hoje 3 tentativas com **backoff fixo `[5,15,45]` minutos** (`BACKOFF_MIN`). História: **3 tentativas, intervalo aleatório de 20 a 60 segundos**.
- `[x]` Resultado registrado (`status`, `erro`, `wamid`, `entrega_status`) e exposto (frontend `Envios`/`CycleTimeline`).
- `[x]` Não loga telefone/Pix/conteúdo (logs usam `envioId`/`etapa`/`codigo`).

### H6.9 Horário reservado por segundo
- `[+]` **Nada existe.** Hoje todas as etapas saem às 09:00 SP (`HORA_ENVIO`). Não há segundo único, nem 10 min por devedor, nem wrap/fallback, nem campo recuperável, nem liberação `null`.

### H6.10 Cadência configurável 🟡
- `[+]` Não existe; gated.

### Divergências (cada uma é trabalho)
- `[!]` Renomear `pendente`→`programado` (enum, trigger, app api+zap, contratos shared+front, PROJETO.md/CLAUDE.md).
- `[!]` `informado_pago` **para** o ciclo (inverter comportamento atual).
- `[!]` Três botões fixos sempre (remover supressão de `ver_pix`).
- `[!]` Rótulo "Chave de Pag." (e "Desativar lembretes").
- `[+]` `pausado` e `aguardando_aprovacao_aviso_editado` (E2/E3) na máquina de estados.
- `[+]` Horário reservado por segundo (H6.9).
- `[+]` Distância mínima 10 min por devedor.
- `[!]` Retry 20-60s aleatório (substitui backoff em minutos).
- `[~]` Textos editáveis e neutros (empurrãozinho novo).

---

## 3. Trabalho por camada

### 3.1 Arquitetura / Dados (migrations)

**M1 — Renomear estado `pendente`→`programado` + novos estados (migration nova, ex.: `0025_estados_ciclo.sql`).**
- `alter type status_aviso rename value 'pendente' to 'programado'` (Postgres 10+ suporta rename de enum value; aplicar no cloud via `db push`).
- `alter type status_aviso add value if not exists 'pausado'`, `'aguardando_aprovacao_aviso_editado'`, `'recusado'`, `'desregistrado'` (alguns são donos de outros épicos; coordenar: criar só o que o ciclo precisa reconhecer — `pausado`, `aguardando_aprovacao_aviso_editado`; `recusado`/`desregistrado` podem vir de E5/E7, mas o trigger de `encerrar_envios` precisa conhecê-los — ver decisão em aberto sobre ordem de épicos).
- Reescrever `validar_transicao_aviso()` cobrindo as transições-alvo do `_CONTEXTO.md`: `programado↔pausado`, `programado↔aguardando_aprovacao_aviso_editado`, `programado→{informado_pago,pago,cancelado,expirado}`, `informado_pago→{pago,programado,cancelado,expirado}`, `aguardando_aceite→{programado,cancelado,expirado,recusado}`, `pago→programado`.
- Atualizar `encerrar_envios_do_aviso()`: cancelar envios também em `recusado`; e **suspender** (não cancelar) em `pausado`/`aguardando_aprovacao_aviso_editado` — decisão de design abaixo.

**M2 — Campo de horário reservado no `avisos` (mesma ou nova migration).**
- `add column horario_reservado_seg integer` (segundos desde meia-noite SP, 28800..64799 = 08:00:00..17:59:59) — `null` = liberado.
- `add column horario_reservado_orig integer` (campo **recuperável**: guarda o valor original mesmo quando `horario_reservado_seg` vira `null`, para reabertura H6.9).
- Índice parcial para a busca de segundo livre e a regra dos 10 min por devedor: `create index idx_avisos_horario on public.avisos (telefone_devedor, horario_reservado_seg) where horario_reservado_seg is not null`.
- Constraint de unicidade global de segundo entre avisos **ativos**: não dá para `unique` parcial direto sobre estado dinâmico de forma trivial; usar `create unique index idx_horario_seg_unico on public.avisos (horario_reservado_seg) where horario_reservado_seg is not null` (liberação por `null` garante o "segundo livre"). A regra dos 10 min por devedor é validada na **lógica de alocação** (não no índice).

**M3 — Templates: rótulos e empurrãozinho (migration de dados, upsert).**
- Atualizar `conteudo.botoes` dos `ciclo.*`: rótulo `ver_pix`→**"Chave de Pag."**, `optout`→**"Desativar lembretes"** (catálogo vai em migration, não no seed — regra do cloud).
- Nova chave de template para o empurrãozinho de D+1 em `informado_pago`: usar o **contexto `revisao`** da etapa `ciclo.d_mais_1` (já existe na 0024, mas com texto de "desconsidere"); **trocar o texto** para o empurrãozinho da história ("...você já informou que pagou, mas [cobrador] ainda não confirmou..."), neutro de gênero, sem travessão. Aprovar+ativar (`status_meta='aprovado', ativo=true`) já que agora é a **única** mensagem possível em `informado_pago`.
- Remover/aposentar os textos `revisao` das outras etapas (D, D+1 "desconsidere") porque o ciclo normal não roda mais em `informado_pago`.

**M4 — Retry timing.** Não é schema; o campo `proxima_tentativa_em` já existe (0004). Só muda a lógica (ver 3.3).

### 3.2 Backend api (`apps/api`)
- `modules/aceite/repo.ts` `vincularEAtivar`: `status='pendente'`→`status='programado'`.
- `modules/aceite/service.ts`: tipo `ResultadoAceite.status: 'programado'`; **alocar o horário reservado** no aceite (chamar o alocador, ver 3.5) dentro da transação, antes de `inserirEnvios`.
- `modules/aceite/repo.ts` `inserirEnvios`: passar a usar o horário reservado (data da etapa + `horario_reservado_seg`) em vez de 09:00; ou receber agendamentos já calculados com esse horário.
- Buscar todos os `'pendente'` literais na api (avisos/painel/recebimentos) e renomear para `'programado'` (Grep `'pendente'` em `apps/api/src`).

### 3.3 Backend zap (`apps/zap`)
- `webhook_whatsapp/repo.ts` (aceite via botão): `status='programado'`; alocar horário reservado + inserir envios com ele (mesmo alocador da api — vive em `shared`).
- `webhook_whatsapp/repo.ts` (`ja_paguei`): ao ir para `informado_pago`, **cancelar os envios do ciclo normal ainda agendados** e (re)agendar **somente** o empurrãozinho de D+1 (se D+1 ainda não passou e o aviso seguir em `informado_pago`). Liberar/preservar horário conforme H6.9 (informado_pago **não** é terminal → mantém horário reservado).
- `enviar_lembretes/index.ts`:
  - Reconferência de estado: aceitar só `programado` (e `informado_pago` **apenas para a etapa empurrãozinho de D+1**); descartar em `pausado`/`aguardando_aprovacao_aviso_editado`/terminais. Remover o comportamento atual de mandar o ciclo inteiro em `informado_pago`.
  - **Remover a supressão de `ver_pix`** (três botões sempre).
- `enviar_lembretes/repo.ts`:
  - Retry: substituir `BACKOFF_MIN=[5,15,45]` por **intervalo aleatório 20-60s** (`proxima_tentativa_em = now() + (random*40+20) segundos`), mantendo `MAX_TENTATIVAS=3`.
  - `carregarDados`: em `informado_pago` carregar o template do empurrãozinho (contexto `revisao` de `d_mais_1`) só para a etapa `d_mais_1`; não carregar textos normais.
- `expirar_avisos/index.ts`: trocar literais `'pendente'`→`'programado'`; ao expirar, liberar horário (`horario_reservado_seg=null`, preservando `_orig`). Considerar `informado_pago` na regra de expiração? (história: após D+1 fica em painel; expiração de `informado_pago` não está neste épico — manter como está, só renomear).
- **Horário reservado / scheduler janela 8-18:** o claim hoje dispara por `agendado_para <= now()`. Como cada envio já guarda o timestamp (data + horário reservado), a janela 8-18 é garantida na **alocação** (o segundo escolhido está sempre em 08:00:00-17:59:59). Confirmar que o tick do scheduler não precisa de gate de horário extra (o `agendado_para` já é o instante certo). Documentar.

### 3.4 Frontend (`frontend/src`)
- Contratos Zod próprios (`shared/contracts/entidades.ts`): renomear `'pendente'`→`'programado'` no enum `statusAviso`; adicionar `pausado`, `aguardando_aprovacao_aviso_editado` (e `recusado`/`desregistrado` se já entrarem). Dicionário de rótulos do front (status) atualizado.
- `CycleTimeline.tsx`: já é orientado por `envios` reais (bom). Garantir que os 4 pontos e rótulos batem; nenhum cálculo de etapa no cliente (já respeitado).
- `PreviaCiclo.tsx`: copy ilustrativa — alinhar aos novos textos/rótulos ("Chave de Pag.", "Desativar lembretes"), neutro de gênero, sem travessão.
- Qualquer tela que mostre status "pendente" passa a "programado" (rótulo amigável pode ser "No ciclo de lembretes"/"Programado" — decidir copy com E9/E13).

### 3.5 Lógica compartilhada (`packages/shared`)
- `shared/datas`: novo módulo **alocador de horário reservado** (`reservarHorario`) e **gerador de agendamentos a partir do horário reservado** (substitui `HORA_ENVIO` fixo). Funções puras de cálculo de segundo (wrap 18→8, fallback aleatório) + a parte que consulta o banco (segundos ocupados globalmente + segundos do mesmo `telefone_devedor`) fica num repo chamado pela api e pelo zap (módulo nunca importa módulo; isto é `shared`, permitido).
- `calcularAgendamentos`: parametrizar pelo `horario_reservado_seg` em vez de `HORA_ENVIO`; manter a regra de catch-up (pular etapa vencida, "hoje" agenda para o próximo disparo válido **dentro** da janela, depois de D+1 nada).

### 3.6 Segurança / invariantes E13
- Sem travessão / palavras proibidas / gênero nos novos textos (empurrãozinho, rótulos) e nos comentários de código.
- Nunca logar telefone/Pix/conteúdo (manter; auditar os novos logs do alocador — logar só `aviso_id`/segundo, nunca telefone).
- Botão leva `aviso_id` no payload (já é assim: `acao:avisoId`); webhook idempotente por estado (já é).
- Validação de limite de envios (H6.10/E11) fica fora do MVP; ao implementar a cadência custom, validar no servidor sem corrida (E11 H11.8).

### 3.7 Testes
- **Unit (`shared/datas`):** alocador de segundo — segundo atual livre; ocupado→próximo; wrap 18:00→08:00; todos ocupados→aleatório; respeito aos 10 min por devedor; fallback quando 10 min não cabe; preservação de `_orig`; reuso na reabertura.
- **Unit:** `calcularAgendamentos` com horário reservado — catch-up (aceite em D-1, D, depois de D+1), DST não desloca o dia civil.
- **Integração zap (vitest, banco local):** programar ciclo no aceite cria 4 (ou menos) envios com timestamps corretos; `informado_pago` cancela ciclo e agenda só o empurrãozinho; estados de pausa suspendem; reconferência no disparo descarta terminal/pausado; retry 3x com intervalo 20-60s; idempotência `SKIP LOCKED` (toque duplo / reinício não duplica).
- **Corrida (dedicado, ponto crítico):** dois aceites concorrentes do **mesmo devedor** não recebem segundos a menos de 10 min; dois aceites quaisquer não recebem o mesmo segundo (unicidade global) sob concorrência — usar transações paralelas no teste.
- **Lint/typecheck/migrations:** `npm run lint`, `npm run typecheck`, `bash scripts/validate_migrations.sh whaviso_dev` após cada mudança de schema.

---

## 4. Sequência de passos

> Cada passo aterrissa num critério (HNN.x). Modelo: **sonnet** = mecânico; **opus** = máquina de estados, scheduler, alocação por segundo, fila/corrida, segurança.

**P1 — Migration de estados: renomear `pendente`→`programado`, adicionar `pausado`/`aguardando_aprovacao_aviso_editado` (+`recusado` se coordenado), reescrever `validar_transicao_aviso()` e `encerrar_envios_do_aviso()`.**
Arquivos: `backend/supabase/migrations/0025_estados_ciclo.sql`, `packages/shared/src/contracts/enums.ts`.
Critério: H6.1 (estado `programado`), H6.4 (pausa suspende, terminal cancela), divergência "renomear" + "pausa por estados novos".
Modelo: **opus** — máquina de estados no banco + app, transições novas com risco de regressão.

**P2 — Migration de schema do horário reservado: colunas `horario_reservado_seg`/`horario_reservado_orig`, índices (unicidade global parcial + lookup por devedor).**
Arquivos: `0025_*.sql` (mesma migration ou `0026_horario_reservado.sql`).
Critério: H6.9 (segundo único, campo recuperável, liberação `null`).
Modelo: **opus** — modelagem de unicidade/liberação que sustenta a regra de corrida.

**P3 — Alocador de horário reservado em `packages/shared` (cálculo puro + repo de leitura de segundos ocupados/por devedor) com wrap, fallback e 10 min.**
Arquivos: `packages/shared/src/datas/horario_reservado.ts` (+ repo de consulta), testes unit.
Critério: H6.9 (busca segundo livre, wrap 18→8, fallback aleatório, 10 min por devedor, reabertura reusa `_orig`).
Modelo: **opus** — algoritmo de alocação por segundo + regra de espaçamento, núcleo da corrida.

**P4 — `calcularAgendamentos` passa a usar o horário reservado (não 09:00) e mantém catch-up.**
Arquivos: `packages/shared/src/datas/index.ts`, testes `datas.test.ts`.
Critério: H6.1, H6.7 (catch-up, próxima etapa aplicável), H6.9 (mesmo horário em todas as etapas), DST não desloca dia.
Modelo: **opus** — interação catch-up + horário reservado + DST tem casos sutis.

**P5 — Aceite (api + zap) aloca horário e programa o ciclo em `programado`.**
Arquivos: `apps/api/src/modules/aceite/{service,repo}.ts`, `apps/zap/src/modules/webhook_whatsapp/repo.ts`.
Critério: H6.1 (programar ao aceitar), H6.9 (horário definido no aceite).
Modelo: **opus** — transação que aloca segundo sob corrida + insere envios; consistência entre dois pontos de aceite (página e botão).

**P6 — `informado_pago` para o ciclo: cancelar envios normais e agendar só o empurrãozinho de D+1.**
Arquivos: `apps/zap/src/modules/webhook_whatsapp/repo.ts` (ja_paguei), `apps/zap/src/modules/enviar_lembretes/{index,repo}.ts`.
Critério: H6.5 (ciclo para, empurrãozinho único), divergência "informado_pago PARA o ciclo".
Modelo: **opus** — inverte comportamento atual + agendamento condicional do empurrãozinho.

**P7 — Reconferência de estado no disparo + liberação do horário reservado ao encerrar/opt-out.**
Arquivos: `apps/zap/src/modules/enviar_lembretes/index.ts`, `apps/zap/src/modules/expirar_avisos/index.ts`, trigger (P1) p/ liberar `horario_reservado_seg`.
Critério: H6.4 (reconfere no disparo, libera horário), H6.9 (liberação `null`, preserva `_orig`; recorrente libera só no fim — stub, E8).
Modelo: **opus** — reconferência + liberação tocam estado e horário, fonte de bugs de envio indevido.

**P8 — Três botões fixos sempre: remover supressão de `ver_pix` no envio.**
Arquivos: `apps/zap/src/modules/enviar_lembretes/index.ts`.
Critério: H6.2 (três botões em todas as etapas, inclusive D-2), H6.3 (opt-out sempre), divergência "três botões fixos".
Modelo: **sonnet** — remoção de um filtro, mecânico.

**P9 — Rótulos dos botões e empurrãozinho de D+1 nos templates (migration de dados).**
Arquivos: `0025_*` ou `0026_*.sql` (upsert em `templates`).
Critério: H6.2 ("Chave de Pag."), H6.3 ("Desativar lembretes", opt-out visível), H6.5 (texto do empurrãozinho), divergência "rótulo sem Pix" + "textos editáveis e neutros".
Modelo: **sonnet** — dados de catálogo + copy neutra; sem lógica.

**P10 — Retry 3x com intervalo aleatório 20-60s (substitui backoff fixo em minutos).**
Arquivos: `apps/zap/src/modules/enviar_lembretes/repo.ts`.
Critério: H6.8 (retry 3x, 20-60s aleatório).
Modelo: **sonnet** — troca da fórmula de `proxima_tentativa_em`, isolado e testável.

**P11 — Frontend: renomear estado, alinhar contratos/dicionário e copy ilustrativa.**
Arquivos: `frontend/src/shared/contracts/entidades.ts`, dicionário de rótulos, `PreviaCiclo.tsx`, telas que exibem "pendente".
Critério: H6.2/H6.3 (rótulos), H6.1/H6.6 (estado `programado` na UI), invariantes E13.
Modelo: **sonnet** — rótulos, enum e copy; sem lógica de agendamento (já calculado no servidor).

**P12 — Atualizar PROJETO.md e CLAUDE.md: `pendente`→`programado`, `informado_pago` para o ciclo, horário reservado, retry 20-60s.**
Arquivos: `PROJETO.md`, `CLAUDE.md`.
Critério: divergências (alinhar docs à história, sem travessão/palavras proibidas).
Modelo: **sonnet** — edição de documentação.

**P13 — Testes dedicados: alocador (unit), catch-up/DST (unit), integração ciclo/informado_pago/pausa/retry, corrida 10 min + unicidade de segundo.**
Arquivos: `packages/shared/src/datas/*.test.ts`, `apps/zap/src/modules/enviar_lembretes/tests/*`, harness de corrida.
Critério: H6.7, H6.8, H6.9 (pontos críticos do `_CONTEXTO.md`).
Modelo: **opus** — testes de corrida e de alocação por segundo precisam de cenários concorrentes corretos.

**P14 (🟡 gated, NÃO implementar agora) — Registrar dívida de design H6.10 (cadência configurável) e seguir só o padrão D-2..D+1.**
Arquivos: README (dívida de UX), nota no plano.
Critério: H6.10 (padrão é o ciclo fixo; flexibilidade fica para estudo).
Modelo: **sonnet** — apenas registro; a construção real espera decisão de UX/modelagem.

---

## 5. Dependências de outros épicos

- **E5 (Convite & Aceite):** o ciclo só ativa após o aceite levar a `programado`; depende do número de convite/aceite (origem do `aceite`/`webhook`). Os estados `recusado` (E5) e `desregistrado` (E7) que o trigger de encerramento precisa reconhecer vêm desses épicos — coordenar ordem (ver decisão em aberto).
- **E12 (Templates):** textos das 4 etapas + empurrãozinho + rótulos editáveis vivem em `templates`; o zap é transporte. Em grande parte já feito (0022/0024).
- **E11 (Planos/limites):** restringe a cadência (H6.10); fora do MVP, mas a validação de quantidade de envios entra quando a cadência custom for construída.
- **Máquina de estados (fundação cross-épico):** `programado`, `pausado`, `aguardando_aprovacao_aviso_editado` (E2/E3), `informado_pago` (E8). O ciclo consome esses estados.
- **Alimenta E9 (Painel):** status de envio (`CycleTimeline`/`Envios`) e estado `programado`.
- **Alimenta/depende de E10 (Notificações ao cobrador):** o Já paguei enfileira `notificacoes_cobrador`; a fila de saída com espaçamento 10 min + coalescing (H10.9) é par da regra de 10 min por devedor de H6.9 — manter coerência nas duas outboxes.

---

## 6. Riscos e pontos de teste dedicado

- **Corrida na alocação de segundo (crítico):** dois aceites concorrentes podem escolher o mesmo segundo (unicidade global) ou violar os 10 min do mesmo devedor. Mitigar com índice único parcial + transação que relê os ocupados sob `FOR UPDATE`/serialização e refaz a busca em conflito. Teste com transações paralelas.
- **Inversão do `informado_pago` (crítico):** risco de (a) continuar mandando o ciclo (comportamento antigo) ou (b) nunca mandar o empurrãozinho. Teste: ja_paguei antes de D+1 → só empurrãozinho sai; ja_paguei depois de D+1 → nada; rejeição volta a `programado` e o ciclo retoma a etapa aplicável.
- **Liberação x reabertura do horário (H6.9):** ao encerrar libera `seg=null` mas preserva `_orig`; reabertura (`pago→programado`, E8) reusa `_orig` mesmo se o segundo estiver ocupado (exceção à unicidade). Teste do reuso e da exceção.
- **Canal: RESOLVIDO.** Os botões hoje são interactive buttons oficiais da Meta, sancionados pela plataforma. O fallback de resposta numerada no texto segue disponível como resiliência geral do canal, não como mitigação de risco. Teste no mínimo do render (3 botões presentes).
- **DST / fuso:** D-2 deve cair sempre 2 dias antes no calendário local; teste com data em torno da virada de horário de verão (mesmo que o Brasil não use hoje, manter o teste para robustez).
- **Reconferência no disparo:** mudança de estado entre programar e enviar (pausa/terminal/opt-out) deve descartar o envio; teste do "estado mudou no claim".

---

## 7. Decisões em aberto (não inventadas — confirmar com o humano)

1. **H6.10 cadência configurável (🟡):** modelagem de dados da cadência custom (datas avulsas / semanal / mensal) e layout clean exigem estudo de UX. Manter MVP fixo D-2..D+1; não construir agora.
2. **Confirmar bloqueio do WhatsApp por "Pix" em rótulo (H6.2):** se o WhatsApp não bloquear "Pix", reavaliar se "Chave de Pag." é mesmo necessário. Como decidir o texto é do owner (E12), o padrão default ("Chave de Pag.") é seguro, mas vale validar.
3. **Fallback de resposta numerada: RESOLVIDO.** Os botões hoje são os interactive buttons oficiais da Meta; o fallback de resposta numerada no corpo da mensagem já está no MVP como resiliência geral do canal.
4. **Ordem dos épicos / donos dos estados:** `pausado`/`aguardando_aprovacao_aviso_editado` são donos de E2/E3 e `recusado`/`desregistrado` de E5/E7. Definir se a migration de estados do ciclo (P1) cria todos de uma vez ou só os que E6 precisa reconhecer, para o trigger de encerramento não quebrar quando os outros épicos chegarem.
5. **Comportamento da pausa na outbox:** ao pausar, **cancelar** os envios pendentes e recriá-los ao retomar, **ou** mantê-los e barrar no disparo pela reconferência de estado? A história pede que ao retomar valha "a etapa aplicável à data" (recriar parece mais limpo). Confirmar a estratégia antes de P7.
6. **Granularidade do scheduler vs janela 8-18:** como a janela é garantida na alocação (o segundo escolhido está sempre em 08:00:00-17:59:59), o tick não precisa de gate de horário — confirmar que não se quer um gate adicional de segurança no claim.
