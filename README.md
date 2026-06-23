# whaviso

Automatize avisos de pagamento por WhatsApp e controle tudo pelo painel.

- Visão do produto: [PROJETO.md](PROJETO.md)
- Guia técnico (layout, comandos, fronteiras): [AGENTS.md](AGENTS.md)

## Serviços

| Serviço | Porta | Papel |
|---|---|---|
| `apps/api` | 3001 | REST para o SPA: avisos, aceite, painel, admin, billing |
| `apps/zap` | 3002 | WhatsApp: scheduler dos 4 envios (D-2→D+1) + webhook de botões |

Supabase fornece **Postgres + Auth** apenas. Integração entre serviços via banco compartilhado (outbox `envios`).

## Subir em dev

```bash
npm install
supabase start && supabase db reset
npm run dev:api   # :3001
npm run dev:zap   # :3002
```
