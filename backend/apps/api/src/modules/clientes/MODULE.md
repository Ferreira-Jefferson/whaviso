# clientes

## Proposito
Clientes por loja (telefone em hash + cifra) e seus enderecos: lista/busca, ficha, cadastro manual,
revelar telefone sob demanda (dono/gerente, auditado) e "ultimo endereco" para repetir pedido.

## Entry points
- `index.ts`: `clientesRoutes` (registry, segredos de PII do ambiente) e `criarClientesRoutes(pii)` (injetavel em teste).
- Rotas finais (`/v1/clientes`): `GET /` (nome, cursor), `POST /buscar` (telefone completo via hash),
  `POST /`, `GET|PATCH /:id`, `POST /:id/telefone/revelar`, `GET|POST /:id/enderecos`,
  `GET /:id/ultimo-endereco`, `PATCH /enderecos/:id`, `POST /enderecos/:id/desativar`.

## Especialistas consumidos
- `@whaviso/shared/db`, `shared/http_errors`, `shared/tenant` (escopo e papeis via `app.escopoLoja`).

## Cifra: kernel compartilhado
`cripto.ts` so reexporta o kernel `@whaviso/shared/cifra` (normalizacao E.164, HMAC-SHA256 do
telefone, mascara, AES-256-GCM): api, zap e atendente batem o MESMO hash e a MESMA cifra. O segredo
vem da env `MASTER_KEY` (min 32 chars), unica, sem `PII_*`; as chaves AES e HMAC sao derivadas dela
com separacao de dominio. A cifra e injetavel (`criarClientesRoutes(cifra)`) para teste.

## Tabelas
- dono de (escrita pelo painel): `clientes`, `enderecos` (sem DELETE; endereco some com `ativo = false`).
- le de: `pedidos` (so count, max(criado_em), sum(total_centavos) por cliente, sem `rascunho`).
- escreve: `eventos` (`cliente.criado`, `cliente.atualizado`, `cliente.telefone_revelado`, `endereco.alterado`; `detalhes` so com `user_id`).

## Contratos
- Zod em `schemas.ts` (espelhar no front): telefone em claro so na entrada e em `TelefoneRevelarSaida`.

## Contrato de uso do endereco (para API-pedidos / atendente, via SQL proprio, sem importar este modulo)
Ao confirmar pedido com entrega: `update public.enderecos set ultimo_uso_em = now() where id = $1 and loja_id = $2`
(grant ja existe). "Ultimo endereco" = ativo, maior `ultimo_uso_em` (desempate `criado_em`), so com uso registrado.

## Regras
- Telefone na URL nunca: `GET /?q=` com telefone devolve 422 `busca_telefone_use_post`.
- Busca parcial por telefone nao existe (hash); parcial so por nome.
- Revelar: papel dono/gerente, rate limit 10/min, `Cache-Control: no-store`, auditoria sem o numero.
