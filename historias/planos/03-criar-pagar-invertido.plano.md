# Plano de desenvolvimento: Épico 03 — Criar combinado (fluxo pagar invertido)

> Fonte da verdade: `historias/03-criar-combinado-pagar.md`. Onde o código diverge da história, o trabalho é mudar o código.
> Espelho do Épico 2 com papéis trocados. Reaproveita a mesma maquinaria de convite/aceite/edição/pausa.
> Verificado contra o código real (não o grafo: o CLI `graphify` não está no PATH desta máquina; usei leitura direta de migrations, contratos, módulos `avisos`/`aceite`/`perfil`, webhook do zap, e telas do front).

---

## 1. Resumo do épico e escopo

Quem cria é o **devedor** (vai pagar) e convida o **cobrador** (vai receber e confere os dados). O combinado nasce em `aguardando_aceite`, não dispara lembrete até o cobrador confirmar (E5/E6). Os lembretes vão ao **devedor** (`telefone_devedor` = sempre o alvo). Este épico é, em grande parte, a **espinha de criação/edição/cancelamento/pausa do invertido**; aceite/recusa no WhatsApp, textos e disparo são de E5/E6.

**MVP 🟢 deste épico (tudo 🟢 no épico):**
- H3.1 Cadastrar combinado a pagar com Pix **obrigatório** na criação.
- H3.2 Gerar convite ao cobrador (número de 6 dígitos hash + mensagem completa + link wa.me) — mecânica compartilhada com H2.2 (E2/E5 donos do número).
- H3.3 Cobrador confere (inclusive Pix) e responde por botão: Aceitar / Chave Pix incorreta / Recusar (terminal `recusado`); devedor sempre notificado.
- H3.4 Limite do plano na API (compartilha regra com H2.3; já considera criador por papel).
- H3.5 Editar/cancelar/pausar com papéis trocados (compartilha estados novos com E2).

**Gated / fora deste épico (citado por dependência):**
- 🟡 Auto-envio do convite como template Meta com botões (hoje é link wa.me + página pública) — E5.
- 🟡 Aceite/recusa e validação do número de convite 100% no WhatsApp — E5.
- 🟡 Backfill por telefone no signup condicionado a OTP — E1/E10 (hoje roda sem verificação, risco aceito).
- 🟡 `informado_pago` com cobrador sem conta (notificar por `telefone_cobrador`) — E8/E10.

---

## 2. Estado atual vs história (por critério, baseado no código real)

Legenda: `[x]` ok · `[~]` parcial · `[!]` diverge (refatorar) · `[+]` não existe.

### H3.1 Cadastrar um combinado a pagar
- `[x]` Coleta nome/telefone do cobrador, motivo, valor, data. `criarAvisoBody` exige `nome_cobrador`+`telefone_cobrador` no `pagar` (`payloads.ts:47`); front coleta em `NovoAviso.tsx`.
- `[x]` Nome do devedor pré-preenchido do perfil (`NovoAviso.tsx:81` usa `perfil.nome`).
- `[!]` **Pix obrigatório no invertido.** Hoje `pix_chave` é `nullish` no contrato (`payloads.ts:41`), `optional` no front (`schemas.ts:42`, label "Chave Pix (opcional)"), e o **cobrador é quem preenche no aceite** (`aceite/service.ts:63`, `Aceite.tsx:143`). A história inverte: **devedor informa o Pix na criação** e o cobrador só confere. Refatoração central deste épico.
- `[x]` `criador_papel = devedor`, `cobrador_id` nulo, cobrador denormalizado por `nome_cobrador`/`telefone_cobrador` (migration `0017`, `avisos/service.ts:52-62`).
- `[x]` Valor em centavos int (`valorCentavos`, `valor_centavos::bigint`).
- `[x]` Data em America/Sao_Paulo, banco UTC (`data_combinada` text + `aceiteExpiraEm`).
- `[x]` Campos obrigatórios validados, valor > 0 (Zod no contrato e no front).
- `[x]` Nasce em `aguardando_aceite` (`avisos/service.ts:57`).
- `[~]` Linguagem: ok no fluxo de avisos; ressalva conhecida em `Landing.tsx` ("cobranças") fora deste escopo (E13).
- `[+]` **Cobrador valida/ajusta titular e banco da chave no aceite** (usados em E7 H7.3): não há colunas `pix_titular`/`pix_banco` em `avisos` nem em `chaves_pix` (só `chave`, `rotulo`, `tipo` a partir de `0016`). Modelagem nova (ver Decisão em aberto D2).

### H3.2 Gerar o convite ao cobrador
- `[~]` Hoje gera **token aleatório longo** (`gerarToken`/`sha256Hex`, `avisos/service.ts:44`) e link `/aceite/:token`, não número de 6 dígitos. Mesma divergência da H2.2.
- `[+]` **Número de 6 dígitos `xxx-xxx`, hash, unicidade por telefone do cobrador, anti-brute-force 3 tentativas** — não existe. É trabalho de E5; aqui o invertido só herda a mesma mecânica com unicidade **por `telefone_cobrador`**.
- `[~]` Mensagem ao devedor com link: `AvisoCriado.tsx` monta link + wa.me. Falta a **mensagem completa** (introdução + número + link) com texto pré-preenchido *"Oi, aqui é [nome do devedor], meu convite é o xxx-xxx"* (E5/E12).
- `[x]` Tela oferece copiar/compartilhar (`CopyLinkButton`, wa.me em `AvisoCriado`).

### H3.3 Cobrador confere os dados e a chave Pix e responde com um toque
- `[~]` Página pública `/aceite/:token` mostra dados + Pix no invertido (`Aceite.tsx`, `aceite/service.ts:22`). Mas hoje o Pix é **editável pelo cobrador** (deve virar só "conferir/confirmar/apontar incorreto").
- `[x]` Aceitar → `aguardando_aceite→pendente` + cria envios (`aceite/repo` via `aceitar()`; webhook `aplicarAcaoBotao` aceite).
- `[+]` **Botão "Chave Pix incorreta"** (sinal de dado incorreto, sem texto livre; não aceita nem recusa; notifica o devedor): não existe ação/evento/handler.
- `[!]` **Recusar → terminal `recusado`.** Hoje recusa vai para `cancelado` (webhook `repo.ts:56`) com evento `recusado`. A história e o `_CONTEXTO` exigem **estado `recusado` próprio** (distinto de `cancelado`).
- `[+]` **"Em qualquer resposta o devedor é notificado"**: não há enfileiramento de notificação ao devedor na recusa / Pix incorreto (a outbox `notificacoes_cobrador` notifica o cobrador, não o devedor; falta canal/uso para notificar o devedor criador). Coordenar com E10.
- `[x]` Vínculo por `profile.id` se tem conta, senão só por telefone (aceite genérico por papel; backfill em `perfil`).
- `[x]` Nenhum lembrete antes do aceite (envios só criados no aceite).
- `[~]` CTA de criar conta existe (`Aceite.tsx` `CtaCriarConta`); rótulos canônicos de botão ficam no E5.

### H3.4 Respeitar o limite do plano ao criar
- `[x]` Checagem na API antes de criar (`avisos/service.ts:28-37`).
- `[x]` Só conta `aguardando_aceite`/`pendente` (terminais não contam) (`repo.contarAtivos`).
- `[x]` Conta por **criador independente do papel** (`contarAtivos` filtra por `criador_papel`+id correto).
- `[~]` **Free não cria (só visualiza)**: depende do catálogo de planos de E11 (plano free read-only com limite 0). Hoje o padrão sem assinatura é `pessoal` (`limiteDoPlano`). Defere a H2.3/E11.

### H3.5 Editar, cancelar e pausar
- `[x]` **Cancelar**: `POST /avisos/:id/cancelar` via `buscarComoCriador` (funciona p/ devedor criador no invertido). Cancelável em `aguardando_aceite`/`pendente`. `cancelado` terminal, nada apagado.
- `[+]` **Editar** (`PATCH/PUT /avisos/:id`): não existe rota nem serviço.
- `[+]` **Editar depois do aceite → `aguardando_aprovacao_aviso_editado`** com lembretes pausados e reaprovação pelo cobrador: estado e fluxo **não existem**.
- `[+]` **Pausar/reativar** (estado `pausado`): não existe estado, rota nem serviço.
- `[~]` **Notificar o cobrador** das mudanças: depende de notificar por conta OU `telefone_cobrador` (cobrador sem conta), hoje só há `notificacoes_cobrador` por profile. Coordenar com E10.
- `[x]` Alterações como evento append-only: infra existe (`inserirEvento`, `eventos_aviso`); faltam os tipos de evento de edição/pausa/reativação.

---

## 3. Trabalho por camada

### 3.1 Arquitetura / Dados (migrations, estados, índices)

Estes itens são **compartilhados com o Épico 2** (mesma máquina de estados). Implementar uma vez; este plano os referencia para o invertido.

1. **Estado `recusado` terminal** (nova migration, ex. `0025`):
   - `alter type status_aviso add value if not exists 'recusado'`.
   - Atualizar `validar_transicao_aviso()` (substitui a de `0011`): `aguardando_aceite → {pendente, cancelado, expirado, recusado}`. `recusado` é terminal (sem saída). Espelhar a regra de ouro #6 dos envios: nada mais é enviado em estado terminal.
   - Espelhar no enum Zod `statusAviso` (`backend/packages/shared/src/contracts/enums.ts`) e no front (`frontend/src/shared/contracts/enums.ts`).
2. **Estado `pausado`** + transições `pendente↔pausado` (E2/E3 H3.5). Migration + enum back/front + lint de transição na app.
3. **Estado `aguardando_aprovacao_aviso_editado`** + transições `pendente↔aguardando_aprovacao_aviso_editado` e `aguardando_aprovacao_aviso_editado → {pendente, cancelado, expirado}` (E2/E3 H3.5). Migration + enum back/front.
4. **Renomear `pendente → programado`** (decisão cross-épico do `_CONTEXTO`): toca trigger + app + enums + PROJETO.md/CLAUDE.md + front. **Decisão em aberto D1** (fazer no E2 e este épico só consome, ou adiar). Não inventar: sinalizar.
5. **Modelagem de titular/banco da chave Pix** (H3.1: cobrador valida/ajusta no aceite, usados em E7 H7.3): adicionar `pix_titular text` e `pix_banco text` em `public.avisos` (denormalizado, igual `nome_cobrador`), com checks de tamanho. **Decisão em aberto D2** (no aviso vs em `chaves_pix`).
6. **Eventos novos** em `tipo_evento` (mesma migration de estados): `editado_criador`, `pausado_criador`, `reativado_criador`, `aprovado_aviso_editado`, e `pix_incorreto` (sinal do cobrador, H3.3). `recusado` já existe (`0017`).
7. **Notificação ao devedor criador** (H3.3 "devedor sempre notificado" em recusa/pix incorreto): decidir o canal. Reusar a outbox genérica de E10 (`notificacoes_cobrador` é específica do cobrador). **Decisão em aberto D3**: criar outbox/uso para notificar o **criador** (devedor no invertido) por conta OU telefone, ou generalizar a tabela de notificações. Coordenar com E10.
8. **Unicidade do número de convite por `telefone_cobrador`** (H3.2): índice/coluna do número de convite (hash) chega no E5; aqui garantir a variante por telefone do cobrador. Citar como dependência.

### 3.2 Backend api (`apps/api`)

- **`avisos/service.ts` `criarAviso`**: no invertido (`direcao=pagar`), **exigir Pix** e gravar `pix_chave` do **criador-devedor** (não nulo). Hoje grava `body.pix_chave ?? null` para ambos — manter para receber, tornar obrigatório no invertido (validação no contrato + guard no serviço com `regraNegocio('pix_obrigatorio', ...)`).
- **`criarAvisoBody`** (`shared/contracts/payloads.ts`): novo `.refine` — `direcao !== 'pagar' || pix_chave != null` (mensagem em linguagem permitida). Espelhar no front (`avisos/schemas.ts`).
- **`aceite/service.ts` `aceitar`**: **parar de receber/gravar `pixChave` do cobrador** no invertido (o Pix já vem do devedor na criação). O aceite do cobrador apenas ativa (`→ pendente`) e, opcionalmente, ajusta `pix_titular`/`pix_banco` (D2). Remover/ressignificar `aceitarBody.pix_chave` (`payloads.ts:86`) → vira `pix_incorreto: boolean` + ajuste de titular/banco.
- **`infoAceite`** (`aceite/service.ts:22`): manter Pix visível ao cobrador no invertido (para conferir), mas agora **somente leitura** + flags para os botões Aceitar/Pix incorreto/Recusar.
- **Novo endpoint de edição** `PATCH /avisos/:id` (`avisos/index.ts` + `service.editarAviso`): valida criador (`buscarComoCriador`), aplica edição; se já aceito (`pendente`), transiciona para `aguardando_aprovacao_aviso_editado`, pausa lembretes (marca envios futuros), grava evento `editado_criador` e enfileira notificação ao cobrador (D3/E10). Espelha H2.5.
- **Novos endpoints de pausa** `POST /avisos/:id/pausar` e `/reativar` (`pendente↔pausado`): só a partir de aceito; grava eventos; notifica o cobrador. Espelha H2.7.
- **`cancelarAviso`**: já cobre o invertido. Ampliar `cancelavel` para incluir `pausado` e `aguardando_aprovacao_aviso_editado` (qualquer fase viva, H3.5). Notificar o cobrador se já aceito.
- **Sinal "Chave Pix incorreta"** (H3.3): handler no aceite (`POST /aceite/:token` com `pix_incorreto`) que **não muda o status** (segue `aguardando_aceite`), grava evento `pix_incorreto` e enfileira notificação ao **devedor** criador (D3). Resposta neutra ao cobrador.
- **Recusa via página pública**: `POST /aceite/:token` ramo recusa → `aguardando_aceite→recusado` (não `cancelado`), evento `recusado`, notifica o devedor. Alinhar com o webhook (3.3).

### 3.3 Backend zap (`apps/zap`)

- **`webhook_whatsapp/repo.ts` `aplicarAcaoBotao`**: `acao === 'recusa'` deve ir para **`recusado`** (não `cancelado`, linha `repo.ts:56`). Após mudar a máquina de estados, ajustar o `update`.
- **Nova ação de botão `pix_incorreto`** (H3.3): adicionar a `ACOES_BOTAO` (`service.ts:14`) e `AcaoBotao` (`repo.ts:5`); handler que mantém `aguardando_aceite`, grava evento `pix_incorreto`, enfileira notificação ao devedor (D3), responde neutro (template `resposta.pix_incorreto`). Idempotente.
- **Notificar o devedor criador** em recusa/pix incorreto (H3.3): hoje só existe `notificacoes_cobrador`. Drenar a nova outbox (D3) no zap, roteando por conta (`devedor_profile_id`) OU telefone (`telefone_devedor`). Coordenar com E10 (módulo de notificações).
- **`enviar`/transporte**: nenhum novo provider; reusar `ClienteWhats`/`renderMensagem`. Fallback de botão por resposta numerada é risco de canal (ver §6), tratado em E5/E6.
- **`expirar_avisos`**: ao ganhar `recusado`/`pausado`/`aguardando_aprovacao_aviso_editado`, conferir que a expiração só atua sobre `aguardando_aceite`/vivos e não toca terminais.

### 3.4 Frontend (`frontend/`)

- **`NovoAviso.tsx` + `schemas.ts`**: no invertido, **Pix obrigatório** (remover "(opcional)", `pix_chave` obrigatório no `pagar` via `.superRefine`/discriminante). Texto: "Chave de quem vai receber (para onde você vai pagar)".
- **`Aceite.tsx` `FluxoAceite`**: no invertido, Pix vira **somente leitura para conferir**; trocar o campo editável por 3 ações: **Aceitar / tudo certo**, **Chave Pix incorreta**, **Recusar combinado** (rótulos finais em E5). Recibos para `recusado` (novo) e para a resposta neutra de "pix incorreto".
- **Contratos front** (`shared/contracts/enums.ts`, `entidades.ts`, `payloads.ts`): adicionar `recusado` (se faltar em outras telas), `pausado`, `aguardando_aprovacao_aviso_editado`; novo body de aceite (`pix_incorreto`); body de editar/pausar.
- **`StatusBadge`/listas/painel**: rotular os novos estados (`recusado`, `pausado`, `aguardando_aprovacao_aviso_editado`) — copy neutra, sem palavras proibidas.
- **`DetalheAviso.tsx`**: ações Editar/Pausar/Reativar/Cancelar conforme estado; auditoria mostrando os novos eventos.
- **`AvisoCriado.tsx`**: quando E5 entregar o número de 6 dígitos, exibir `xxx-xxx` + mensagem completa pré-montada para o **cobrador**. Por ora segue link/wa.me.

### 3.5 Segurança

- **Pix nunca logado** (regra de ouro): garantir que o novo fluxo (criar com Pix, conferir, pix incorreto) não loga `pix_chave`/`pix_titular`/`pix_banco`/telefone (já é invariante; cobrir em revisão).
- **Número de convite só como hash** (E5); aqui a unicidade por `telefone_cobrador` não pode vazar o número claro.
- **Edição/pausa/cancelamento**: sempre via `buscarComoCriador` (autorização por criador), nunca confiar no client para estado/etapa.
- **Aceite público sem login**: `POST /aceite/:token` segue `autenticarOpcional`; o sinal "pix incorreto" e a recusa não podem ser usados para enumerar avisos (404 genérico já existe em `infoAceite`).
- **Validação de limite sem corrida** (H3.4): a checagem `contarAtivos`/`inserir` roda dentro de `comTransacao`; manter (E11 H11.8 endurece com lock/constraint).

### 3.6 Testes

- **api `avisos.test.ts`**: criar invertido **exige Pix** (rejeita sem Pix); grava `criador_papel=devedor`, `cobrador_id` null, `telefone_devedor`=telefone do perfil; limite conta criador por papel (H3.4).
- **api `aceite.test.ts`**: cobrador aceita (não envia mais Pix), `→pendente`, cria envios; **recusa → `recusado`** (terminal) + evento + notifica devedor; **pix incorreto** mantém `aguardando_aceite` + evento + notifica devedor; idempotência (re-tap).
- **api edição/pausa**: editar aceito → `aguardando_aprovacao_aviso_editado` pausa lembretes; reaprovação volta a `pendente`; pausar/reativar só de aceito; cancelar de qualquer estado vivo (incl. `pausado`).
- **zap `webhook.test.ts`**: recusa → `recusado`; nova ação `pix_incorreto` (idempotente, sem mudar estado); notificação ao devedor enfileirada; cobrador sem conta não quebra (guard).
- **Trigger (migration)**: `bash scripts/validate_migrations.sh whaviso_dev` após mudar a máquina de estados; testar transições válidas/invalidas de `recusado`/`pausado`/`aguardando_aprovacao_aviso_editado`.
- **Front**: schema obriga Pix no invertido; Aceite mostra Pix read-only + 3 ações; badges dos novos estados.
- **Linguagem (E13)**: nenhum texto novo com palavra proibida / travessão / gênero inferido.

---

## 4. Sequência de passos

> Estados/edição/pausa são compartilhados com E2. Marcados "(compartilhado E2)": implementar uma vez.

1. **Migration: estado `recusado` terminal + máquina de estados** (compartilhado E2). Trigger `validar_transicao_aviso`, enum back/front. Critério: H3.3 (recusa → `recusado`). **Modelo: opus** — máquina de estados + trigger, defesa em profundidade, alto risco de regressão.
2. **Migration: estados `pausado` e `aguardando_aprovacao_aviso_editado` + eventos novos** (`editado_criador`, `pausado_criador`, `reativado_criador`, `aprovado_aviso_editado`, `pix_incorreto`) (compartilhado E2). Critério: H3.5, H3.3. **Modelo: opus** — transições novas + auditoria, mesma máquina crítica.
3. **Migration: colunas `pix_titular`/`pix_banco` em `avisos`** (D2). Critério: H3.1 (cobrador valida/ajusta titular e banco). **Modelo: sonnet** — alter table + checks, mecânico (pende D2).
4. **Contratos: Pix obrigatório no invertido** (`criarAvisoBody` refine) + espelhar no front `schemas.ts`. Critério: H3.1. **Modelo: sonnet** — regra Zod simples.
5. **api `criarAviso`: gravar Pix do devedor no invertido + guard de obrigatoriedade**. Critério: H3.1. **Modelo: sonnet** — ajuste pontual no serviço existente.
6. **api `aceite`: remover Pix editável do cobrador; aceite só ativa; titular/banco opcional**. Critério: H3.1, H3.3. **Modelo: opus** — toca o fluxo de aceite/transição e contrato público (`aceitarBody`), risco de quebrar idempotência.
7. **api + zap: sinal "Chave Pix incorreta"** (ação/evento `pix_incorreto`, não muda estado, notifica devedor, resposta neutra). Critério: H3.3. **Modelo: opus** — nova ação de webhook idempotente + roteamento de notificação ao devedor.
8. **api + zap: recusa → `recusado` (terminal) + notificar devedor**. Critério: H3.3. **Modelo: opus** — transição terminal + idempotência de webhook + notificação.
9. **Notificar o devedor criador (outbox/uso)** em recusa/pix incorreto, roteando por conta OU `telefone_devedor` (D3, coordenar E10). Critério: H3.3 ("devedor sempre notificado"). **Modelo: opus** — outbox + roteamento conta/telefone, espelha o ponto crítico de E10.
10. **api edição: `PATCH /avisos/:id`** com reaprovação (`pendente→aguardando_aprovacao_aviso_editado`, pausa lembretes, notifica cobrador) (compartilhado E2). Critério: H3.5. **Modelo: opus** — transição + pausa de envios + notificação, sem corrida.
11. **api pausa/reativação: `POST /avisos/:id/pausar` e `/reativar`** (compartilhado E2); ampliar `cancelarAviso` p/ estados vivos novos; notificar cobrador. Critério: H3.5. **Modelo: opus** — transições `pendente↔pausado` + efeito em envios.
12. **Frontend NovoAviso: Pix obrigatório + copy invertida**. Critério: H3.1. **Modelo: sonnet** — form/label/validação.
13. **Frontend Aceite: Pix read-only + 3 ações (Aceitar/Pix incorreto/Recusar) + recibo `recusado`/neutro**. Critério: H3.3. **Modelo: sonnet** — tela, lógica simples (rótulos canônicos de E5).
14. **Frontend estados novos: badges/listas/DetalheAviso (Editar/Pausar/Reativar) + contratos**. Critério: H3.5. **Modelo: sonnet** — UI/contratos espelhados.
15. **Testes dedicados** (api avisos/aceite/edição/pausa, zap webhook, trigger, front). Critério: todos H3.x. **Modelo: opus** — cobrir idempotência, transições terminais, notificação e corrida de limite.
16. **Atualizar PROJETO.md / CLAUDE.md** (estados novos, Pix na criação invertida, `recusado`) e rodar lint+typecheck+test+`validate_migrations.sh`. Critério: invariantes E13 + coerência. **Modelo: sonnet** — docs + verificação.

> Após qualquer mudança de código: rodar `cd backend && npm run lint && npm run typecheck && npm test`, e (se mexer no schema) `bash scripts/validate_migrations.sh whaviso_dev`. O grafo (`graphify update .`) está indisponível nesta máquina via PATH; usar o shim documentado em `[[whaviso-graphify]]`.

---

## 5. Dependências de outros épicos

- **E13 (linguagem):** invariante em toda copy/evento novo.
- **E11 (planos):** H3.4 free read-only depende do catálogo (plano free limite 0). Hoje o padrão sem assinatura é `pessoal`.
- **E1 (auth):** conta-no-aceite, JWKS, backfill por telefone (gated por OTP).
- **Máquina de estados (E2/E3):** `recusado`, `pausado`, `aguardando_aprovacao_aviso_editado`, eventual rename `pendente→programado`.
- **E2 (receber):** este épico é o espelho; passos 1, 2, 10, 11 são literalmente os mesmos (implementar uma vez).
- **E5 (convite/aceite WhatsApp):** número de 6 dígitos (hash, unicidade por `telefone_cobrador`), validação número+telefone, anti-brute-force, rótulos canônicos dos botões, recusa no WhatsApp, mensagem completa do convite.
- **E6 (lembretes):** disparo ao devedor após aceite; pausa de envios na edição/pausa.
- **E8/E10 (notificações):** notificar o **devedor** em recusa/pix incorreto e o **cobrador** em edição/pausa/cancelamento, por conta OU telefone (cobrador sem conta); `informado_pago` com cobrador sem conta.

---

## 6. Riscos e pontos de teste dedicado

- **Transição terminal `recusado`** (passos 1, 8): trigger + app + webhook precisam concordar; risco de aviso recusado ainda receber lembrete. Teste de trigger + reconferência de estado no disparo.
- **Idempotência de webhook** (passos 7, 8): re-tap de Aceitar/Recusar/Pix incorreto não pode duplicar evento/notificação nem reabrir estado terminal. Teste de toque duplo + `for update`.
- **Pausa de lembretes na edição** (passo 10): editar aceito deve impedir envios em voo (reconferência de estado no disparo do E6). Teste de corrida disparo×edição.
- **Notificação ao devedor sem corrida/duplicidade** (passo 9): par recusa/pix-incorreto não pode notificar o devedor duas vezes; coordenar coalescing de E10 (H10.9).
- **Validação de limite sem corrida** (H3.4): criar dois invertidos em paralelo no limite. Endurecimento em E11.
- **Cobrador sem conta** (`cobrador_id` null): notificar por `telefone_cobrador`; guard para não quebrar a outbox por profile (já existe guard no `ja_paguei`, replicar nas novas notificações).
- **Risco de canal (Baileys):** botões interativos (Aceitar/Pix incorreto/Recusar) podem ser instáveis → prever fallback por resposta numerada (E5/E6).

---

## 7. Decisões em aberto (confirmar com o humano, não inventar)

- **D1 — Rename `pendente→programado`:** fazer agora (toca trigger + app + enums + PROJETO.md/CLAUDE.md + front) ou manter `pendente` neste épico e tratar no E2/cross-épico? O `_CONTEXTO` lista como varredura transversal.
- **D2 — Onde guardar titular/banco da chave Pix** (H3.1: cobrador valida/ajusta no aceite, usados em E7 H7.3): colunas `pix_titular`/`pix_banco` denormalizadas em `avisos` (proposta deste plano) ou referência a uma chave de `chaves_pix` do cobrador? Hoje nenhuma das duas existe.
- **D3 — Canal/tabela para notificar o devedor criador** (H3.3 "devedor sempre notificado" em recusa/pix incorreto): generalizar `notificacoes_cobrador` para "notificações ao criador/contraparte" ou criar outbox dedicada? Decidir junto com E10.
- **D4 — Rótulos finais dos botões** (Aceitar/tudo certo · Chave Pix incorreta · Recusar combinado): canônicos definidos em E5; este épico assume nomes provisórios.
- **D5 — Login WhatsApp botão vs OTP** (E1) e **backfill condicionado a OTP**: afeta o vínculo do cobrador convidado; hoje backfill roda sem verificação (risco aceito).
