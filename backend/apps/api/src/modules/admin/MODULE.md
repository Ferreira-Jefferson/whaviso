# admin

## Propósito
Métricas (com período + opt-out) e mensagens/templates UNIFICADOS por chave em
`/admin/mensagens` (listar + preview/lint + propor versão + aprovar + ativar +
apagar; ativação só com status_meta=aprovado; lint cobre texto e rótulos de botão).
Auditoria global read-only: usuários (com saldo da carteira), envios, avisos. E11: o
owner CREDITA envios numa conta (ativação manual pós-pagamento via WhatsApp) e edita a
CURVA de créditos. Restrito a owner.

## Entry points
- `index.ts`: plugin Fastify registrado em `src/routes.ts` sob `/v1`
- `repo.ts`: consultas read-only de auditoria + suspensão

## Rotas de créditos (E11)
- `POST  /admin/usuarios/:id/creditar` credita N envios (lançamento 'credito_owner', aditivo)
- `PATCH /admin/creditos-catalogo`     edita a curva (piso/topo/min/max/cortesia/tetos de agenda)

## Especialistas consumidos
- `@whaviso/shared/contracts`, `@whaviso/shared/db`
- `shared/auth`, `shared/http_errors`, `shared/planos` (creditarEnvios)

## Tabelas
- dono de: templates (unificada por chave; conteúdo estruturado em jsonb)
- escreve em: profiles (suspenso), creditos_carteira + creditos_lancamentos (crédito do
  owner, via shared/planos), creditos_catalogo (curva de preço)
- lê de: avisos, envios, profiles, eventos_aviso (métricas/opt-out), creditos_carteira

## Suspensão de conta
- `PATCH /admin/usuarios/:id` aceita `{ suspenso }`. Suspender grava
  `profiles.suspenso=true` (migration 0009). O bloqueio é no caminho de autenticação
  (`shared/auth`, `bloquearSeSuspenso`): toda rota autenticada da pessoa passa a
  responder 403 `conta_suspensa`. Reativar (`suspenso=false`) volta ao normal; não apaga
  dados. Owner não pode se auto-suspender (422 `auto_suspensao`).

## Contratos
- payloads em `@whaviso/shared/contracts`
