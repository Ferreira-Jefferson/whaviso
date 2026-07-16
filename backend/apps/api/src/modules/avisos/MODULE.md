# avisos

## Propósito
CRUD de avisos: criar (gera tokens + link de aceite, valida limite do plano), listar, detalhar, cancelar.

## Entry points
- `index.ts`: plugin Fastify registrado em `src/routes.ts` sob `/v1`

## Especialistas consumidos
- `@whaviso/shared/contracts`, `@whaviso/shared/db`
- `shared/auth`, `shared/http_errors`

## Tabelas
- dono de: avisos, eventos_aviso (insert)
- dono de: aviso_categorias (junção E16 multi; select/insert/**delete**). O DELETE é EXCEÇÃO
  DELIBERADA à regra de não-DELETE: junção pura, "definir categorias" é delete-all + insert
  (idempotente), sem histórico a preservar (o combinado permanece; só o rótulo muda). Lê a
  tabela `categorias` (por query direta) para validar posse, sem importar o módulo `categorias`.
- lê de: assinaturas, planos (limite do plano)

## Notas
- `pessoas` (E15 H15.8) escreve em `avisos.nome_devedor` ao renomear um cliente; a máquina de
  estados e os campos do acordo permanecem sob este módulo.

## Contratos
- payloads em `@whaviso/shared/contracts`
