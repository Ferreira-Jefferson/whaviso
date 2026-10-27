# conversas

## Proposito
Conversas e mensagens de WhatsApp de cada loja no painel: lista, historico, estado da janela de 24h
(calculado no servidor), resposta humana via outbox e encerramento. Assumir/devolver (handoff) e do API-handoff.

## Entry points
- `index.ts`: `conversasRoutes` (registrado em `src/routes.ts`, `/v1/conversas/*`) e `criarConversasRoutes({ relogio, respostasPorMinuto })` (testes).
- Rotas: `GET /`, `GET /:id`, `GET /:id/mensagens`, `POST /:id/lida` (no-op), `POST /:id/mensagens`, `POST /:id/encerrar`.

## Especialistas consumidos
- `@whaviso/shared/db` (consultar/sql/comTransacao/notificar)
- `shared/http_errors`, `shared/tenant` (escopo + permissao `conversas:atender`), `shared/auth` (via app)

## Tabelas
- dono de: `mensagens` (so insert, autor humano), status `encerrada` de `conversas`, `envios` (origem resposta humana)
- le de: `clientes` (nome e sufixo do hash, nunca telefone), `numeros_whatsapp` (id/status), `pedidos` (id/codigo/status)
- escreve auditoria em `eventos` (sem PII): `conversa.resposta_enviada`, `conversa.encerrada`

## Contratos
- Realtime (NOTIFY na transacao, so referencia): `conversa.mensagem` (resposta humana), `conversa.handoff` (encerrada).
- Regra: janela aberta se `agora < ultima_entrada_em + 24h`; sem entrada = fechada. "Nao lida" derivada (entrada mais nova que a ultima saida).
- Erros 409: `janela_fechada`, `conversa_com_ia`, `conversa_encerrada`, `numero_indisponivel`.
