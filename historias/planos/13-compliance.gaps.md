# Relatório de validação: Épico 13 (Linguagem, opt-out e compliance)

> Revisão adversarial do plano `13-compliance.plano.md` contra a história `13-compliance.md` (fonte da verdade) e o código real (grafo + arquivos).

## 1. Veredito

**Aprovado com ressalvas.**

O plano cobre os 10 critérios H13.x, está bem ancorado no código real (a tabela de estado-atual confere em quase tudo que verifiquei) e respeita as invariantes. A ressalva é: a lista de limpeza de travessão/proibidas está **incompleta** (omite arquivos de produto reais); faltam também alguns testes/pontos finos. Nenhum gap é bloqueante, mas essa lista precisa de correção antes de executar para o trabalho realmente fechar as varreduras (H13.1/H13.2).

---

## 2. Gaps por severidade

### Crítico

**C1. Lista de limpeza de travessão (passo 5) incompleta: omite código de produto que tem em dash.**
A história H13.2 exige que o travessão nunca apareça em código. A varredura do passo 3/4, depois de criada, vai **falhar** em arquivos que o passo 5 não lista, travando os passos seguintes ou (pior) levando alguém a adicionar exclusões indevidas. Achados reais não listados:
- `backend/eslint.config.mjs:15` contém `—` num comentário ("a regra vale — para código de produção"). É config de produto, não doc interna; precisa ser corrigido.
- `backend/scripts/meta_sink.mjs`, `backend/scripts/push_secrets.sh`, `backend/scripts/scaffold_module.sh` contêm `—`. O passo 5 diz "scripts em backend/scripts/ (os que são produto/infra)" de forma vaga; nomeie-os.
Correção: enumerar explicitamente todos os arquivos com hit (rodar a varredura primeiro, listar, corrigir um a um) e decidir se `backend/scripts/*` e `eslint.config.mjs` entram no escopo da varredura do passo 3 (recomendo que sim, são código de produto).

**C2. Lista de limpeza de palavras proibidas em comentários (passo 6) incompleta.**
O passo 6 cita migrations `0006`, `0022`, `0018` para reescrever comentários. Os hits reais de proibidas em comentários/strings de migration são:
- `0006_templates_mensagem.sql:15` ("linguagem de cobrança") — listado.
- `0014_notificacoes_cobrador.sql:18,20` ("linguagem de cobrança") — **não listado**.
- `0019_billing_personalizado.sql:2,5,50,60,68` (vários "cobrança"/"cobranças") — **não listado**. Este é o maior foco.
- `0022_templates_unificada.sql:5,36` ("Isto é dívida", "linguagem de cobrança") — listado.
- `0018` na verdade **não** tem palavra proibida; tem travessão (linha 6). O passo 6 colocou `0018` na lista errada.
Correção: trocar `0018` por `0014` e `0019` na lista do passo 6; e atenção: parte desses comentários (`0006`/`0014`/`0022`) descreve o próprio CHECK e o padrão regex — reescrever sem distorcer o sentido (ex.: "linguagem de cobrança" -> "vocabulário proibido"); o regex do CHECK em si fica como está (é a definição da regra, igual ao `linguagem.ts`, que o próprio teste de varredura exclui).

### Médio

**M1. RESOLVIDO: o webhook HMAC da Meta já está implementado (H13.8).**
A história H13.8 e o plano (tabela linha 44) descrevem "payload do botão é `acao:avisoId` ... webhook HMAC-autenticado". O webhook HTTP da Meta com validação HMAC (`X-Hub-Signature-256`, `META_APP_SECRET`) já cobre o inbound de botões; o payload leva `aviso_id`, nunca token. Não há mais divergência a corrigir aqui.

**M2. Redaction (passo 8): falta `telefone_cobrador` e o paths real precisa de verificação cuidadosa, não só append.**
Confirmei `logger/index.ts`: redige `telefone`, `telefone_devedor`, `pix_chave`, `chave`, `token`, mas **não** `telefone_cobrador`. O plano acerta em adicioná-lo. Porém:
- O `nome_cobrador` (nome de quem cobra) não é citado; não é "sensível" pela letra de H13.8 (telefone/Pix/titular/banco/token), então OK deixar de fora, mas vale uma decisão consciente.
- O risco real (apontado no próprio plano, risco nº 3) é o **shape aninhado**: pino só redige os paths declarados. Se alguém logar `logger.info({ aviso })` com um objeto que tem `aviso.telefone_devedor`, o path `*.telefone_devedor` cobre 1 nível, mas `aviso.dados.telefone_devedor` (2 níveis) **não**. O passo 8 deve incluir um teste com objeto aninhado de 2+ níveis e/ou a recomendação concreta de "logar só ids", não apenas appendar paths chatos. O passo 9(a) prevê o teste mas não exige o caso aninhado profundo — torne-o explícito.

**M3. H13.7 "menu pago vs silêncio free" não tem passo nem verificação, mesmo sendo invariante deste épico.**
H13.7 tem 4 critérios. O plano marca `[x]` e delega "menu pago vs silêncio free é E7". Aceitável como fronteira, mas o critério "texto livre: silêncio no free, menu no pago" é uma regra de compliance transversal; o plano não tem nenhum teste de invariante garantindo que texto livre **nunca** dispara ação/IA/Pix (só afirma que `service.ts` ignora). Recomendo um teste de compliance leve: "evento de texto livre não muda estado nem enfileira nada", para a regra não regredir. Sem isso, H13.7 fica só documentado, não guardado.

**M4. H13.4 (opt-out visível) — teste do passo 9(c) é frágil e não cobre todos os "templates do ciclo".**
O plano prevê um teste "todo template do ciclo carrega botão optout". Confirmei que os templates seedados em `0022` têm `resposta.optout` e variantes de ciclo. Mas: (a) "templates do ciclo" precisa de uma definição precisa de quais chaves contam (lembrete D-2..D+1, revisão, etc.) — sem isso o teste vira tautologia; (b) o critério H13.4 também diz que o **rótulo** é editável (E12) mas a **presença** não é opcional, ou seja, a validação ao salvar template (passo 7) deveria, idealmente, impedir remover o botão optout de um template de ciclo. O plano não cobre essa guarda (só barra proibidas/travessão no conteúdo). Anote como limitação ou estenda `lintConteudo` para exigir optout em chaves de ciclo.

**M5. H13.6 — falta teste do "botão tocado em terminal não reabre".**
H13.6 critério 2: "botão tocado num combinado terminal não reabre nem dispara ação; no máximo resposta neutra". O plano garante o lado de **envio** (enviar_lembretes só envia em pendente/informado_pago — confere no código) mas não menciona o lado de **inbound** (toque de botão em aviso terminal). O `webhook_whatsapp/repo.ts` já trata estados (linha 84: ativo só em pendente/informado_pago), e há teste de idempotência em E7, mas o plano de E13 não fixa esse invariante de compliance com teste próprio nem o referencia. Recomendo um teste de compliance: botão em aviso `cancelado`/`pago` não muda estado.

### Baixo

**B1. Contrato `previewMensagemResposta` já existe e usa `lint_ok`/`palavra_proibida` (passo 7).**
Confirmei `payloads.ts:293-298`. O passo 7 fala em adicionar campo `avisos[]`/`travessao` aos contratos de resposta, mas não cita que `previewMensagemResposta` é o contrato concreto a estender (cita `payloads.ts` genericamente). Detalhe: hoje o **preview não bloqueia** (só retorna `lint_ok`), o bloqueio é só no `POST /admin/mensagens`. Ao adicionar travessão, manter essa assimetria (preview informa, POST barra) e estender ambos. Pequeno, mas precisa estar explícito para não quebrar o editor do front (E12).

**B2. Falso positivo de "atras" sem acento (risco nº 2) merece teste, não só menção.**
O regex `atras(o|ad)` casa "atrasado/atraso" mas o plano nota que "atrás" (com acento) não casa `atras` puro. Confirmação: `atras(o|ad)` exige sufixo `o` ou `ad`, então "atrás de" (sem esse sufixo) não casa, "atrasar" casa via `atras` + ... na verdade "atrasar" -> `atrasa` casa `atras`+`a`? não, precisa `o`/`ad`; "atrasar" tem "atras"+"ar", não casa. OK. Mas "cadastro" contém "astr"? não. O ponto: o passo 3 deve incluir **casos de borda como teste unitário** do lint (palavra que parece proibida mas não é), não só rodar a varredura. O plano menciona no risco mas não cria o teste; adicione-o ao passo 3/9.

**B3. CHECK de banco para travessão (decisão 7.2): há precedente de proibidas em `0006`/`0014`/`0022`.**
A recomendação "só API+lint" é razoável, mas note para o humano que já existe defesa-em-profundidade para proibidas no banco (3 CHECKs). Não ter o equivalente para travessão é uma assimetria consciente, não um esquecimento — o plano explica bem. Sem ação, só registro.

**B4. Espelho backend/front (risco nº 1): o teste de igualdade dos patterns é citado mas não vira passo numerado.**
O risco nº 1 propõe "teste que compara os patterns" backend vs front, mas nenhum passo (1-11) cria esse teste. Como o front não importa `@whaviso/shared`, a única defesa contra divergência é esse teste. Recomendo torná-lo um passo explícito (ou item do passo 2/9) que leia o arquivo do outro lado e compare a string do pattern. Sem ele, H13.9 ("não divergirem com o tempo") fica só na disciplina humana.

---

## 3. Cobertura dos critérios de aceite

Todos os 10 critérios H13.x têm passo no plano. Detalhe por critério:

- H13.1 (proibidas em tudo, incl. banco/comentários/erros): passos 3, 6. **Lacuna de execução (C2)**: lista de migrations incompleta.
- H13.2 (sem travessão): passos 1, 3, 4, 5, 11. **Lacuna de execução (C1)**: lista de limpeza incompleta.
- H13.3 (gênero neutro): passos 1, 2, 7 (alerta). Coberto como heurística/alerta (correto, é 🟡).
- H13.4 (opt-out visível): passo 9(c). **Parcial (M4)**: teste frágil, sem guarda no salvar template.
- H13.5 (opt-out reversível `desregistrado`): passo 10 (coordenação com E7) + teste de compliance. Coberto como dependência (correto).
- H13.6 (terminal não envia): coberto no lado envio (já `[x]`); **falta lado inbound (M5)**.
- H13.7 (devedor só botão): `[x]` documentado; **sem teste de invariante (M3)**.
- H13.8 (não logar sensível): passos 8, 9(a). **Parcial (M2)**: faltava `telefone_cobrador` (plano corrige) + teste aninhado profundo.
- H13.9 (fonte única espelhada): passos 1, 2. **Falta teste de igualdade (B4)**.
- H13.10 (lint/validação automática): passos 3, 4, 7, 11 + decisão 7.1. Coberto (com decisão aberta legítima).

**Critérios sem passo dedicado (apenas afirmados):** H13.7 critérios (sem teste), H13.6 critério 2 (toque em terminal, lado inbound). Nenhum critério ficou totalmente fora; os gaps são de profundidade de teste, não de ausência.

---

## 4. Testes para pontos críticos

- **Corrida/fila/coalescing:** o plano corretamente afirma que **não há ponto de corrida próprio** deste épico (fila/estado são E6/E7/E10). Concordo: E13 é invariantes transversais. OK.
- **Redaction de log (crítico de segurança):** previsto (passo 9a). **Reforçar com caso aninhado profundo (M2).**
- **Varredura de linguagem no CI:** previsto (passos 3, 4). **Falta caso de borda de falso positivo como teste unitário (B2).**
- **Igualdade de patterns backend/front:** **ausente como passo (B4).**
- **Invariante opt-out visível:** previsto (9c) mas **frágil (M4)**.
- **Invariante "devedor só botão" e "terminal não reabre no inbound":** **ausentes (M3, M5).**

---

## 5. Coerência cross-épico

- **E7 (`desregistrado`):** correto delegar a mecânica a E7 e só fixar o invariante + docs (passo 10). Coerente com `_CONTEXTO.md` e com a divergência declarada no próprio épico. Bom o detalhe de que o teste de compliance deve **falhar enquanto o estado não existir** (sinaliza pendência, não passa silenciosamente) — alinhado com a máquina de estados-alvo do `_CONTEXTO.md`.
- **E12 (templates):** validação ao salvar (passo 7) amarra H12.5; coerente. Atenção a não quebrar o contrato `previewMensagemResposta`/editor do front (B1).
- **E3 (pagar invertido):** redaction de `pix_titular`/`pix_banco` "quando existirem" — coerente; o plano nota que os campos entram no E3/E7. Bom não inventar campos.
- **E6 (`informado_pago` parar o ciclo):** o plano corretamente diz que isso é refator de E6, não de E13. Sem contradição.
- **Sem contradição com outros épicos detectada.**

---

## 6. Aderência às invariantes do Épico 13

- Sem travessão / sem proibidas: o **próprio plano** está limpo (doc interno, exento de qualquer forma). OK.
- Gênero neutro: tratado como alerta (correto, 🟡).
- Centavos / fuso / cálculo no servidor: não aplicável a este épico (sem dinheiro/datas novas); o plano não viola.
- Token só hash sha256 + payload leva `aviso_id`: confirmado no código (`service.ts` usa `acao:avisoId`), plano coerente.
- Nunca logar sensível: é o núcleo do passo 8/9; coberto com a ressalva M2.
- Envelope `{error:{code,message}}` / JWKS: o plano mantém o envelope na validação de template; JWKS não é tocado aqui. OK.
- Sem DELETE de negócio/auditoria: opt-out grava `eventos_aviso` append-only (confirmado `repo.ts:123`); plano respeita; a exceção `templates` (owner apaga versões) é de E12, não tocada aqui. OK.

---

## 7. Recomendação de modelo por passo

Sensata no geral. Observações:
- **Passo 1 (opus):** justificado — é o contrato que 3 consumidores espelham; o desenho das regex de gênero/travessão precisa acertar de primeira. OK.
- **Passo 8 (opus, redaction):** justificado por segurança; concordo, dado o risco de shape aninhado (M2).
- **Passo 5 (sonnet, limpeza de travessão):** OK como mecânico, **desde que a lista esteja completa (C1)**. Se a lista vier vazia/parcial, o sonnet não vai descobrir os arquivos faltantes sozinho; o passo deve começar por rodar a varredura e listar.
- **Passo 6 (sonnet, comentários):** OK, mas reescrever comentário de migration sem distorcer a explicação do CHECK pede um pouco de cuidado; o sonnet dá conta se o passo já trouxer a lista correta (C2) e a regra "não mexer no regex do CHECK".
- **Passo 11 (sonnet):** OK; a parte difícil (a decisão ESLint vs teste) está corretamente isolada na seção 7.

---

## 8. Resumo das correções pedidas (acionáveis)

1. (C1) Completar a lista de limpeza de travessão: incluir `backend/eslint.config.mjs:15`, `backend/scripts/meta_sink.mjs`, `push_secrets.sh`, `scaffold_module.sh`; decidir o escopo da varredura.
2. (C2) Corrigir a lista de comentários proibidos: trocar `0018` por `0014` e `0019`; manter `0006`/`0022`; não alterar o regex dos CHECKs.
3. (M1) RESOLVIDO: o inbound de botões já é webhook HTTP da Meta com HMAC (`X-Hub-Signature-256`); nenhuma correção de redação necessária.
4. (M2) Passo 8/9a: adicionar `telefone_cobrador` (plano já prevê) + teste com objeto aninhado 2+ níveis; reforçar "logar só ids".
5. (M3) Adicionar teste de invariante H13.7 (texto livre não dispara ação/estado).
6. (M4) Precisar quais chaves são "templates do ciclo" no teste de opt-out; considerar guarda de presença de optout no salvar.
7. (M5) Adicionar teste de compliance: toque de botão em aviso terminal não reabre.
8. (B4) Tornar o teste de igualdade dos patterns backend/front um passo explícito.
