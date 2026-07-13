# categorias

## Propósito
CRUD das categorias definidas pelo usuário (E16): rótulos por marca/linha (ex.: Natura,
Boticário, Bijuterias) para organizar e filtrar combinados. Categoria é organização
INTERNA do dono da conta; nunca aparece em mensagem ao devedor. "Remover" é soft-delete
(arquivada), nunca DELETE.

## Entry points
- `index.ts`: plugin Fastify registrado em `src/routes.ts` sob `/v1`
  - `GET /categorias` (minhas ativas), `POST /categorias`, `PATCH /categorias/:id`

## Especialistas consumidos
- `@whaviso/shared/contracts`, `@whaviso/shared/db`
- `shared/auth`, `shared/http_errors`

## Tabelas
- dono de: categorias (select/insert/update; sem delete)
- lê de: (nenhuma)

## Contratos
- `criarCategoriaBody`, `atualizarCategoriaBody`, `categoriaSchema`, `listaCategoriasResposta`

## Notas
- `avisos.categoria_id` referencia esta tabela, mas o wiring (gravar/filtrar a categoria de
  um combinado) vive no módulo `avisos` (módulo nunca importa módulo; a validação de posse
  da categoria é uma query direta na tabela `categorias`, não import do módulo).
