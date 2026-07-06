# Relatório de validação (caça-gaps): Épico 03 — Criar combinado (pagar invertido)

> Fonte da verdade: `historias/03-criar-combinado-pagar.md`. Plano avaliado: `historias/planos/03-criar-pagar-invertido.plano.md`.
> Afirmações do plano sobre o código foram conferidas direto nos fontes (`payloads.ts`, `enums.ts`, `avisos/service.ts`, `aceite/service.ts`, `webhook_whatsapp/repo.ts`). O CLI graphify não está no PATH desta máquina; usei leitura direta como o próprio plano fez.

## 1. Veredito

**Aprovado com ressalvas.**

O plano é forte: cobre todos os 5 critérios-mãe (H3.1 a H3.5), acerta o diagnóstico do estado atual do código (verifiquei cada `[x]/[~]/[!]/[+]`), separa bem o que é compartilhado com o E2, sinaliza honestamente as decisões em aberto (D1 a D5) em vez de inventar, e marca corretamente os pontos críticos para teste. As ressalvas abaixo são gaps reais, mas nenhum invalida a estrutura do plano: são detalhes de critério de aceite que faltam virar passo explícito, e um par de armadilhas de invariante/segurança que o plano não nomeou.

Confirmação das afirmações de código do plano (todas corretas):
- `pix_chave` é `nullish` em `criarAvisoBody` (`payloads.ts:41`) e `aceitarBody.pix_chave` existe (`payloads.ts:87`). [confere]
- Cobrador grava o Pix no aceite (`aceite/service.ts:63`), Pix só visível no invertido (`service.ts:22`). [confere]
- Recusa vai para `cancelado` com evento `recusado` (`webhook_whatsapp/repo.ts:56-60`). [confere]
- `statusAviso` NÃO tem `recusado`/`pausado`/`aguardando_aprovacao_aviso_editado` (`enums.ts:11-18`); `tipoEvento` JÁ tem `recusado` (`enums.ts:50`). [confere — o plano acerta ao dizer que `recusado` "já existe" só como evento, e o estado precisa ser criado]
- `criarAviso` grava `pix_chave: body.pix_chave ?? null` para ambos os fluxos (`avisos/service.ts:65`), `criador_papel`/`cobrador_id`/telefone do criador como descritos. [confere]
- `cancelarAviso` cobre só `aguardando_aceite`/`pendente` (`service.ts:120`). [confere]

---

## 2. Gaps por severidade

### Críticos

**C1 — H3.1: o cobrador "valida/ajusta o NOME DO TITULAR e o BANCO da chave" ao confirmar (não só titular/banco abstratos). O fluxo de confirmação desse ajuste pelo cobrador não tem passo de fim a fim, só a coluna.**
O plano cria as colunas `pix_titular`/`pix_banco` (passo 3) e diz que o aceite "opcionalmente ajusta" (passo 6), mas H3.1 é explícita: esses dados são **usados na resposta de Pix ao devedor (E7 H7.3)** e o cobrador os **valida/ajusta no aceite**. Hoje o `aceitarBody` está sendo refatorado para `pix_incorreto: boolean` (passo 6/§3.2), mas não há campo no contrato de aceite para o cobrador **informar** titular/banco. Resultado: as colunas existiriam vazias e o critério de E7 H7.3 ficaria sem fonte de dados.
*Correção:* incluir no novo `aceitarBody` os campos `pix_titular`/`pix_banco` (opcionais) que o cobrador preenche/confirma ao aceitar, e um passo de UI no Aceite.tsx (§3.4) para coletá-los. Caso contrário, declarar explicitamente que titular/banco são deferidos a E7 e não pertencem a este épico (a história os coloca em H3.1, então deferir precisa ser uma decisão consciente, não silêncio).

**C2 — H3.3 + invariante E13: a recusa por botão do WhatsApp e o opt-out grava `cancelado` na MESMA tabela, mas o opt-out (`webhook_whatsapp/repo.ts:121`) também usa `cancelado`. Ao introduzir `recusado`, o plano só toca o ramo `recusa`; não verifica que outros ramos que escrevem `cancelado` (opt-out, `ver_pix` não, mas opt-out sim) continuem corretos, nem reconcilia o evento `cancelado_cobrador` (`avisos/service.ts:125`) que é gravado mesmo quando o criador é o devedor (invertido).**
No invertido, cancelar grava evento `cancelado_cobrador` com ator = `criador_papel` (= `devedor`), o que é semanticamente errado (o nome diz "cobrador" mas o ator é devedor). H3.5 pede auditoria correta. O plano lista eventos novos (`editado_criador`, etc.) mas não corrige o `cancelado_cobrador` herdado para o invertido.
*Correção:* renomear/parametrizar o evento de cancelamento (ex.: `cancelado_criador`) ou documentar que o ator no payload já distingue; e garantir no passo 1/8 que a transição para `recusado` não colida com a transição para `cancelado` do opt-out (ambos saem de estados diferentes, mas a migration da máquina de estados precisa contemplar os dois explicitamente).

### Médios

**M1 — H3.2: o critério "fallback sem número" e "validação confrontando número + telefone do COBRADOR" são listados como `[+]` e jogados inteiros para o E5, mas H3.2 também exige a UNICIDADE por `telefone_cobrador` que é dado deste épico (o invertido).** O plano cita isso (§3.1 item 8, "citar como dependência"), mas não há passo que garanta, neste épico, que a futura constraint de unicidade do número de convite seja **por telefone do cobrador** (e não por telefone do devedor, como seria no E2). É a única especialização real da H3.2 para o invertido e está só como nota, sem passo numerado nem teste.
*Correção:* adicionar passo/teste explícito (ainda que dependente de E5) afirmando: no invertido, a chave de unicidade e o confronto de validação usam `telefone_cobrador`. Sem isso, há risco de E5 implementar só a variante `telefone_devedor`.

**M2 — H3.2: a mensagem pré-preenchida "Oi, aqui é [nome do devedor], meu convite é o xxx-xxx" é redigida do ponto de vista do DEVEDOR enviando ao COBRADOR.** O plano (§3.4 AvisoCriado e estado §2 H3.2) trata a mensagem como genérica "mensagem completa". No invertido o texto inicial vai na voz do devedor (criador) e leva ao WhatsApp do Whaviso para o cobrador. O plano não explicita que o template/cópia desta mensagem é específico do invertido (no E2 a voz é do cobrador). É copy nova → invariante E13 (gênero neutro, sem palavra proibida) aplica, mas o plano não nomeia o template/chave nem o teste de linguagem desse texto específico.
*Correção:* nomear a chave de template do convite invertido (E5/E12) e incluir no passo de testes de linguagem (passo 15/§3.6) a verificação dessa copy específica.

**M3 — H3.3: "Em qualquer resposta, o devedor que convidou é notificado." cobre 3 respostas (Aceitar, Pix incorreto, Recusar). O plano enfileira notificação ao devedor em recusa e pix-incorreto (passos 7, 8, 9), mas NÃO no ACEITE.** A história diz "em qualquer resposta", o que inclui o aceite bem-sucedido (o devedor precisa saber que o cobrador confirmou e que os lembretes começarão). O plano só notifica o devedor nos ramos negativos. Hoje o aceite não notifica ninguém (`aceite/service.ts` não enfileira nada para o criador).
*Correção:* adicionar enfileiramento de notificação ao devedor também no aceite (e cobrir em teste). Se a intenção é que o início dos lembretes já sirva de aviso, deixar explícito; mas "em qualquer resposta" inclui o caso feliz.

**M4 — H3.5: reaprovação do aviso editado "é feita pelo COBRADOR (quem confirmou)" — no invertido o reaprovador é o cobrador convidado, que pode NÃO TER CONTA (`cobrador_id` null).** O plano cria o estado `aguardando_aprovacao_aviso_editado` e notifica o cobrador (passo 10), mas não detalha COMO o cobrador sem conta reaprova (seria por botão no WhatsApp, território E5) nem garante que a notificação de edição chegue por `telefone_cobrador` quando não há conta. O plano cita o problema de "cobrador sem conta" para outbox, mas não o conecta ao caminho de reaprovação da edição.
*Correção:* deixar explícito que a reaprovação do editado pelo cobrador sem conta depende do canal WhatsApp (E5) + roteamento por telefone (E10), e que sem isso o estado `aguardando_aprovacao_aviso_editado` no invertido fica preso (lembretes pausados indefinidamente). É um risco de deadlock funcional que merece nota em §6.

**M5 — H3.4: "free não cria (só visualiza)" está marcado `[~]` e deferido a E11, mas o plano não inclui um passo/teste que GARANTA o comportamento neste épico (mesmo que via stub).** O critério é parte de H3.4. Deferir 100% a E11 deixa H3.4 parcialmente sem cobertura própria. O plano deveria ao menos prever o ponto de checagem (limite 0 ⇒ bloqueio) e um teste que vire verde quando E11 entregar o catálogo.
*Correção:* adicionar teste pendente/marcado para "plano free não cria invertido" amarrado a H3.4, ou afirmar explicitamente que H3.4 só fecha quando E11 entregar (e listar como dependência bloqueante, não apenas "defere").

### Baixos

**B1 — H3.3 evento `pix_incorreto`:** o plano adiciona o tipo em `tipo_evento` (passo 2) e como ação de botão. Bom. Mas `pix_incorreto` não está em `acaoBotaoTemplate` (`enums.ts:65`) nem em `AcaoBotao` (`repo.ts:5`) — o plano cita ambos em §3.3, ok. Só falta citar o enum `acaoBotaoTemplate` do shared (templates) além do `AcaoBotao` do zap, senão o template do botão não reconhece a ação. Detalhe de completude.

**B2 — Segurança/idempotência:** o plano cobre idempotência do webhook (re-tap), `for update`, 404 genérico no aceite, Pix nunca logado, validação no servidor. Bom. Falta nomear explicitamente a **idempotência da notificação ao devedor** quando a MESMA resposta chega duas vezes pela página pública E pelo WhatsApp (dois canais para a mesma ação): o plano fala de coalescing E10 para par recusa/pix-incorreto, mas não do mesmo sinal por dois canais. Cobrir em teste do passo 9.

**B3 — Invariante centavos/fuso:** plano respeita (valor centavos, data SP/UTC) — sem gap. Sem travessão no plano — verifiquei, ok. Gênero neutro nas copys novas — citado em §3.6, ok.

---

## 3. Cobertura dos critérios de aceite

| Critério | Coberto? | Observação |
|---|---|---|
| H3.1 nome/motivo/valor/data/telefone cobrador | Sim (passo 5) | |
| H3.1 nome devedor pré-preenchido | Sim (estado `[x]`) | |
| H3.1 Pix obrigatório no invertido | Sim (passos 4, 5, 12) | |
| H3.1 titular + banco validados pelo cobrador | **Parcial — C1** | coluna sim, fluxo de coleta não |
| H3.1 criador_papel/cobrador_id null/denormalizado | Sim (`[x]`) | |
| H3.1 centavos / fuso / validação / `aguardando_aceite` / linguagem | Sim | |
| H3.2 mecânica da H2.2 ao cobrador | Sim (defere E5) | |
| H3.2 número 6 dígitos hash / unicidade por tel. cobrador | **Parcial — M1** | unicidade por `telefone_cobrador` só como nota |
| H3.2 anti-brute-force 3 tentativas | Defere E5 | aceitável |
| H3.2 mensagem completa + link wa.me (voz do devedor) | **Parcial — M2** | copy específica não nomeada |
| H3.2 validação número+telefone / fallback sem número | Defere E5 | aceitável |
| H3.2 copiar/compartilhar | Sim (`[x]`) | |
| H3.3 convite mostra dados + Pix | Sim | |
| H3.3 botão Aceitar | Sim (passos 6, 13) | |
| H3.3 botão Chave Pix incorreta | Sim (passo 7) | |
| H3.3 botão Recusar → `recusado` terminal | Sim (passos 1, 8) | |
| H3.3 devedor notificado em QUALQUER resposta | **Parcial — M3** | aceite não notifica |
| H3.3 vínculo profile/telefone + CTA conta | Sim (`[x]`) | |
| H3.3 nenhum lembrete antes do aceite | Sim (`[x]`) | |
| H3.4 mesma regra H2.3 / checagem na API | Sim (passo 15 testes) | |
| H3.4 terminais não contam | Sim (`[x]`) | |
| H3.4 limite por criador independente do papel | Sim (`[x]`) | |
| H3.4 free não cria | **Parcial — M5** | deferido a E11 sem teste-âncora |
| H3.5 editar/cancelar/pausar como H2.5/6/7 c/ papéis trocados | Sim (passos 10, 11) | |
| H3.5 editar pós-aceite → `aguardando_aprovacao_aviso_editado`, reaprova cobrador | **Parcial — M4** | cobrador sem conta não detalhado |
| H3.5 cancelar em qualquer fase viva, notifica cobrador, terminal | Sim (passo 11 amplia `cancelavel`) | ver C2 (evento) |
| H3.5 pausar/reativar só de aceito, devedor é alvo, notifica cobrador | Sim (passo 11) | |
| H3.5 tudo como evento append-only | Sim (passo 2) | |

Critérios sem nenhum passo: **nenhum** (todos têm ao menos passo parcial ou deferimento explícito). Os parciais estão em C1, M1, M2, M3, M4, M5.

---

## 4. Testes para pontos críticos

| Ponto crítico | Teste no plano? | Observação |
|---|---|---|
| Transição terminal `recusado` (trigger + app + webhook) | Sim (§3.6, passo 15, §6) | bom |
| Idempotência de webhook (re-tap Aceitar/Recusar/Pix incorreto) | Sim | bom |
| Pausa de lembretes na edição (corrida disparo×edição) | Sim (§6) | bom |
| Notificação ao devedor sem duplicidade | Parcial — B2 | falta o caso "mesmo sinal por 2 canais" |
| Validação de limite sem corrida (criar 2 invertidos em paralelo no limite) | Sim (§6) | bom |
| Cobrador sem conta (guard na outbox) | Sim (§6) | bom |
| Fallback de resposta numerada (resiliência do canal) | Sim (§6, defere E5/E6) | bom |

Os pontos críticos do `_CONTEXTO` relevantes a este épico (idempotência, limite sem corrida, reconferência de estado no disparo, terminal não envia) estão cobertos. O coalescing/fila 10min de E10 H10.9 é corretamente referido como dependência, não reimplementado aqui.

---

## 5. Coerência cross-épico

- Dependências (E1, E11, E13, E2, E5, E6, E8/E10, máquina de estados) listadas e corretas. O épico se declara espelho do E2 e marca passos 1, 2, 10, 11 como "implementar uma vez" — coerente com a orientação do `_CONTEXTO` (E2/E3 compartilham a máquina de estados).
- **Atrito com o `_CONTEXTO` (sinalizado, não resolvido):** o `_CONTEXTO` já decidiu o rename `pendente→programado` e usa `programado↔pausado`/`programado↔aguardando_aprovacao_aviso_editado` como transições-alvo. O plano mantém `pendente` e levanta D1 (fazer agora vs adiar). Isso é correto (não inventar), MAS cria risco: se o E2 fizer o rename e este épico assumir `pendente`, os dois planos divergem no nome do estado. Recomendo que D1 seja resolvida ANTES de iniciar os passos 1/2 (são compartilhados) para não ter retrabalho. É a maior fonte de incoerência cross-épico latente.
- O `_CONTEXTO` lista a transição-alvo como `aguardando_aceite→recusado` (e não inclui `aguardando_aceite→cancelado` para a recusa). O plano passo 1 escreve `aguardando_aceite → {pendente, cancelado, expirado, recusado}` — mantém `cancelado` como saída (necessário p/ o cancelamento pelo criador antes do aceite, que é legítimo). Coerente, sem contradição.
- E10: o plano não reimplementa a outbox; cria a dúvida D3 (notificar o devedor/criador) e coordena com E10. Coerente. Risco: se E10 modelar só `notificacoes_cobrador`, faltará canal para notificar o **devedor** (M3 depende disso). Deve ficar como dependência bloqueante de H3.3.

Sem contradição direta com outros épicos. A única incoerência latente é o rename `pendente→programado` (D1).

---

## 6. Aderência às invariantes do Épico 13

- **Sem travessão:** o plano não usa em-dash; usa vírgula/dois-pontos/parênteses. OK.
- **Sem palavras proibidas:** vocabulário do plano usa aviso/lembrete/combinado; aponta corretamente a ressalva conhecida de `Landing.tsx` ("cobranças") como fora de escopo (E13). OK.
- **Gênero neutro:** citado para copys novas (§3.6). OK, mas M2 pede cobrir a copy específica do convite invertido.
- **Centavos / fuso SP-UTC / cálculo no servidor:** respeitados (passos não movem cálculo p/ cliente). OK.
- **Hash do número de convite / nunca logar Pix/telefone:** plano reafirma (§3.5). OK.
- **Sem DELETE de negócio/auditoria:** `recusado`/`cancelado`/`pausado` são estados, nada some; eventos append-only. OK.
- **Estado terminal nunca mais envia:** plano cobre via reconferência no disparo e teste de `recusado` não receber lembrete. OK.
- **Opt-out visível em toda mensagem:** não é foco deste épico (mensagens são E6); não regride. OK.

Aderência boa. Nenhuma violação de invariante; as ressalvas de linguagem (M2) e auditoria (C2, evento `cancelado_cobrador` no invertido) são de correção, não de violação direta.

---

## Resumo das ações recomendadas (ordenadas)

1. (C1) Adicionar `pix_titular`/`pix_banco` ao novo `aceitarBody` + coleta no Aceite.tsx, OU deferir explicitamente a E7 com decisão registrada.
2. (C2) Corrigir o evento de cancelamento no invertido (`cancelado_cobrador` → `cancelado_criador` ou ator parametrizado) e garantir que `recusado` e `cancelado` coexistam na migration da máquina de estados.
3. (M3) Notificar o devedor também no ACEITE (a história diz "em qualquer resposta").
4. (M4) Documentar o caminho de reaprovação da edição pelo cobrador SEM conta (risco de deadlock; depende E5/E10) em §6.
5. (M1) Passo/teste explícito: unicidade e validação do número de convite por `telefone_cobrador` no invertido.
6. (M5) Teste-âncora para "free não cria invertido" amarrado a H3.4 (mesmo pendente de E11).
7. (M2) Nomear a chave de template da copy do convite invertido e cobri-la no teste de linguagem.
8. (D1) Resolver o rename `pendente→programado` antes dos passos compartilhados 1/2.
