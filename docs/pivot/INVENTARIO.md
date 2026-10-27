# Inventário do pivô: de cobrança para pedidos de restaurante por WhatsApp

> **Status:** proposta para aprovação. **Nada foi apagado ainda.** Este documento é a lista
> de exclusão (e o que se mantém) para o pivô, para o dono revisar item por item antes de
> qualquer remoção.
> **Data:** 2026-10-27.
> **Spec da nova direção:** "O Aviso, Fluxo de Pedido pelo WhatsApp (Restaurantes)".
> **Método:** classificação por 4 subagentes (api, zap, shared+schema, frontend) sobre o
> código real, mais a leitura das pastas de doc/infra. Legenda: **APROVEITA** (fica como
> está), **ADAPTA** (mantém a casca, reescreve o conteúdo), **APAGA** (remove limpo).

## 1. Resumo

O produto muda de **avisos de pagamento/cobrança** para **automação de pedidos de
restaurante por WhatsApp** (atendimento conversacional texto e áudio, cardápio digital,
painel de pedidos em kanban com impressão, rotas e motoboys, dashboard, multi-loja, builder
de fluxo tipo n8n). O que sobrevive é o **esqueleto**: Fastify + Supabase (Postgres + Auth),
login sem senha, transporte WhatsApp/Meta e submissão de templates, design system do front,
deploy/VPS/CI, padrão feature-first e a convenção de outbox. O que morre é **todo o domínio
de cobrança** (aviso, devedor, lembretes, confirmação de pagamento, carteira de créditos).

**Princípio (palavras do dono):** aproveitar o esqueleto bem feito, apagar o resto limpo,
sem resquício que confunda no futuro, sem drama.

## 2. APAGA (a lista de exclusão)

### 2.1 Backend `apps/api`
- `src/modules/avisos` (núcleo de cobrança: criar/listar/detalhar/cancelar aviso, tokens, aceite)
- `src/modules/acoes_devedor` (ações públicas do devedor por token)
- `src/modules/recebimentos` (confirmar/desmarcar pagamento, encerrar lembretes)
- `src/modules/billing` (carteira de créditos de envio)
- `src/modules/painel` (totais por papel, "precisa de você")
- `src/modules/pessoas` (combinados agrupados por telefone)
- `src/modules/produtos` (catálogo plano nome+preço, acoplado a combinado)
- `src/modules/categorias` (categorias do revendedor; **não** é a categoria de cardápio)
- `src/modules/itens` (autocomplete de itens de combinado)
- `src/modules/notificacoes` (central do cobrador)
- `src/shared/whats_sessao`, `src/shared/config_plataforma`, `src/shared/planos`,
  `src/shared/notificacoes`, `src/shared/notificacoes_billing`,
  `src/shared/storage_comprovantes`, `src/shared/validacao_comprovante`,
  `src/shared/catalogo.ts`, `src/shared/estados.ts`
- Os `tests/` dos módulos acima saem junto.

### 2.2 Backend `apps/zap`
- `src/modules/enviar_lembretes`, `src/modules/expirar_avisos`,
  `src/modules/notificar_billing`, `src/modules/notificar_cobrador`,
  `src/modules/testar_envio`
- `src/shared/creditos`, `src/shared/config_plataforma`, `src/shared/notificacoes`
- Dentro de `src/modules/webhook_whatsapp`: o conteúdo de regra de cobrança
  (`service.ts`, `repo.ts`, `wizard_pix.ts`) sai; o esqueleto do módulo é reescrito (ver ADAPTA).

### 2.3 Backend `packages/shared`
- `src/datas/horario_reservado.ts`, `horario_reservado_repo.ts` (+ testes)
- `src/ocorrencias/` (recorrência de aviso)
- Blocos de cobrança dentro de `contracts/enums.ts`, `entidades.ts`, `payloads.ts`,
  `datas/index.ts` (etapas/cadência/agendamento), `logger/index.ts` (paths de cobrança):
  removidos na reescrita dos arquivos (ver ADAPTA, não são delete do arquivo inteiro).

### 2.4 Banco de dados (schema)
As 103 migrations **não** são reaproveitadas: o caminho limpo é um **baseline novo** (poucas
migrations) que recria só o que sobra. Tabelas/conceitos que **saem** do novo baseline:
- `avisos` e satélites: `eventos_aviso`, `avisos_edicoes`, `avisos_reportes`,
  `aviso_ocorrencias`, `aviso_categorias`, `sessao_cadastro_pix`
- Billing de cobrança: `creditos_catalogo`, `creditos_carteira`, `creditos_lancamentos`,
  `creditos_hold`, `billing_comprovantes` (e planos/assinaturas já dropados)
- Notificações: `notificacoes_cobrador`, `notificacoes_billing`
- WhatsApp antigo: `whats_sessao` (Baileys/QR), `whats_teste_config`, `whats_teste_mensagens`
- `convite_tentativas_telefone`, `categorias`, `produtos` (modelo revendedor)

### 2.5 Frontend `frontend/src`
- `modules/avisos`, `modules/aceite`, `modules/devedor`, `modules/billing`,
  `modules/painel`, `modules/pessoas`, `modules/produtos`, `modules/landing`
- `app/layouts/GestaoLayout.tsx`, `app/AssinaturaBanner.tsx`
- `shared/auth/useVinculoDevedor.ts`, `shared/contracts/*` (enums/entidades/payloads de
  cobrança), `shared/contracts/linguagem.ts` (+ teste), `shared/plano/*`
- `shared/ui/CycleTimeline.tsx`, `IconePendencia.tsx`, `ListaCombinados.tsx`, `Recibo.tsx`
- Rotas legadas e redirects (`/aviso`, `/sair-lembretes`, `/meus/*`, `/app/avisos`,
  `/app/metricas`, `/app/categorias`)

### 2.6 Histórias, docs e raiz
- `historias/` : apaga **o conteúdo** (19 épicos + `planos/` + `verificacao/`); **mantém a
  pasta** para as histórias novas de restaurante.
- `PROJETO.md`, `README.md`, `ESTUDO-revendedores-venda-direta.md`
- `docs/feedback-2026-07-22.md`, `docs/planos/*`, `docs/qa/PLAN.md`
- `business/` (marketing do produto antigo: briefing, ideias, criativos, potenciais clientes)

## 3. APROVEITA (esqueleto que fica, não encostar)

- **Backend api infra:** `src/server.ts`, `src/shared/auth` (JWT/JWKS), `src/shared/http_errors`,
  `src/shared/eventos_auth`, `src/shared/supabase_admin`, `src/shared/tokens`, `modules/auth`.
- **Backend zap transporte:** `src/shared/meta_client` (núcleo), `src/shared/whats` (contrato),
  `webhook_eventos_processados` (idempotência).
- **Shared:** `contracts/pix.ts` (+ teste), `contracts/render.ts` (+ teste), `config/`, `db/`,
  `datas` (só `TZ`/`hojeSp`/formatadores).
- **Frontend shell:** `main.tsx`, `app/providers`, `ErrorBoundary`, `NotFound`, layouts
  públicos, `shared/api_client`, `shared/supabase`, `shared/auth` (sessão/OTP),
  `shared/ui/*` (design system: Button, Card, Input, Dialog, Toast, StatCard, etc.),
  `shared/format` (formatadores brl/data/telefone).
- **Infra/dev:** `deploy/` inteiro (nginx, systemd, scripts, `CICD.md`, `META_CLOUD_API.md`,
  envs), `docs/seguranca/*`, `backend/scripts/*`, `secrets/`,
  `package.json` raiz, `.gitignore`, skills `frontend-design`/`deploy`.

## 4. ADAPTA (mantém a casca, reescreve o conteúdo)

- **api:** `app.ts`, `routes.ts`, `env.ts` (limpar cobrança, registrar módulos novos);
  `modules/admin` (manter submissão de templates à Meta + teste WhatsApp + suspender
  usuário; apagar métricas/avisos/créditos/config-plataforma; provável extrair `templates`
  para módulo próprio); `modules/perfil` (manter perfil, tirar chaves Pix pessoais);
  `modules/sync` (polling por versão, reapontar para pedidos/conversas da loja).
- **zap:** `meta_client`/`whats`/`webhook_whatsapp`/`sincronizar_templates`/`templates`/
  `sessao`/`retry.ts`/`scheduler.ts`/`app.ts`/`server.ts`/`env.ts`: transporte reaproveitado,
  mas migra de **single-número global** para **multi-loja** (credenciais por WABA via Embedded
  Signup, roteamento do inbound por `phone_number_id`, suporte a áudio/STT, mídia, listas).
- **shared:** `enums.ts`, `entidades.ts`, `payloads.ts` (manter bloco de template/erro/
  primitivos, apagar cobrança, escrever o do novo domínio), `linguagem.ts` (manter travessão
  e gênero neutro que são convenção do repo; tirar o vocabulário proibido de cobrança),
  `logger/index.ts` (trocar paths sensíveis), `datas/index.ts` (manter TZ/formatadores).
- **Banco (novo baseline mantém, adaptado):** `profiles`/auth (vira Conta -> Lojas -> Números),
  `eventos_auth`, `templates` (por loja/branding), `envios` (outbox genérica),
  `webhook_eventos_processados`, `config_plataforma`, `chaves_pix` (vira Pix por loja),
  roles `whaviso_api`/`whaviso_zap` + RLS/grants, `seed.sql`.
- **Frontend:** `app/router.tsx`, `nav.ts`, `AppShell.tsx`, `guards.tsx` (tirar guard de
  vínculo devedor, manter auth/papéis, adicionar seletor de loja + branding);
  `index.css` (tokens viram branding por empresa + status do kanban); `modules/admin`
  (shell da plataforma + editor de templates), `modules/categorias` (vira categoria de
  cardápio), `modules/notificacoes` (sino vira alerta de pedido), `modules/conta` (vira
  conta/loja/branding + Pix da loja), `modules/legal` (reescrever texto, manter estrutura);
  `shared/sync`, `shared/pix`, `shared/ui/StatusBadge`, `WhatsAppPreview`, `ChavePixInput`,
  `RodapeSite`/`BellLogo` (marca), `shared/format` (dividir: manter formatadores, trocar rótulos).
- **Raiz/skills:** `CLAUDE.md` (manter arquitetura/comandos/acesso ao servidor; reescrever a
  parte de negócio), `chrome-qa-loop.config.json` + skill `chrome-qa-loop` (re-apontar os
  "docs donos" para as novas histórias), skill `marketing-generator` (novo produto).

## 5. Decisões de projeto (não travam a exclusão, mas definem a reconstrução)

Coletadas dos 4 agentes. Respostas que já saem do spec marcadas com **[spec]**.
1. **Monetização:** **[spec]** assinatura por loja (~R$700/mês), **não** carteira de créditos.
   Logo `creditos/billing/planos` = APAGA; o novo billing é construído do zero depois.
2. **Login do painel:** continua Google OAuth + WhatsApp OTP? Se mantém OTP, de qual número
   sai (a plataforma é Tech Provider puro, sem número próprio)? Decide o destino de `hook_otp`.
3. **Credenciais Meta por loja:** onde guardar o token do Embedded Signup (tabela criptografada)
   e quem executa o onboarding/callback (api ou zap). Define a forma de `OpcoesMeta`.
4. **Escopo de templates:** por WABA/loja com herança de um padrão da plataforma, ou conjunto
   global replicado. Afeta `templates` e `sincronizar_templates`.
5. **Pix:** só copia-e-cola (BR Code estático, sem confirmação automática) ou confirmação via
   PSP/gateway. Muda o schema de pedido/pagamento.
6. **Áudio/STT e LLM:** rodam no zap (inbound) ou em worker via outbox. Define onde vive o novo
   webhook. (Sugestão dos agentes: inbound só enfileira a mídia, processamento assíncrono.)
7. **Papéis na conta:** só owner/user, ou dono/gerente/atendente por loja. Muda `profiles`,
   `guards`, `perfil` e o schema de membership.
8. **Realtime:** kanban de pedidos e conversas provavelmente pedem SSE/WebSocket em vez do
   polling de 30s atual (`shared/sync`).
9. **Identidade visual:** a paleta "Calmo Editorial" vira default do painel (sobrescrita por
   branding de empresa) ou entra uma marca nova do produto.

## 6. Como executar a limpeza (depois do seu aval)

Proposta de ordem, em passos reversíveis por commit, sem quebrar o build a cada etapa:
1. Front e back: remover os módulos APAGA inteiros (cada um é isolado pelo lint feature-first,
   então sai sem quebrar os vizinhos), tirando as linhas em `routes.ts`/`router.tsx`/`nav.ts`.
2. Reescrever os arquivos ADAPTA de `shared` para só o que fica (contratos, enums, datas,
   logger, linguagem), ajustando os imports.
3. Schema: criar o baseline novo (apagar as 103 migrations antigas e escrever as poucas que
   recriam profiles/auth/templates/envios/webhook/config/chaves_pix/roles). Sem cliente em
   produção, não há migração de dados.
4. Docs/raiz/historias/business: apagar os arquivos de cobrança; esvaziar `historias/`.
5. Atualizar `CLAUDE.md`, rodar lint+typecheck+test (devem passar
   vazios/adaptados) antes de commitar.

Cada passo vira um commit próprio, revisável e revertível.
