# notificacoes

## Propósito
- GET /v1/notificacoes: central de notificações (H10.10, item 6), servida numa página
  própria (`/app/notificacoes`, junto com o "precisa de você" do painel). Feed
  cronológico paginado (mais recentes primeiro, `page`/`per_page`) das notificações do
  usuário logado, unindo `notificacoes_cobrador` (tipo `pagamento_informado` ou
  `combinado_dado_incorreto`) e `notificacoes_billing` (recarga de crédito). `nao_lidas`
  é o total pendente (não limitado pela página atual), usado no atalho do sino.
- POST /v1/notificacoes/:id/marcar-lida: marca UMA notificação como lida (decisão de
  produto: o contador só cai item a item, ao clicar naquele específico; abrir a
  página/sino nunca marca em massa). Sem `origem` no corpo: tenta em ambas as tabelas
  escopado por dono, só uma bate. Idempotente e silenciosamente no-op se o id não for do
  usuário logado (isolamento, sem vazar se o id existe em outra conta).
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
  marcarNotificacaoLidaResposta)
