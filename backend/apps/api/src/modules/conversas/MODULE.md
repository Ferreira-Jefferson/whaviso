# conversas

## Proposito
Conversas e mensagens de WhatsApp de cada loja no painel: lista, historico, estado da janela de 24h
(calculado no servidor), resposta humana via outbox, handoff manual (assumir/devolver) e encerramento.
O modulo e dono unico do estado da conversa (`status`, `atendido_por_membro_id`, `humano_desde`).

## Entry points
- `index.ts`: `conversasRoutes` (registrado em `src/routes.ts`, `/v1/conversas/*`) e `criarConversasRoutes({ relogio, respostasPorMinuto })` (testes).
- Rotas: `GET /`, `GET /:id`, `GET /:id/mensagens`, `POST /:id/lida` (no-op), `POST /:id/mensagens`, `POST /:id/assumir`, `POST /:id/devolver`, `POST /:id/encerrar`.
- Handoff (`handoff.ts` + `transicoes.ts`): maquina pura. `assumir -> humano` parte de `ia`, `aguardando` ou `humano` SEM dono (pedido da IA por humano); `devolver -> ia` parte de `humano`; `encerrada` e terminal. Transicao fora dessas = 422 `transicao_invalida`. A trava `FOR UPDATE` serializa a disputa (um vencedor; o segundo re-le a linha ja com dono e recebe 422). Guards de propriedade: `devolver` so por quem assumiu ou papel `dono|gerente` (senao 403 `nao_e_o_atendente`); a resposta humana (`POST /:id/mensagens`) exige `atendido_por_membro_id = membro atual` (403 `nao_e_o_atendente`, ou 409 `conversa_nao_assumida` se ninguem assumiu).

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
- Erros 409: `janela_fechada`, `conversa_com_ia`, `conversa_nao_assumida`, `conversa_encerrada`, `numero_indisponivel`. Erro 422 do handoff: `transicao_invalida`. Erro 403: `nao_e_o_atendente`.
- Detalhe (`GET /:id`) expoe `tem_atendente` e `atendido_por_mim` (sem nome/telefone) para o painel decidir assumir/devolver/responder.
