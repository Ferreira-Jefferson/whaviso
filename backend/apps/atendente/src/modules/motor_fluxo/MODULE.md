# motor_fluxo (AT-motor-min)

Motor **deterministico** do pedido: conduz a conversa por um grafo fixo de botoes e regras, **SEM
LLM**. Fecha o laco do pedido no backend: inbound enfileirado pelo zap -> pedido `novo` no kanban ->
resposta enfileirada em `envios`.

## Fronteira sagrada (HARNESS-ATENDENTE.md)

O node **ENTENDE e PROPOE** (`SaidaNode`: `proximo` + `mensagens` + `efeitos`, tudo dado); o **motor
EFETIVA**. Nenhuma acao (confirmar pedido, preco, taxa) acontece sem passar pela regra deterministica
do node no estado certo (SEC-061). Texto livre nunca e comando: "confirmar pedido" fora do estado
`confirmar` nao confirma. Ids de botao/lista sao entrada nao confiavel: so valem se foram
apresentados por este motor E revalidados contra a loja da conversa (SEC-002).

## Como e disparado

O scheduler do app chama `drenarInbound`/`processarProximaMensagem`. Cada turno roda numa transacao:

1. **claim** da proxima mensagem de entrada nao processada (`FOR UPDATE SKIP LOCKED`, como o dreno de
   `envios` do zap) + trava a conversa (`FOR UPDATE`): serializa o turno por conversa.
2. conversa em `humano` (handoff) ou `encerrada`: **nao responde**, so marca processada.
3. monta o contexto (loja/cliente/cardapio **vivo**/estado), roda o node de `estado.etapa`, aplica os
   efeitos (estado, criar_endereco, criar_pedido, handoff, encerrar), enfileira as respostas em
   `envios` (texto/interativo, janela de 24h) e registra as saidas, e marca a entrada processada.

## Grafo (grafo.ts, dados)

`saudacao -> pedir_categoria -> montar_pedido -> confirmar -> endereco -> pagamento -> acompanhar`.
Lacos cobrem "adicionar mais", reapresentacao e sub-passos de texto. O estado do fluxo vive em
`conversas.contexto` (jsonb), unica fonte; o builder visual (onda 5) troca a FONTE do grafo (arquivo
-> banco) sem mexer no motor.

## Tabelas

- **Le** (vivo, nunca cache): `lojas`, `clientes`, `enderecos`, `categorias`, `itens`, `grupos_opcoes`,
  `opcoes`, `categoria_grupos`, `item_grupos`, `zonas_entrega`, `conversas`, `mensagens`, `pedidos`.
- **Escreve** (grant whaviso_atendente): `mensagens` (saida + `processada_em`), `conversas` (contexto
  e status), `enderecos`, `pedidos`/`itens_pedido`/`itens_pedido_opcoes`, `envios` (enfileira),
  `eventos` (append-only, sem PII). Preco e taxa calculados no servidor, centavos.

## Regras

- Dinheiro em centavos; datas de negocio em America/Sao_Paulo.
- Dados so via `@whaviso/shared/db` (SEC-080). Nunca logar telefone/conteudo (SEC-024).
- Nodes nao se importam entre si; o compartilhado e funcao/dado puro (`comum`, `ids`, `acoes`).
- Criar pedido e idempotente por conversa (guarda `estado.pedido_id`); respostas deduplicam por
  `dedupe_chave = <mensagem_id>:<indice>`.
