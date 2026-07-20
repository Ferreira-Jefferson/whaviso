# Riscos aceitos e correções diferidas

Companheiro de [AUDITORIA-SEGURANCA.md](AUDITORIA-SEGURANCA.md). Aqui ficam os achados que NÃO foram corrigidos agora, cada um com o motivo plausível e a correção recomendada para quando for feito. Data: 2026-07-06. Branch: `development`.

A regra que guiou a separação: correção segura e localizada (hardening) foi aplicada já; mudança arquitetural, que altera comportamento de entrega, ou que depende de decisão de produto foi diferida e documentada aqui. Ações que só o dono do projeto aplica (servidor, chaves, painel) estão no [RUNBOOK-ACOES-MANUAIS.md](RUNBOOK-ACOES-MANUAIS.md).

> **Atualização 2026-07-20 (rodada de revisão da "brecha de login sem Google"):** confirmado que NÃO há bypass de auth no código do runtime (frontend e api só aceitam Google ou WhatsApp OTP, JWT verificado via JWKS; o `Bearer x` vive só no harness de teste). Uma varredura de segurança ampla não achou nenhum risco novo resolvível no código. Nesta rodada: **D4 resolvido** (`algorithms: ['ES256']` no JWT, ver abaixo) e **removido o script morto `backend/scripts/criar_usuario_confirmado.ts`** (login por e-mail/senha não existe mais na UI, então era código morto que ainda expunha o uso da service_role). A "maneira de testar sem o Google" que motivou a revisão era o **Test OTP no painel do Supabase** (config, não código): virou ação manual pendente no passo 6 do [RUNBOOK-ACOES-MANUAIS.md](RUNBOOK-ACOES-MANUAIS.md).

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

### D4. API L2 (BAIXA): fixar o algoritmo do JWT (`algorithms`) — ✅ RESOLVIDO (2026-07-20)
- **O que era:** as chamadas `jwtVerify` não fixavam o algoritmo; teoricamente abria margem para algorithm-confusion. O jose já rejeitava `alg: none` e não casava HS* com chave assimétrica, então a exposição sempre foi baixa.
- **Correção aplicada:** consultado o JWKS ao vivo (`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`) → chave ativa é **ES256**. Adicionado `algorithms: ['ES256']` nas duas chamadas `jwtVerify` de `apps/api/src/shared/auth/index.ts` (`verificar` e `autenticarOpcional`). Typecheck + lint OK.
- **Manutenção:** se o projeto Supabase trocar a chave para RS256 no futuro, atualizar esse array (a auth quebra 100% se o algoritmo real divergir do fixado).

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

## 4. Falha de CI investigada e corrigida (testes do ciclo x migration 0068)

Ao commitar esta rodada, o gate do CI ficou vermelho em ~13 testes de integração do zap (drainer, webhook, créditos), com "expected 0 to be 1". Investigado a fundo (o gate já vinha vermelho no commit ANTERIOR, com os mesmos testes, logo NÃO é regressão desta rodada). Causa raiz:

- A migration `0068_templates_reset_meta_sync` (parte da migração Baileys -> Meta) zera as aprovações fantasmas: deixa todos os templates com `status_meta='pendente'`, porque a aprovação real agora vem da Meta (que ainda está sendo configurada). Em PRODUÇÃO isso é o correto.
- O drainer (`enviar_lembretes/index.ts`) corretamente NÃO envia template com `status_meta != 'aprovado'` (devolve "aguardando template"), então `processarEnviosDevidos` retorna 0.
- Os testes de integração (`enviar_lembretes`, `ciclo_horario`, `cadastro_pix_e14`, `interacao_devedor`, `creditos_disparo`) foram escritos quando os templates vinham 'aprovado' e NÃO aprovam o template no próprio setup, então recebiam 0 e falhavam. Bug de setup de teste desatualizado, não de produto.

Correção aplicada (test-only, sem tocar produção): `backend/supabase/seed.sql` agora aprova os templates ativos (`update templates set status_meta='aprovado' where ativo`). O seed roda no `validate_migrations` (local) e no bootstrap do CI, mas o `db push` NÃO roda o seed, então a produção continua corretamente com os templates 'pendente' até a aprovação real na Meta. Os testes que verificam o gating de template não-aprovado (`notificar_cobrador`/`notificar_billing`) definem o `status_meta` que precisam no próprio setup, então não dependem deste default. Depois do fix, a suíte completa passa (api 175, zap 200, shared 42; zero falhas).

Nota: a origem do `status_meta='aprovado'` que existia em produção NÃO foi um teste tocando o banco de produção (os testes rodam só no `whaviso_dev` local) nem uma migration "de teste" vazada. Foi resíduo legítimo da era Baileys: os templates eram inseridos como 'aprovado' (ver comentário na migration 0048) e o painel antigo "aprovava" gravando `status_meta='aprovado'` direto no banco (ver comentário na 0066). A 0068 é a reversão correta desse estado para o modelo da Meta.

O cluster `hook_otp` (o único que ESTA rodada de fato tocou, por causa do frescor de timestamp) foi ajustado à parte e passa 6/6, incluindo o novo teste anti-replay. A validação da migration `0070` foi feita direto na produção (cloud), confirmando que o `whaviso_zap` tem exatamente os privilégios de coluna certos.
