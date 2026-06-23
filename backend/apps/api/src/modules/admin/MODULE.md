# admin

## Propósito
Métricas (com período + opt-out) e mensagens/templates UNIFICADOS por chave em
`/admin/mensagens` (listar + preview/lint + propor versão + aprovar + ativar +
apagar; ativação só com status_meta=aprovado; lint cobre texto e rótulos de botão).
Auditoria global read-only: usuários, envios, avisos. Troca de plano do usuário.
Restrito a owner.

## Entry points
- `index.ts`: plugin Fastify registrado em `src/routes.ts` sob `/v1`
- `repo.ts`: consultas read-only de auditoria + troca de plano

## Especialistas consumidos
- `@whaviso/shared/contracts`, `@whaviso/shared/db`
- `shared/auth`, `shared/http_errors`

## Tabelas
- dono de: templates (unificada por chave; conteúdo estruturado em jsonb)
- escreve em: assinaturas (troca de plano, upsert), profiles (suspenso: suspende/reativa)
- lê de: avisos, envios, profiles, eventos_aviso (métricas/opt-out), assinaturas/planos

## Suspensão de conta
- `PATCH /admin/usuarios/:id` aceita `{ plano_id?, suspenso? }`. Suspender grava
  `profiles.suspenso=true` (migration 0009). O bloqueio é no caminho de autenticação
  (`shared/auth`, `bloquearSeSuspenso`): toda rota autenticada da pessoa passa a
  responder 403 `conta_suspensa`. Reativar (`suspenso=false`) volta ao normal; não apaga
  dados. Owner não pode se auto-suspender (422 `auto_suspensao`).

## Contratos
- payloads em `@whaviso/shared/contracts`
