# Relatório de validação: Épico 10 — Notificações ao cobrador

> Revisão adversarial do plano `historias/planos/10-notificacoes-cobrador.plano.md` contra a fonte da verdade `historias/10-notificacoes-cobrador.md`, com checagem do código real (graph + leitura).

## 1. Veredito

**Aprovado com ressalvas.**

O plano é forte: cobre todos os 9 critérios-mãe (H10.1 a H10.9), acerta o estado atual do código nas afirmações verificáveis (outbox `cobrador_id` NOT NULL, retry em minutos `[5,15,45]`, opt-out terminal `cancelado` sem notificação, Pacer != espaçamento de produto, só `pagamento_informado` no drainer, dedupe inexistente), trata as dependências cross-épico com honestidade e marca o ponto crítico (H10.9) com testes dedicados. As ressalvas são lacunas pontuais de cobertura e de modelagem, não erros de direção.

## 2. Verificação das afirmações do plano contra o código (todas conferidas, nenhuma falsa)

- `notificacoes_cobrador.cobrador_id` é **NOT NULL** (0014 L29): confere. Plano propõe nullable na 0025.
- Retry em **minutos** `BACKOFF_MIN=[5,15,45]` tanto em `notificar_cobrador/repo.ts` L23 quanto em `enviar_lembretes/repo.ts` L31: confere. H6.8 exige **20-60s aleatório**. O plano acerta ao mandar alinhar AMBOS.
- Opt-out → `status='cancelado'` terminal, **sem** insert em `notificacoes_cobrador` (`acoes_devedor/service.ts` L50): confere.
- "Já paguei" guardado por `status==='pendente'` → idempotente (`acoes_devedor/service.ts` L30): confere.
- Insert direto `(aviso_id, cobrador_id)` sem dedupe/unique (L43): confere.
- Drainer hard-coded em `cobrador.pagamento_informado` (`notificar_cobrador/index.ts` L12): confere.
- Pacer é GAP anti-bloqueio em processo, não espaçamento por destinatário persistido (`ritmo.ts`): confere.
- `marcarCancelado` grava só `erro`, sem auditoria append-only do coalescing: confere.

## 3. Gaps por severidade

### CRÍTICOS

- **C1 — Liberação/realocação do "horário reservado" na reativação (H10.5 + H6.9) não é mencionada.** Hoje opt-out é `cancelado` terminal e, por H6.9, o horário reservado é liberado (`null`) ao sair. Quando a H10.5 reintroduz reativação (`desregistrado→programado`), o aviso volta ao ciclo e **precisa re-alocar um segundo reservado** e re-popular a outbox `envios`. O plano fala do par optout/reativação só no nível da notificação ao cobrador, mas **não sinaliza** que a reativação tem de re-acionar o agendamento do Épico 6. Sem isso, o cobrador é notificado de "voltou", mas nenhum lembrete volta a sair. Correção: adicionar dependência explícita "E6/E7: reativação re-aloca horário reservado e re-enfileira `envios`" e um teste de integração de que, pós-reativação fora da janela de 1 min, o ciclo de lembretes volta a produzir linhas em `envios`.

- **C2 — Coalescing do par opt-out/reativação está dividido entre api (cancela a linha) e drain, mas a janela de corrida real não é a de 1 min.** A H10.9 generaliza: o cancelamento vale enquanto o item está **não enviado na fila**, que com o gate de 10 min de H10.9 pode ser **muito maior** que 1 min. O plano modela `agendar_para = now()+1min` (H10.5) mas o item pode ficar represado pelo espaçamento de 10 min por destinatário (H10.9) e ainda assim ter de ser cancelável pela reativação. O passo 4 (cancelar na reativação) só cancela linha `agendado`; precisa cancelar também a que já está `agendado` mas atrasada pelo gate, e definir o que acontece se a linha já foi **reivindicada** (`processando`) pelo drainer no instante da reativação. Correção: especificar o cancelamento como "anula qualquer linha do grupo ainda **não enviada** (`agendado` OU `processando` ainda não confirmada)", com reconferência no drain logo antes de `enviarMensagem` (recheck do `coalesce_grupo`/estado dentro do claim), e teste de corrida "reativa enquanto o drainer já reivindicou a linha de optout".

### MÉDIOS

- **M1 — H10.8 limite de envios por plano: o plano declara dependência de E11 mas não prevê o caminho "registra o evento mas não envia por WhatsApp".** O critério H10.8 exige que, ao estourar o limite do plano, o evento **continue registrado/visível** mesmo sem sair por WhatsApp. O plano lista isso como "não existe (Épico 11)" e para aí. Como a notificação ao cobrador pode bater no limite, o plano deveria definir o estado terminal da linha nesse caso (ex.: status próprio `bloqueado_plano` ou `cancelado` com motivo auditável + visibilidade no painel), para não cair silenciosamente no retry. Correção: adicionar passo/critério "ao exceder o limite do plano (E11), marca a notificação com motivo auditável e mantém o registro visível; não conta como falha de entrega nem entra em retry".

- **M2 — Idempotência pós-rejeição do "já paguei" (H10.2 vs máquina de estados) não é discutida.** A guarda atual é `status!=='pendente'`. Após o cobrador rejeitar (`informado_pago→pendente/programado`, E8), o devedor pode tocar "já paguei" de novo: é uma notificação **legítima nova**, mas a `dedupe_key` proposta (`aviso_id:tipo:ocorrencia`) precisa incluir uma **ocorrência/ciclo** que mude na rejeição, senão o `unique index` suprime a 2ª notificação válida. O plano cita "ocorrencia" na chave mas não amarra como ela incrementa. Correção: definir que a `dedupe_key` de `pagamento_informado` incorpora um contador de ocorrência que avança a cada `informado_pago` novo (não a cada toque duplo), com teste: toque duplo = 1 notificação; pagou→rejeitou→pagou = 2 notificações.

- **M3 — H10.3 "aceite no invertido inclui que a chave Pix foi confirmada" não tem template/variável dedicada.** O passo 2 cria `cobrador.convite_aceito` genérico. A história distingue: no invertido, a notificação ao devedor-criador deve dizer que **a chave Pix foi confirmada** pelo cobrador. Correção: prever variante/variável de template para o caso invertido (ou chave separada `cobrador.convite_aceito_pix`) e cobrir no teste de papel.

- **M4 — H10.4 "telefone divergente NÃO revela dados do combinado a quem não deve" carece de passo de segurança explícito.** O plano menciona "validar que o alvo pertence ao aviso" em §3.5, mas o cenário H5.8 (quem respondeu não bate) é justamente onde há risco de vazar para o número errado. O critério é "a notificação vai ao **criador**, e nada do combinado vaza para o respondente divergente". Correção: passo de teste dedicado de que a notificação de divergência vai SÓ ao criador (cobrador/devedor-criador), nunca ao número que tentou abrir.

- **M5 — H10.9 "cada cancelamento é registrado/auditável" deixado como decisão em aberto, mas o critério é obrigatório.** O plano trata "onde gravar a auditoria" como decisão a confirmar com o humano. A obrigatoriedade da auditoria não é opcional (é critério de aceite); só o **local** é discutível. Correção: marcar a auditoria como entregável obrigatório do passo 9 (preferência `eventos_aviso` append-only, coerente com "sem DELETE de negócio"), deixando em aberto apenas a forma, não o "se".

### BAIXOS

- **B1 — H10.5 "identifica o combinado por xxx-xxx" e H10.3 "aponta qual combinado": o plano confia no template mas não garante a variável.** Garantir que todas as chaves novas tenham a variável do identificador do combinado e que o `render` a popule; sem expor token/telefone em log.
- **B2 — H10.7 CTA de criar conta: o plano resolve por "append no template/variante", mas não diz como a CTA evita virar palavra proibida nem como é neutra de gênero.** Trivial, mas incluir no check de linguagem do passo 2.
- **B3 — Numeração de migrations: o plano usa 0025 (notif v2), 0026 (envios coalescing) e cita 0027 (templates) fora de ordem no passo 2.** A última migration é 0024; o passo 2 referencia `0027_templates_cobrador_eventos.sql` enquanto o passo 1 é 0025 e o §3.1 fala de 0026 para envios. Renumerar em sequência (0025/0026/0027) e alinhar a referência do passo 2.

## 4. Cobertura dos critérios de aceite (HNN.x)

Todos os critérios têm passo correspondente, com as ressalvas acima. Os parcialmente cobertos (passo existe mas incompleto): H10.5 reativação→re-agendamento (C1), H10.8 limite de plano (M1), H10.2 ocorrência na dedupe (M2), H10.3 Pix confirmado no invertido (M3), H10.4 não-vazamento (M4), H10.9 auditoria obrigatória (M5). Nenhum critério ficou totalmente sem passo.

## 5. Testes (pontos críticos)

Cobertos e bem definidos: corrida opt-out/reativação quase simultâneos, optout enviado depois reativa = 2ª notificação, espaçamento ≥10 min entre itens do mesmo destinatário, item obsoleto por estado terminal nas DUAS filas, 2 drainers `SKIP LOCKED`, silêncio no ciclo (0 linhas após um ciclo), idempotência "já paguei" 2x.

Faltam testes dedicados para: reativação re-produz `envios` (C1); reativação enquanto a linha de optout já foi reivindicada/`processando` (C2); pagou→rejeitou→pagou = 2 notificações (M2); notificação de divergência não vaza ao número errado (M4); excesso de limite de plano registra mas não envia nem entra em retry (M1).

## 6. Coerência cross-épico

Correta e sem contradição: E5 (`recusado` terminal, eventos de convite, anti-brute-force) consumido, não criado; E7 (`desregistrado` reversível, reativação) como fonte; E8 (botões Confirmar/Ainda não recebi) como dono do efeito; E6 (retry 20-60s H6.8, 10 min/devedor H6.9) complementado, não substituído; E9 (painel) como destino "com conta"; E11 (limite) e E12 (templates) como fundações. A única lacuna de coerência é C1 (reativação ↔ re-agendamento do E6), que o plano deveria amarrar explicitamente.

## 7. Invariantes do Épico 13

Respeitadas no plano: sem travessão (texto do plano e templates), sem palavras proibidas (apoia-se no check `templates_*_linguagem_limpa` existente, confirmado na 0014/0022), neutro de gênero (citado), centavos (drainer lê `valor_centavos::bigint`), sem DELETE de negócio (coalescing por `status='cancelado'`, não delete; auditoria em `eventos_aviso` append-only), nunca logar telefone/Pix/token (logs por `notifId`/`tipo`). Fuso America/Sao_Paulo: o épico não calcula datas de negócio no cliente; ok. Ressalva menor B2 (CTA via template) deve passar pelo check de linguagem.

## 8. Recomendação de modelo por passo

Sensata. `opus` corretamente reservado para máquina de estados/roteamento por papel/fila/coalescing/segurança (passos 1,3,4,5,6,7,8,9,10) e `sonnet` para catálogo de templates, rótulos do front e docs (passos 2,11,12). Sem objeções.
