# conversas

## Proposito
Conversas e mensagens de WhatsApp de cada loja no painel: lista, historico, estado da janela de 24h
(calculado no servidor), resposta humana via outbox, handoff manual (assumir/devolver) e encerramento.
O modulo e dono unico do estado da conversa (`status`, `atendido_por_membro_id`, `humano_desde`).

## Entry points
- `index.ts`: `conversasRoutes` (registrado em `src/routes.ts`, `/v1/conversas/*`) e `criarConversasRoutes({ relogio, respostasPorMinuto })` (testes).
- Rotas: `GET /`, `GET /:id`, `GET /:id/mensagens`, `POST /:id/lida` (no-op), `POST /:id/mensagens`, `POST /:id/assumir`, `POST /:id/devolver`, `POST /:id/encerrar`.
- Handoff (`handoff.ts` + `transicoes.ts`): maquina pura so com `ia->humano` (assumir) e `humano->ia` (devolver); `encerrada` e terminal. Transicao fora dessas = 422 `transicao_invalida`. A trava `FOR UPDATE` serializa a disputa (um vencedor; o segundo recebe 422).

## Especialistas consumidos
- `@whaviso/shared/db` (consultar/sql/comTransacao/notificar)
- `shared/http_errors`, `shared/tenant` (escopo + permissao `conversas:atender`), `shared/auth` (via app)

## Tabelas
- dono de: `mensagens` (so insert, autor humano), estado de `conversas` (`status`, `atendido_por_membro_id`, `humano_desde`), `envios` (origem resposta humana)
- le de: `clientes` (nome e sufixo do hash, nunca telefone), `numeros_whatsapp` (id/status), `pedidos` (id/codigo/status), `membros`+`lojas` (resolver quem assumiu; so o id do membro)
- escreve auditoria em `eventos` (sem PII): `conversa.resposta_enviada`, `conversa.handoff_assumido`, `conversa.handoff_devolvido`, `conversa.encerrada`

## Contratos
- Realtime (NOTIFY na transacao, so referencia): `conversa.mensagem` (resposta humana), `conversa.handoff` (assumir=`humano`, devolver=`ia`, encerrar=`encerrada`).
- Regra: janela aberta se `agora < ultima_entrada_em + 24h`; sem entrada = fechada. "Nao lida" derivada (entrada mais nova que a ultima saida).
- Erros 409: `janela_fechada`, `conversa_com_ia`, `conversa_encerrada`, `numero_indisponivel`. Erro 422 do handoff: `transicao_invalida`.
