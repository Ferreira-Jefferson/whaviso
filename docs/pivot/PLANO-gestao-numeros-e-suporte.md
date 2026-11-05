# Plano: gestão de números pelo operador + suporte com acesso assistido

> Decisão do Jeff (2026-11-04). Fonte de verdade da decisão: memória `whaviso-gestao-numeros-operador`.
> Este é o plano de execução (decomposição, fronteiras, fases). Regra de negócio canônica continua em
> `historias/`. Disciplina: cada módulo testado é commitado pelo INTEGRADOR ao integrar; subagente não commita.

## Modelo (vocabulário travado)

```
whaviso (SaaS)
├── equipe whaviso (operador; papel de plataforma)
└── Conta (cliente = dono de restaurante)
    └── Loja (restaurante, a "empresa") → N números de WhatsApp
```

Alvo em 3 partes:
1. Loja gere os próprios números (self-service): JÁ EXISTE (`canais/numeros` + módulo `numeros_whatsapp`).
2. Operador gere números de QUALQUER loja pelo console (acesso padrão só números + metadados). CONSTRUIR.
3. Operador tem acesso ao CONTEÚDO (conversas) de uma loja SÓ sob consentimento do dono (acesso assistido,
   temporário, revogável, auditado). CONSTRUIR. Quebra o SEC-003 de forma controlada.

## Chaves de permissão novas (chave é globalmente única; prefixos distintos por escopo)

- console `numeros_plataforma:ver`  — "Ver numeros de WhatsApp das lojas (todas as contas)" — padrao: suporte, operador
- console `numeros_plataforma:gerir` — "Conectar, pausar e reconectar numeros de qualquer loja" — padrao: operador
- console `suporte_plataforma:ver` — "Ver chamados de suporte e acessos assistidos" — padrao: suporte, operador
- console `suporte_plataforma:atender` — "Responder chamados e abrir sessao de acesso assistido" — padrao: suporte, operador
- loja `suporte_loja:gerir` — "Abrir chamado de suporte e conceder/revogar acesso assistido" — padrao: gerente

Os rótulos e padrões ACIMA têm que bater EXATAMENTE entre `catalogo.ts` e a migration (teste de paridade).

## Migrations (números reservados)

- `0098_plataforma_numeros_permissoes.sql`: insere as 2 permissões de console de números + seed em
  `papel_permissoes` (molde 0073: insert em `permissoes` + insert em `papel_permissoes` com ON CONFLICT DO NOTHING).
- `0099_acesso_suporte.sql`:
  - permissões: `suporte_plataforma:ver/atender` (console), `suporte_loja:gerir` (loja) + seed.
  - `chamados_suporte` (id uuid, loja_id fk lojas, assunto text, status text check aberto|respondido|resolvido
    default 'aberto', criado_por uuid, criado_em, atualizado_em + trigger tocar_atualizado_em).
  - `chamados_suporte_mensagens` (id uuid, chamado_id fk, autor_tipo text check loja|operador, autor_user_id uuid,
    texto text, criado_em).
  - `acessos_suporte` (id uuid, loja_id fk, chamado_id fk null, concedido_por uuid, motivo text, criado_em,
    expira_em timestamptz not null, revogado_em timestamptz null, revogado_por uuid null).
  - `acessos_suporte_log` (id bigint identity, acesso_id fk, operador_user_id uuid, loja_id uuid, acao text,
    recurso text, criado_em) — APPEND-ONLY.
  - grants: `whaviso_api` select/insert/update (SEM delete, SEC-030); RLS enable + policy api. Entrada em
    `backend/security/matriz/privilegios.ts` (TABELAS_CONHECIDAS) para as 4 tabelas.

## Decomposição (ownership = sem conflito)

INTEGRADOR (Jeff/Claude principal) possui os arquivos COMPARTILHADOS e TODOS os commits:
- `catalogo.ts`, as duas migrations, `apps/api/src/routes.ts`, `frontend/src/app/arvore.tsx`,
  `OperadorShell.tsx` / nav da loja, regeneração de contratos (`gen:contracts` / `_generated`),
  `backend/security/matriz/privilegios.ts`, e a PONTE de acesso assistido no `shared/tenant` (crítica).

WAVE 0 (integrador): migrations 0098/0099 + catalogo.ts + privilegios.ts; `validate_migrations.sh whaviso_dev`
  + teste de paridade do catálogo + typecheck verdes. Commit. (desbloqueia e remove conflito de arquivo.)

WAVE 1 (subagentes, backend, paralelos, pastas disjuntas):
- NUM-BE: promover lógica de número para `apps/api/src/shared/numeros/**` (repo+service+porta meta_onboarding),
  refatorar `numeros_whatsapp` (rotas da loja) para consumir o kernel SEM mudar contrato/rotas, e criar
  `plataforma_numeros` (rotas de console: `/plataforma-numeros`, loja_id em params, `acesso:'plataforma'`,
  `escopoOperador` + `exigirPermissao('numeros_plataforma:*')`). Testes de integração + SEC (segredo write-only,
  SEC-003, cross-tenant por params). NÃO commitar, NÃO editar routes.ts/catalogo.
- SUP-BE: módulo `suporte` (api) dono de `chamados_suporte`/`mensagens`/`acessos_suporte`/`acessos_suporte_log`.
  Rotas da LOJA (`escopoLoja` + `suporte_loja:gerir`): abrir chamado, mandar mensagem, conceder/revogar acesso.
  Rotas do CONSOLE (`escopoOperador` + `suporte_plataforma:*`): listar chamados/acessos de qualquer loja,
  responder, abrir sessão assistida (registra em log). Testes + SEC. NÃO commitar, NÃO editar routes.ts/catalogo.

WAVE 1.5 (integrador): PONTE de acesso assistido — `escopoLoja` passa a aceitar identidade de OPERADOR quando
  existe `acessos_suporte` ATIVO (now < expira_em, revogado_em null) para a loja alvo, produzindo escopo de loja
  READ-ONLY; toda leitura de conteúdo nessa sessão grava `acessos_suporte_log`. Aplicar (read-only) a `conversas`.
  Commit próprio. SEC: sem consentimento ativo → 403; escrita bloqueada na sessão assistida.

WAVE 2 (subagentes, frontend, paralelos, pastas disjuntas):
- NUM-FE: tela de console `/plataforma/numeros` (listar por conta/loja, conectar/pausar/reconectar/remover).
- SUP-FE-LOJA: página "Suporte" da loja (abrir chamado, conversar, conceder/revogar acesso assistido).
- SUP-FE-CONSOLE: console de suporte (fila de chamados, responder, abrir sessão assistida, ver conversas quando
  houver consentimento).

INTEGRADOR, por módulo, ao receber: roda o gate (lint+typecheck+test, e test:security no backend), integra os
arquivos compartilhados, confirma verde, e commita AQUELE módulo (atômico). Migrations novas → perguntar sobre
`db push` no cloud no commit (regra do CLAUDE.md; autorização permanente de cloud para teste já existe).

## Fora de escopo (anotado, não construir agora)
- Modelo agência (uma conta operando outras contas) — descartado pelo Jeff.
- Consumidor do número oficial singleton (OTP/notificação pela marca) — feature separada.
- Lado Meta de produção (App Live, Business Verification, App Review, Embedded Signup via SDK, webhook de prod,
  templates por WABA) — ações no Business Manager, não código.
