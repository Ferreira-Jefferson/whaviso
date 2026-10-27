# F6 front-shell

- **ID:** F6  ·  **Área:** F (frontend)  ·  **Onda:** 0
- **Modelo sugerido:** Sonnet  ·  **Status:** `A FAZER`
- **Reivindicado por:** (livre)

## Objetivo

Entregar o shell da SPA (`frontend/`, React 19 + Vite 7 + TS estrito + Tailwind v4) sobre o qual todas as
telas `FR-*` entram: roteamento e layout, `api_client` (REST com contratos gerados), autenticação
(login via `supabase-js` **só para obter o JWT**), consumo de `_generated`, ui kit base, seletor de loja
com branding, e cliente de realtime (SSE). "Pronto" observável: o usuário loga, o shell mostra o seletor
de loja com cores/logo da loja ativa, navega por rotas protegidas (placeholders), chama a api com Bearer e
envelope de erro tratado, e recebe eventos realtime que invalidam queries. **As telas específicas
(cardápio, pedidos, etc.) NÃO entram aqui** (são `FR-*`).

## Dependências

- `F1`: `_generated` (contratos) e o regra de lint contra `@whaviso/shared`.
- `F4`: api no ar (envelope de erro, `/healthz`, convenção de rotas) para o `api_client` e o login e2e.
  (O endpoint SSE de F5 é consumido, mas o cliente é testado com servidor fake; a integração real fecha
  quando F5 estiver pronto.)

## Contratos e tabelas que toca

Nenhuma tabela. Consome contratos gerados: `ErroApi`, `SessaoDto`, `EscopoLoja`, DTO de loja (branding:
nome, `logo_url`, `cores`), `CanalRealtime`/`EventoDominio`. O front **nunca** fala com o banco; o
`supabase-js` é usado apenas para login/sessão. Zero `service_role`.

## Arquivos (escopo de edição)

- `frontend/src/app/**` (providers, router, layout/shell, guards)
- `frontend/src/shared/api_client/**`
- `frontend/src/shared/auth/**`
- `frontend/src/shared/supabase/**` (cliente só de auth)
- `frontend/src/shared/ui/**` (ui kit base)
- `frontend/src/shared/tenant/**` (seletor de loja + branding)
- `frontend/src/shared/realtime/**` (cliente SSE)
- `frontend/src/shared/format/**` (moeda em centavos, data America/Sao_Paulo)
- `frontend/src/shared/contracts/_generated/**` **somente leitura** (importar, nunca editar)
- `frontend/src/main.tsx`, `frontend/src/index.css`, `frontend/index.html`, `frontend/package.json`,
  `frontend/vite.config.*`, `frontend/eslint.config.*`
- `frontend/src/modules/**` **fora do escopo** (telas de `FR-*`; o legado de cobrança não é tocado aqui)

## Etapas

- [ ] 1. Inventário do `frontend/src` atual (app/shared/modules, `sync`, `pix`, cobrança): o que
  reaproveita (api_client, auth, ui base) e o que o pivô aposenta. Registrar em Notas.
  (commit: `chore(frontend): inventario do shell atual`)
- [ ] 2. **Artifact primeiro** do shell: layout desktop + mobile (navegação lateral/bottom bar, topo com
  seletor de loja, estado vazio/carregando/erro). Aprovado, linkado em "Design". Sem código antes.
- [ ] 3. Tokens de design (cores, tipografia, espaçamento, raio) em Tailwind v4 (`@theme`), com
  **branding por loja** via variáveis CSS (`--cor-primaria`...) aplicadas do `cores` da loja ativa.
  (commit: `feat(frontend): tokens de design e tema por loja`)
- [ ] 4. ui kit base em `shared/ui`: Button, Input, Select, Dialog, Toast, Tabs, Card, Badge, Skeleton,
  EmptyState, ErrorState, Spinner, Tabela básica; acessíveis (foco, aria, teclado), responsivos.
  Cada componente com teste de renderização/acessibilidade.
  (commit: `feat(frontend): ui kit base`)
- [ ] 5. `shared/format`: `formatarCentavos` (BRL), data/hora em America/Sao_Paulo a partir de ISO UTC.
  Testes de unidade, incluindo virada de dia e horário de verão histórico.
  (commit: `feat(frontend): formatacao de moeda e data`)
- [ ] 6. Importar `_generated`: configurar alias/`tsconfig` e confirmar que o typecheck passa só com o
  gerado local. Confirmar a regra de lint contra `@whaviso/shared`.
  (commit: `chore(frontend): consumo do _generated`)
- [ ] 7. `shared/supabase` + `shared/auth`: cliente supabase configurado **só** com URL e anon key
  públicas, persistência de sessão, `useSessao`, login (Google OAuth e/ou OTP conforme o auth vigente),
  logout, refresh automático; sem nenhuma query a tabela. Guard de rota.
  (commit: `feat(frontend): autenticacao via supabase-js so para JWT`)
- [ ] 8. `shared/api_client`: wrapper de `fetch` com Bearer do JWT atual, base URL de config, parse e
  **validação Zod da resposta** com os contratos gerados, tradução do envelope `{ error: { code,
  message } }` para um erro tipado, tratamento de 401 (refresh uma vez, depois logout) e 403/429.
  Integração com TanStack Query (defaults, retry só em erro transitório).
  (commit: `feat(frontend): api_client com contratos gerados e erro tipado`)
- [ ] 9. `shared/tenant`: carrega `GET` de lojas do usuário, seletor de loja (persistência por usuário em
  `localStorage` com try/catch), aplica branding (logo/cores) ao shell, envia a loja ativa no header
  esperado pela api; troca de loja **limpa o cache de queries**. Estado "sem loja" (onboarding mínimo,
  sem implementar a tela de criar loja, que é de `FR-nucleo`).
  (commit: `feat(frontend): seletor de loja e branding`)
- [ ] 10. `shared/realtime`: cliente SSE via `fetch` stream (envia Bearer), reconexão com backoff,
  heartbeat watchdog, `Last-Event-ID`, e ponte para TanStack Query (`invalidateQueries` por tipo de
  evento; no evento `resync` ou reconexão, invalida tudo). API de hook `useRealtime(tipo, handler)`.
  Testado com servidor SSE fake. (commit: `feat(frontend): cliente de realtime SSE`)
- [ ] 11. Shell/layout e roteamento: `app/` com router, rotas protegidas, layout responsivo (nav,
  topo), páginas placeholder por área (`/pedidos`, `/cardapio`...) apenas como slots vazios que os
  `FR-*` preencherão; 404 e erro global (error boundary). Registry de rotas por módulo (1 linha por
  módulo), espelhando a regra do backend. (commit: `feat(frontend): shell, rotas protegidas e layout`)
- [ ] 12. Transpor o artifact aprovado do shell sem degradar (desktop e mobile conferidos num browser).
  (commit: `feat(frontend): shell conforme artifact aprovado`)
- [ ] 13. Teste de fumaça e2e leve (browser ou testing-library): login mockado -> shell -> chamada
  autenticada -> troca de loja limpa cache -> evento realtime invalida query.
  (commit: `test(frontend): fluxo do shell`)
- [ ] 14. Verificação de bundle: build não contém `service_role` e só a anon key esperada. (SEC-025)
  (commit: `test(frontend): bundle sem service_role (SEC-025)`)
- [ ] 15. `npm run lint`, `typecheck`, `build` verdes; abrir o app e conferir o shell em tela larga e estreita.

## Testes e segurança exigidos

- Unidade: `format` (centavos, fuso), `api_client` (envelope, 401 com refresh, validação Zod falhando de
  forma visível), `realtime` (reconexão, resync, parse), `tenant` (troca limpa cache, branding), guards.
- **SEC-025**: o build do front não contém `service_role`; só a anon key pública. Script faz grep no
  `dist/`.
- **SEC-010** (lado cliente): nenhum `supabase.from(...)`/`.rpc(...)` no front; regra de lint ou teste
  de busca falha se existir. Todo dado passa pela api.
- **SEC-001/002** (lado cliente): o front nunca envia `loja_id` no corpo de escrita; o escopo vai por
  header validado no servidor. Teste de contrato do `api_client` garante o header e a ausência no corpo.
- **SEC-040**: token expirado leva a refresh/logout, nunca a request sem credencial silenciosa.
- **SEC-020/024**: o `api_client` não loga corpo nem header; nenhum segredo em `localStorage` além do que
  o `supabase-js` persiste por padrão.

## Design

Artifact visual do shell (desktop + mobile): **a criar na etapa 2** (link: `<preencher ao aprovar>`).
O código segue o artifact. Referências de inspiração: consoles de operação de restaurante (painéis
kanban/pedidos), shells de SaaS multi-tenant com seletor de loja. Usar as skills de design do projeto.

## Notas e decisões

- O front é standalone: importa **só** `_generated`, nunca `@whaviso/shared` (lint de F1 barra).
- `EventSource` nativo não envia `Authorization`; por isso o cliente SSE usa `fetch` com stream (alinhado
  com F5). JWT em query string foi descartado (vaza em log de proxy).
- `localStorage` só para conveniência (loja ativa), sempre em try/catch e com o app funcionando sem ele.
- O legado de cobrança em `frontend/src/modules/**`, `shared/sync`, `shared/pix` não é apagado aqui;
  a limpeza é um commit coordenado à parte (registrar e perguntar ao dono), para não quebrar o build no
  meio da onda. O shell novo não deve importar nada desses diretórios.
- Telas (lojas, números, cardápio, pedidos, conversas, clientes) são de `FR-nucleo`; este módulo deixa só
  slots de rota e o registry para elas se encaixarem com 1 linha.
