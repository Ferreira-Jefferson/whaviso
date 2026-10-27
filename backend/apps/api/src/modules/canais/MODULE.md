# canais

## Proposito
Unificar pedidos de canais externos (iFood e outros) no modelo `pedidos`, marcados por `origem`
('ifood' para o canal iFood; 'manual' para o canal generico 'outro'). A api registra a conexao da
loja (credencial cifrada, write-only) e, em `sincronizar`, puxa pedidos por trás da interface
`ClienteCanal` (shared/clientes/canais.ts), revalida cada um e cria o pedido de forma idempotente.

## Provedor de canal (default: iFood)
Provedor padrao escolhido (decisao de engenharia, 2026-10-27): **iFood** (API oficial de parceiro),
o canal pedido pela especificacao (G4) e o de maior adocao. A impl real (`criarCanalIfoodDoAmbiente`,
em `@whaviso/shared/clientes`, arquivo `canais_ifood.ts`) entra atras de `ClienteCanal` via
`config.ts` para o canal `ifood`, GATED por credencial de app: so com o par
`API_CANAL_IFOOD_CLIENT_ID`/`API_CANAL_IFOOD_CLIENT_SECRET` (OAuth client_credentials, nivel app). Sem
isso, `ifood` cai no `StubClienteCanal` (501 `canal_nao_integrado`); o canal generico `outro` segue
sempre no stub. Fluxo: OAuth (token cacheado) -> polling de eventos escopado pelo `merchantId` (a
credencial por loja, write-only, cifrada) -> eventos PLC viram `PedidoExterno` (detalhe do pedido,
totais reconciliados) -> `confirmar` da o acknowledgment. Saida do iFood e revalidada por
`PedidoExterno` (Zod estrito). **Go-live (honesto):** exige conta de parceiro iFood homologada;
a mecanica esta verificada so por mock. Decisoes ainda abertas (nao bloqueiam): (1) mover o pull para
um worker mantendo a credencial write-only; (2) status inicial do pedido do canal (hoje `novo`, sem
PII); (3) cancelamento/atualizacao de status no canal (fora do escopo).

## Entry points (`canaisRoutes`, prefixo `canais`, `/v1/canais/*`)
- `GET /` estado dos canais (sem credencial) · `GET /pedidos` mapa canal -> pedido
- `PUT /` `{ canal, credencial, config? }` conecta/troca (SO dono; rate limit 10/min)
- `PATCH /:canal` `{ ativo?, config? }` (`loja:gerir`)
- `POST /:canal/sincronizar` -> `{ importados, duplicados, rejeitados }` (501 sem provedor, 502 falha do provedor)

## Tabelas (0050)
- dono de `canais_loja` e `canal_pedidos` (api; sem DELETE). Escreve `pedidos`/`itens_pedido`
  (origem marcada) e `eventos` (`canal.*`, sem PII/credencial).

## Seguranca
- Credencial cifrada com `CANAIS_MASTER_KEY` propria (min 32), lida preguicosamente; nunca em
  resposta/log. Chamadas externas so via `ClienteCanal` (allowlist de host + fetchSeguro).
- Saida do provedor nao confiavel: Zod estrito + conferencia de totais; invalido = rejeitado.
- Multi-tenant por `loja_id` do escopo (404 cross-loja). Idempotencia: unique (canal_loja_id, id_externo).
