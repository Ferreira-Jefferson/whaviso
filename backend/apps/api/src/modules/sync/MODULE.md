# sync

## Propósito
Carimbo barato do estado do usuário logado (detecção de mudança por versão), consultado
pelo front em intervalo curto para saber se painel/avisos precisam recarregar sem depender
de refetch-on-mount ou foco de janela.

## Entry points
- `index.ts` (plugin Fastify registrado em `src/routes.ts`): `GET /sync/versao`.

## Especialistas consumidos
- `@whaviso/shared/db` (Pool)
- `@whaviso/shared/contracts` (syncVersaoResposta)

## Tabelas
- dono de: (nenhuma)
- lê de: `public.avisos`, `public.aviso_ocorrencias`, `public.envios`, `public.eventos_aviso`
  (só leitura, escopo do usuário)

## Contratos
- publica: `syncVersaoResposta` (`GET /sync/versao`)
