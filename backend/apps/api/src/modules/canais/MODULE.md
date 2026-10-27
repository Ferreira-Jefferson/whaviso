# canais

## Proposito
Unificar pedidos de canais externos (iFood e outros) no modelo `pedidos`, marcados por `origem`
('ifood' para o canal iFood; 'manual' para o canal generico 'outro'). A api registra a conexao da
loja (credencial cifrada, write-only) e, em `sincronizar`, puxa pedidos por trás da interface
`ClienteCanal` (shared/clientes/canais.ts), revalida cada um e cria o pedido de forma idempotente.

## DECISAO DO DONO PENDENTE
O provedor real (iFood Merchant API direta ou agregador) NAO esta definido e a documentacao nao
estava disponivel. Producao usa `StubClienteCanal`: `sincronizar` responde 501 `canal_nao_integrado`.
Para integrar: implementar `ClienteCanal` (traduzir payload do provedor para `PedidoExterno`, usar
`fetchSeguro` com `HOSTS_CANAL`, que e placeholder nao verificado) e trocar o stub em `config.ts`.
Tambem decidir: (1) a api decifrar a credencial para o pull (como esta) ou mover o pull para um
worker (mantendo a credencial write-only na api); (2) status do pedido do canal (hoje entra `novo`,
sem cliente/PII); (3) tratamento de cancelamento/atualizacao de status no canal (fora do escopo).

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
