# canais (frontend)

## Proposito
Pagina `/canais`: conectar canais externos de pedidos (iFood e outro), trocar credencial, ativar/desativar,
sincronizar e listar os pedidos ja importados.

## Entry points
- `index.ts`: export default da pagina (`lazy(() => import('@/modules/canais'))`).

## Dados (`api.ts`, raiz `['canais']`)
- `GET /v1/canais`, `GET /v1/canais/pedidos`, `PUT /v1/canais` (so o dono), `PATCH /v1/canais/:canal`,
  `POST /v1/canais/:canal/sincronizar`. Contrato `_generated/canais`.

## Segredo
- **Credencial WRITE-ONLY**: campo `type="password"` sem autocompletar, limpo ao fim do envio; as leituras so
  trazem `ultimos4` (mascarado) e config nao secreta.

## Notas
- Provedor pode ser stub: `sincronizar` responde 501 `canal_nao_integrado`, tratado como aviso (toast info), nao erro.
- `ultimo_erro` e um codigo curto do servidor, traduzido em `descreverErroSync`.
- Pedidos importados nao carregam dados do consumidor (so codigo, id externo, total, data).
