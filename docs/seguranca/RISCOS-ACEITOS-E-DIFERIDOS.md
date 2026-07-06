# Riscos aceitos e correções diferidas

Companheiro de [AUDITORIA-SEGURANCA.md](AUDITORIA-SEGURANCA.md). Aqui ficam os achados que NÃO foram corrigidos agora, cada um com o motivo plausível e a correção recomendada para quando for feito. Data: 2026-07-06. Branch: `development`.

A regra que guiou a separação: correção segura e localizada (hardening) foi aplicada já; mudança arquitetural, que altera comportamento de entrega, ou que depende de decisão de produto foi diferida e documentada aqui. Ações que só o dono do projeto aplica (servidor, chaves, painel) estão no [RUNBOOK-ACOES-MANUAIS.md](RUNBOOK-ACOES-MANUAIS.md).

---

## 1. O que FOI corrigido nesta rodada (resumo)

Aplicado no código (branch `development`), com lint e typecheck passando nos 3 workspaces do backend e no frontend:

- **Frontend:** validação do parâmetro `next` (allowlist de caminho interno) nos 3 pontos de redirect pós-login; `detectSessionInUrl: false` no cliente supabase (o app não usa fluxo por redirect); remoção da var obsoleta `VITE_WHATSAPP_VENDAS` do `.env`.
- **API:** `trustProxy: 'loopback'` (restaura o rate limit por IP e para de confiar em XFF forjado); `audience: 'authenticated'` na validação do JWT; `@fastify/helmet` com config mínima para API + `Cache-Control: no-store` nas respostas autenticadas; whitelist explícita de colunas no `PATCH /perfil` (elimina a fragilidade de coluna dinâmica); remoção do `credentials: true` desnecessário no CORS; log de `err.message`/código em vez do objeto de erro cru.
- **ZAP:** `@fastify/rate-limit` por IP nos endpoints públicos + `bodyLimit` de 128KB no webhook + rejeição precoce de POST sem assinatura; comparação constant-time do verify token do handshake; frescor do `webhook-timestamp` no OTP hook (janela de 5 min, anti-replay); remoção do número do WhatsApp do `/healthz` público; `trustProxy: 'loopback'`; bind em `127.0.0.1` (configurável por `ZAP_HOST`). Teste `hook_otp` atualizado para timestamp atual + novo teste que trava a regra anti-replay.
- **Infra / migrations:** CSP do nginx corrigida para o Google Identity Services (login Google) sem afrouxar (só `accounts.google.com` em `script-src`/`frame-src`/`connect-src`) + `object-src 'none'`; `location /webhook/` do zap preparada no nginx (comentada até ativar a Meta); `EnvironmentFile` dividido em `api.env` e `zap.env` (systemd); migration `0069` (REVOKE de anon/authenticated, defesa em profundidade) e `0070` (GRANT do zap por coluna em `envios` e `creditos_carteira`), ambas **aplicadas no Supabase cloud e verificadas em produção**; script `check_rls_coverage.sh` + passo no CI que falha se alguma tabela de `public` ficar sem RLS.

---

## 2. Correções DIFERIDAS (não feitas agora, com motivo)

### D1. H1 (ALTA): tirar a `service_role` key do processo exposto à internet (zap)
- **Por que não agora:** é um refactor cross-service, não um hardening localizado. A `service_role` (que bypassa RLS e habilita a Admin API do Auth) é usada pelo zap para criar conta no aceite pelo WhatsApp (H5.3). Removê-la do zap exige criar um endpoint interno na api (autenticado por segredo dedicado, na rede loopback/VPS) que o zap chame para essa operação, e mudar os dois serviços. Merece um PR próprio, com teste do novo caminho.
- **Risco enquanto não feito:** um comprometimento do zap (o processo que fala com a internet) entrega a service_role, dando leitura/escrita de todas as tabelas via PostgREST e takeover de contas via Auth admin, ignorando o role `whaviso_zap`.
- **Mitigações já entregues no meio-tempo:** split de `EnvironmentFile` por serviço (reduz o blast radius de SO) e a orientação de rotacionar a chave (runbook). O `0070` também reduziu o poder do role de banco `whaviso_zap` (não é a service_role, mas fecha a fronteira do outbox por coluna).
- **Correção recomendada:** concentrar a Admin API do GoTrue num único ponto (idealmente só a api); o zap chama um endpoint interno da api para criar conta; a `service_role` sai do `zap.env`. Depois, rotacionar a chave.
- **Prioridade:** a mais alta da lista.

### D2. ZAP ACHADOS 1, 2, 3 (MÉDIA): durabilidade do inbound do WhatsApp (padrão inbox)
- **Por que não agora:** muda a semântica de entrega (a Meta entrega at-least-once; hoje o inbound é processado em background após responder 200, e não há dedupe por `wamid`). A correção certa exige uma NOVA tabela (inbox append-only com `unique(wamid)`), migration própria, e teste dedicado. É um PR focado, não uma edição de hardening em paralelo. Não é bypass de segurança, é confiabilidade.
- **Risco enquanto não feito:** (a) reentrega/replay de um evento reprocessa handlers não idempotentes (ex.: `contarErroNumero` incrementa o contador 2x, podendo bloquear/regenerar convite antes da hora); (b) crash entre enviar e marcar reenvia o lembrete ao devedor (duplicado); (c) crash durante o processamento em background perde o evento (aceite, "Já paguei", opt-out, wizard Pix), pois a Meta não reenvia após o 200.
- **Correção recomendada (um único PR "inbox de inbound"):** persistir o evento cru/extraído numa tabela `inbound_whatsapp` com `unique(wamid)` e INSERT só para `whaviso_zap`, DENTRO da transação, ANTES de responder 200; drenar/processar a partir dela com retry idempotente; dedupe por `wamid` no início dos handlers; tornar `contarErroNumero` idempotente. Para o envio (ACHADO 2), registrar o `wamid` na mesma transação do claim e só ressuscitar linhas comprovadamente não enviadas. O frescor de timestamp que já foi adicionado ao OTP hook cobre o replay daquele hook; o webhook da Meta (sem timestamp) fica coberto pelo dedupe por `wamid`.
- **Nota:** o mesmo achado aparece como L3 no relatório de integração.

### D3. API M2 (MÉDIA): merge de conta em telefone não verificado (decisão de produto)
- **Por que não agora:** as duas correções óbvias quebram o fluxo LEGÍTIMO. O merge existe justamente para ligar um `profiles.telefone` auto-declarado (não verificado) de uma conta Google a um primeiro login por OTP verificado. Exigir identidade phone verificada no lado Google, ou gatear a escrita de `profiles.telefone` a uma identidade OTP, impediria esse caso legítimo. Precisa de decisão de produto sobre a experiência.
- **Risco enquanto não feito:** cenário de borda: se um usuário Google digita por engano o telefone de outra pessoa, quem controla aquele número, ao logar por OTP, é mesclado à conta Google alheia. Não é explorável ativamente por um atacante (ele não controla o `profiles.telefone` da vítima).
- **Correção recomendada (produto):** ao detectar merge, exigir confirmação explícita de posse da conta Google (re-auth Google) antes de conceder a sessão mesclada, e/ou notificar a conta Google, em vez de devolver o magic token silenciosamente.

### D4. API L2 (BAIXA): fixar o algoritmo do JWT (`algorithms`)
- **Por que não agora:** pinar o algoritmo ERRADO quebra 100% da autenticação. O código usa JWKS assimétrico (ES256 ou RS256); não foi possível confirmar com certeza qual o projeto Supabase usa sem consultar o JWKS ao vivo. O jose já rejeita `alg: none` e não casa HS* com chave assimétrica, então a exposição é baixa.
- **Correção recomendada:** buscar `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, ler o `alg` da chave ativa, e então adicionar `algorithms: ['<alg-real>']` nas duas chamadas `jwtVerify` de `apps/api/src/shared/auth/index.ts`. Não chutar.

### D5. Migração de sessão para cookie HttpOnly no frontend (BAIXA)
- **Por que não agora:** exigiria um proxy de auth e mudança de arquitetura. O `supabase-js` usa localStorage por padrão.
- **Risco:** um XSS no domínio poderia exfiltrar os tokens. Mitigado por: CSP apertada (mantida/endurecida), ausência de vetor XSS no código, e `detectSessionInUrl: false` (aplicado).
- **Correção recomendada:** só se o modelo de ameaça exigir; registrar como opção, não como pendência.

---

## 3. Riscos ACEITOS conscientemente (para o estágio atual)

### A1. Store do rate-limit em memória (Informativa)
`@fastify/rate-limit` usa store em memória: por instância e reinicia no restart. Correto para 1 VM (o desenho atual). Só vira limitação se escalar horizontalmente, quando os limites deixariam de ser globais. Aceito enquanto for 1 VM.

### A2. VM único = ponto único de falha (L5, Baixa)
Toda a origem (nginx + api + zap + scheduler) roda num VM. O zap é obrigatoriamente instância única (o scheduler drena a outbox e não pode competir consigo mesmo). Aceito para o estágio; mitigado por `MemoryMax`/`Restart=on-failure` por serviço e Cloudflare servindo cache do estático. Futuro (se for para HA): separar o estático (Cloudflare Pages/objeto) e failover do zap com lock de líder.

### A3. Oracle de existência de conta por telefone (L4, Baixa)
O endpoint pré-OTP revela se existe conta para um telefone e por qual provedor. É necessário para a UX (decidir o fluxo antes do OTP) e já é rate-limited (nginx 20r/s + limite por rota na api). Aceito; sugestão: monitorar volume por origem e considerar resposta mais genérica no futuro.

### A4. Vulnerabilidades de dependências de DESENVOLVIMENTO (não runtime)
O `npm audit` completo do backend acusa 4 advisories (1 low, 2 high, 1 critical), TODAS em dependências de desenvolvimento, não de runtime:
- `esbuild` (via `vite`, que vem do `vitest`, o runner de teste): leitura de arquivo pelo dev server, só em dev.
- `handlebars` (critical/high) via `@boundaries/elements` <- `eslint-plugin-boundaries` (plugin de lint que enforça as fronteiras feature-first).

Nenhuma vai para o bundle de produção (a api e o zap rodam via `tsx`; o frontend é estático). O `handlebars` não processa template de entrada não confiável aqui (roda no lint, sobre o próprio código do projeto). Por isso o `npm audit --omit=dev` dá 0. **Não foi aplicado `npm audit fix`** para não bumpar automaticamente o `eslint-plugin-boundaries` (sustenta a arquitetura) nem o `vite`/`esbuild` do vitest, arriscando quebrar o lint/teste.
- **Ação recomendada (manutenção):** quando conveniente, atualizar `eslint-plugin-boundaries` para uma versão que traga `handlebars >= 4.7.9`+ (rodar `npm audit` de novo depois) e o `vitest`/`vite` para eliminar o esbuild antigo, validando `npm run lint` e `npm test` após o bump. Fora do caminho crítico de segurança.

---

## 4. Nota sobre os testes (para não assustar ao rodar `npm test`)

Ao rodar `npm test` no backend nesta máquina (Windows, timezone America/Sao_Paulo), 13 testes de integração do zap falham (drainer, webhook, créditos). Foi confirmado que são falhas PRÉ-EXISTENTES, NÃO causadas por esta rodada:
- Elas falham identicamente com as migrations novas (0069/0070) removidas.
- Nenhum dos arquivos de código exercitados por esses testes (`enviar_lembretes/*`, `webhook_whatsapp/*`, `shared/creditos/*`) foi modificado nesta rodada.
- A causa é sensibilidade a relógio/timezone: o harness insere `agendado_para = new Date()` e a comparação `agendado_para <= now()` do claim depende do timezone da sessão do Postgres local (UTC-3 na máquina vs UTC no banco). O CI roda em UTC e passa.

O único cluster de teste que ESTA rodada tocou (`hook_otp`) foi ajustado e passa (6/6, incluindo o novo teste anti-replay que trava a regra de frescor). A validação da migration `0070` foi feita direto na produção (cloud), confirmando que o `whaviso_zap` tem exatamente os privilégios de coluna certos.

Sugestão (fora do escopo desta rodada): tornar os testes do drainer determinísticos quanto ao tempo (fixar o clock, ou setar o timezone da sessão de teste para UTC via a connection string do teste), para eles passarem localmente também.
