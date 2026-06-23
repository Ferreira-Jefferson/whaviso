# Plano de desenvolvimento: Épico 08, Confirmação de pagamento (`informado_pago`)

> Fonte da verdade: `historias/08-confirmacao-pagamento.md`. Onde o código atual diverge da história, o trabalho é mudar o código/doc, não a história.
> Estado inspecionado no código real (api `recebimentos`/`avisos`/`painel`, zap `webhook_whatsapp`/`notificar_cobrador`/`enviar_lembretes`, migrations `0003`/`0004`/`0011`/`0014`/`0024`, frontend `modules/avisos`).

---

## 1. Resumo do épico e escopo

Fecha o ciclo do dinheiro: depois que o devedor toca "Já paguei" (E7, `informado_pago`), **só o cobrador** encerra confirmando, ou devolve ao ciclo rejeitando. O Whaviso nunca confirma sozinho.

**Transições deste épico:** `informado_pago → pago` (confirma), `informado_pago → programado` (rejeita, evento `rejeitado_cobrador`), `programado → pago` (marcar direto), `pago → programado` (reabrir, única saída de `pago`).

**MVP 🟢 (entra agora):**
- H8.1 confirmar (`informado_pago→pago`), H8.2 rejeitar, H8.4 marcar pago direto, H8.6 reabrir, H8.8 acompanhamento em `informado_pago`, H8.9 auditoria/segurança.
- H8.5 confirmar/rejeitar por botão no WhatsApp para **qualquer** cobrador (com ou sem conta).
- H8.3 reengajamento pós-ciclo (mensagem manual com os 3 botões, sem mudar de estado).
- **Janela de reversão de ~1 minuto** na confirmação (mensagem de encerramento atrasada).
- Refinamento do **horário reservado**: campo recuperável, liberar só no fim.

**Gated 🟡 (NÃO entra agora, só preparar o terreno):**
- H8.7 recorrência por ocorrência: depende do estudo de cadência configurável (E6 H6.10). A máquina de estados atual não modela ocorrências. **MVP trata combinado simples (1 ocorrência).** O plano isola a confirmação para que a recorrência seja acoplável depois (tabela de ocorrências/pagamentos a definir), mas não a implementa.

**Pré-requisito que o épico assume pronto (vem de outros épicos, mas é bloqueante aqui):**
- Rename `pendente → programado` (cross-épico; E6/E2/E3). O épico exige `informado_pago→programado` e `pago→programado`. Este plano **inclui a varredura** como passo 1 porque sem ela nenhuma transição do épico tem nome correto.
- `informado_pago` **para o ciclo** (só empurrãozinho de D+1): divergência compartilhada com E6 H6.5. Incluída aqui no que toca este épico (a reconferência no disparo).
- Horário reservado por segundo (E6 H6.9): este épico **adiciona** o campo recuperável; o mecanismo base é de E6.

---

## 2. Estado atual vs história (por critério, código real)

Legenda: `[x]` ok · `[~]` parcial · `[!]` diverge (refatorar) · `[+]` não existe.

### H8.1 Confirmar (`informado_pago → pago`) 🟢
- [~] Confirma de `informado_pago` **e** de `pendente` → `pago`: existe em `recebimentos/service.ts::confirmarRecebimento` (cobre H8.1 e H8.4 num só método; precisa separar/registrar ator).
- [+] Combinado simples vira `pago` terminal: ok hoje, mas o nome `pendente` precisa virar `programado`.
- [+] Recorrente fecha só a ocorrência: **não existe** (🟡 H8.7).
- [+] Liberação do horário reservado só no fim: **não existe** (não há campo de horário reservado).
- [~] Descarte de envios pendentes ao virar terminal: trigger `encerrar_envios_do_aviso` (0004) cancela na transição + reconferência no disparo em `enviar_lembretes/index.ts`. Ok, mas falta a janela de 1 min (abaixo).
- [+] **Mensagem ao devedor com atraso de ~1 min:** não existe; hoje o webhook só responde na janela 24h, sem mensagem de encerramento agendada e reversível.
- [+] Texto de encerramento neutro sem botões: template `encerramento.*` não existe.
- [~] Evento de auditoria com ator/quando: grava `confirmado_cobrador` ator `cobrador` (sem timestamp de quem confirmou além do `criado_em`; ok). Mas não distingue confirmar de marcar-direto.
- [x] Idempotência (já `pago` → no-op): presente.

### H8.2 Rejeitar (`informado_pago → programado`) 🟢
- [~] Rejeita `informado_pago → pendente`, evento `rejeitado_cobrador`, idempotente: existe em `rejeitarPagamento`. **Diverge no nome** (`pendente`, deve ser `programado`).
- [~] Retoma por catch-up: depende de E6 (catch-up não implementado aqui); o estado volta certo.
- [x] Horário não muda na rejeição (nunca foi liberado): trivial, pois não há liberação ainda.
- [x] Evento `ja_paguei_devedor` permanece (append-only): garantido por `eventos_aviso`.
- [+] Devedor notificado da rejeição: **não existe** notificação ao devedor na rejeição (texto/canal é E10, mas o **enfileiramento** é deste épico).

### H8.3 Reengajar pós-ciclo 🟢
- [+] Endpoint de reengajamento manual: **não existe**.
- [+] Mensagem com os 3 botões virando o "último aviso": não existe.
- [+] Não muda de estado, registra evento: não existe.

### H8.4 Marcar pago direto 🟢
- [~] `pendente → pago` direto: `confirmarRecebimento` já aceita `pendente`. Funciona, mas **não distingue ator** (mesmo evento `confirmado_cobrador` da H8.1); o épico/E9 exige diferenciar "informado pelo devedor" de "marcado pelo cobrador".
- [+] Mesmo efeito da H8.1 (janela 1 min, horário só no fim): herda as lacunas da H8.1.

### H8.5 Confirmar/rejeitar por botão no WhatsApp 🟢
- [!] **Diverge:** hoje só o **devedor** age por botão (`webhook_whatsapp/repo.ts::aplicarAcaoBotao` trata `ja_paguei/optout/ver_pix/aceite/recusa`). **Não há** ação de cobrador (`confirmar`/`rejeitar`) por botão.
- [+] Notificação ao cobrador com botões Confirmar / Ainda não recebi: a outbox `notificacoes_cobrador` existe e é drenada, mas o template `cobrador.pagamento_informado` é só texto, **sem botões** (0023); o render (`notificar_cobrador/render.ts`) não passa botões.
- [+] Roteamento por telefone (profile ou `telefone_cobrador`) + verificação de telefone do remetente: não existe; `notificacoes_cobrador` exige `cobrador_id not null`, sem fallback por `telefone_cobrador`.
- [+] HMAC + `aviso_id` no payload: o payload de botão já é `acao:avisoId` (sem token), mas falta as ações de cobrador.
- [+] CTA discreta de criar conta para cobrador sem conta: não existe.

### H8.6 Reabrir (`pago → programado`) 🟢
- [~] `pago → pendente` existe: `desmarcarRecebimento`, evento `desmarcado_cobrador`. **Diverge no nome** (`pendente`→`programado`) e no evento (épico chama de "reabertura"; manter `desmarcado_cobrador` ou criar `reaberto_cobrador` é decisão).
- [+] Reuso do **mesmo horário** (campo recuperável, fora da regra de timestamp, aceitando colisão): não existe.
- [+] Catch-up sem reenviar lote: depende de E6.
- [+] Janela de 1 min: reabrir antes cancela a mensagem; depois manda 2ª mensagem de "status alterado": **não existe**.
- [x] Auditoria não apaga o `pago` anterior: garantido (append-only).
- [+] Reabertura **só** pelo cobrador, painel **ou WhatsApp**: painel ok via `desmarcar`; WhatsApp não existe.

### H8.7 Recorrência por ocorrência 🟡
- [+] Tudo: a máquina de estados não modela ocorrências múltiplas. **Fora do MVP.**

### H8.8 Acompanhamento em `informado_pago` 🟢
- [!] **Diverge:** `informado_pago` **continua disparando o ciclo** hoje (`enviar_lembretes/index.ts` aceita `informado_pago` e usa a variante `revisao`). História: ciclo **para**, só o empurrãozinho de D+1. (Mesma divergência E6 H6.5.)
- [x] `informado_pago` é não-terminal sem prazo automático: nenhum job o move por tempo (correto).
- [~] Aparece destacado no painel "aguardando sua confirmação" com Confirmar/Rejeitar e quando informou: front tem os botões (`avisos/api.ts`), o destaque/"quando informou" é E9.

### H8.9 Auditoria e segurança 🟢
- [~] Só transições válidas, trigger + api: trigger em `0011` valida; api valida. **Falta** acrescentar `pago→programado` já existe; falta renomear e cobrir as novas (reabertura como `pago→programado` já está).
- [x] Defesa em profundidade (front só solicita): arquitetura atual respeita.
- [x] Evento append-only com ator: ok.
- [~] Só o cobrador age; devedor não confirma o próprio: `exigirPapel(...'cobrador')` garante para quem tem conta. **Falta** o caminho sem conta (por `telefone_cobrador`) com verificação de telefone do remetente.
- [x] Idempotência: presente nos métodos atuais.
- [x] Nunca logar telefone/Pix/token; valor em centavos: respeitado no código atual.

---

## 3. Trabalho por camada

### 3.1 Arquitetura / Dados (migrations)

Nova migration **`0025_pendente_para_programado.sql`** (varredura cross-épico, mas bloqueante aqui):
- Adicionar valor de enum `programado` a `status_aviso` (Postgres não renomeia valor de enum com dados; usar `ALTER TYPE ... ADD VALUE` + `UPDATE` das linhas + recriar a função de transição com o novo nome). Como `pendente` é usado em todo lugar, a abordagem segura: `ALTER TYPE status_aviso ADD VALUE IF NOT EXISTS 'programado'`; migrar dados `UPDATE avisos SET status='programado' WHERE status='pendente'`; recriar `validar_transicao_aviso` e `encerrar_envios_do_aviso` usando `programado`. (Não dá para dropar `pendente` do enum sem recriar o tipo; decidir manter o valor órfão ou recriar o tipo — ver Decisões em aberto.)

Nova migration **`0026_avisos_horario_reservado.sql`** (campo recuperável, refinamento E6 H6.9):
- `alter table avisos add column horario_reservado timestamptz` (ou `time`/segundo do dia, conforme E6 decidir) e `horario_reservado_original timestamptz` (campo recuperável para a reabertura).
- Atualizar `validar_transicao_aviso` para as transições do épico (já com `programado`): `informado_pago→{pago,programado,cancelado,expirado}`, `programado→{pago,informado_pago,cancelado,expirado}`, `pago→programado`. Aceitar `aguardando_aceite→programado`.
- Atualizar `encerrar_envios_do_aviso` para considerar terminal só quando não há ocorrência futura (no MVP simples, `pago` é sempre terminal).

Nova migration **`0027_eventos_pagamento.sql`** (ator/distinção e novos eventos):
- `alter type tipo_evento add value if not exists 'marcado_pago_cobrador'` (H8.4, distinguir de `confirmado_cobrador` da H8.1, para o painel E9).
- `alter type tipo_evento add value if not exists 'reaberto_cobrador'` (H8.6, distinguir de `desmarcado_cobrador`).
- `alter type tipo_evento add value if not exists 'reengajamento_cobrador'` (H8.3).
- Manter `rejeitado_cobrador` (já existe). Espelhar tudo no `enums.ts` do shared e do front.

Nova migration **`0028_mensagem_devedor_agendada.sql`** (janela de 1 min + notificação de rejeição/status alterado):
- Reusar a outbox `envios`? **Não**: `envios` é por etapa do ciclo (unique por etapa). Criar tabela **`mensagens_avulsas`** (ou estender semântica): outbox de mensagens ao devedor que não são etapa de ciclo: encerramento (atrasada ~1 min, cancelável), rejeição (E10 trata texto), status-alterado (reabertura tardia), reengajamento (H8.3). Campos: `id, aviso_id, chave_template, agendado_para, status (agendado/processando/enviado/cancelado/falhou), tentativas, proxima_tentativa_em, wamid, erro, criado_em`, índice de claim por `agendado_para where status in ('agendado','processando')`. Grants: api insere/cancela, zap drena/atualiza. RLS deny-all + policies de serviço (padrão 0014/0008).
  - A janela de 1 min = `agendado_para = now() + interval '1 minute'`. A reabertura dentro do minuto faz `update ... set status='cancelado' where aviso_id=$1 and chave_template='encerramento' and status='agendado'` (coalescing por estado, padrão E7/E10).

Catálogo de templates (migration de dados, upsert; **não** vai no seed pois não roda no cloud) **`0029_templates_pagamento.sql`**:
- `encerramento.padrao` (mensagem de confirmação, neutra, sem botões).
- `encerramento.recorrente` (🟡, criar inativo/pendente para a recorrência futura).
- `status_alterado.padrao` (reabertura tardia, sem botões).
- `cobrador.pagamento_informado`: **acrescentar `conteudo.botoes`** com ações `confirmar` e `rejeitar` (espelhando o padrão do ciclo em 0024). Render do `notificar_cobrador` passa a emitir os botões.
- Rejeição ao devedor: texto vem do E10; aqui só a chave `rejeicao.padrao` (criar a chave; texto final é E10).
- H8.3 reengajamento: reusar os 3 botões do ciclo (`ja_paguei/ver_pix/optout`) num template `reengajamento.padrao`.
- Validar linguagem limpa (constraint já existe na tabela `templates`; E13).

### 3.2 Backend api (`recebimentos` + `avisos` + `painel`)

- **Refatorar `recebimentos/service.ts`:**
  - Separar `confirmarRecebimento` (apenas `informado_pago→pago`, evento `confirmado_cobrador`) de `marcarPagoDireto` (`programado→pago`, evento `marcado_pago_cobrador`), ou manter um método aceitando ambos os estados de origem mas gravando o evento conforme a origem (H8.1 vs H8.4 distinção de ator/origem para E9).
  - Ao virar `pago` (simples): gravar `horario_reservado_original = horario_reservado`, setar `horario_reservado = null`; enfileirar mensagem de **encerramento** em `mensagens_avulsas` com `agendado_para = now()+1min` (janela de reversão). NÃO cancelar envios imediatamente fora da janela? Decisão: o trigger já cancela envios ao virar terminal; isso é correto (não vamos reenviar). A janela de 1 min é só da **mensagem ao devedor**, não dos envios de ciclo (que já param). Documentar isso claramente.
  - `rejeitarPagamento`: `informado_pago→programado` (renomeado), evento `rejeitado_cobrador`, **enfileirar** mensagem de rejeição ao devedor (`mensagens_avulsas` chave `rejeicao.padrao`, sem atraso especial). Horário não muda.
  - `reabrir` (renomear `desmarcarRecebimento`): `pago→programado`, evento `reaberto_cobrador`. Restaurar `horario_reservado = horario_reservado_original` **sem** passar pela regra de escolha (aceita colisão). Janela de 1 min: se a mensagem de encerramento ainda está `agendado` em `mensagens_avulsas`, cancelar (confirmação+reabertura se anulam); se já foi enviada, enfileirar `status_alterado.padrao`.
  - `marcarPagoDireto` novo endpoint (ou reuso) e novo endpoint `reabrir`.
  - **H8.3 reengajamento:** novo método/endpoint `POST /avisos/:id/reengajar` (só cobrador, só quando `programado` e ciclo terminou, isto é, hoje > D+1). Enfileira `mensagens_avulsas` chave `reengajamento.padrao` no **horário reservado** dentro de 8h-18h (não imediato), com os 3 botões; marca essa mensagem como o "último aviso" (ver E7 H7.7 sobre qual aviso age). Evento `reengajamento_cobrador`. Não muda estado. Respeita limite do plano (E11, stub no MVP). 
- **`avisos`/`painel`:** expor o ator do último evento e o estado para o painel distinguir "informado pelo devedor" x "marcado pelo cobrador" (consumo final em E9; aqui garantir o dado gravado).
- Envelope de erro `{ error: { code, message } }` em toda transição inválida (já é o padrão via `http_errors`).

### 3.3 Backend zap (`webhook_whatsapp` + `notificar_cobrador` + novo drainer)

- **`webhook_whatsapp/repo.ts::aplicarAcaoBotao`:** adicionar ações de cobrador `confirmar` e `rejeitar`:
  - Validar que o **telefone do remetente** corresponde ao alvo da notificação daquele aviso: cobrador com conta → telefone do `profile`; sem conta → `telefone_cobrador`. Se não corresponder, **ignorar sem vazar** se o aviso existe (retorno `null`/`aplicado:false` sem distinção).
  - `confirmar`: aplica efeito da H8.1 (`informado_pago→pago`, janela 1 min, enfileira encerramento). `rejeitar`: H8.2 (`informado_pago→programado`, evento `rejeitado_cobrador`, enfileira rejeição). Idempotente; só o último aviso age (E7 H7.7).
  - Acrescentar `confirmar`/`rejeitar` ao `ACOES_BOTAO` e ao `parsearPayloadBotao` em `service.ts`; mapear chave de resposta na janela 24h.
- **`notificar_cobrador/render.ts` + repo:** passar `conteudo.botoes` (Confirmar / Ainda não recebi) ao montar a mensagem; roteamento por telefone: hoje `notificacoes_cobrador.cobrador_id not null`. Para cobrador sem conta (invertido), precisa de fallback por `telefone_cobrador` (alterar a outbox para aceitar `cobrador_id null` + carregar telefone de `avisos.telefone_cobrador`; ver Decisões/segurança). Incluir CTA discreta de criar conta no texto/template para sem-conta.
- **Novo módulo zap `enviar_mensagens_avulsas`** (drena `mensagens_avulsas`): claim `FOR UPDATE SKIP LOCKED`, respeita `agendado_para`, **reconfere o estado do aviso no disparo** (se reaberto/cancelado dentro do minuto, descarta), retry 3x com backoff (padrão `enviar_lembretes`). Espaçamento 10min/destinatário + coalescing é da fila de saída (E10/E6 H6.9); aqui pelo menos não duplicar e cancelar obsoletos por estado.
- **`enviar_lembretes`:** **parar o ciclo em `informado_pago`** (divergência H8.8/H6.5): a carga em `repo.ts` e o guard em `index.ts` devem tratar `informado_pago` como **não enviável** pelo ciclo normal (só o empurrãozinho de D+1, que é E6). Trocar o guard `status !== 'pendente' && status !== 'informado_pago'` por só `programado` (+ a lógica de D+1 que E6 detalha). Coordenar com o dono de E6.

### 3.4 Frontend (`modules/avisos`)

- Renomear `pendente`→`programado` no `enums.ts` (espelho), `StatusBadge`, `ROTULO_STATUS_AVISO` e dicionário de linguagem (E13). Atualizar todos os usos.
- `avisos/api.ts`: renomear hooks de recebimento conforme os novos endpoints; adicionar `useMarcarPagoDireto`, `useReabrir` (substitui `useDesmarcarRecebimento`), `useReengajar`. Otimismo só onde a reversão é trivial; reler do servidor depois (defesa em profundidade, H8.9).
- `DetalheAviso.tsx`: botões Confirmar / Rejeitar quando `informado_pago`; Marcar como pago quando `programado`; Reabrir quando `pago`; Reengajar quando `programado` e ciclo terminou. Front **só solicita**, não decide transição (H8.9). O destaque "aguardando sua confirmação" e "quando informou" é E9 (mostrar o que o backend já retorna).
- Novo aviso visual da janela de 1 min ("você pode reabrir no próximo minuto").

### 3.5 Segurança

- HMAC do webhook já cobre o canal; payload leva `aviso_id`, nunca token (já é assim).
- **Verificação de telefone do remetente** na ação de cobrador por WhatsApp (não vazar existência do aviso a número errado): teste dedicado.
- Sem conta → ação por `telefone_cobrador`: garantir que o devedor (telefone_devedor) **não** pode confirmar o próprio pagamento mesmo que mande `confirmar:avisoId` (H8.9: devedor não confirma).
- Nunca logar telefone/Pix/token; valor em centavos.

### 3.6 Testes

- **api `recebimentos`:** confirmar (`informado_pago→pago`); marcar direto (`programado→pago`) com evento `marcado_pago_cobrador`; rejeitar (`informado_pago→programado`, evento `rejeitado_cobrador`, enfileira rejeição); reabrir (`pago→programado`, evento `reaberto_cobrador`, restaura `horario_reservado_original`); idempotência de cada um; transições inválidas → envelope de erro; devedor não confirma (403); reengajamento só após D+1 e só `programado`.
- **Janela de 1 min (crítico):** confirmar enfileira encerramento `agendado_para=+1min`; reabrir dentro do minuto cancela a mensagem (nada sai); reabrir depois enfileira `status_alterado`. Teste de corrida do drainer reconferindo estado no disparo.
- **zap webhook (crítico):** `confirmar`/`rejeitar` por botão; telefone do remetente diverge → ignora sem vazar; idempotência (toque duplo); só o último aviso age.
- **zap `enviar_mensagens_avulsas`:** claim SKIP LOCKED, reconferência de estado, retry/backoff.
- **`enviar_lembretes`:** confirma que `informado_pago` **não** dispara o ciclo (regressão da divergência H8.8/H6.5).
- **Migrations:** `bash scripts/validate_migrations.sh whaviso_dev` após cada mudança de schema.

---

## 4. Sequência de passos

> Cada passo aterra num critério H8.x. Modelo: **opus** para máquina de estados, agendamento/coalescing, webhook idempotente, roteamento por telefone, segurança; **sonnet** para CRUD/rótulos/telas/config.

1. **Varredura `pendente → programado`** (migration `0025` + trigger + função de envios + PROJETO.md/CLAUDE.md/README + enums shared/front). Critério: pré-requisito de H8.1/H8.2/H8.6/H8.9. **opus** — toca a máquina de estados no banco e a app, com risco de corromper transições/dados se feito errado.

2. **Migration `0026` horário reservado + campo recuperável** e atualização do trigger de transição para todas as transições do épico. Critério: H8.1 (liberar só no fim), H8.6 (reuso do mesmo horário), H8.9 (transições válidas). **opus** — modela o horário recuperável e a máquina de estados; base da reabertura sem corrida.

3. **Migration `0027` novos eventos** (`marcado_pago_cobrador`, `reaberto_cobrador`, `reengajamento_cobrador`) + espelho em `enums.ts` shared/front. Critério: H8.4 (distinguir ator), H8.6, H8.3, H8.9 (auditoria). **sonnet** — acréscimo de valores de enum, mecânico.

4. **Migration `0028` outbox `mensagens_avulsas`** (encerramento/rejeição/status-alterado/reengajamento), grants/RLS, índice de claim. Critério: H8.1 (mensagem atrasada), H8.2, H8.6. **opus** — outbox nova com semântica de janela de reversão e coalescing por estado.

5. **Migration `0029` catálogo de templates de pagamento** (`encerramento.*`, `status_alterado.padrao`, `rejeicao.padrao`, `reengajamento.padrao`) + botões `confirmar`/`rejeitar` em `cobrador.pagamento_informado`. Linguagem limpa (E13). Critério: H8.1/H8.5/H8.3. **sonnet** — dados de catálogo/copy (upsert idempotente).

6. **Refatorar api `recebimentos/service.ts`:** separar confirmar (H8.1) / marcar direto (H8.4) com eventos distintos; rejeitar→`programado` + enfileirar rejeição (H8.2); reabrir com restauração de horário + janela de 1 min (H8.6). Critério: H8.1/H8.2/H8.4/H8.6/H8.9. **opus** — coração da máquina de estados, idempotência, janela de reversão e segurança de papel.

7. **api: endpoint de reengajamento** `POST /avisos/:id/reengajar` (só `programado` pós-D+1, enfileira no horário reservado com 3 botões, evento, não muda estado, stub de limite de plano). Critério: H8.3. **opus** — depende do "último aviso age" (E7 H7.7) e do agendamento no horário reservado, não é CRUD trivial.

8. **zap webhook: ações de cobrador `confirmar`/`rejeitar`** em `aplicarAcaoBotao` + `parsearPayloadBotao`, com verificação de telefone do remetente e roteamento profile/`telefone_cobrador`, idempotência, só o último aviso age. Critério: H8.5, H8.9. **opus** — idempotência de webhook, anti-vazamento por telefone, segurança.

9. **zap `notificar_cobrador`: botões + roteamento sem conta + CTA.** Outbox aceitar `cobrador_id null` carregando `telefone_cobrador`; render emite botões Confirmar/Ainda não recebi; CTA discreta de criar conta. Critério: H8.5. **opus** — roteamento por telefone e fallback sem conta tem implicação de segurança/vazamento.

10. **zap novo módulo `enviar_mensagens_avulsas`** (drainer da outbox `mensagens_avulsas`): claim SKIP LOCKED, respeita `agendado_para`, reconfere estado no disparo, retry/backoff. Critério: H8.1 (mensagem ~1min, descartar se reaberto), H8.2, H8.6. **opus** — fila com claim, reconferência de estado e janela de reversão; corrida.

11. **zap `enviar_lembretes`: parar ciclo em `informado_pago`** (divergência H8.8/H6.5), coordenado com E6 (empurrãozinho D+1). Critério: H8.8. **opus** — toca o scheduler e a semântica de quando enviar; regressão sensível.

12. **Frontend: rename `programado`, novos hooks e botões** (Confirmar/Rejeitar/Marcar pago/Reabrir/Reengajar) + aviso da janela de 1 min; front só solicita. Critério: H8.1/H8.2/H8.4/H8.6/H8.3/H8.8/H8.9. **sonnet** — telas e rótulos; sem regra de negócio no front.

13. **Testes** (api recebimentos, janela 1 min, webhook cobrador, drainer avulsas, regressão `informado_pago` sem ciclo, migrations). Critério: H8.9 e pontos críticos. **opus** — os testes de corrida/idempotência/janela são a parte difícil; os de CRUD podem ser sonnet, mas o conjunto pede opus.

14. **🟡 Preparar (NÃO implementar) recorrência H8.7:** deixar `confirmar`/`marcar`/`reabrir` com um ponto de extensão "por ocorrência" e documentar a tabela de ocorrências/pagamentos a definir junto de E6 H6.10. Critério: H8.7 (só o terreno). **sonnet** — só documentação/comentários de extensão, sem lógica nova.

---

## 5. Dependências de outros épicos

- **E6 (ciclo/scheduler):** horário reservado por segundo (H6.9, este épico adiciona o campo recuperável), catch-up (H6.7) para rejeição/reabertura, empurrãozinho D+1 e parada do ciclo em `informado_pago` (H6.5). O passo 11 deve ser coordenado com o dono de E6.
- **E7 (interação do devedor):** "Já paguei" origina `informado_pago`; "só o último aviso age" (H7.7) vale no reengajamento e nos botões de cobrador; janela de 1 min espelha o opt-out (H7.4).
- **E10 (notificações ao cobrador):** **texto/canal/janela** da notificação ao cobrador e da rejeição ao devedor; fila de saída com espaçamento 10min + coalescing (H10.9). Este épico enfileira; E10 define a entrega.
- **E9 (painel):** exibe `informado_pago`/`pago`, "aguardando sua confirmação", "quem informou x quem marcou", progresso do recorrente. Este épico grava o dado (ator/eventos); E9 mostra.
- **E11 (planos):** limite de reengajamentos manuais (H8.3) e limite de envios; stub no MVP.
- **E12 (templates):** tabela `templates` por chave (já feito); novos templates entram por migration de dados.
- **E13 (linguagem):** sem travessão, sem palavras proibidas, neutro de gênero em toda a copy nova.

---

## 6. Riscos e pontos de teste dedicado

- **Janela de reversão de 1 min (novo):** confirmar agenda +1min; reabrir antes cancela (nada sai); reabrir depois manda "status alterado". Corrida entre o drainer e a reabertura → teste com reconferência de estado no disparo. **Crítico.**
- **Webhook idempotente + anti-vazamento por telefone:** toque duplo não duplica; telefone errado não confirma e não revela se o aviso existe; devedor não confirma o próprio pagamento. **Crítico.**
- **Rename `pendente→programado`:** migração de dados + trigger + app + docs + enums em 3 lugares (shared, front, banco); risco de transição quebrar se um lado ficar para trás. **Crítico.**
- **Reuso do horário na reabertura aceitando colisão:** garantir que NÃO passa pela regra de escolha de timestamp e que `horario_reservado_original` é restaurado igual.
- **Parar ciclo em `informado_pago`:** regressão; teste explícito de que o ciclo normal não dispara nesse estado.
- **Drainer da outbox `mensagens_avulsas`:** claim SKIP LOCKED, reconferência de estado, retry/backoff.

---

## 7. Decisões em aberto (confirmar com humano, não inventar)

1. **Rename `pendente→programado`:** manter o valor de enum `pendente` órfão (mais simples, `ADD VALUE`+`UPDATE`) ou recriar o tipo `status_aviso` para remover `pendente` de vez (mais limpo, mais arriscado/custoso, segue o padrão de `0015`)? Recomendo manter órfão no MVP e limpar depois.
2. **Evento da reabertura:** criar `reaberto_cobrador` (proposto) ou reusar `desmarcado_cobrador` existente? O épico fala em "reabrir"; E9 quer distinguir. Recomendo novo evento.
3. **Outbox da mensagem ao devedor:** nova tabela `mensagens_avulsas` (proposto) vs estender `envios`. `envios` tem unique por etapa e semântica de ciclo; recomendo tabela nova. Confirmar nome/escopo com E10 (que pode querer unificar a fila de saída).
4. **Roteamento ao cobrador sem conta (H8.5):** alterar `notificacoes_cobrador` para aceitar `cobrador_id null` + `telefone_cobrador`, ou criar coluna/fluxo separado? Tem implicação de segurança (verificação de telefone). Confirmar com E10.
5. **Limite de reengajamentos manuais (H8.3):** valor por plano — **decisão do E11** (o épico remete). MVP: sem limite ou limite alto, com TODO.
6. **🟡 Modelagem da recorrência (H8.7):** tabela de ocorrências/pagamentos e como ancorar mini-ciclos — depende do estudo de cadência configurável (E6 H6.10). **Fora do MVP**; só preparar o ponto de extensão.
7. **Login WhatsApp botão vs OTP (E1):** não bloqueia este épico, mas a CTA "criar conta" para cobrador sem conta (H8.5) deve seguir o fluxo de auth decidido em E1.
