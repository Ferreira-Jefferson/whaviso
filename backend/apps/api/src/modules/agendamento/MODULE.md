# agendamento

## Proposito
Pedido agendado: o cliente quer o pedido para um instante futuro. A loja define, limpa e lista a
agenda; a cozinha ve com antecedencia o que vem por ai.

## Entry points
- `index.ts`: `agendamentoRoutes` (registry, prefixo `agendamento`).
- Rotas (`/v1/agendamento`): `GET /` (agenda; filtros `de`, `ate`, `janela`, `antecedencia_min`, cursor),
  `GET /:pedido_id`, `PUT /:pedido_id` (define), `DELETE /:pedido_id` (limpa; volta a imediato).

## Tabelas
- escreve so a coluna `pedidos.agendado_para` (migration 0043; null = imediato). Le `pedidos` por SQL.
- escreve `eventos` (`pedido.agendado`, `pedido.agendamento_removido`; so ids e instante).

## Regras
- Instante absoluto (UTC no banco, ISO com offset na entrada). Passado: 422 `agendamento_no_passado`.
  Alem de 30 dias: 422 `agendamento_muito_distante`.
- So pedido `rascunho` ou `novo` e agendavel; senao 422 `pedido_nao_agendavel`.
- Entrada no fluxo vivo: o pedido segue em `novo` (sem novo estado, sem job). A janela
  (`futuro`, `liberar`, `atrasado`) e calculada na consulta; quem inicia o preparo e a loja, pelo
  kanban de pedidos (liberacao humana). Automacao por scheduler fica fora deste modulo.
- Permissao: `pedidos:gerir`.
