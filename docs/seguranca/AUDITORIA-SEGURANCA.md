# Auditoria de segurança do whaviso

Data: 2026-07-06. Branch analisada: `development`. Modo da auditoria: read-only (a análise não alterou código; as correções foram aplicadas em etapa separada, ver `RISCOS-ACEITOS-E-DIFERIDOS.md` e `RUNBOOK-ACOES-MANUAIS.md`).

Este documento reúne dois trabalhos:
1. Um levantamento dos erros mais reportados em projetos Supabase e SaaS (pesquisa pública + conhecimento de segurança), com o que cada brecha é, o risco, e se o whaviso está exposto.
2. Uma auditoria do código real do whaviso em quatro frentes (frontend, api, zap, integração), com evidência por arquivo e linha e a correção de cada achado.

Nenhum achado foi classificado como Crítico. O desenho de segurança do projeto é maduro: RLS habilitado em todas as tabelas, assinatura HMAC verificada nos webhooks com comparação de tempo constante, tokens só como hash, roles de banco de privilégio mínimo, segredos fora do git e nginx com Cloudflare e cabeçalhos fortes. Os achados são de endurecimento (hardening), raio de impacto (blast radius) e robustez, não buracos abertos de acesso.

---

## 1. Sumário executivo

### Contagem por severidade (auditoria do código)

| Severidade | Qtde | Onde |
|---|---|---|
| Crítica | 0 | (nenhuma) |
| Alta | 1 | Integração: H1 (service_role nos dois processos) |
| Média | 10 | api (2), zap (4), integração (4) |
| Baixa | 12 | frontend (1), api (2), zap (3), integração (6) |
| Informativa | 8 | frontend (3), api (4), zap (1) |

### Prioridade sugerida (do maior impacto para o menor)

1. **H1** (Alta): repensar onde vive a `SUPABASE_SERVICE_ROLE_KEY` (essa chave bypassa RLS por completo e habilita a Admin API; hoje é lida também pelo zap, que é o processo exposto à internet).
2. **M1 (integração)**: separar o arquivo de env por serviço, para o comprometimento de um processo não entregar os segredos do outro.
3. **M3 (integração)**: REVOKE explícito de `anon`/`authenticated` + teste de cobertura de RLS no CI (barato, evita vazamento por esquecer RLS numa tabela futura).
4. **M2 (api/zap/integração)**: corrigir `trustProxy` para o rate limit por IP voltar a valer e os logs pararem de registrar IP forjado.
5. **M4 (integração)**: apertar o GRANT do zap por coluna em `envios` e `creditos_carteira`.
6. **zap ACHADOS 1/2/3**: durabilidade do inbound do WhatsApp (dedupe, idempotência, padrão inbox). Confiabilidade, não bypass; requer PR focado.
7. Demais achados Baixa/Informativa conforme roadmap.

---

## 2. Erros comuns de Supabase e SaaS (pesquisa) e como o whaviso se posiciona

Esta seção resume os erros mais reportados em projetos que usam Supabase e SaaS em geral. Para cada um: o que é a brecha, o risco, e o veredito para o whaviso.

### 2.1 RLS (Row Level Security) desligada ou mal configurada
- **O que é:** tabelas criadas via SQL ou pelo Table Editor vêm com RLS DESLIGADA por padrão. Sem RLS, qualquer requisição com a `anon key` (que é pública e vive no frontend) lê, altera e apaga todas as linhas da tabela via PostgREST. Policies permissivas (ex.: `USING (true)`) têm efeito parecido.
- **Risco:** vazamento e corrupção total dos dados daquela tabela por qualquer visitante do site. É a causa mais comum de incidente em Supabase.
- **Dados públicos:** o CVE-2025-48757 achou 303 endpoints em 170 apps com tabelas lidas por requisições não autenticadas usando a anon key, incluindo tabelas de pagamentos, pedidos, tokens OAuth e logs de auditoria; mais de 50 tabelas aceitavam escrita não autenticada. Estimativas de pesquisa apontam que cerca de 83% dos incidentes de Supabase envolvem RLS mal configurada. O caso Moltbook (2025) expôs 1,5 milhão de tokens e 35 mil e-mails por um banco Supabase sem RLS.
- **Veredito whaviso:** protegido. RLS está habilitada em TODAS as 20+ tabelas atuais, sem nenhuma policy para `anon`/`authenticated`, e o frontend nunca usa `supabase.from()` (dados 100% via API REST com Bearer). Ver controles na seção 6. Ponto de atenção residual: essa proteção depende de lembrar de habilitar RLS em toda tabela nova; endereçado pelo achado M3 (REVOKE + teste de cobertura no CI).

### 2.2 service_role key exposta
- **O que é:** a `service_role` key é um JWT que BYPASSA toda a RLS e dá acesso de administrador (inclusive Admin API do Auth para criar/editar/apagar usuários). O erro clássico é colocá-la no frontend, em variável prefixada `VITE_`/`NEXT_PUBLIC_`, ou commitá-la.
- **Risco:** quem tem a service_role lê e escreve o banco inteiro e faz takeover de contas. Comprometimento total.
- **Veredito whaviso:** o frontend NÃO tem a service_role (só a publishable/anon key, pública por design). A chave fica só no servidor. Porém há um achado Alta (H1): ela é lida por AMBOS os processos de servidor, inclusive o zap, que é o exposto à internet. Ver H1.

### 2.3 Funções/RPC chamáveis sem autenticação e Storage público
- **O que é:** funções de banco (RPC) expostas via PostgREST sem checar `auth.uid()`, e buckets de Storage sem policy (leitura/escrita pública).
- **Risco:** execução de lógica sensível ou acesso a arquivos por qualquer um.
- **Veredito whaviso:** não se aplica. O projeto não usa PostgREST para dados (RLS deny-all para anon/authenticated) e não usa Supabase Storage. As funções `SECURITY DEFINER` têm `search_path` fixo e são concedidas só aos roles de serviço.

### 2.4 Falta de rate limit / CAPTCHA nos fluxos de auth
- **O que é:** endpoints de login, OTP, signup e reset sem limite de tentativas, permitindo brute force, enumeração e spam de mensagens (custo).
- **Risco:** força bruta, enumeração de usuários, e "denial of wallet" (gerar custo com envio de OTP/e-mail).
- **Veredito whaviso:** parcialmente coberto. A api tem rate limit por rota (status-telefone 12/min, /acao 10/min, global 100/min) e o nginx tem `limit_req` por IP real. O OTP em si é emitido/validado pelo Supabase Auth (confirmar limites no painel, ver runbook). Achados relacionados: M2 (trustProxy tornava o limite da app burlável) e o zap sem rate limit nos endpoints públicos (ACHADO 4).

### 2.5 Exaustão de conexões e indisponibilidade (DDoS / denial of wallet)
- **O que é:** SaaS sem proteção de borda, sem limite de body, sem timeouts e com pool de conexões grande pode ser derrubado por flood, ou gerar conta alta por egress/uso.
- **Risco:** indisponibilidade e custo.
- **Veredito whaviso:** bem posicionado na borda (Cloudflare + nginx `limit_req` + `client_max_body_size` + pools pequenos: api max 5, zap max 3, com `connectionTimeout`). O gargalo real de disponibilidade é o VM único (SPOF, achado L5), não o pooler. Achado relacionado: zap sem rate limit/bodyLimit próprios (ACHADO 4).

### 2.6 Segredos vazados no git / em logs
- **O que é:** commitar `.env`, chaves em histórico do git, ou logar PII/segredos.
- **Risco:** vazamento permanente (o git guarda histórico).
- **Veredito whaviso:** protegido. `.gitignore` cobre `.env`/`secrets`; verificado com `git log --all` que só os `*.example` estão versionados. Redaction de PII no logger cobre telefone/Pix/token em campos aninhados. Ponto de atenção: a redaction cobre 2 níveis de aninhamento (disciplina de "não logar objeto cru").

### 2.7 Itens do checklist oficial de produção do Supabase
Boas práticas que dependem de configuração no painel do Supabase (não do código). Ver o runbook de ações manuais para aplicar:
- Habilitar RLS em todas as tabelas (feito no código; validar no painel).
- Enforce SSL nas conexões de banco (Database > Settings > SSL).
- Network Restrictions (limitar IPs que acessam o banco).
- OTP com expiração baixa (recomendado 3600s ou menos) e comprimento adequado.
- Rate limits de Auth (OTP, verificação, refresh) revisados no painel.
- Proteção de senha vazada (HaveIBeenPwned) no plano Pro+ (whaviso não usa senha, então não se aplica diretamente).
- CAPTCHA em signup/sign-in (avaliar para os fluxos de OTP).
- MFA na própria conta Supabase e 2+ owners na organização.
- PITR (Point-in-Time Recovery) / backups conforme o tamanho do banco.

### Fontes da pesquisa
- [Supabase Security Retro 2025 (oficial)](https://supabase.com/blog/supabase-security-2025-retro)
- [Production Checklist (oficial)](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Row Level Security (oficial)](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Rate limits (oficial)](https://supabase.com/docs/guides/auth/rate-limits)
- [Securing your data (oficial)](https://supabase.com/docs/guides/database/secure-data)
- [Supabase RLS: Common Mistakes & CVE-2025-48757](https://vibeappscanner.com/supabase-row-level-security)
- [Supabase Security Flaw: 170+ Apps Exposed by Missing RLS (byteiota)](https://byteiota.com/supabase-security-flaw-170-apps-exposed-by-missing-rls/)
- [Supabase: one misconfiguration away from disaster (stingrai)](https://www.stingrai.io/blog/supabase-powerful-but-one-misconfiguration-away-from-disaster)
- [10 Common Supabase Security Misconfigurations (ModernPentest)](https://modernpentest.com/blog/supabase-security-misconfigurations)
- [Supabase Security Checklist 2026 (ubserve)](https://ubserve.com/platform-guides/supabase-security-checklist-ai-built-apps)
- [Remediating Supabase Service Role JWT leaks (GitGuardian)](https://www.gitguardian.com/remediation/supabase-service-role-jwt)
- [Validando o webhook do WhatsApp com X-Hub-Signature-256 (issue de exemplo)](https://github.com/zeroclaw-labs/zeroclaw/issues/51)

---

## 3. Diagrama de fronteiras de confiança

```
                     INTERNET (nao confiavel)
                             |
                 +-----------+-----------+
                 |  Cloudflare (borda)    |  TLS de borda, esconde IP de origem
                 |  DDoS L3/L4/L7          |  CF-Connecting-IP
                 +-----------+-----------+
   ufw: 80/443 so das faixas | Cloudflare (resto bloqueado)
                 +-----------+-----------------------------------------+
                 |  VPS Hostinger (1 VM sempre-ligado)  == SPOF ==      |
                 |                                                      |
                 |   nginx :443  (cert de ORIGEM CF, Full strict)       |
                 |   |- whaviso.com        -> /var/www/whaviso (SPA)     |
                 |   |- api.whaviso.com /  -> 127.0.0.1:3001 (api)       |
                 |   \- api.whaviso.com /hooks/ -> 127.0.0.1:3002 (zap)  |
                 |        limit_req 20r/s, client_max_body_size 1m       |
                 |                                                      |
                 |   [ FRONTEIRA: JWT (Bearer) ]                        |
                 |   api :3001  (Fastify)                               |
                 |     - valida JWT Supabase via JWKS                    |
                 |     - escopo por-usuario em WHERE                     |
                 |     - role DB: whaviso_api                            |
                 |                                                      |
                 |   zap :3002  (Fastify + scheduler)                   |
                 |     - webhook Meta: HMAC X-Hub-Signature-256          |
                 |     - Send SMS Hook: HMAC Standard Webhooks           |
                 |     - role DB: whaviso_zap                            |
                 +----------+---------------------+---------------------+
                            | pg (session pooler)  | HTTPS (Graph API)
              +-------------+------------+   +-----+---------------+
              |  Supabase cloud           |   |  Meta Cloud API     |
              |  Postgres + Auth (GoTrue) |   |  graph.facebook.com |
              |  PostgREST (RLS deny-all) |   +---------------------+
              |  roles: whaviso_api/_zap  |
              |  service_role (bypassa RLS)|
              +----------------------------+

  api <-> zap: SEM chamada direta. So via banco (OUTBOX: envios,
               notificacoes_cobrador, notificacoes_billing) com
               claim FOR UPDATE SKIP LOCKED. Nunca importam um ao outro.

  Frontend: supabase-js SO para login (Google id_token / phone OTP);
            NUNCA supabase.from(); todo dado via api_client (Bearer).
```

Fronteiras (onde o dado passa de nao-confiavel para confiavel):
1. Internet -> Cloudflare -> nginx (borda de rede: ufw + CF).
2. Cliente -> api: JWT Bearer validado por JWKS.
3. Meta / Supabase-cloud -> zap: assinatura HMAC do corpo cru.
4. api/zap -> Postgres: roles de banco de privilegio minimo + RLS.
5. api <-> zap: banco compartilhado (outbox); cada um escreve so o que tem GRANT.

### Modelo de ameaças (resumo)

| Ativo | Ameaça principal | Controle atual | Resíduo (achado) |
|---|---|---|---|
| PII (telefones, Pix, titular/banco) | Vazamento via PostgREST com anon key pública | RLS deny-all em todas as tabelas | Depende de lembrar RLS em tabela nova (M3) |
| Banco inteiro | service_role (bypassa RLS) vaza de um processo | Chave só em env de servidor | Presente também no zap internet-facing (H1/M1) |
| Estado de negócio | Corromper via outbox / replay | Claim SKIP LOCKED, dedupe por índice, idempotência por estado, HMAC | GRANT do zap amplo demais (M4); durabilidade do inbound (zap 1/2/3) |
| Disponibilidade | DDoS / exaustão | Cloudflare + nginx 20r/s + pools pequenos + MemoryMax | VM único = SPOF (L5); limiter da app burlável (M2) |
| Login / conta | Enumeração / brute force | Tokens 256-bit hash, rate limit | Oracle de existência por telefone (L4); merge por telefone não verificado (api M2) |

---

## 4. Achados por área

Nomenclatura de severidade: Crítica, Alta, Média, Baixa, Informativa. Cada achado traz o que é, o risco, a evidência (arquivo:linha) e a correção. O status de cada um (corrigido agora, diferido, ou ação manual) está em `RISCOS-ACEITOS-E-DIFERIDOS.md` e `RUNBOOK-ACOES-MANUAIS.md`.

### 4.1 Frontend (SPA React/Vite)

**F1. CSP não inclui as origens do Google Identity Services (Média, a verificar no publicado).**
A SPA carrega `https://accounts.google.com/gsi/client` (script + iframe + fetch), mas a CSP publicada tem `script-src 'self'`, sem `frame-src` e sem Google no `connect-src`. Ou o login Google está quebrado em produção, ou a CSP foi relaxada à mão no servidor (drift em relação ao repo). Risco: a "correção" tentadora de usar `'unsafe-inline'`/wildcard destruiria a proteção anti-XSS. Evidência: `deploy/nginx/whaviso.conf:55`, `frontend/src/modules/auth/components/GoogleLoginButton.tsx:35,46-52,114-130`. Correção: adicionar EXATAMENTE `https://accounts.google.com` a `script-src`/`frame-src`/`connect-src`, sem afrouxar o resto (fix aplicado no nginx do repo; validar no site publicado após deploy).

**F2. Tokens de sessão (access + refresh) em localStorage (Média/Baixa).**
Padrão do `supabase-js` (`persistSession: true`). Um XSS no domínio poderia exfiltrar os tokens. Mitigado hoje pela CSP e ausência de vetor XSS. Evidência: `frontend/src/shared/supabase/client.ts:24-30`. Correção: manter CSP apertada (F1); avaliar `detectSessionInUrl: false` (o app não usa fluxo por redirect); no painel Supabase manter TTL curto + rotação de refresh (runbook). Migração para cookie HttpOnly é mudança de arquitetura, diferida.

**F3. Parâmetro `next` de redirect sem allowlist (Baixa, defense-in-depth).**
`next` é lido cru e usado na navegação pós-login. Open redirect externo não é explorável numa SPA pura (a History API barra cross-origin), mas vale higienizar. Evidência: `frontend/src/app/guards.tsx:48`, `Login.tsx:81`, `GoogleLoginButton.tsx:124`. Correção: validar que `next` é caminho interno (`/`, mas não `//` nem `/\`) antes de navegar.

**F4. `VITE_WHATSAPP_VENDAS` obsoleto no `.env` vai pro bundle (Baixa/Informativa).**
Tudo com prefixo `VITE_` é embutido no cliente. Essa var está obsoleta (o número agora vem da API). PII de baixa sensibilidade. Evidência: `frontend/.env`. Correção: remover a var; reforçar por convenção que `VITE_*` só recebe valor público.

**F5. `index.html` embute nome civil + CNPJ do MEI (Informativa).**
Decisão deliberada de SEO e revisão da Meta. CNPJ é público. Sem risco técnico. Sem correção.

**F6. Endurecimentos menores de CSP (Informativa).**
Adicionar `object-src 'none'`; `style-src 'unsafe-inline'` é padrão de baixo risco (migrar para hash/nonce no futuro). Evidência: `deploy/nginx/whaviso.conf:55`.

**F7. Guards de rota são UX, não segurança (Informativa, load-bearing).**
Os guards do front são UX; a autorização real precisa estar na api (validada no achado da api: sem IDOR encontrado, admin atrás de `requireRole('owner')`). Evidência: `frontend/src/app/guards.tsx:1-5`.

### 4.2 API (`backend/apps/api`, Fastify)

**M1 (api). Rate limiting burlável por spoof de X-Forwarded-For (Média).**
`trustProxy: true` + rate-limit chaveado por `req.ip` deixam o XFF spoofável (o Fastify pega o valor mais à esquerda, controlado pelo cliente). Anula os limites anti-enumeração (status-telefone 12/min), anti-brute-force (/acao 10/min) e anti-DoS (100/min). Evidência: `backend/apps/api/src/app.ts:39,56`, `modules/auth/index.ts:17`, `modules/acoes_devedor/index.ts:8`. Correção: `trustProxy: 'loopback'` (com bind em 127.0.0.1 e o nginx enviando o IP real no XFF), para o `req.ip` voltar a ser o IP real.

**M2 (api). Merge de conta ancorado em telefone NÃO verificado (Média, com pré-condição).**
No login OTP, o backend mescla contas por `profiles.telefone`, coluna que é gravada sem verificação de posse no `PATCH /perfil` (só o backfill é gated por OTP). Se um usuário Google digitar por engano o telefone de outra pessoa, quem controla aquele número, ao logar por OTP, é mesclado à conta Google alheia. Não é explorável ativamente pelo atacante (ele não controla o telefone da vítima), mas o gatilho depende de dado não verificado. Evidência: `backend/apps/api/src/modules/auth/index.ts:53-88`, `modules/perfil/index.ts:62-104`. Correção recomendada: exigir prova de posse do telefone também no lado da conta Google antes de mesclar, ou condicionar a escrita de `profiles.telefone` a identidade OTP.

**L1 (api). JWT: `audience` não validado (Baixa).**
`jwtVerify` roda só com `{ issuer }`; não valida `aud` (Supabase usa `authenticated`). Evidência: `backend/apps/api/src/shared/auth/index.ts:54,74`. Correção: passar `audience: 'authenticated'`.

**L2 (api). JWT: algoritmo não fixado (Baixa, hardening).**
`jwtVerify` sem `algorithms`. O jose já rejeita `alg:none` e não casa HS* com chave assimétrica do JWKS, mas fixar o algoritmo é a prática recomendada. Cuidado: pinar o algoritmo errado quebra a auth; exige confirmar o alg do projeto (ES256 vs RS256). Evidência: `shared/auth/index.ts:45,54,74`.

**L3 (api). Sem cabeçalhos de segurança nas respostas (Baixa).**
Falta `@fastify/helmet`/equivalente (nosniff, Referrer-Policy, no-store em respostas autenticadas). Impacto menor por ser API JSON. Evidência: `backend/apps/api/src/app.ts`. Correção: registrar helmet com config mínima + `Cache-Control: no-store` nas respostas autenticadas.

**L4 (api). Coluna dinâmica frágil em `PATCH /perfil` (Baixa, seguro hoje).**
O handler monta o SET iterando `Object.entries(req.body)` e injeta o nome da coluna na string SQL. Seguro hoje porque o Zod estreita as chaves (só `nome`/`telefone`). Fragilidade do padrão, não brecha ativa. Evidência: `backend/apps/api/src/modules/perfil/index.ts:66-71`. Correção: whitelist explícita de colunas (padrão de `avisos/service.ts camposEditados`).

**I1..I4 (api, Informativa).** `autenticarOpcional` é código morto; CORS `credentials:true` desnecessário (auth é Bearer); rate-limit em memória (ok p/ 1 VM); handler de erro loga o objeto cru (logar `err.message`/código). Evidências: `shared/auth/index.ts:70-82`, `app.ts:55-56`, `shared/http_errors/index.ts:55`.

### 4.3 ZAP (`backend/apps/zap`, scheduler + webhook)

**ACHADO 1 (zap). Inbound não deduplicado (Média).**
A Meta entrega webhooks at-least-once. O zap não guarda/confere o `wamid` antes de processar. Handlers não idempotentes (ex.: `contarErroNumero`) são reexecutados em reentrega/replay, inflando o contador e podendo bloquear/regenerar convite antes da hora. Evidência: `shared/meta_client/index.ts:142`, `modules/webhook_whatsapp/repo.ts:311-353`. Correção: tabela append-only com `unique(wamid)` e dedupe no início dos handlers (padrão inbox, casa com ACHADO 3).

**ACHADO 2 (zap). Envio duplicado ao devedor em crash entre enviar e marcar (Média).**
Se o processo cair entre `whats.enviarMensagem` e `repo.marcarEnviado`, `ressuscitarTravados` devolve a linha e reenvia. Outbox at-least-once sem chave de idempotência no envio. Evidência: `modules/enviar_lembretes/index.ts:97-98`, `repo.ts:42-48`. Correção: registrar o `wamid` imediatamente / minimizar a janela; documentar a semântica.

**ACHADO 3 (zap). Webhook responde 200 antes de processar (Média).**
`void processarWebhook(...)` responde 200 e processa em background; erro no processamento perde o evento (a Meta não reenvia após 200). Perde aceite, "Já paguei", opt-out, wizard Pix. Evidência: `shared/meta_client/index.ts:173-181`. Correção: persistir o evento cru antes do 200 (inbox) e drenar com retry idempotente; ou responder não-2xx em falha.

**ACHADO 4 (zap). Sem rate limit / bodyLimit nos endpoints públicos (Média).**
`/webhook/whatsapp`, `/hooks/send-code`, `/healthz` sem rate limit; body default 1MB. Risco de flood/DoS num daemon único e crítico. Evidência: `backend/apps/zap/src/app.ts:28-32`. Correção: `@fastify/rate-limit` por IP + `bodyLimit` apertado (~128KB) no webhook + firewall da 3002.

**ACHADO 5 (zap). Verify token do handshake GET não constant-time (Baixa).**
Compara `hub.verify_token` com `===`. Evidência: `shared/meta_client/index.ts:167`. Correção: `crypto.timingSafeEqual`.

**ACHADO 6 (zap). OTP hook não valida frescor do timestamp (Baixa).**
Standard Webhooks: assinatura inclui o timestamp mas não checa janela, permitindo replay. Evidência: `modules/hook_otp/verificar_assinatura.ts:28-43`. Correção: rejeitar se `|now - timestamp| > 5min`.

**ACHADO 7 (zap). `/healthz` expõe número do WhatsApp + trustProxy + bind (Baixa).**
Retorna o número de exibição do negócio; `trustProxy: true` e bind `0.0.0.0`. Evidência: `app.ts:53,31`, `server.ts:103`, `meta_client/index.ts:207`. Correção: remover `numero` do healthz público; `trustProxy: 'loopback'`; bind 127.0.0.1; firewall.

**ACHADO 8 (zap). Token de acesso da Meta de longa duração, sem rotação (Informativa).**
`META_ACCESS_TOKEN` (System User) no `.env`, sem cofre nem rotação. Evidência: `server.ts:42`, `graph.ts:36`. Correção (operacional): cofre + rotação + alerta erro 190 + System User com permissão mínima.

### 4.4 Integração (fronteiras, RLS, roles, infra)

**H1. service_role key presente nos DOIS processos, inclusive o exposto à internet (Alta).**
A `SUPABASE_SERVICE_ROLE_KEY` (bypassa RLS + Admin API) é lida pela api E pelo zap. O zap fala com a internet (webhook Meta, Send SMS Hook). Comprometer o zap (RCE por dependência, bug de parsing) entrega a service_role: leitura/escrita de TODAS as tabelas via PostgREST e takeover de contas via Auth admin, ignorando o role `whaviso_zap`. Evidência: `backend/apps/api/src/env.ts:16`, `apps/zap/src/env.ts:40-43`, `apps/zap/src/server.ts:55-58`, `deploy/whaviso.env.example:17`. Correção recomendada: isolar o uso da Admin API num único ponto (idealmente só a api); o zap chamar um endpoint interno da api para criar conta no aceite, mantendo a service_role fora do processo internet-facing. No mínimo, rotacionar a chave e documentar "service_role vazada = incidente total".

**M1 (integração). EnvironmentFile único: cada processo carrega os segredos do outro (Média).**
api e zap usam o mesmo `/etc/whaviso/whaviso.env`. O ambiente de cada processo contém TODAS as vars (as duas connection strings, service_role, META_*, hook secret). A separação de privilégio some na camada de SO. Evidência: `deploy/systemd/whaviso-api.service`, `whaviso-zap.service`, `deploy/whaviso.env.example`. Correção: dividir em `api.env` e `zap.env`, cada `.service` apontando só ao seu.

**M2 (integração). trustProxy: true torna o rate limiter burlável e envenena o IP nos logs (Média).**
Igual ao M1 da api, vale para api e zap. O limiter efetivo hoje é só o do nginx (por CF-Connecting-IP, não forjável); se o nginx for contornado (L1), a app fica sem limiter. Evidência: `apps/api/src/app.ts:39`, `apps/zap/src/app.ts:31`. Correção: `trustProxy: 'loopback'` + nginx enviando o IP real no XFF.

**M3 (integração). Deny-all do PostgREST depende de lembrar RLS; falta REVOKE e teste (Média).**
Não há `revoke ... from anon, authenticated` explícito nem teste de cobertura de RLS. Se uma migration futura criar tabela e esquecer o `enable row level security`, ela fica legível/gravável pela anon key (pública no front). Evidência: migrations sem REVOKE executável; anon key em `frontend/.env.example`. Correção: migration com REVOKE + `alter default privileges ... revoke`, e um check no CI que falha se alguma tabela public tiver `relrowsecurity=false`.

**M4 (integração). GRANT do zap na outbox/carteira é por-linha amplo (Média).**
zap tem `grant select, update on envios` (linha inteira) e `grant select, update on creditos_carteira` com policy `for all`, diferente do cuidado por-coluna que já existe em `avisos`. Um bug/compromisso do zap pode sobrescrever colunas que a api é dona. Evidência: `backend/supabase/migrations/0008_roles_rls.sql:30,57`, `0057_creditos_carteira.sql:187,203`. Correção: restringir por coluna (só as que o zap escreve).

**L1..L6 (integração, Baixa).** bind 0.0.0.0 (esconder as portas depende só do ufw) -> bindar 127.0.0.1; JWT sem `aud` (mesmo L1 da api); webhook fire-and-forget (mesmo ACHADO 3 do zap); oracle de existência por telefone (necessário para UX pré-OTP, rate-limited); VM único = SPOF (aceito para o estágio); path `/webhook/whatsapp` ainda não exposto no nginx (pré-requisito funcional do deploy da Meta). Evidências detalhadas no relatório de origem.

---

## 5. Distribuição das ações

- Correções aplicadas agora (hardening seguro e localizado): ver commits/diffs e o resumo em `RISCOS-ACEITOS-E-DIFERIDOS.md`.
- Achados diferidos (arquiteturais ou que pedem decisão de produto): `RISCOS-ACEITOS-E-DIFERIDOS.md`.
- Ações que só o dono aplica (servidor, painel Supabase, rotação de chaves, deploy, aplicar migrations no cloud): `RUNBOOK-ACOES-MANUAIS.md`.

---

## 6. Controles corretos (o que já está bem feito, não regredir)

**RLS / dados**
- RLS habilitada em todas as tabelas atuais, sem policy para anon/authenticated. Tabelas antigas foram DROPADAS, não deixadas sem RLS.
- Roles `whaviso_api`/`whaviso_zap`: `login noinherit nosuperuser nocreatedb nocreaterole nobypassrls`.
- Sem DELETE em tabelas de negócio/auditoria (exceção documentada: `whaviso_api` em `templates`, que é config).
- View `combinado_linhas` com `security_invoker = true`. Funções `SECURITY DEFINER` todas com `search_path` fixo.

**API**
- Isolamento multi-tenant forte (sem IDOR): todo acesso a recurso filtra por `uid` no WHERE. Admin atrás de `requireRole('owner')` com revalidação de assinatura/suspensão/role. Owner não se auto-suspende. Bloqueio de conta suspensa em toda rota autenticada.
- SQL 100% parametrizado; partes dinâmicas usam só índices de placeholder ou constantes do servidor.
- Zod em body/params/query de toda rota; descarta chaves desconhecidas (barra mass-assignment).
- Tokens: `randomBytes(32)` (256 bits), persistidos só como sha256; convite via `crypto.randomInt` com anti-brute-force. Billing sob `FOR UPDATE`, livro-razão append-only.

**ZAP**
- HMAC do webhook Meta verificado em todo POST, sobre o corpo cru, com `timingSafeEqual` e checagem de comprimento. Sem bypass encontrado.
- OTP hook (Standard Webhooks) com `timingSafeEqual`. Sem SSRF (não faz fetch de mídia inbound). Sem injeção de template (parâmetros JSON estruturados). Telefone normalizado, `preview_url:false`.
- Retry limitado a 3 com backoff aleatório; erros permanentes não retentados. Claim de outbox `FOR UPDATE SKIP LOCKED`, cálculo de janela/etapa no servidor em America/Sao_Paulo. Encerramento limpo (SIGINT/SIGTERM).

**Integração / infra**
- Cloudflare na frente; ufw `default deny incoming`, 80/443 só das faixas CF. nginx com HSTS+preload, nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, CSP restritiva, `server_tokens off`, `client_max_body_size 1m`, `limit_req 20r/s` por IP real.
- CORS single-origin exato (não wildcard). Auth por Bearer (sem CSRF).
- systemd hardening: NoNewPrivileges, ProtectSystem, ProtectHome, PrivateTmp, RestrictSUIDSGID, MemoryMax, Restart=on-failure. Pools pequenos + connectionTimeout.
- CI/CD com `permissions: contents: read`, chave de deploy com forced-command, secrets nunca ecoados. `.gitignore` cobre `.env`/`secrets`; verificado que só os `*.example` estão no git.
- `npm audit` = 0 vulnerabilidades nos três workspaces do backend e no frontend (na data da auditoria).

---

## 7. Nota de manutenção

Este documento é um retrato de 2026-07-06 na branch `development`. Reexecute a auditoria (e o `npm audit`) após mudanças relevantes de arquitetura, ao expor o webhook da Meta em produção, e periodicamente. As correções aplicadas e as pendências estão rastreadas nos dois documentos companheiros nesta mesma pasta.
