# Relatório de validação: Épico 05 — Convite & Aceite pelo WhatsApp

> Fonte da verdade: `historias/05-convite-aceite.md`. Plano avaliado: `historias/planos/05-convite-aceite.plano.md`.
> Revisão adversarial (caça-gaps). Afirmações do plano sobre o código foram conferidas contra `backend/apps/zap/src/modules/webhook_whatsapp/{repo,service}.ts`, `backend/apps/api/src/modules/avisos/{service,repo}.ts`, migrations `0011`/`0017`.

## 1. Veredito

**Aprovado com ressalvas.** O plano é abrangente, cobre os 9 critérios H5.x, acerta o estado atual do código (recusa→cancelado em `repo.ts:56`, aceite→pendente sem vínculo de profile, guarda de terminal que retorna `aplicado:false` sem responder, `validar_transicao_aviso` em `0011`), e identifica bem os pontos críticos (corrida no anti-brute-force, privacidade em H5.8, idempotência). Mas há **gaps médios** que precisam de correção antes de codar, principalmente em torno de: contagem de tentativas em estado terminal/expirado, idempotência da regeneração de número, vínculo de profile no aceite, e duas afirmações imprecisas no §2.

---

## 2. Gaps por severidade

### Críticos

Nenhum gap que invalide o plano. Os pontos abaixo são corrigíveis no detalhamento de cada passo.

### Médios

**G1 (H5.1 / H5.7 — contagem de tentativa quando o convite existe mas está terminal/expirado).**
O plano define três ramos em P5 (número inexistente conta; feliz; telefone divergente não conta) mas **não trata o ramo "o número bate num aviso que já não está `aguardando_aceite`"** (recusado/cancelado/pago/expirado, ou expirado por `convite_expira_em`). A localização em P5 busca `aguardando_aceite` por hash; se o convite caducou ou já foi respondido, o hash não casa com nenhum `aguardando_aceite` e cai no ramo "número inexistente" → **consome tentativa indevidamente** (H5.9 manda contar só "número que não bate com nenhum convite"). Pior: H5.7 exige resposta informativa específica ("convite expirado/já aceito"), que esse caminho não dá.
*Correção:* a busca de localização deve casar pelo hash **independente do status**, e só então ramificar: terminal/expirado → resposta informativa de H5.7 **sem contar tentativa**; `aguardando_aceite` → ramos felizes/divergente. O índice único parcial de M2 (`where status='aguardando_aceite'`) permite reuso do número após terminal, então o hash pode existir em mais de uma linha ao longo do tempo: a busca precisa de critério determinístico (ex.: o `aguardando_aceite` vence; se não houver, o mais recente terminal com aquele hash responde "já respondido/expirado").

**G2 (H5.6 / H5.3 — idempotência da regeneração de número e da conta no aceite sob toque/mensagem dupla).**
P6 garante `FOR UPDATE` na linha de `convite_tentativas` para a contagem, e P8 cita "não criar conta duplicada por toque duplo", mas o plano **não especifica a chave de idempotência** da criação de conta (H5.3/H1.4) nem trata a regeneração concorrente de forma completa: se duas mensagens com número errado chegam e ambas cruzam o 3º erro, a transação `FOR UPDATE` serializa a contagem, porém a **notificação ao criador para reenviar** (H5.9) pode ser enfileirada duas vezes se não houver coalescing/guarda. O §6 menciona "regeneração concorrente gera um único novo hash" como teste, mas o passo não diz **como** (ex.: só regenerar se `erros` cruzou exatamente o limiar dentro da mesma transação que zera o contador).
*Correção:* em P6, especificar que regeneração + reset do contador + enfileiramento da notificação ocorrem **na mesma transação** que detecta `erros >= 3`, e que o reset impede que a 4ª mensagem conte de novo. Em P8, definir a chave de idempotência da conta (telefone E.164 único em profiles; criar com `on conflict do nothing` ou checar existência sob a mesma transação do aceite).

**G3 (H5.3 — vínculo por profile com sessão ativa não tem caminho).**
O plano §2 marca `[x] Vínculo por telefone sem sessão` como correto e nota que o aceite por botão "não tem sessão, fica só pelo telefone". Verifiquei `repo.ts:64-67`: o aceite hoje **só** faz `update status/aceito_em`, **não grava nenhum `devedor_profile_id`** nem vínculo. A história H5.3 exige: "sem sessão, vinculado só pelo telefone; **com sessão ativa, vincula ao `profile.id`**". No canal WhatsApp (webhook da Meta) não há sessão de login no inbound, então o ramo "com sessão" **fica sem cobertura** e o plano não o reconhece como gap. Como o site sai (divergência), o único caminho com sessão desaparece.
*Correção:* o plano deve declarar explicitamente que, no aceite 100% WhatsApp, **não há sessão no inbound** → o vínculo é sempre por telefone, e a parte "com sessão vincula profile.id" de H5.3 passa a ser satisfeita pelo **backfill no signup por telefone** (gated por OTP, E1) e/ou pela conta-no-aceite de P8 (que cria/associa o profile pelo telefone). Sem isso, P8 deixa um critério de H5.3 sem dono.

**G4 (H5.9 — desbloqueio do telefone não cadastrado é decisão em aberto, mas o critério exige comportamento).**
O plano joga o desbloqueio para a decisão #2 (§7: api no `criarAviso` vs zap). Tudo bem deixar **quem** limpa em aberto, mas o passo precisa garantir que **algum** passo implementa a limpeza, senão o telefone bloqueado nunca recebe combinado novo (H5.9: "bloqueado até que um novo combinado seja enviado"). Hoje P3 (api `criarAviso`) e P6 (zap) ambos citam a limpeza condicionalmente ("ou… decidir"), o que pode resultar em ninguém implementar.
*Correção:* marcar a limpeza do bloqueio como critério de aceite obrigatório de P3 **ou** P6 (não condicional), mesmo que o local exato fique pendente da decisão #2.

**G5 (H5.4 — `dado_incorreto` mantém `aguardando_aceite`, mas o convite não pode caducar antes do reenvio).**
H5.4 diz que ao sinalizar "dado incorreto" o combinado continua em `aguardando_aceite` e o criador revisa/reenvia (edição livre, H2.5). O plano (P7) trata o evento e a notificação, mas **não trata a interação com a expiração de 7 dias (H5.7)**: se o `convite_expira_em` é fixo "a partir da criação" (M2/P3), um "dado incorreto" perto do dia 7 pode expirar o convite enquanto o criador ainda revisa, frustrando o reenvio. A edição em H2.5 é "livre, sem reaprovação", mas o épico não diz se reinicia o relógio de 7 dias.
*Correção:* sinalizar como decisão em aberto (ou definir): a edição/reenvio após "dado incorreto" **reinicia** `convite_expira_em` (e idealmente regenera o número, já que o anterior pode ter dados errados)? Recomendar reiniciar o prazo no reenvio. Cruza com E2/E3.

**G6 (H5.2 / H5.8 invertido — resumo com Pix e divergência no fluxo invertido).**
No invertido o convidado é o **cobrador** e o resumo inclui a **chave Pix** para ele conferir (H5.2). Em H5.8 (telefone divergente) a regra é "não revelar **Pix**" a quem não bate. O plano cobre H5.8 genericamente ("não revela valor/motivo/Pix"), mas **não destaca** que no invertido o alvo do convite é `telefone_cobrador` (não `telefone_devedor`): a checagem de "telefone bate" em P5 precisa comparar contra o **telefone-alvo correto por `criador_papel`** (já existe a lógica `telConvidado` em `repo.ts:47`, mas P5/P6 falam só em "telefone-alvo" sem amarrar à direção). Risco de comparar sempre contra `telefone_devedor` e quebrar o invertido.
*Correção:* P5 e P6 devem referenciar explicitamente o alvo por papel (receber→`telefone_devedor`, invertido→`telefone_cobrador`), reaproveitando o padrão de `aplicarAcaoBotao`.

**G7 (H5.9 — "número errado por telefone": escopo do contador entre múltiplos convites).**
H5.9/H5.1 contam "número que não bate com nenhum convite" por telefone. O plano modela `convite_tentativas` por telefone (correto), mas não define o que acontece com o contador no **caminho feliz**: H5.1 implica que acertar zera. O §3.3 ramo 2 diz "zerar contador" no feliz — bom — mas P6 não repete isso no critério, e o reset no caso de telefone divergente (H5.8 não conta) precisa ser explícito (não incrementa, não zera). Detalhe pequeno, mas é onde testes de borda falham.
*Correção:* enumerar no critério de P6 os três efeitos sobre o contador: feliz → zera; número inexistente → +1 (e checa limiar); divergente → inalterado.

### Baixos

**G8 RESOLVIDO (§2, HMAC do webhook).** O webhook HTTP da Meta com validação HMAC (`X-Hub-Signature-256`, `META_APP_SECRET`) já está implementado; o `aviso_id` no payload + o HMAC real do webhook satisfazem H5.6/H5.2 textualmente, sem necessidade de mitigação.

**G9 (P3 — `link_aceite` e teste de criação).** Os testes existentes (`avisos.test.ts:53,120`) assertam `link_aceite` no formato `/aceite/<token>`. P3 troca isso por `wa.me`, mas P11 não lista explicitamente a atualização desses testes de api — só "geração de número único / expiração". Adicionar à lista de P11/P3 para não deixar teste quebrado.

**G10 (P9 / H5.7 — sweep de expiração e estado-alvo).** P9 troca a coluna do sweep para `convite_expira_em`. Conferir que o sweep só expira quem está em `aguardando_aceite` (não pegar `pendente`/`programado` que têm outra lógica de prazo, E6). O plano cita "manter o sweep de pendente/programado por data (isso é E6)" — bom — mas explicitar a guarda de status no novo sweep evita expirar combinado já aceito.

**G11 (M5 / decisão #4 — `acao_token_hash`).** Bem sinalizado como decisão. Só reforçar: não dropar `aceite_token_hash`/`acao_token_hash` na mesma migration que cria o número (M2) se a remoção do site/E7 não entrou no mesmo PR, para não quebrar `repo.ts` da api que ainda insere essas colunas (`avisos/repo.ts:71,78`).

---

## 3. Cobertura dos critérios de aceite

Todos os 9 critérios H5.x têm passo. Mapeamento:

- **H5.1** → P3 (geração/número), P4 (texto inbound), P5 (parser/localização), P10 (wa.me). Coberto, com ressalva **G1** (ramo terminal/expirado conta tentativa indevida) e **G6** (alvo por papel).
- **H5.2** → P5 (resumo+botões). Coberto.
- **H5.3** → P7 (aceite→programado), P8 (conta+CTA+notifica). Coberto, com ressalva **G2** (idempotência da conta) e **G3** (vínculo profile com sessão sem dono).
- **H5.4** → P7 (`dado_incorreto`). Coberto, com ressalva **G5** (interação com expiração no reenvio).
- **H5.5** → P1 (estado `recusado`), P7 (recusa→recusado). Coberto.
- **H5.6** → P5/P7 (terminal/idempotência), P11 (testes). Coberto.
- **H5.7** → P2/P3 (7 dias fixo), P5 (resposta expirado/já aceito), P9 (sweep). Coberto, com ressalva **G1**.
- **H5.8** → P5 (divergente). Coberto, com ressalva **G6**.
- **H5.9** → P6 (contador/regeneração/bloqueio). Coberto, com ressalva **G4** (desbloqueio sem dono) e **G7** (efeitos no contador).

**Critérios sem passo dedicado (precisam de detalhamento, não estão "fora"):**
- H5.3 "com sessão ativa, vincula ao `profile.id`" — sem caminho no aceite WhatsApp (G3).
- H5.1/H5.7 resposta a convite terminal/expirado quando o número bate — fundido erroneamente no ramo "número inexistente" (G1).

---

## 4. Testes (pontos críticos)

Bem cobertos no §3.6 e §6: corrida no anti-brute-force (`FOR UPDATE`), regeneração concorrente, privacidade em H5.8, idempotência de toque duplo, número inexistente conta, divergente não conta, transição `recusado` aceita/saída rejeitada, colisão de número forçada.

**Faltam testes dedicados para:**
- **G1:** número que bate num aviso terminal/expirado **não** conta tentativa e responde informativo (não está na lista de integração de P11).
- **G2:** toque/mensagem dupla no aceite **não cria duas contas** (P8 cita o risco; P11 não lista o teste de re-tap sobre criação de conta especificamente).
- **G5:** "dado incorreto" perto da expiração / reenvio reinicia (ou não) o prazo.
- **G6 invertido:** divergência de telefone no fluxo invertido (alvo `telefone_cobrador`) não vaza Pix ao cobrador errado.

---

## 5. Coerência cross-épico

Dependências corretas e bem amarradas (E1 conta-no-aceite, E12 templates/rótulos via migration de catálogo, E10 enfileiramento, E6 ciclo, E7 `acao_token_hash`). Sem contradição com a máquina de estados do `_CONTEXTO` (cria `recusado` e a transição `aguardando_aceite→recusado`, não duplica a renomeação global `pendente→programado` — coerente com §"máquina de estados").

**Pontos de atenção:**
- A nota de P7 ("usa `pendente` e deixa TODO para a renomeação") é coerente, mas o plano deve garantir que P1 **não** introduza `programado` no trigger antes da varredura global, senão `aplicarAcaoBotao` (que escreve `pendente`) vira transição inválida. O plano já trata isso, só vale reforçar a ordem.
- E10/criador no invertido: o código atual (`repo.ts:103`) só notifica se `cobrador_id` existe e há TODO de fallback por telefone. O plano (P8/§3.3) reconhece "cobrir criador sem conta por telefone", coerente com E3/E10.

---

## 6. Aderência às invariantes (Épico 13)

- **Sem travessão / palavras proibidas / gênero neutro:** §3.4 e §3.5 delegam a copy aos templates (E12) e mandam revisar logs. Coerente. As mensagens novas (resumo, divergência, expirado, bloqueio) vivem em `templates` e passam pela validação de linguagem do E13 ao salvar — bom.
- **Hash sha256 do número, claro nunca persiste/loga:** explícito em §3.5 e M2; CSPRNG exigido. Conforme.
- **Nunca logar telefone/Pix/número:** §3.5 e ramos H5.8/H5.9 corretos.
- **Sem DELETE de negócio/auditoria:** `convite_tentativas` modelada como estado mutável de rate-limit (não auditoria), reset por UPDATE, sem DELETE; `recusado` é estado, não apaga combinado (H5.5). Conforme.
- **Centavos / fuso / cálculo no servidor:** expiração e agendamento calculados no servidor (`calcularAgendamentos`, `now()+7d`), nunca no cliente. Conforme. Atenção: "7 dias a partir da criação" deve ser computado em UTC no banco, exibição ao criador em America/Sao_Paulo se houver (G pequeno, não bloqueia).

---

## 7. Recomendação de modelo por passo

Sensata. `opus` em P1 (máquina de estados), P2/P3 (modelagem de segurança/unicidade), P5/P6 (coração: ramos+privacidade+rate-limit sem corrida), P7 (transições+evento novo), P8 (cruza fronteiras+idempotência), P11 (concorrência). `sonnet` em P4 (transporte mecânico), P9 (troca de coluna), P10 (UI), P12 (docs). Concordo integralmente; nenhuma reclassificação necessária.

---

## 8. Resumo das correções pedidas (acionável)

1. **G1 (médio):** localizar por hash independente de status; ramo terminal/expirado responde informativo (H5.7) **sem contar tentativa**. Adicionar teste.
2. **G2 (médio):** especificar chave de idempotência da conta (telefone único, `on conflict`) e que regeneração+reset+notificação ocorrem na mesma transação do 3º erro. Adicionar teste de re-tap sobre criação de conta.
3. **G3 (médio):** declarar que o aceite WhatsApp não tem sessão → vínculo sempre por telefone; o "com sessão vincula profile.id" de H5.3 é satisfeito por conta-no-aceite/backfill (E1), não fica órfão.
4. **G4 (médio):** tornar a limpeza do bloqueio (H5.9) critério obrigatório de P3 ou P6 (não condicional).
5. **G5 (médio):** decidir/sinalizar se reenvio após "dado incorreto" reinicia os 7 dias (recomendado: sim).
6. **G6 (médio):** P5/P6 referenciam o telefone-alvo por `criador_papel` (receber→devedor, invertido→cobrador); testar divergência no invertido sem vazar Pix.
7. **G7 (baixo):** enumerar efeitos no contador (feliz zera / inexistente +1 / divergente inalterado).
8. **G8–G11 (baixos):** G8 resolvido (HMAC do webhook já implementado); atualizar testes de api do `link_aceite` (P3/P11); guarda de status no sweep (P9); ordem de drop de colunas vs remoção do site (M5).
