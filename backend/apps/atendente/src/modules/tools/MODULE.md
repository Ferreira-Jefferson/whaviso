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
- Propostas (`rascunho_pedido`, `cadastro_cliente`, `escalar_humano`) trazem `chave_idempotencia` deterministica.
- `cliente_cadastrar` e a UNICA tool de escrita-como-rascunho: PROPOE (nome/endereco que o cliente informou)
  como `EventoProposto` para o motor efetivar em `ctx.cliente_id`; nunca grava em `clientes`/`enderecos`.
  Nome e endereco sao ENTRADA NAO CONFIAVEL (Zod `.strict()`, tamanho limitado) e seguem so como DADO.

## Entry points
`criarRegistroTools(ferramentasPadrao({ exec, rag }))` -> `specs()` (ao ServicoLlm) e `executar(chamada, ctx)`.
Tools: cardapio_buscar, montar_rascunho_pedido, cliente_reconhecer, cliente_cadastrar, tempo_de_entrega,
status_pedido, escalar_humano, buscar_conhecimento.

## Fora de escopo
Visao (ler_foto_cardapio, identificar_prato) e calcular_total (ja coberto pelo `subtotal_previa_centavos`
de montar_rascunho_pedido) ficam para tarefas proprias. Unica escrita = proposta de cliente_cadastrar
(rascunho; o motor efetiva). Sem migration. `tempo_de_entrega` estima pela fila de pedidos (readonly);
o preparo configurado da loja (`despacho_config`) nao e legivel pelo role `whaviso_atendente` hoje: ligar
isso exige um grant em migration propria (fora deste modulo).
