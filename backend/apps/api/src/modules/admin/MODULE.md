# admin

## Propósito
Mensagens/templates UNIFICADOS por chave em `/admin/mensagens` (listar + preview/lint +
propor versão + SUBMETER à Meta + ativar + apagar). A api NÃO fala com a Meta; o zap
reflete o status real. Também: `/admin/usuarios` (listar/suspender) e `/admin/whatsapp*`
(status + mini-chat de teste). Restrito a owner.
TODO(pivo): listagem de usuários ainda traz saldo da carteira (contrato em shared).

## Entry points
- `index.ts`: plugin Fastify; `repo.ts`: usuários + suspensão

## Tabelas
- dono de: templates; escreve em profiles (suspenso); whats_teste_*

## Suspensão de conta
- `PATCH /admin/usuarios/:id` aceita `{ suspenso }`. Suspender grava
  `profiles.suspenso=true` (migration 0009). O bloqueio é no caminho de autenticação
  (`shared/auth`, `bloquearSeSuspenso`): toda rota autenticada da pessoa passa a
  responder 403 `conta_suspensa`. Reativar (`suspenso=false`) volta ao normal; não apaga
  dados. Owner não pode se auto-suspender (422 `auto_suspensao`).

## Contratos
- payloads em `@whaviso/shared/contracts`
