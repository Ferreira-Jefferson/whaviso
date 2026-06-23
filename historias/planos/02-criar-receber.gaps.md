# Relatório de validação — Épico 2: Criar combinado (fluxo receber)

> Revisor crítico (caça-gaps). Fonte da verdade: `historias/02-criar-combinado-receber.md`.
> Estado do código conferido contra os arquivos reais (migrations 0001–0024, `apps/api/src/modules/avisos/{service,repo,index}.ts`, `packages/shared/src/contracts/{payloads,enums}.ts`, `frontend/src/modules/avisos/`). O grafo (`graphify`) não estava no PATH desta sessão; a conferência foi feita lendo os arquivos diretamente.

---

## 1. Veredito

**Aprovado com ressalvas.**

O plano é forte: mapeia o código real com precisão (token opaco vs número de 6 dígitos, Pix `nullish`, `contarAtivos` em `('aguardando_aceite','pendente')`, `cancelavel` restrito, ausência de editar/pausar, ausência de `free`, `AvisoCriado.tsx` apontando wa.me para o telefone do convidado), cobre as camadas, separa MVP do gated, recomenda modelos coerentes e lista decisões em aberto sem inventar. Porém há **gaps reais** que precisam virar passos antes de aprovar sem ressalva: armazenamento das tentativas de validação (H2.2), contador de edições por plano (H2.5), tratamento explícito do evento de cancelamento no fluxo invertido, e a ambiguidade do rename `pendente→programado`. Nenhum é bloqueante de arquitetura, mas todos são critérios/invariantes que o plano hoje só tangencia.

---

## 2. Gaps por severidade

### Críticos

**G-C1 — H2.2 anti-brute-force: o ARMAZENAMENTO do contador de tentativas é deste épico, não de E5.**
O plano joga "anti-brute-force 3 tentativas" inteiro para o E5 (§2 H2.2 `[+]` "é E5, só anotar"; §1 gated). Correto que a *validação* (incrementar/bloquear ao receber mensagem no WhatsApp) é E5. Mas o **campo onde o contador vive** (ex.: `convite_tentativas int default 0` + eventual `convite_bloqueado_em`) é estrutura de dados que casa com a migration do número de convite (M-B). Se M-B não previr a coluna, o E5 terá de abrir nova migration só para isso, ou pior, o contador fica sem lugar. **Correção:** incluir em M-B (passo 2) a coluna de tentativas (sem a lógica), anotando que o efeito de bloqueio é E5. Isso mantém a fronteira (E2 entrega estrutura + número, E5 consome) sem deixar buraco.

**G-C2 — H2.5 último critério: "quantidade de edições/reedições por plano" não tem onde ser contada.**
O plano remete a alavanca a E11 (§5) mas **não modela onde o número de edições do aviso é persistido**. Sem um contador (ex.: `edicoes_count` no aviso, ou derivado de `count(*)` em `eventos_aviso where tipo='editado'`), nem E2 nem E11 conseguem aplicar o teto. A derivação por contagem de eventos é viável e alinhada à auditoria append-only, mas precisa estar **explícita no plano** (e o `editarAviso` precisa checar esse teto no servidor, espelhando H2.3). **Correção:** decidir e registrar a fonte do contador (recomendo `count` sobre `eventos_aviso` tipo `editado`/`edicao_recusada`), e adicionar a checagem de teto no passo 9 (editar). Hoje o passo 9 não menciona limite de edições.

**G-C3 — Evento de cancelamento: `cancelado_cobrador` é específico de papel e não cobre o invertido nem o vocabulário-alvo.**
O código existente grava `inserirEvento(..., 'cancelado_cobrador', aviso.criador_papel)` (service.ts:125) e o enum `tipo_evento` (0001) só tem `cancelado_cobrador`. No fluxo **receber** o criador é cobrador (ok), mas o épico e o _CONTEXTO tratam os dois fluxos com a mesma maquinaria, e E3 (espelho) reusa isto. O plano não menciona renomear/generalizar o tipo de evento para algo neutro de papel (ex.: `cancelado` pelo ator). Como E9 "linha do tempo de eventos" depende do ator gravado corretamente, manter `cancelado_cobrador` quando o cancelador pode ser devedor é incoerente. **Correção:** o passo 11 (cancelar) deve tratar o tipo de evento (manter `cancelado_cobrador` só quando faz sentido, ou introduzir tipo neutro), e o plano deve dizer qual. Mesma observação para os novos tipos: o plano propõe `editado`, `pausado`, etc. (neutros, bom) — só falta fechar o caso do cancelamento legado.

### Médios

**G-M1 — `pendente→programado`: o plano deixa o rename ambíguo (ora "renomear", ora usa `pendente`).**
O _CONTEXTO (§Máquina de estados) é enfático: "A varredura `pendente→programado` toca trigger + app + PROJETO.md/CLAUDE.md" e é espinha cross-épico. O plano ora fala em `pendente↔pausado` (passo 1), ora "ao renomear `pendente→programado`" (§2 H2.3) sem cravar **se o rename acontece neste épico**. Misturar `pendente` e `programado` na mesma migration de estados é receita de bug. **Correção:** decidir explicitamente — ou (a) este épico já faz o rename `pendente→programado` (mais limpo, alinhado ao alvo) e todas as novas transições usam `programado`; ou (b) o rename fica para um épico-âncora da máquina de estados e E2 usa `pendente` por ora, anotando a dívida. Hoje o plano não escolhe, e o passo 1 usa `pendente` enquanto o resto fala de `programado`. **Recomendo (a)** e que isso seja dito no passo 1 com o aviso de `ALTER TYPE ... RENAME VALUE` (que, ao contrário de ADD VALUE, roda em transação).

**G-M2 — H2.1: dependência de E7 (H7.3) para titular/banco não está na lista de dependências.**
A história H2.1 diz que titular + banco "compõem a 2ª mensagem enviada ao devedor quando ele pede o Pix (Épico 7 H7.3)". O plano coleta/persiste os campos (bom) mas a seção §5 (Dependências) **não cita E7**. É dependência de consumo (E7 lê o que E2 grava), então E2 deve garantir que o **contrato/coluna** combine com o que E7 espera. **Correção:** adicionar nota em §5 de que titular/banco são consumidos por E7 H7.3 (a forma de armazenamento — decisão em aberto §7.2 — precisa ser compatível com a leitura do E7).

**G-M3 — H2.5: "reativar nas condições anteriores" vs "desfazer" deixado como decisão em aberto, mas a história já define o comportamento.**
A decisão em aberto §7.6 pergunta se "reativar anterior" = "desfazer". Pela história (H2.5), na **recusa** do devedor o cobrador escolhe "reativar nas condições anteriores OU reeditar". "Reativar nas condições anteriores" = restaurar snapshot e voltar ao ciclo (= efeito de desfazer, mas partindo de `aguardando_aprovacao_aviso_editado` após recusa, não de desistência do cobrador). É legítimo perguntar ao humano se compartilham implementação, mas o **comportamento esperado já está na história** e o plano não deveria deixar dúvida sobre o resultado (volta às condições anteriores, ciclo retomado, evento gravado). **Correção:** tratar §7.6 como "confirmar reuso de código", não como "comportamento indefinido"; o caminho de recusa→reativar-anterior já tem critério de aceite.

**G-M4 — H2.5: mensagem ao devedor "houve alteração a aprovar E que os lembretes estão pausados" — o plano só cita o template, não garante os dois conteúdos.**
A migration M-E lista `aviso.edicao_a_aprovar`, mas a história exige que a mensagem diga **as duas coisas** (há alteração a aprovar + lembretes pausados até decidir). É detalhe de copy, mas como o épico é explícito, vale o lembrete no passo 5/9. **Correção:** anotar no template o conteúdo obrigatório (alteração + pausa), respeitando linguagem/gênero neutro.

**G-M5 — Reconferência no disparo: o plano cobre `pausado`/reaprovação, mas não cita o caso de o aviso ter sido EDITADO antes do aceite (livre) entre claim e envio.**
Como em `aguardando_aceite` não há `envios` (H2.4, correto), o risco real é só pós-aceite, que o plano cobre. Sem gap aqui — registro só para confirmar que a análise foi feita. (Não-gap.)

### Baixos

**G-B1 — H2.2 fallback "sem número": deferido a E5 (ok), mas a mensagem pré-preenchida do wa.me é o que GARANTE o número no texto — e isso é deste épico.**
O plano monta o wa.me com *"Oi, aqui é [nome], meu convite é o xxx-xxx"* (passo 14, bom). Vale anotar que a robustez do fallback de E5 depende de E2 não deixar o número fora do texto. Sem ação extra; coerência ok.

**G-B2 — H2.3: contar `informado_pago` como ativo não está no filtro proposto.**
O plano diz que `pausado` e `aguardando_aprovacao_aviso_editado` passam a contar como ativos (correto), mas o filtro atual `('aguardando_aceite','pendente')` **já omite `informado_pago`**, que é não-terminal e deveria contar (lembretes continuam). É borda de E8, mas o filtro de `contarAtivos` é tocado aqui. **Correção:** ao reescrever `contarAtivos` (passo 8), incluir `informado_pago` (e `programado`) além dos novos estados de pausa, deixando claro que só os terminais (`pago`,`cancelado`,`expirado`,`recusado`) não contam.

**G-B3 — Decisão em aberto §7.4 (transporte da notificação ao devedor) é citada como "bloqueia §3.2/§3.3" — boa sinalização, mas o plano deveria recomendar um default.**
Não inventar é correto, mas o _CONTEXTO pede que o plano "sinalize" decisões; aqui há risco de paralisia. Recomendação leve: indicar que reusar `notificacoes_cobrador` generalizado (ou fila `notificacoes_devedor` espelhada) é o caminho que herda o espaçamento/coalescing de E10 (H10.9), evitando uma terceira maquinaria. Mantém a decisão com o humano mas reduz superfície.

---

## 3. Cobertura dos critérios de aceite

Todos os critérios têm passo correspondente, com as ressalvas acima. Mapa:

| Critério | Coberto? | Onde / observação |
|---|---|---|
| H2.1 dados + Pix obrigatório | ✅ | passos 3, 6, 13 |
| H2.1 titular + banco | ✅ (com G-M2) | passos 3, 6, 13; dependência E7 não listada |
| H2.1 nome cobrador do perfil | ✅ | já existe |
| H2.1 centavos / fuso / valor>0 / nasce aguardando_aceite | ✅ | passos 3, 7 |
| H2.2 gera número 6 dígitos | ✅ | passos 6, 7 |
| H2.2 exibição xxx-xxx / aceita corrido ou hífen | ✅ | passos 6 (util), 14 |
| H2.2 só hash armazenado | ✅ | passo 7, §3.5 |
| H2.2 unicidade por telefone | ✅ | passos 2, 7, 16 (teste de corrida) |
| **H2.2 anti-brute-force 3 tentativas (armazenamento)** | ⚠️ **parcial** | **G-C1** — só anotado p/ E5; falta a coluna em M-B |
| H2.2 mensagem completa + link wa.me Whaviso | ✅ | passos 7, 14 |
| H2.2 forma fácil de copiar a mensagem inteira | ✅ | passo 14 |
| H2.3 free não cria | ✅ (depende E11) | passos 8, 13; decisão §7.5 |
| H2.3 teto pessoal / na API / terminal não conta | ✅ (com G-B2) | passo 8 |
| H2.4 nada antes do aceite | ✅ | já é assim; teste passo 16 |
| H2.5 editar em qualquer fase viva | ✅ | passo 9 |
| H2.5 antes do aceite = direto | ✅ | passo 9 |
| H2.5 depois do aceite = ConfirmDialog + aguardando_aprovacao + pausa | ✅ | passos 1, 9, 15 |
| H2.5 devedor é avisado (alteração + pausa) | ✅ (com G-M4) | passos 5, 9 |
| H2.5 desfazer edição | ✅ | passos 4, 9 |
| H2.5 aprovar / recusar pelo devedor | ✅ | passo 9 (estado aqui; gatilho E5) |
| H2.5 recusa → reativar-anterior OU reeditar | ✅ (com G-M3) | passo 9; §7.6 |
| **H2.5 qtd de edições por plano** | ⚠️ **parcial** | **G-C2** — remetido a E11 sem modelar contador/checagem |
| H2.5 tudo vira evento de auditoria | ✅ | passos 1 (tipos), 9 |
| H2.6 cancelar em qualquer fase viva | ✅ | passo 11 (amplia `cancelavel`) |
| H2.6 notificar devedor se aceito | ✅ | passo 11 |
| H2.6 cancelado terminal / sem DELETE / evento | ✅ (com G-C3) | passo 11; nomenclatura do evento a fechar |
| H2.7 pausado só de aceito | ✅ | passos 1, 10 |
| H2.7 notificar ao pausar / reativar | ✅ | passos 5, 10 |
| H2.7 pausado não envia / não terminal / eventos | ✅ | passos 10, 12 |

Nenhum critério ficou **totalmente** descoberto; os dois `⚠️` (H2.2 tentativas, H2.5 limite de edições) são parciais e viram G-C1/G-C2.

---

## 4. Testes nos pontos críticos

Pontos críticos do _CONTEXTO e específicos do épico, e se há teste dedicado no plano (§3.6 / passo 16):

- ✅ **Unicidade do número por telefone sob concorrência** — teste de colisão/corrida previsto (forçar mesma seed, 2º INSERT regenera). Bom. Reforçar: testar também que **telefones diferentes podem ter o mesmo número** (o índice é por par telefone+hash).
- ✅ **Sub-ciclo de edição** (editar→aguardando→aprovar/recusar/desfazer) — cada caminho previsto, incl. transições inválidas barradas pelo trigger.
- ✅ **Reconferência de estado no disparo** (pausado/reaprovação descartam envio entre claim e envio) — previsto, modelo opus.
- ✅ **Limite de plano sem janela de corrida** (dois POST simultâneos no teto) — previsto.
- ✅ **Idempotência de cancelar** (não duplica notificação) — previsto.
- ⚠️ **Teste do contador de edições por plano** (G-C2) — **ausente**; adicionar quando o contador for modelado.
- ⚠️ **Teste de que `informado_pago` conta como ativo** (G-B2) — não listado; o plano só testa `pausado`/reaprovação contando.
- ➖ Anti-brute-force (3 tentativas) — corretamente fora (E5), mas se a coluna entrar em M-B (G-C1), um teste mínimo de default/persistência aqui é barato.

---

## 5. Coerência cross-épico

- **E1 (auth):** ✅ identidade do cobrador, free read-only. Coerente.
- **E11 (planos):** ✅ catálogo `free` confirmado ausente no código (0007 só `pessoal|profissional`; `personalizado` em 0019). A dependência está corretamente sinalizada. **Atenção (G-C2):** a alavanca "qtd de edições" também é E11 e está sub-modelada.
- **E12 (templates):** ✅ novos templates por chave via migration UPSERT (padrão 0022–0024). Coerente; bom não criar template de convite agora (segue sendo wa.me).
- **E13 (linguagem):** ✅ §3.5 cobre sem-travessão, sem-palavra-proibida, gênero neutro, hash, não logar telefone/Pix/titular/banco/número. Coerente.
- **E5:** ✅ entrega número + unicidade + decisão "dado incorreto = edição-livre"; consumo (validação/anti-brute-force/recusa) fica em E5. **Ajuste (G-C1):** a coluna de tentativas deve nascer aqui.
- **E6/E10:** ✅ pausa/reaprovação exigem que o scheduler reconfira estado (previsto); §7.4 sinaliza a decisão de fila que define se herda coalescing de E10. **Sem contradição**, mas ver G-B3.
- **E7:** ⚠️ **não listado** em §5 e é consumidor de titular/banco (G-M2). Acrescentar.
- **E9:** ✅ implícito (eventos com ator). **Atenção (G-C3):** ator/tipo do evento de cancelamento precisa ficar correto para a linha do tempo.
- **Máquina de estados (espinha):** ⚠️ ambiguidade `pendente↔programado` (G-M1) é o ponto cross-épico mais delicado. Resolver antes de codar o passo 1.

Nenhuma **contradição** com outros épicos; os ajustes são de completude/explicitação.

---

## 6. Aderência às invariantes do Épico 13

- ✅ Sem travessão / palavras proibidas: §3.5 e M-E exigem validar templates contra `linguagem.ts`. (Conferi: o próprio plano não usa travessão.)
- ✅ Gênero neutro: §3.5 e M-E. Reforçar nos textos de pausa/cancelamento (G-M4).
- ✅ Centavos / fuso America/Sao_Paulo (banco UTC): mantido (já no código; H2.1 confirma).
- ✅ Hash sha256 do número; claro só na resposta de criação, nunca persiste/loga.
- ✅ Sem DELETE de negócio: edições/pausas/cancelamento são estado + evento append-only; snapshot recomendado como tabela `avisos_edicoes` append-only (§7.3) — alinhado.
- ✅ Envelope `{ error: { code, message } }` via helpers existentes.
- ⚠️ **Botão do WhatsApp leva `aviso_id` no payload (não o número):** o plano afirma manter (§3.5), correto — mas isso é o **botão de aceite** (E5). O **link wa.me de convite** (H2.2) leva o **número de convite em texto pré-preenchido**, não no payload de webhook. São coisas distintas; o plano não confunde, mas vale deixar explícito que "número no texto wa.me" ≠ "payload de botão", para o revisor de E5 não tropeçar.

---

## 7. Recomendação de modelo por passo

Sensata no geral: **opus** para máquina de estados (1), unicidade/corrida (2, 7), limite sem corrida (8), sub-ciclo de edição (9), pausar/reativar (10), cancelar+notificar (11), reconferência no disparo (12), contratos do casamento api↔front↔E5 (6) e testes de corrida (16); **sonnet** para migrations mecânicas (3, 4, 5), formulários/UI (13, 14, 15) e docs (17).

Ressalvas:
- **Passo 4 (snapshot de edição) como sonnet:** se a decisão §7.3 for tabela `avisos_edicoes` append-only com restauração de snapshot, a parte de **restaurar** vive no service (passo 9, opus) — ok. Mas se o snapshot virar jsonb com regras de quais campos restaurar, há risco sutil; manter sonnet só se for "adicionar coluna/tabela", como o plano diz. Aceitável.
- **Passo 5 (templates) sonnet:** ok, mas a copy de pausa/cancelamento/edição tem armadilha de linguagem (G-M4, gênero neutro, sem palavra proibida) — sonnet serve, desde que a validação contra `linguagem.ts` (E13) seja parte do critério.

---

## Resumo executivo

- **Veredito:** aprovado com ressalvas.
- **Gaps críticos:** (G-C1) coluna de tentativas do convite deve nascer na M-B, não só em E5; (G-C2) contador/checagem de limite de edições por plano não modelado (H2.5 + E11); (G-C3) tipo/ator do evento de cancelamento (`cancelado_cobrador`) não tratado para o cenário multi-papel.
- **Critérios não cobertos integralmente:** H2.2 anti-brute-force (armazenamento) e H2.5 limite de edições por plano — ambos parciais.
- **Testes críticos:** unicidade sob corrida, sub-ciclo de edição, reconferência no disparo e limite sem corrida estão cobertos; faltam testes do contador de edições (G-C2) e de `informado_pago` contar como ativo (G-B2).
- **Coerência cross-épico:** sem contradições; ajustar a ambiguidade `pendente→programado` (G-M1) e adicionar E7 às dependências (G-M2).
