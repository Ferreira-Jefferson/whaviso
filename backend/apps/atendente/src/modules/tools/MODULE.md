# tools (AT-tools)

## Proposito
Registry de `ToolContract` (kernel: `@whaviso/shared/contracts`, arquivo `tool.ts`) e as tools do atendente.
Fronteira de AUTORIZACAO do agente: tools so LEEM e PROPOEM; o motor deterministico EFETIVA.

## Regras (SEC-063..066)
- `ConversaCtx {loja_id, cliente_id, conversa_id}` e selado pelo servidor (`selarCtxDaConversa`) e injetado
  no handler. O modelo nunca o ve; nenhum schema de args declara esses campos (o registro RECUSA no cadastro).
- Args passam por Zod `.strict()`: `loja_id` forjado e rejeitado (`argumentos_invalidos`).
- Ids opacos (item, opcao) sao revalidados com `where loja_id = ctx.loja_id`; id alheio e id inexistente
  dao a mesma resposta (`referencia_invalida`).
- Texto livre vai so como parametro SQL (LIKE escapado); resultado de tool e DADO.
- Propostas (`rascunho_pedido`, `escalar_humano`) trazem `chave_idempotencia` deterministica.

## Entry points
`criarRegistroTools(ferramentasPadrao({ exec, rag }))` -> `specs()` (ao ServicoLlm) e `executar(chamada, ctx)`.
Tools: cardapio_buscar, montar_rascunho_pedido, cliente_reconhecer, status_pedido, escalar_humano, buscar_conhecimento.

## Fora de escopo
Nenhuma escrita em banco. Visao (ler_foto_cardapio, identificar_prato), calcular_total e tempo_de_entrega
ficam para tarefas proprias. Sem migration.
