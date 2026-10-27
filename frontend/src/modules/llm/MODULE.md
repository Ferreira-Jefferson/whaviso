# llm (frontend)

## Propósito
Área da chave do atendente (BYO key do provedor) e do consumo. Rota `/llm` (grupo config).
A chave é **write-only**: a tela só mostra metadado ("configurada, termina em 1234, validada em ...").

## Entry points
- `index.ts`: export default da página (`lazy(() => import('@/modules/llm'))`).

## Dados
- `GET /v1/llm/credencial` (estado), `PUT` (cadastrar/trocar; a api valida no provedor antes de gravar),
  `PATCH` (ligar/desligar e modelo, sem chave), `POST /credencial/testar` (revalida a chave digitada),
  `GET /v1/llm/uso` (consumo do mês, centavos).
- Contratos: `@/shared/contracts/_generated/configuracoes_llm` (não redefinir). Cache: raiz `['llm']`.

## Segredo (regras do módulo)
- A chave vive só no `useState` do `FormularioChave`; é apagada em `finally` após cada envio.
- As mutações com chave limpam o cache de mutação (`reset`) para a chave não ficar em `variables`.
- Campo `type="password"`, `autoComplete="new-password"`; nunca em storage, URL, log ou query key.
- Só o papel `dono` escreve; 403 vira mensagem amigável.
