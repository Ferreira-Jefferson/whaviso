# notificacoes

## Propósito
- GET /v1/notificacoes: central de notificações (H10.10, item 6). Feed cronológico
  (mais recentes primeiro) das notificações do usuário logado, unindo
  `notificacoes_cobrador` (tipo `pagamento_informado` ou `combinado_dado_incorreto`) e
  `notificacoes_billing` (recarga de crédito). `nao_lidas` é o total pendente (não
  limitado por `limit`), usado no badge do sino.
- POST /v1/notificacoes/marcar-lidas: marca TODAS as não lidas do usuário como lidas
  de uma vez (mecanismo escolhido: simples, idempotente, cobre "abrir o sino zera o
  contador").
- Só LEITURA: o enfileiramento das duas outbox já existe em outros lugares (ver
  `apps/api/src/shared/notificacoes` e `shared/notificacoes_billing`); este módulo não
  produz notificação, só expõe o que já foi enfileirado.

## Escopo (decisão H10.10)
Só as categorias do item 6 do feedback entram nesta central: pagamento informado
("já paguei", que é o mesmo evento de "pagamento reportado"), dado incorreto reportado
e solicitação de créditos (recarga). Os demais `TipoNotificacao` (optout, reativação,
encerramento, edição a aprovar/recusada, reengajamento, status_alterado, rejeicao,
combinado_aceito, combinado_recusado, combinado_enviar) continuam só WhatsApp/auditoria,
de propósito, fora da central por ora (extensível depois).

## Entry points
- `index.ts`: plugin Fastify registrado em `src/routes.ts` sob `/v1`

## Especialistas consumidos
- `@whaviso/shared/contracts`, `@whaviso/shared/db`
- `shared/auth`

## Tabelas
- lê de: notificacoes_cobrador, notificacoes_billing
- escreve em: notificacoes_cobrador.lida_em, notificacoes_billing.lida_em (só o carimbo
  de leitura; nunca o restante da linha, que é dono do enfileirador/drainer)

## Contratos
- payloads em `@whaviso/shared/contracts` (notificacoesCentralQuery,
  notificacaoCentralSchema, notificacoesCentralResposta,
  marcarNotificacoesLidasResposta)
