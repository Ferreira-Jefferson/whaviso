# produtos

## Propósito
CRUD do catálogo de produtos do dono (E17): nome + preço de venda, reaproveitáveis ao montar
os itens de um combinado. Produto é dado INTERNO do dono; nunca aparece em mensagem ao
devedor. Sem custo, sem categoria (decisão E17). "Remover" é soft-delete (arquivado), nunca DELETE.

## Entry points
- `index.ts`: plugin Fastify registrado em `src/routes.ts` sob `/v1`
  - `GET /produtos` (meus ativos), `POST /produtos`, `PATCH /produtos/:id`

## Especialistas consumidos
- `@whaviso/shared/contracts`, `@whaviso/shared/db`
- `shared/auth`, `shared/http_errors`

## Tabelas
- dono de: produtos (select/insert/update; sem delete)
- lê/escreve de: avisos.itens (jsonb) SÓ para propagar o NOME do produto (H17.3) na descrição
  dos itens que o referenciam (`produto_id`), escopado ao dono. Nunca toca em valor_unit_centavos
  (preço é snapshot congelado). Não importa o módulo `avisos` (módulo nunca importa módulo): a
  propagação é um UPDATE direto na tabela compartilhada.

## Contratos
- `criarProdutoBody`, `atualizarProdutoBody`, `produtoSchema`, `listaProdutosResposta`

## Notas
- Editar o NOME propaga para combinados existentes (correção de rótulo); editar o PREÇO NÃO
  propaga (só vale para combinados novos). O item do combinado guarda `produto_id` só como
  vínculo; descrição/preço são snapshot independente.
