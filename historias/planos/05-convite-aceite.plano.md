# Plano de desenvolvimento: Épico 05 — Convite & Aceite pelo WhatsApp

> Fonte da verdade: `historias/05-convite-aceite.md`. Onde o código diverge, o plano descreve como mudar o código para bater com a história.
> Contexto base: `historias/planos/_CONTEXTO.md`.

---

## 1. Resumo do épico e escopo

O aceite passa a ser **100% pelo WhatsApp**, sem site e sem login. O convidado abre a conversa com o número do Whaviso (link `wa.me` pré-preenchido), é reconhecido por um **número de convite de 6 dígitos + telefone** (comparação contra hash), vê um resumo do combinado e responde por um de **três botões**: Aceitar, Algum dado está incorreto (no invertido: Chave Pix incorreta), Recusar. O criador é notificado em qualquer resposta (conteúdo no Épico 10). O épico introduz o estado terminal próprio `recusado`, anti-brute-force de 3 tentativas por telefone com regeneração/bloqueio do número, detecção de telefone divergente, e expiração fixa de 7 dias.

**MVP (🟢, tudo neste épico é 🟢):**
- H5.1 localizar por número+telefone (extração 6 dígitos, fallback sem número, número inexistente, anti-brute-force 3 tentativas).
- H5.2 resumo + 3 botões (rótulos do template, Épico 12) com `aviso_id` no payload (HMAC/auth do canal).
- H5.3 aceitar (`aguardando_aceite → programado`*, ativa ciclo, vínculo por telefone, conta no aceite H1.4, CTA discreta, notifica criador).
- H5.4 "dado incorreto" (sinal, sem mudar estado, notifica criador).
- H5.5 recusar (`aguardando_aceite → recusado`, terminal próprio, notifica criador).
- H5.6 segurança/idempotência (terminal não reabre, toque duplo não duplica, sem log de dado sensível).
- H5.7 expiração 7 dias fixo + respostas a convite expirado/já aceito.
- H5.8 telefone divergente (não conta como tentativa; avisa as duas pontas; não revela dados).
- H5.9 esgotar 3 tentativas (cadastrado → regenera número + notifica; não cadastrado → bloqueia até novo combinado).

\* Nota cross-épico: o nome-alvo do estado ativo é `programado` (renomeado de `pendente` no \_CONTEXTO §"máquina de estados"). A varredura `pendente→programado` é trabalho do épico de máquina de estados / E6. Este plano **escreve o passo que cria `recusado`** e **acrescenta a transição `aguardando_aceite → recusado`**, e referencia `programado` como alvo, mas não duplica a renomeação global (ver Dependências). Onde o código atual lê/escreve `pendente`, manter compatível até a varredura global.

**Gated (🟡):** nenhum item gated neste épico.

**Fora de escopo:** textos/disparo dos lembretes pós-aceite (E6); interação do devedor já ativo (E7); confirmação de pagamento (E8); conteúdo das notificações ao criador (E10).

---

## 2. Estado atual vs história (por critério, baseado no código real)

Legenda: `[x]` ok · `[~]` parcial · `[!]` diverge (refatorar) · `[+]` não existe.

### H5.1 Localizar pelo número de convite
- `[!]` Link `wa.me` pré-preenchido: existe em `frontend/.../AvisoCriado.tsx`, mas a mensagem aponta para o **link de aceite do site** (`link_aceite`), não para a conversa com o número do Whaviso com "meu convite é o xxx-xxx". O link `wa.me` é para o número do **convidado**, não do Whaviso.
- `[+]` Extração dos 6 dígitos da mensagem inicial: não existe (o inbound do zap, `shared/baileys_client/inbound.ts`, só extrai clique de botão; texto livre é descartado em `conexao.ts::aoReceber`).
- `[!]` Localização por número+telefone contra hash: hoje a localização é por `aceite_token_hash` (token longo de 32+ chars, `avisos/service.ts::criarAviso`), via site. Não há número de 6 dígitos.
- `[+]` Fallback sem número, número inexistente, anti-brute-force 3 tentativas: não existem.

### H5.2 Ver o combinado e escolher resposta
- `[~]` Resumo do combinado: existe via site (`api/.../aceite/service.ts::infoAceite` + `frontend/.../aceite/components/ResumoCombinado.tsx`), **não** pelo WhatsApp.
- `[+]` Resposta com resumo + botões enviada pelo WhatsApp ao receber o número: não existe.
- `[x]` `aviso_id` no payload do botão, canal autenticado: o padrão `acao:<avisoId>` já é o usado (`webhook_whatsapp/service.ts::parsearPayloadBotao`, valida UUID). HMAC: no Baileys o inbound já é por sessão pareada (autenticidade do canal).
- `[+]` Terceiro botão "Algum dado está incorreto" / "Chave Pix incorreta": só existem `aceite`/`recusa` (`ACOES_BOTAO`).

### H5.3 Aceitar
- `[~]` Transição aceite → ativo + cria envios do ciclo: existe no botão (`webhook_whatsapp/repo.ts::aplicarAcaoBotao`, vai para `pendente` e insere `envios`). Falta renomear alvo para `programado` (cross-épico) e usar evento/ator corretos.
- `[x]` Vínculo por telefone sem sessão: o aceite por botão não tem sessão, fica só pelo telefone (correto por design).
- `[+]` **Conta criada automaticamente no aceite (H1.4)** com nome+telefone no plano free: não acontece no caminho WhatsApp (só o site/backfill cria). É item de E1, mas o gatilho aqui precisa existir.
- `[+]` Confirmação + CTA discreta para o painel: a confirmação vem do template `resposta.aceite`; falta CTA com link para acompanhar.
- `[~]` Criador notificado do aceite: existe `eventos_aviso 'aceite'`, mas a notificação ao criador (E10) hoje só cobre `informado_pago` (`notificacoes_cobrador`); aceite não enfileira notificação ao criador.

### H5.4 Dado incorreto
- `[+]` Botão/payload "dado incorreto", sem mudar estado, notifica criador, resposta neutra, evento registrado: não existe.

### H5.5 Recusar
- `[!]` Recusa: existe, mas vai para `cancelado` (`webhook_whatsapp/repo.ts` linha 56), não para um estado próprio `recusado`. O evento `recusado` já é gravado, mas o **status** está errado.
- `[+]` Estado `recusado` em `status_aviso`: não existe (só há o `tipo_evento 'recusado'`). Transição `aguardando_aceite → recusado` não existe no trigger.
- `[~]` Notificar criador da recusa: evento gravado, notificação ao criador não enfileirada.

### H5.6 Segurança e idempotência
- `[x]` Payload leva `aviso_id`, não token; canal por sessão.
- `[~]` Terminal não reabre: a guarda existe para os estados atuais (`aplicarAcaoBotao` rejeita quando não é `aguardando_aceite`), mas precisa incluir `recusado` e responder informativo em toque tardio (hoje retorna `aplicado:false` e **não responde nada**).
- `[x]` Idempotência do toque duplo: `aplicado` só true quando muda de estado; re-tap não duplica.
- `[~]` Não logar dado sensível: o código atual não loga telefone/Pix; precisa manter ao adicionar o fluxo de texto (número de convite nunca em log).

### H5.7 Expirado / já respondido
- `[~]` Expiração 7 dias: `expirar_avisos/index.ts` expira por `aceite_token_expira_em`; o prazo vem de `aceiteExpiraEm(data_combinada)` (shared/datas), **não** é fixo em 7 dias. Precisa virar 7 dias fixo a partir da criação do convite.
- `[+]` Resposta a convite expirado / já aceito pelo WhatsApp: o site trata (409), mas não há resposta pelo canal WhatsApp.

### H5.8 Telefone divergente
- `[+]` Distinguir "número não existe" de "número existe + telefone não bate", avisar as duas pontas, não revelar dados, não consumir tentativa: não existe.

### H5.9 Esgotar 3 tentativas
- `[+]` Contador por telefone, distinção cadastrado/não cadastrado, regeneração do número, bloqueio do número desconhecido: não existe.

### Divergências (todas são trabalho)
- `[!]` Remover aceite via site: `/aceite/:token` GET+POST na api (`modules/aceite/*`), rota e página no frontend (`router.tsx` linha 89, `modules/aceite/pages/Aceite.tsx`), `link_aceite` em `avisos/service.ts` e `AvisoCriado.tsx`.
- `[+]` Validação por número de 6 dígitos + telefone (substitui token de site para o aceite).
- `[+]` `recusado` como estado próprio.
- `[+]` Detecção de telefone divergente; esgotar 3 tentativas; botão "dado incorreto".
- `[x]` Rótulos de botão editáveis (já vêm do template no ciclo; aplicar o mesmo padrão aos botões de convite — E12).

---

## 3. Trabalho por camada

### 3.1 Arquitetura / Dados (migrations, estados, índices)

**M1 — Estado `recusado` + transição (nova migration, ex.: `0025_recusado.sql`).**
- `alter type status_aviso add value if not exists 'recusado';`
- Atualizar `public.validar_transicao_aviso()` (substituindo a de `0011`): acrescentar `aguardando_aceite → recusado`. Manter as demais. Garantir que `recusado` é terminal (sem transição de saída).
- Trigger de encerramento de ciclo (cancela envios pendentes) deve tratar `recusado` igual a `cancelado`/`expirado` (verificar onde está esse trigger; se inexistente, o aceite ainda não cria envios em `aguardando_aceite`, então só importa que recusa não deixe envios — ela ocorre antes do aceite).
- Espelhar o enum em `packages/shared/src/contracts/enums.ts` e no `frontend/src/shared/contracts/enums.ts`.

**M2 — Número de convite de 6 dígitos (hash) + expiração 7 dias.**
- Acrescentar a `avisos`: `convite_numero_hash text unique` (sha256 do número de 6 dígitos em claro), `convite_expira_em timestamptz` (7 dias fixos a partir da criação). Manter `aceite_token_*` por ora **deprecados** (remover só após a remoção do site, ver M5) ou já dropá-los nesta migration se a remoção do site entrar no mesmo PR.
- Índice único parcial em `convite_numero_hash where status = 'aguardando_aceite'` (colisão só importa entre convites ativos; permite reuso de número após terminal).
- Decisão de modelagem do contador de tentativas: ver M3.

**M3 — Tentativas por telefone + bloqueio (anti-brute-force, H5.9).**
- Nova tabela `convite_tentativas` (telefone E.164, `erros int`, `bloqueado_ate`/`bloqueado boolean`, `atualizado_em`). NÃO guardar o número tentado (nem hash do que foi digitado errado é necessário; só o contador). Chave por telefone.
- Alternativa considerada: contador em `whats_sessao`/coluna — descartada; tentativa é por telefone do remetente, não por aviso. Tabela dedicada é mais limpa e auditável (append-only não se aplica: é estado mutável de rate-limit, não auditoria de negócio).
- Índice por telefone (PK). RLS deny-all (é dado de operação do zap; só o role `whaviso_zap` acessa). Conceder grants mínimos a `whaviso_zap` (SELECT/INSERT/UPDATE), sem DELETE (limpeza por sweep com UPDATE de reset).

**M4 — Grants/roles.** `whaviso_zap` precisa de UPDATE em `avisos.convite_numero_hash`/`convite_expira_em` (para regenerar número em H5.9) e acesso à `convite_tentativas`. Conferir `0008_roles_rls.sql`.

**M5 — Remover colunas do site (após M-frontend/api de remoção).** Dropar `aceite_token_hash`, `aceite_token_expira_em` de `avisos` quando a rota pública sair. `acao_token_hash` é de E7 (ações do devedor por link) — confirmar com E7 antes de dropar; provavelmente também sai (interação 100% por botão). Sinalizar como decisão (ver §7).

### 3.2 Backend — api

- **Geração do número de convite:** em `avisos/service.ts::criarAviso`, gerar número de 6 dígitos aleatório (CSPRNG), garantir unicidade entre convites ativos (retry em colisão), persistir só o **hash** (`sha256Hex`), e devolver o número em claro **uma única vez** na resposta de criação (para montar o `wa.me`). Expiração = `now() + 7 dias` (fixo), não `aceiteExpiraEm(data_combinada)`.
- **Resposta de criação:** trocar `link_aceite` por um payload que o front use para montar o `wa.me` do **número do Whaviso** com a mensagem "Oi, aqui é {nome}, meu convite é o xxx-xxx". O número do Whaviso vem de config (`API_*`/expor via endpoint ou env do front). Decidir onde mora (ver §7).
- **Regeneração do número (H5.9):** o zap regenera direto no banco (é dele a lógica de tentativas); a api não precisa de rota nova para isso. Mas se a regeneração precisar reusar o gerador unicidade da api, extrair para `packages/shared` ou duplicar a função pequena no zap (módulo não importa módulo; gerador de número pode ir em `shared`).
- **Remoção do módulo `aceite`:** apagar `apps/api/src/modules/aceite/*` e a linha de registro em `routes.ts`. Remover contratos `aceiteInfoResposta`/`aceitarBody` do shared se não usados em outro lugar.

### 3.3 Backend — zap (núcleo do épico)

Hoje o inbound só trata botões. Precisa de uma segunda via: **mensagens de texto** (a inicial com o número de convite). Novo módulo `webhook_whatsapp` ganha o caminho de texto, ou um módulo irmão `convite_aceite` (decidir; recomendo manter no `webhook_whatsapp` por ser o dono do inbound — evita módulo importando módulo).

- **Captura de texto no transporte:** `shared/baileys_client/inbound.ts` ganha `extrairTexto(m)` (texto de `conversation`/`extendedTextMessage`), e `conexao.ts::aoReceber` dispara handlers de texto além dos de botão. Acrescentar `onTexto(cb)`/`EventoTexto { telefone, texto, wamid }` ao contrato `ClienteWhats` (`tipos.ts`). Manter o transporte sem regra de negócio.
- **Extração do número (H5.1):** parser que aceita `xxx-xxx` e 6 dígitos corridos; extrai os 6 dígitos da frase. Sem número → fallback (template `convite.pedir_numero`).
- **Localização (H5.1/H5.8):** buscar aviso `aguardando_aceite` por `convite_numero_hash = sha256(numero)`. Três ramos:
  1. nenhum aviso bate → "número inexistente" (conta tentativa, H5.9).
  2. bate o número e o telefone do remetente == telefone-alvo do convite → caminho feliz: responder resumo + 3 botões (H5.2), zerar contador de tentativas.
  3. bate o número mas telefone diverge → H5.8 (não conta tentativa; notifica as duas pontas; não revela dados).
- **Resumo + botões (H5.2):** template `convite.resumo` (padrão/invertido com Pix); botões vindos do `conteudo.botoes` do template (`aceite`/`dado_incorreto`/`recusa`), id `acao:<avisoId>` via `renderMensagem`. Adicionar `'dado_incorreto'` a `ACOES_BOTAO`.
- **Botões de resposta:** estender `aplicarAcaoBotao`:
  - `aceite` → `programado` (hoje `pendente`) + envios + evento `aceite` + **enfileirar notificação ao criador** + **disparar criação de conta (H1.4)**. No invertido, confirmar a chave Pix mostrada (já é o valor em `avisos.pix_chave`; nada a fazer além de manter).
  - `recusa` → `recusado` (hoje `cancelado`) + evento `recusado` + notificar criador.
  - `dado_incorreto` → **não muda status** + evento novo `dado_incorreto` + notificar criador + resposta `resposta.dado_incorreto`.
- **Idempotência/terminal (H5.6/H5.7):** toque em aviso terminal (`recusado`/`cancelado`/`pago`/`expirado`) ou já aceito → responder template informativo (`convite.ja_respondido`/`convite.expirado`), sem efeito. Hoje retorna `aplicado:false` e **não responde**; precisa responder informativo (mas sem reprocessar). Convite expirado: comparar `convite_expira_em`.
- **Anti-brute-force (H5.9):** ao contar 3 erros de número para um telefone, em transação: se há convite `aguardando_aceite` cujo alvo é esse telefone → **regenerar número** (novo hash, invalida o anterior), resetar contador, notificar criador para reenviar, orientar quem tentou a aguardar; senão → marcar telefone **bloqueado** (mensagem diferente, sem revelar nada, sem notificar criador). Desbloqueio quando um novo combinado for criado para esse telefone (a api, ao criar aviso, limpa o bloqueio do telefone-alvo — ou o zap limpa ao detectar convite novo; decidir, ver §7).
- **Expiração 7 dias (H5.7):** `expirar_avisos` passa a usar `convite_expira_em` (7 dias) em vez de `aceite_token_expira_em`. Manter o sweep de `pendente`/`programado` por data (isso é E6, não mexer além do necessário).
- **Notificação ao criador em toda resposta:** garantir enfileiramento via `notificacoes_cobrador` (ou outbox equivalente) para aceite/recusa/dado_incorreto, cobrindo o **criador** (no invertido o criador é o devedor; o "cobrador" da tabela pode ser null). O conteúdo é E10; aqui só o enfileiramento. Cobrir criador sem conta por telefone (ver E10).

### 3.4 Frontend

- **Remover página/rotas de aceite:** apagar `modules/aceite/pages/Aceite.tsx` (e `ResumoCombinado`/`data`/`schemas` se não reaproveitados), remover `{ path: '/aceite/:token' }` de `router.tsx` e o import `AceitePage`. Avaliar `/aviso/:token` e `/sair-lembretes/:token` (E7) — não mexer aqui se forem de E7; sinalizar.
- **Tela pós-criação (`AvisoCriado.tsx`):** trocar o link de aceite do site pelo `wa.me` do **número do Whaviso** com a mensagem inicial pré-preenchida contendo o número de convite (`Oi, aqui é {nome}, meu convite é o {xxx-xxx}`). Mostrar o número de 6 dígitos com hífen para o criador copiar/repassar. Remover `CopyLinkButton` do link de site.
- **Dicionário de linguagem:** confirmar que toda a copy nova (resumo, respostas) é neutra, sem travessão, sem palavras proibidas (o texto real mora nos templates do backend; o front só exibe o que vier da api/E10).

### 3.5 Segurança

- Número de convite **só como hash** (sha256) no banco; claro nunca persistido nem logado (H5.1/H5.6). Gerar com CSPRNG (`crypto.randomInt`), não `Math.random`.
- Nunca logar telefone, Pix, número de convite (revisar todos os `logger.*` adicionados; usar só `aviso_id`/contadores).
- Anti-brute-force sem corrida: contador e checagem de bloqueio em transação com `FOR UPDATE` na linha do telefone (`convite_tentativas`), para que duas mensagens simultâneas do mesmo número não contornem o limite.
- H5.8 não revela nada do combinado a quem não bate (só "algo não confere"); H5.9 telefone não cadastrado não notifica criador nenhum.
- Botão carrega `aviso_id` (UUID validado), nunca número/token. Canal autenticado por sessão pareada (equivalente ao HMAC citado na história enquanto for Baileys).

### 3.6 Testes

- **Unit (zap):** parser de número (`xxx-xxx`, 6 corridos, com texto ao redor, sem número), `parsearPayloadBotao` com `dado_incorreto`, escolha de template de resposta.
- **Integração (zap, banco real):** caminho feliz localização → resumo; número inexistente conta tentativa; telefone divergente NÃO conta tentativa e notifica duas pontas; aceite → `programado` + envios + evento + notificação enfileirada; recusa → `recusado`; dado_incorreto não muda status + evento + notificação; idempotência (toque duplo); terminal não reabre e responde informativo; convite expirado.
- **Corrida (dedicado, banco real):** 3 mensagens simultâneas de número errado do mesmo telefone não passam de 3 contagens nem escapam do bloqueio (`FOR UPDATE`); regeneração de número sob concorrência gera um único novo hash.
- **Migração:** `bash scripts/validate_migrations.sh whaviso_dev` após M1–M4; testar transição `aguardando_aceite → recusado` aceita e saída de `recusado` rejeitada pelo trigger.
- **api:** geração de número único (retry em colisão), expiração 7 dias fixa, remoção do módulo aceite não quebra `routes.ts`/typecheck.

---

## 4. Sequência de passos

> Cada passo: objetivo · arquivos prováveis · critério (HNN.x) · modelo + justificativa.

**P1 — Migration `recusado` + transição.**
Objetivo: criar estado terminal `recusado` e transição `aguardando_aceite → recusado`; espelhar enums no shared e no front.
Arquivos: `supabase/migrations/0025_recusado.sql`, `packages/shared/src/contracts/enums.ts`, `frontend/src/shared/contracts/enums.ts`. Validar com `validate_migrations.sh`.
Critério: H5.5 (estado próprio terminal). **opus** — mexe na máquina de estados (trigger + invariante de terminal), erro aqui corrompe transições.

**P2 — Migration número de convite (hash) + expiração 7 dias + tentativas.**
Objetivo: colunas `convite_numero_hash`/`convite_expira_em`, índice único parcial, tabela `convite_tentativas`, grants ao `whaviso_zap`.
Arquivos: `supabase/migrations/0026_convite_numero.sql`, `0008_roles_rls.sql` (grants). Validar.
Critério: H5.1 (número+telefone por hash), H5.7 (7 dias), H5.9 (contador). **opus** — modelagem de dados de segurança (hash, índice de unicidade entre ativos, base do rate-limit sem corrida).

**P3 — Geração do número na api + remoção do link de site (api).**
Objetivo: `criarAviso` gera número 6 dígitos (CSPRNG, único entre ativos, só hash persistido), expira em 7 dias, devolve o número em claro uma vez; apagar módulo `aceite` e suas rotas/contratos.
Arquivos: `apps/api/src/modules/avisos/service.ts`+`repo.ts`, `apps/api/src/routes.ts`, apagar `modules/aceite/*`, ajustar `packages/shared/src/contracts/*`.
Critério: H5.1, divergência "remover aceite via site". **opus** — geração com unicidade sem corrida e retry, e a remoção precisa não deixar referência pendurada; risco de regressão na criação.

**P4 — Transporte: capturar texto inbound.**
Objetivo: `onTexto`/`EventoTexto` no contrato e no Baileys; `extrairTexto`; disparo no `aoReceber`.
Arquivos: `shared/baileys_client/{tipos.ts,inbound.ts,conexao.ts,index.ts}`.
Critério: H5.1 (receber a mensagem inicial). **sonnet** — extensão mecânica do transporte, espelha o caminho de botão já existente.

**P5 — Parser do número + localização e ramos (zap).**
Objetivo: extrair 6 dígitos (`xxx-xxx`/corridos), localizar por hash, ramos número-inexistente / telefone-divergente / feliz; respostas por template; sem log de dado sensível.
Arquivos: `apps/zap/src/modules/webhook_whatsapp/{service.ts,repo.ts}`, novos templates (`convite.resumo`, `convite.pedir_numero`, `convite.expirado`, `convite.ja_respondido`, mensagens de divergência) — conteúdo via E12.
Critério: H5.1, H5.2, H5.7, H5.8. **opus** — lógica de três ramos com privacidade (não vazar dados em H5.8) e idempotência; é o coração do épico.

**P6 — Anti-brute-force: contador, regeneração e bloqueio (zap).**
Objetivo: contar 3 erros por telefone em transação `FOR UPDATE`; cadastrado → regenera número + notifica criador + orienta; não cadastrado → bloqueia até novo combinado; telefone-divergente não conta.
Arquivos: `webhook_whatsapp/{service.ts,repo.ts}`, função de regeneração de número (em `packages/shared` para reuso pela api), api `criarAviso` (limpar bloqueio do telefone-alvo).
Critério: H5.9, H5.8 (não consome tentativa). **opus** — rate-limit sem corrida, regeneração concorrente, distinção de caminhos; ponto crítico de teste.

**P7 — Botões de convite: aceite/recusa/dado_incorreto (zap).**
Objetivo: `aceite → programado` + envios + evento + notificação ao criador + gatilho de conta no aceite; `recusa → recusado`; novo `dado_incorreto` (não muda status, evento, notifica criador); terminal/já-aceito responde informativo sem efeito.
Arquivos: `webhook_whatsapp/{service.ts,repo.ts}` (`ACOES_BOTAO`, `aplicarAcaoBotao`, `chaveResposta`), migration enum `tipo_evento` `dado_incorreto`.
Critério: H5.3, H5.4, H5.5, H5.6. **opus** — transições de estado, idempotência e o novo evento; precisa casar com a máquina de estados de P1.

**P8 — Conta no aceite (H1.4) + CTA discreta + notificação ao criador.**
Objetivo: criar conta free (nome+telefone) no aceite quando não houver sessão; enfileirar notificação ao criador (aceite/recusa/dado_incorreto), cobrindo criador sem conta por telefone; confirmação com CTA discreta para o painel.
Arquivos: `webhook_whatsapp/repo.ts`, integração com a tabela de profiles/auth (coordenar com E1), `notificacoes_cobrador` (coordenar com E10).
Critério: H5.3 (conta + CTA + notifica), H5.4/H5.5 (notifica). **opus** — cruza fronteiras (E1 auth, E10 outbox) e precisa de idempotência (não criar conta duplicada por toque duplo).

**P9 — Expiração 7 dias no sweep (zap).**
Objetivo: `expirar_avisos` usa `convite_expira_em`; resposta a convite expirado no inbound (P5 já trata a resposta).
Arquivos: `apps/zap/src/modules/expirar_avisos/index.ts`.
Critério: H5.7. **sonnet** — troca de coluna no sweep, simples.

**P10 — Frontend: pós-criação aponta para o WhatsApp do Whaviso + remover página de aceite.**
Objetivo: `AvisoCriado` monta `wa.me` do número do Whaviso com a mensagem inicial e o número de convite; remover `/aceite/:token` e a página.
Arquivos: `frontend/src/modules/avisos/components/AvisoCriado.tsx`, `frontend/src/app/router.tsx`, apagar `modules/aceite/pages/Aceite.tsx` (+ correlatos).
Critério: H5.1, divergência "remover aceite via site". **sonnet** — UI mecânica e remoção de rota.

**P11 — Testes dedicados (zap + api + migração).**
Objetivo: cobrir os pontos críticos (corrida no contador/regeneração, idempotência, terminal, divergência não conta, número inexistente conta, expiração).
Arquivos: `apps/zap/src/modules/webhook_whatsapp/tests/*`, `apps/api/src/modules/avisos/tests/*`, rodar `npm run lint/typecheck/test` e `validate_migrations.sh`.
Critério: H5.6, H5.8, H5.9 (corrida) + cobertura geral. **opus** — testes de concorrência e idempotência exigem raciocínio sobre interleavings.

**P12 — Atualizar grafo e docs.**
Objetivo: `graphify update .`; ajustar PROJETO.md/CLAUDE.md onde citam aceite por site/token e `recusa → cancelado`.
Arquivos: `CLAUDE.md`, `PROJETO.md`, `backend/AGENTS.md`, `graphify-out/`.
Critério: aderência/divergências. **sonnet** — edição de docs e regeneração de mapa.

---

## 5. Dependências de outros épicos

- **Máquina de estados (fundação):** `recusado` e a transição são deste épico, mas a renomeação global `pendente → programado` é da fundação/E6. Coordenar para não escrever `pendente` e `programado` em paralelo. Se a varredura ainda não rodou, P7 usa `pendente` e deixa TODO para a renomeação.
- **E12 (templates):** os textos das mensagens (resumo, respostas, pedir número, expirado, já respondido, divergência) e os **rótulos dos botões** de convite vivem na tabela `templates` por chave. P5/P7 dependem dessas chaves existirem (criar via migration de catálogo, padrão do projeto: catálogo em migration, não seed).
- **E1 (auth):** conta criada no aceite (H1.4) e decisão login WhatsApp botão vs OTP. P8 depende do mecanismo de criação de conta free por telefone.
- **E2/E3 (criação):** o número de convite é gerado na criação; P3 altera `criarAviso` dos dois fluxos (receber e invertido). Pix obrigatório no invertido vem de E3.
- **E10 (notificações ao cobrador/criador):** P8 só **enfileira**; o conteúdo, roteamento conta/telefone e a fila com espaçamento+coalescing são de E10. Cobrir criador sem conta por `telefone_cobrador`.
- **E6 (ciclo):** o aceite ativa o ciclo; o cálculo de agendamentos (`calcularAgendamentos`) já existe; horário reservado/cadência são de E6.
- **E7 (interação do devedor):** confirmar se `acao_token_hash` e as rotas `/aviso/:token`, `/sair-lembretes/:token` saem (interação por botão). Não dropar `acao_token_hash` sem alinhar com E7.

---

## 6. Riscos e pontos de teste dedicado

- **Corrida no anti-brute-force (H5.9):** duas mensagens simultâneas do mesmo telefone podem driblar o limite de 3 ou gerar dois números novos. Mitigação: transação com `FOR UPDATE` na linha do telefone em `convite_tentativas`. Teste de concorrência dedicado.
- **Privacidade no telefone divergente (H5.8):** risco de vazar valor/motivo/Pix a quem não é o convidado. Teste afirmando que a resposta de divergência não contém nenhum dado do combinado.
- **Idempotência do aceite (H5.3/H5.6):** toque duplo não pode criar duas contas (P8) nem duplicar envios/eventos. Teste de re-tap.
- **Botões interativos via Baileys instáveis** (\_CONTEXTO §decisões): prever **fallback numerado** — se o canal não entregar botões de forma confiável, aceitar resposta por número/texto curto. Sinalizar como decisão (ver §7); o parser de texto de P5 já abre caminho para isso.
- **Unicidade do número de 6 dígitos:** espaço de 1M; com volume baixo (alvo ~100 clientes) colisão entre ativos é rara, mas o índice único parcial + retry é obrigatório. Teste de colisão forçada.
- **Estado `recusado` órfão de tradução:** o front e qualquer relatório (E9) precisam saber exibir `recusado` distinto de `cancelado`. Garantir enum espelhado (P1).
- **Migração de dados existentes:** avisos já em `aguardando_aceite` no cloud não têm `convite_numero_hash`. A migration precisa decidir: gerar número para os existentes (não dá, é hash de valor que não temos em claro) ou expirá-los/ignorá-los. Sinalizar (ver §7).

---

## 7. Decisões em aberto a confirmar com o humano

> O épico declara "nenhuma decisão pendente" no escopo de produto. As abaixo são **de implementação**, não de produto, e precisam de confirmação antes de codar.

1. **Número do Whaviso para o `wa.me`:** de onde o frontend lê o número público do Whaviso para montar o link (env `VITE_*` fixo vs endpoint da api que lê o número conectado da `whats_sessao`)? O número pode mudar ao reparear; um endpoint evita link quebrado.
2. **Desbloqueio do telefone não cadastrado (H5.9):** quem limpa o bloqueio quando "um novo combinado é enviado" — a api ao `criarAviso` (limpa `convite_tentativas` do telefone-alvo) ou o zap ao localizar um convite novo para o telefone? Recomendo a api no `criarAviso`.
3. **Fallback de botões (risco de canal Baileys):** ligar já um fallback por resposta numerada/texto (1/2/3) caso os botões não cheguem, ou deixar para depois? Afeta P5/P7.
4. **`acao_token_hash` e rotas `/aviso/:token`, `/sair-lembretes/:token`:** saem neste épico junto da limpeza do site, ou ficam para E7? Não dropar a coluna sem alinhar.
5. **Avisos `aguardando_aceite` já existentes no cloud na hora da migração:** expirar/cancelar (não temos o número em claro para gerar hash compatível) ou gerar um número novo e exigir reenvio do convite? Recomendo gerar número novo + marcar para reenvio.
6. **Onde mora o gerador de número único:** `packages/shared` (reuso api+zap, mas zap não importa api) vs duplicar no zap. Recomendo `packages/shared`.
