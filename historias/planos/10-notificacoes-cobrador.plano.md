# Plano de desenvolvimento: Épico 10 — Notificações ao cobrador

> Fonte da verdade: `historias/10-notificacoes-cobrador.md`. Onde o código diverge da história, o plano descreve como **mudar o código** para bater com a história.
> Estado do código inspecionado (2026-06-22): outbox `notificacoes_cobrador` existe (migration 0014, renomeada/migrada na 0023 para usar `templates` por chave `cobrador.*`); a `api` e o `zap` enfileiram **só** o evento "já paguei"; o drainer `notificar_cobrador` envia 1 tipo. **Quase tudo o resto deste épico não existe.**

---

## 1. Resumo do épico e escopo

O épico reúne **tudo que é avisado a quem gerencia o combinado** (cobrador no fluxo `receber`; devedor-criador no `pagar` invertido). A `api` (e o `zap`, no caso do botão do WhatsApp) só **enfileira** em `notificacoes_cobrador`; o `zap` **drena** (`FOR UPDATE SKIP LOCKED`) e envia. Regra de ouro: **silêncio no ciclo normal** de lembretes; só **eventos do devedor** e **problemas de convite** notificam.

**MVP 🟢 (tudo neste épico é 🟢):**
- H10.1 outbox + idempotência + roteamento de canal (conta = telefone do profile + painel; sem conta = `telefone_cobrador`) + retry 3x/20-60s + templates.
- H10.2 "já paguei" notifica na hora, com botões Confirmar / Ainda não recebi (qualquer cobrador).
- H10.3 respostas ao convite (aceite, dado incorreto, recusa).
- H10.4 problemas de convite (telefone divergente, tentativas esgotadas com telefone cadastrado).
- H10.5 opt-out com atraso de 1 min + reativação (cancelamento na janela; 2ª notificação se reativar depois).
- H10.6 silêncio no ciclo normal.
- H10.7 cobrador sem conta avisado por `telefone_cobrador`, com CTA discreta de criar conta.
- H10.8 segurança/antiduplicação; WhatsApp é canal principal.
- H10.9 **fila de saída: espaçamento 10 min por destinatário + coalescing (cancelamento conservador)** nas DUAS outboxes (`notificacoes_cobrador` e `envios`). **Ponto crítico, testes fortes.**

**Gated 🟡 / dependente de outros épicos:** a maioria dos eventos novos (recusa, telefone divergente, tentativas esgotadas) só dispara depois que o **Épico 5** (aceite 100% WhatsApp, anti-brute-force, estado `recusado`) e o **Épico 8** (botões confirmar/rejeitar via WhatsApp) estiverem implementados. Este plano cobre o **lado da notificação**; o evento-fonte é dono do épico citado.

---

## 2. Estado atual vs história (por critério)

Legenda: `[x]` ok · `[~]` parcial · `[!]` diverge (refatorar) · `[+]` não existe.

### H10.1 Entregar pela outbox, no canal certo
- `[x]` api só enfileira; zap drena com `FOR UPDATE SKIP LOCKED`, sem Redis (`notificar_cobrador/repo.ts` `reivindicar`).
- `[~]` idempotência de entrega: o claim e `ressuscitarTravados` evitam duplicar **na entrega**; mas **antiduplicação no enfileiramento** (não criar 2 linhas para o mesmo evento/combinado) não existe — `insert` direto, sem `unique`/dedupe (H10.8).
- `[!]` roteamento de canal: `notificacoes_cobrador.cobrador_id` é **NOT NULL** e o repo lê telefone só do `profile`. **Sem conta (`cobrador_id` null) não há roteamento** — hoje a api simplesmente NÃO enfileira (ver `recebimentos/service.ts` L134 e `acoes_devedor`/webhook com TODO explícito).
- `[!]` retry: existe retry 3x, mas com backoff **em minutos** `[5,15,45]` (`repo.ts` L23), não o **intervalo aleatório 20-60s** que a história exige (alinhar a H6.8).
- `[~]` conteúdo via templates: lê de `templates` chave `cobrador.pagamento_informado` (0023). Só **1** chave existe; faltam as chaves dos demais eventos.
- `[x]` nunca loga telefone/Pix/token: os logs atuais só usam `notifId`/`codigo`.

### H10.2 Notificar "já paguei"
- `[x]` enfileira na hora quando devedor toca "Já paguei" (api `recebimentos`/`acoes_devedor`; zap `webhook_whatsapp/repo.ts`).
- `[+]` botões **Confirmar pagamento** / **Ainda não recebi** na mensagem ao cobrador: o template `cobrador.pagamento_informado` é texto puro ("confirme no painel"), sem botões; o `render` do cobrador não monta botões. Depende do Épico 8 H8.5.
- `[!]` "para qualquer cobrador (com ou sem conta)": hoje **só com conta** (cobrador_id null não enfileira).
- `[~]` aparece em "precisa de você" no painel: é trabalho do Épico 9; aqui só garantimos o registro visível.
- `[~]` texto neutro sem palavras proibidas: o template atual é neutro; manter ao reescrever.
- `[x]` idempotente no "já paguei" repetido: `informado_pago→informado_pago` não reenfileira (guard `status !== 'pendente'`).

### H10.3 Respostas ao convite (aceite / dado incorreto / recusa)
- `[+]` notificação de **aceite** ao criador: não existe (o aceite no webhook só cria os `envios`, sem enfileirar nada ao cobrador).
- `[+]` notificação de **dado incorreto / Pix incorreto**: não existe (depende do Épico 5 H5.4).
- `[+]` notificação de **recusa**: não existe; além disso a recusa hoje grava `status='cancelado'` (evento `recusado`), **não há estado terminal `recusado`** (esse é trabalho do Épico 5; este épico consome o evento).
- `[+]` roteamento por papel (invertido = notifica o devedor-criador): não existe.

### H10.4 Problemas de convite
- `[+]` telefone divergente (H5.8): não existe.
- `[+]` 3 tentativas esgotadas com telefone cadastrado (H5.9): não existe (anti-brute-force é do Épico 5).
- `[x]` 3 tentativas sem telefone cadastrado: **não notifica** — correto por construção (não há convite associado), garantir que continue assim.

### H10.5 Opt-out com atraso de 1 min + reativação
- `[+]` opt-out notifica o cobrador: **hoje opt-out NÃO notifica o cobrador** (api `acoes_devedor`/webhook só muda status para `cancelado`).
- `[+]` atraso de ~1 min: não existe coluna de agendamento na outbox (`notificacoes_cobrador` não tem `agendado_para`).
- `[+]` cancelar na janela se reativar; 2ª notificação se reativar depois: não existe (não há fluxo de reativação/`desregistrado`; opt-out hoje é terminal `cancelado`, irreversível). O estado `desregistrado` reversível é do Épico 7.

### H10.6 Silêncio no ciclo normal
- `[x]` o ciclo de lembretes (`enviar_lembretes`) nunca enfileira em `notificacoes_cobrador`: confirmado por leitura — só envia ao devedor.
- `[~]` falha de lembrete só no painel (não vira notificação): hoje falha de envio marca `falhou`/`erro` no `envios` (visível), e nada é enfileirado ao cobrador. Correto; falta o painel mostrar (Épico 9 H9.7).
- `[+]` "não recebe rajada quando vários eventos em sequência": depende de H10.9 (não existe).

### H10.7 Cobrador sem conta
- `[!]` `cobrador_id` null → notificar por `telefone_cobrador`: TODO explícito no código; **não existe**.
- `[+]` botões acionáveis no WhatsApp para sem-conta: depende H10.2/Épico 8.
- `[+]` CTA discreta de criar conta: não existe.

### H10.8 Seguras, sem ruído; WhatsApp principal
- `[~]` idempotente e registrada: entrega idempotente sim; **antiduplicação no enfileiramento** não.
- `[+]` eventos repetidos não duplicam: parcial só para "já paguei"; sem garantia geral (sem `unique`/coalescing).
- `[+]` respeitar limite de envios do plano ao sair por WhatsApp, mas registrar o evento: não existe contabilização de plano nas notificações (Épico 11).
- `[x]` WhatsApp é canal principal, sem preferência que o desligue: arquitetura já é "WhatsApp sempre; painel complementar". Não há toggle de canal. Garantir que continue.

### H10.9 Fila de saída (espaçamento + coalescing) — CRÍTICO
- `[+]` espaçamento mínimo de **10 min por destinatário** no banco: não existe. O `Pacer` do transporte espaça **em processo** por GAP aleatório (throughput), **não** por destinatário e **não** persiste o "próximo horário liberado". Não satisfaz a história.
- `[+]` coalescing (cancelar item ainda não enviado tornado obsoleto): só há cancelamento **no momento do drain** por reconferência de estado (`aviso_nao_em_revisao`, `aviso_nao_ativo`); não há cancelamento por **par evento/contra-evento** (opt-out↔reativação) nem antes do drain.
- `[~]` reconferência de estado terminal descarta envio: existe (`enviar_lembretes/index.ts` e `notificar_cobrador/index.ts`), alinha parcialmente com o critério "estado terminal anula item".
- `[+]` cada cancelamento auditável: cancelamentos hoje gravam `erro` na linha, mas não há registro de auditoria do coalescing (par evento/contra-evento).

---

## 3. Trabalho por camada

### 3.1 Arquitetura / Dados (migrations, estados, índices)

**Pré-requisito de máquina de estados (cross-épico, ver _CONTEXTO §Máquina de estados):** este épico **consome** os estados/eventos `recusado` (terminal próprio, Épico 5) e `desregistrado` reversível (Épico 7). O plano **não** os cria; assume que E5/E7 os entregam. Onde E5/E7 ainda não existirem, os passos correspondentes ficam "atrás" da dependência.

1. **Migration `0025_notificacoes_cobrador_v2`** (estende a outbox para servir todos os eventos do épico):
   - `alter table notificacoes_cobrador`:
     - `cobrador_id` → **nullable** (passa a aceitar sem-conta).
     - add `telefone_cobrador text` (alvo quando `cobrador_id` é null), com check E.164.
     - add `agendar_para timestamptz not null default now()` (janela de 1 min do opt-out e base do espaçamento de 10 min).
     - add `coalesce_key text` (chave de coalescing: ex. `aviso_id || ':' || tipo || ':' || ocorrencia`), `coalesce_grupo text` (ex. `aviso_id || ':optout_reativa'` para o par que se anula).
     - add `dedupe_key text` + `unique index where status <> 'cancelado'` (antiduplicação no enfileiramento, H10.8).
     - `tipo` deixa de ter default fixo; valores: `pagamento_informado`, `convite_aceito`, `convite_dado_incorreto`, `convite_recusado`, `convite_telefone_divergente`, `convite_tentativas_esgotadas`, `optout`, `reativacao`.
     - add `liberado_apos timestamptz` (próximo horário liberado por destinatário — ver §3.3 espaçamento) **ou** computado em runtime; decidir no passo de implementação.
     - `check`: ou `cobrador_id is not null` ou `telefone_cobrador is not null` (sempre há um alvo).
   - Índice do claim revisto: `where status in ('agendado','processando') and agendar_para <= now()` ordenado por `agendar_para`.
   - Índice por destinatário para o cálculo de espaçamento: `(cobrador_id)` e `(telefone_cobrador)` parciais.
   - **Tabela/recurso de auditoria do coalescing:** registrar cada cancelamento por coalescing. Reusar `eventos_aviso` (append-only) com `tipo='notificacao_coalescida'` **ou** coluna `cancelado_motivo` + `cancelado_em` na própria outbox. Decidir no passo (preferência: `eventos_aviso` para auditoria forte).
2. **Migration `0026_envios_coalescing`** (lado devedor da H10.9): a outbox `envios` precisa de campo de espaçamento por **destinatário (devedor/telefone)** e de cancelamento conservador de item obsoleto. Hoje o cancelamento é só no drain por estado; adicionar:
   - O espaçamento de 10 min por devedor **já** é parcialmente garantido pelo agendamento (Épico 6 H6.9, `calcularAgendamentos`); a fila de saída **complementa** (acúmulo em runtime). Avaliar se basta runtime (sem coluna) ou se precisa de `liberado_apos` por telefone. Provável: cálculo em runtime na query de claim (sem coluna nova), preservando a simplicidade "só banco".
3. **Catálogo de templates (migration, NÃO seed — regra do cloud):** inserir as chaves novas em `templates` (upsert idempotente, nascendo `pendente`+inativas se forem gated por botão Meta; ativas se forem texto puro):
   - `cobrador.convite_aceito`, `cobrador.convite_dado_incorreto`, `cobrador.convite_recusado`, `cobrador.convite_telefone_divergente`, `cobrador.convite_tentativas_esgotadas`, `cobrador.optout`, `cobrador.reativacao`.
   - Reescrever `cobrador.pagamento_informado` para variante **com botões** (Confirmar / Ainda não recebi) quando o Épico 8/Meta liberar; manter variante texto puro como fallback.
   - Todos os textos: neutros de gênero, sem palavras proibidas (check `templates_*_linguagem_limpa` já existe), sem travessão. Identificar o combinado por "do combinado xxx-xxx" (H10.5).
4. **Não criar estado novo aqui.** `recusado`/`desregistrado` são de E5/E7.

### 3.2 Backend `api` (módulos que enfileiram)

- **`avisos`/`aceite`/`recebimentos`/`acoes_devedor`:** padronizar o enfileiramento numa **função compartilhada de domínio dentro do módulo** (não importar entre módulos — lint barra; replicar via `shared/` do app api ou helper local por módulo). Cada ponto de evento (na mesma transação que muda o estado) chama o enfileirador com: `aviso_id`, `tipo`, alvo (resolve `cobrador_id` vs `telefone_cobrador`), `agendar_para`, `coalesce_key`, `dedupe_key`.
- **Roteamento de alvo (H10.1/H10.7):** ao enfileirar, resolver: se `cobrador_id` não-nulo → grava `cobrador_id`; senão grava `telefone_cobrador` (lido do aviso). Remover os 3 TODOs ("fallback por telefone_cobrador") em `recebimentos/service.ts`, `acoes_devedor/service.ts` e zap `webhook_whatsapp/repo.ts`.
- **Papel notificado (H10.3):** no invertido (`criador_papel='devedor'`) o alvo é o **devedor-criador** (`devedor_profile_id`), não o cobrador. O enfileirador deve resolver o "criador" pelo `criador_papel`, não assumir cobrador.
- **Opt-out (H10.5):** quando o devedor faz opt-out, enfileirar `tipo='optout'` com `agendar_para = now() + interval '1 minute'` e `coalesce_grupo` do par opt-out/reativação.
- **Reativação (H10.5/Épico 7):** quando o devedor reativa (`desregistrado→programado`), na mesma transação: (a) cancelar a linha `optout` ainda `agendado` do mesmo grupo (coalescing); (b) se já não houver `optout` pendente (já saiu), enfileirar `tipo='reativacao'`. Depende do Épico 7 entregar a transição de reativação.
- **Antiduplicação (H10.8):** preencher `dedupe_key` por evento/combinado/ocorrência; o `unique index` impede 2ª linha ativa.

### 3.3 Backend `zap` (drainer + fila de saída + webhook)

- **`notificar_cobrador` (generalizar):** hoje é hard-coded para `pagamento_informado` (1 chave). Refatorar para:
  - carregar a chave de template por `tipo` (`cobrador.<tipo>`); se o tipo for gated e sem template ativo, deixar `agendado` (comportamento atual).
  - carregar dados conforme o alvo: profile (com conta) ou telefone direto (sem conta).
  - reconferência de estado por tipo (já existe para `pagamento_informado`: descartar se não está mais em `informado_pago`; estender para os demais: ex. notificação de recusa descartada se o aviso não está mais `recusado`).
  - retry **20-60s aleatório** (substituir `BACKOFF_MIN=[5,15,45]`), alinhando a H6.8/`enviar_lembretes` (que também precisa do mesmo ajuste se hoje usa minutos — verificar/alinhar).
  - botões Confirmar / Ainda não recebi no `render` quando o tipo for `pagamento_informado` e houver template com botões (Épico 8 H8.5); fallback numerado como resiliência geral do canal.
  - CTA discreta de criar conta (H10.7) quando alvo é `telefone_cobrador` sem `cobrador_id` (append no template via variável/variante).
- **Fila de saída / espaçamento 10 min (H10.9) — CRÍTICO:** introduzir um **gate de espaçamento por destinatário no claim**, em banco (não no Pacer em-processo). Estratégia: na query de `reivindicar`, para cada destinatário (`cobrador_id` ou `telefone_cobrador`), só liberar uma linha se a **última enviada ao mesmo destinatário** foi há ≥ 10 min (subquery sobre `enviado_em`/`liberado_apos`). Ao enviar, gravar o timestamp que empurra o "liberado_apos" do destinatário. Mesma técnica do lado `envios` (destinatário = devedor/telefone). Manter `SKIP LOCKED`.
  - **Espaçamento ≠ Pacer:** o `Pacer` continua como anti-bloqueio do transporte; o gate de 10 min é regra de **produto** persistida no banco (sobrevive a restart, vale entre processos). Os dois coexistem.
- **Coalescing no drain (H10.9):** antes de enviar, reconferir o `coalesce_grupo`/estado: se há contra-evento que anula (par optout/reativação já resolvido pela api ao cancelar a linha), o item nem chega ao drain; o drain ainda faz a **reconferência conservadora** (estado terminal → cancela com auditoria). Registrar cada cancelamento (em `eventos_aviso` ou coluna de motivo).
- **`webhook_whatsapp`:** ao receber resposta do cobrador "Confirmar"/"Ainda não recebi" pelo botão (Épico 8 H8.5), processar e enfileirar nada novo aqui (efeito é do Épico 8); o que cabe a E10 é **gerar** essa notificação com botões. Os eventos de convite (aceite/recusa/telefone divergente/tentativas) que chegam pelo webhook devem enfileirar a notificação ao criador via o mesmo enfileirador (resolvendo papel).

### 3.4 Frontend

- Mínimo neste épico (as notificações são WhatsApp + outbox server-side). O **painel** ("precisa de você", "aguardando sua confirmação", status de envio, linha do tempo) é **Épico 9**. Aqui só:
  - garantir que a **linha do tempo de eventos** (`DetalheAviso.tsx`, já existe) exiba os novos eventos (recusa, optout, reativação, telefone divergente) quando E9 ligar — sem trabalho de UI exclusivo deste épico, só confirmar que os `tipo` novos têm rótulo no dicionário.
  - **dicionário de linguagem do front** (regra de ouro): se houver novos rótulos visíveis (ex. "recusado", "reativou"), adicionar neutros/sem proibidas no dicionário do front, espelhando os do backend.

### 3.5 Segurança

- **Nunca logar** telefone/Pix/token/valor sensível (H10.1/H10.2/H10.4): manter os logs por `notifId`/`tipo`/`codigo`; revisar o `render`/drainer novos.
- **RLS deny-all** mantida; grants: `whaviso_api` insert/select; `whaviso_zap` select/insert/update; **sem DELETE** (cancelamento é mudança de status, não delete — H13/regra de ouro). Coalescing usa `status='cancelado'`, não `delete`.
- **Notificações não revelam dado a quem não deve (H10.4):** o alvo é sempre o criador (cobrador ou devedor-criador); validar que o `telefone_cobrador`/profile resolvido pertence ao aviso.
- **Idempotência de webhook** (toque duplo do cobrador): garantir que processar a resposta 2x não duplique efeito (Épico 8) nem gere 2ª notificação.

### 3.6 Testes

- **Unit (api):** enfileirador resolve alvo certo (com conta → cobrador_id; sem conta → telefone_cobrador; invertido → devedor-criador); dedupe não cria 2ª linha ativa; opt-out agenda +1min com grupo de coalescing.
- **Unit (zap):** drainer escolhe template por tipo; retry 20-60s; reconferência de estado por tipo descarta obsoleto; render sem dado sensível; botões/fallback numerado.
- **Integração (banco real, `whaviso_dev`):**
  - H10.2 idempotência: "já paguei" 2x → 1 notificação.
  - H10.3/H10.4: cada evento de convite gera a notificação certa ao papel certo.
  - H10.6: rodar um ciclo de lembretes completo → 0 linhas em `notificacoes_cobrador`.
- **CORRIDA — ponto crítico (H10.9), testes dedicados:**
  - opt-out e reativação **quase simultâneos**: a linha optout `agendado` é cancelada na janela; cobrador não recebe nada; auditoria registra o coalescing.
  - opt-out enviado, **depois** reativa → 2ª notificação (reativação) chega.
  - múltiplos itens do mesmo destinatário: saem com ≥ 10 min entre si (medir `agendar_para`/`enviado_em`).
  - item obsoleto por estado terminal (aviso vira `pago`/`cancelado`) → cancelado, não enviado, em **ambas** as filas (`envios` e `notificacoes_cobrador`).
  - corrida do claim: 2 drainers (`SKIP LOCKED`) não enviam o mesmo item 2x; o gate de 10 min não libera 2 itens do mesmo destinatário na mesma janela.

---

## 4. Sequência de passos

> Cada passo: objetivo · arquivos prováveis · critério (HNN.x) · modelo + justificativa.

1. **Migration `0025_notificacoes_cobrador_v2`** (nullable cobrador_id, telefone_cobrador, agendar_para, coalesce_key/grupo, dedupe_key+unique, tipos, índices).
   Arquivos: `backend/supabase/migrations/0025_*.sql`. Depois: `bash scripts/validate_migrations.sh whaviso_dev`.
   Critério: H10.1 (roteamento), H10.5 (agendamento), H10.8 (dedupe).
   **Modelo: opus** — modela a coluna de coalescing/dedupe/espaçamento que sustenta a fila crítica; decisão errada de chave de coalescing gera perda/duplicação.

2. **Catálogo de templates (migration upsert) das chaves novas** + reescrita de `cobrador.pagamento_informado`.
   Arquivos: `backend/supabase/migrations/0027_templates_cobrador_eventos.sql`.
   Critério: H10.1 (conteúdo via templates), H10.3/H10.4/H10.5 (textos), H13 (neutro/sem proibidas/sem travessão).
   **Modelo: sonnet** — inserts de catálogo + copy; mecânico, validado por check de linguagem existente.

3. **Enfileirador compartilhado na `api`** (resolve alvo por papel/conta, agendar_para, dedupe_key) e troca dos `insert` diretos nos 4 pontos.
   Arquivos: `apps/api/src/modules/{recebimentos,acoes_devedor,aceite,avisos}/service.ts`, helper em `apps/api/src/shared/`.
   Critério: H10.1, H10.2 (qualquer cobrador), H10.3, H10.7 (sem conta), H10.8 (dedupe).
   **Modelo: opus** — roteamento por papel + invertido + dedupe sem corrida; fácil enfileirar para o alvo errado.

4. **Enfileirar opt-out com atraso de 1 min + grupo de coalescing; cancelar na reativação.**
   Arquivos: `apps/api/src/modules/acoes_devedor/service.ts`, `apps/api/src/modules/recebimentos/service.ts` (opt-out logado), e o ponto de reativação (Épico 7).
   Critério: H10.5 (atraso, cancelamento na janela, 2ª notificação).
   **Modelo: opus** — janela + cancelamento idempotente na transação; corrida opt-out/reativação.

5. **Enfileirar respostas ao convite (aceite, dado incorreto, recusa) e problemas (telefone divergente, tentativas esgotadas/cadastrado).**
   Arquivos: `apps/zap/src/modules/webhook_whatsapp/{repo,service}.ts`, módulos de aceite/convite da api (conforme Épico 5 entregar os eventos).
   Critério: H10.3, H10.4, H10.6 (só esses eventos notificam).
   **Modelo: opus** — depende dos estados de E5 (`recusado`), papel correto, e "não notificar quando telefone não cadastrado"; lógica condicional sutil.

6. **Generalizar o drainer `notificar_cobrador`** (template por tipo, alvo profile/telefone, reconferência por tipo, retry 20-60s, CTA sem-conta).
   Arquivos: `apps/zap/src/modules/notificar_cobrador/{index,repo,render}.ts`.
   Critério: H10.1 (canal/retry), H10.3/H10.4/H10.5 (entrega por tipo), H10.7 (sem conta + CTA).
   **Modelo: opus** — reconferência de estado por tipo + retry + roteamento; núcleo da entrega correta.

7. **Botões Confirmar / Ainda não recebi na notificação "já paguei" (com fallback numerado).**
   Arquivos: `apps/zap/src/modules/notificar_cobrador/render.ts`, template `cobrador.pagamento_informado`, processamento da resposta no `webhook_whatsapp` (efeito é Épico 8).
   Critério: H10.2 (botões), H10.7 (acionável sem conta), resiliência de canal.
   **Modelo: opus** (botões interativos oficiais da Meta, fallback e idempotência da resposta).

8. **Fila de saída: espaçamento 10 min por destinatário no claim, em banco — DUAS outboxes.**
   Arquivos: `apps/zap/src/modules/notificar_cobrador/repo.ts` (`reivindicar`), `apps/zap/src/modules/enviar_lembretes/repo.ts` (`reivindicar`), possivelmente migration `0026`.
   Critério: H10.9 (espaçamento 10 min, complementa H6.9), H10.6 (sem rajada).
   **Modelo: opus** — gate de 10 min por destinatário sem corrida, `SKIP LOCKED`, 2 filas; o ponto mais sensível do épico.

9. **Coalescing/cancelamento conservador auditável no drain (ambas as filas) + reconferência de estado terminal.**
   Arquivos: `notificar_cobrador/index.ts`, `enviar_lembretes/index.ts`, repos; auditoria em `eventos_aviso`.
   Critério: H10.9 (coalescing conservador, auditável), H10.6 (acúmulo), H10.8 (sem duplicar).
   **Modelo: opus** — só cancelar o comprovadamente obsoleto; risco de cancelar o que não devia.

10. **Suíte de testes de corrida dedicada (banco real).**
    Arquivos: `apps/zap/src/modules/notificar_cobrador/tests/*`, `apps/zap/src/modules/enviar_lembretes/tests/*`, `apps/api/src/modules/*/tests/*`.
    Critério: H10.9 (testes fortes), H10.2/H10.5 idempotência/coalescing, H10.6 silêncio.
    **Modelo: opus** — desenhar casos de corrida (evento/contra-evento simultâneos, 2 drainers, limites de 10 min) é o coração da garantia.

11. **Frontend: rótulos dos novos eventos no dicionário/linha do tempo (sem proibidas, neutros).**
    Arquivos: `frontend/src/modules/avisos/*` (linha do tempo), dicionário de linguagem do front.
    Critério: H10.3/H10.5 (identificar combinado, linguagem neutra), H13.
    **Modelo: sonnet** — rótulos/copy e mapeamento simples; sem lógica.

12. **Atualizar PROJETO.md/CLAUDE.md/MODULE.md** (outbox `notificacoes_cobrador` agora multi-tipo, roteamento por telefone, fila de espaçamento + coalescing nas duas filas) e rodar `graphify update .`.
    Arquivos: docs + `apps/zap/src/modules/notificar_cobrador/MODULE.md`.
    Critério: coerência com a arquitetura decidida.
    **Modelo: sonnet** — documentação; mecânico.

---

## 5. Dependências de outros épicos (precisam estar prontos antes)

- **E13 (linguagem):** `contracts/linguagem.ts` + dicionário front + lint — invariante de toda copy das notificações.
- **E12 (templates):** tabela `templates` por chave (já feito); as chaves `cobrador.*` deste épico entram nela.
- **E11 (planos):** H10.8 "respeitar limite de envios ao sair por WhatsApp, sem deixar de registrar o evento" depende da contabilização de plano do Épico 11.
- **Máquina de estados / E5:** estado terminal **`recusado`** (hoje recusa vira `cancelado`); a notificação de recusa precisa do estado próprio. Eventos de convite (aceite, dado incorreto, telefone divergente H5.8, tentativas esgotadas H5.9) são gerados pelo Épico 5.
- **E7:** estado **`desregistrado` reversível** e a transição de **reativação** — base do par opt-out/reativação da H10.5/H10.9. Hoje opt-out é `cancelado` terminal irreversível.
- **E8:** botões **Confirmar / Ainda não recebi** e o processamento da resposta por WhatsApp (H10.2/H10.7); este épico só **gera** a notificação acionável.
- **E6:** retry 3x/20-60s (H6.8) e distância de 10 min por devedor no agendamento (H6.9), que a fila de saída **complementa**.
- **E9:** visibilidade no painel ("precisa de você", status de envio, linha do tempo) — destino "com conta".

---

## 6. Riscos e pontos de teste dedicado

- **Coalescing cancela o que não devia / duplica / perde envio (H10.9):** maior risco. Mitigar com coalescing **conservador** (só par evento/contra-evento explícito ou estado terminal), auditoria de cada cancelamento, e testes de corrida (evento/contra-evento quase simultâneos).
- **Gate de 10 min por destinatário sem corrida:** 2 drainers podem liberar 2 itens do mesmo destinatário na mesma janela; o gate precisa ser atômico no claim (`SKIP LOCKED` + subquery de último envio). Teste com 2 drainers concorrentes.
- **Resiliência de canal:** além dos botões interativos oficiais da Meta, prever fallback numerado (resposta "1/2") como resiliência geral; testar o caminho de fallback.
- **Roteamento por papel no invertido:** notificar o cobrador em vez do devedor-criador (ou vazar dado a quem não deve, H10.4). Teste por papel.
- **Retry divergente (minutos vs 20-60s):** alinhar `notificar_cobrador` (e conferir `enviar_lembretes`) a H6.8; não confundir com o backoff de transporte do Pacer.
- **Dedupe sem corrida (H10.8):** `unique index where status<>'cancelado'` + tratar conflito como idempotente no enfileirador.

---

## 7. Decisões em aberto (confirmar com o humano)

O épico declara **"Nenhuma pendente neste épico"**. Mesmo assim, três pontos de implementação precisam de escolha (não inventar):

- **Onde gravar a auditoria do coalescing:** em `eventos_aviso` (append-only, auditoria forte, consistente com o resto) **ou** colunas `cancelado_motivo`/`cancelado_em` na própria outbox. Preferência do plano: `eventos_aviso`.
- **Espaçamento de 10 min: coluna persistida (`liberado_apos` por destinatário) vs cálculo em runtime no claim (subquery do último `enviado_em`).** Runtime é mais simples ("só banco"); coluna é mais barata em escala. Decidir ao implementar o passo 8.
- **Decisão herdada de E1 (login WhatsApp botão vs OTP)** e de E7 (forma exata da reativação/`desregistrado`): a H10.5 depende da transição de reativação que E7 definir; este épico assume que existe. Confirmar a interface antes do passo 4.
