# auth

## Propósito
Superfície mínima de autenticação que o front consome do backend. Hoje: `POST /v1/auth/status-telefone` (H1.2/H1.3), que diz se um número já tem cadastro para a UI escolher a copy do OTP (login vs cadastro). O JWT continua do Supabase (OTP via Send SMS Hook → zap); este módulo NÃO emite sessão.

## Entry points
- `index.ts`: plugin Fastify registrado em `src/routes.ts` sob `/v1`

## Especialistas consumidos
- `@whaviso/shared/contracts`, `@whaviso/shared/db`
- `shared/eventos_auth` (auditoria append-only, telefone só hash)

## Tabelas
- lê: profiles (existência por telefone)
- escreve: eventos_auth (auditoria, via shared/eventos_auth)

## Segurança
- Rota pública, rate-limit dedicado (anti-enumeração de telefones).
- Nunca loga telefone; auditoria só com sha256 do número.
