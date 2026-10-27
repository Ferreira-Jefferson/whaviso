# cardapio_importacao

## Proposito
Importar o cardapio de uma foto ou PDF. A api valida o arquivo e ENFILEIRA; a extracao por LLM roda
no atendente (AT-importar, unico role que decifra a chave da loja). A api expoe o RASCUNHO
(categorias > itens > grupos > opcoes, centavos) para o dono revisar/editar e, na APROVACAO, devolve
o LOTE a criar no cardapio. Nada vai ao cardapio sem aprovacao humana.

## Entry points
- `index.ts`: `cardapioImportacaoRoutes` (prefixo `cardapio-importacao`, rotas `/v1/cardapio-importacao/*`)
  - `POST /` `{ arquivo_base64 }` -> 202 `{ id, status, reaproveitada }` (rate limit 5/min, bodyLimit 14 MB)
  - `GET /` lista (sem binario) · `GET /:id` estado + rascunho
  - `PATCH /:id` `{ rascunho }` edita (so `rascunho_pronto`)
  - `POST /:id/aprovar` -> `{ lote }` (marca `aprovada`, zera o arquivo; reaprovar = 409)
  - `POST /:id/descartar` (fila / pronto / erro; em `processando` = 422)

## Estados
`fila -> processando -> rascunho_pronto | erro`; `rascunho_pronto -> aprovada | descartada`.
Job preso em `processando` por 15 min volta a `fila` (+1 tentativa); ao 3o vira `erro`
(`tempo_esgotado`) e o arquivo e zerado (recuperacao oportunista em listar/detalhe).

## Contrato com o consumidor (AT-importar)
- Claim: `select ... from importacoes_cardapio where status='fila' order by criado_em for update skip locked`
  (indice parcial `importacoes_cardapio_claim`); marca `processando` + `processando_desde = now()`.
- Conclui: `status='rascunho_pronto'` + `rascunho` (formato `RascunhoCardapio`) e `arquivo_bytes = null`,
  ou `status='erro'` + `erro` = CODIGO curto (`llm_sem_visao`, `llm_nao_configurada`, `extracao_invalida`...).
  Nunca gravar texto cru do provedor em `erro` (a api so mostra mensagem fixa por codigo).
- Grants do atendente: SELECT (sem rascunho/hash) e UPDATE (`status, rascunho, erro, arquivo_bytes,
  tentativas, processando_desde`). Sem INSERT/DELETE.

## Onde os itens reais sao criados
Aqui NAO: a importacao nao escreve em `categorias/itens/grupos_opcoes/opcoes` (dono: modulo `cardapio`).
O `aprovar` devolve `lote` no formato das entradas do cardapio (`CategoriaCriar`, `ItemCriar` sem
`categoria_id`, `GrupoCriar`); o orquestrador/painel cria pelos endpoints do cardapio. Quando o
cardapio expuser a porta em lote (`CardapioLoteEntrada`), a aplicacao atomica entra la.

## Tabelas
- dono de: `importacoes_cardapio` (0017; api SELECT sem `arquivo_bytes`/INSERT/UPDATE, sem DELETE)
- le: `credenciais_llm` so `ativo` (nunca a chave) · escreve: `eventos` (`cardapio_importacao.*`, sem PII)

## Seguranca
- Arquivo inline (base64), SEM URL: nao ha busca remota, logo nao ha SSRF. Tipo pela assinatura
  (JPEG/PNG/WebP/PDF), teto 10 MB (413), outro tipo 415. Hash sha256 + idempotencia de 10 min por (loja, hash).
- Saida do modelo e entrada nao confiavel: rascunho revalidado (Zod estrito, limites de linhas) em
  toda leitura/edicao/aprovacao; so rascunho ate a aprovacao (SEC-060/061).
- Permissao `loja:gerir` (dono/gerente). Multi-tenant por `loja_id` do escopo (404 cross-loja).
- Nunca loga conteudo do arquivo, rascunho ou erro cru.
