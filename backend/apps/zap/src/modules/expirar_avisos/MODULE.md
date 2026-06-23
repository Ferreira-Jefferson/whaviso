# expirar_avisos

## Propósito
Sweep periódico: `programado` com data_combinada+2 <= hoje (SP) → `expirado`;
`aguardando_aceite` com token de aceite vencido → `expirado`. Insere evento (ator sistema);
o trigger do banco cancela os envios restantes.

## Entry points
- `index.ts` → `expirarAvisos(deps)`: chamado pelo loop em `src/scheduler.ts`

## Especialistas consumidos
- `@whaviso/shared/db`, `@whaviso/shared/datas`, `@whaviso/shared/logger`

## Tabelas
- escreve em: avisos (expiração), eventos_aviso
