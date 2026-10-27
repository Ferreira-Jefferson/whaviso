# importar_cardapio (AT-importar)

## Proposito
Consumidor da fila `importacoes_cardapio` (a api enfileira; ver `api/.../cardapio_importacao/MODULE.md`).
Reivindica um job, le o arquivo (imagem/PDF), extrai o cardapio com a chave de LLM da LOJA e grava o
RASCUNHO (`rascunho_pronto`) ou um CODIGO de erro. Nada vai ao cardapio sem aprovacao do dono.

## Entry points
- `drenarImportacoes({ pool, servico, logger }, max = 5)`: drena ate `max` jobs; cada job e tocado no
  maximo uma vez por chamada (retry espera o proximo tick). Nunca lanca.
- `processarProximoJob(deps, excluir)`: um job (claim `FOR UPDATE SKIP LOCKED` em transacao curta; o
  LLM roda fora da transacao).

## Agendamento
Igual ao `drenarInbound`: o app-root (`server.ts`) chama `drenarImportacoes` num `tick` do
`iniciarScheduler` (ex.: mesmo tick do inbound ou um scheduler proprio a cada ~5 s), com
`servico = criarServicoLlmProducao({ logger })`. Esta entrega NAO altera `server.ts` (wiring do integrador).

## Fluxo
1. Claim: `where status='fila' order by criado_em for update skip locked` -> `processando` + `processando_desde`.
2. Valida arquivo (nao nulo, mime na allowlist) senao `arquivo_invalido`.
3. Visao (`ServicoLlm.descreverImagem`, imagem ou PDF) transcreve o cardapio em texto; `SEM_CARDAPIO` = `extracao_invalida`.
4. Estruturacao (`completarEstruturado` + `RascunhoCardapio` do contrato; 1 reparo no ServicoLlm). A transcricao
   entra delimitada e saneada, declarada DADO nao confiavel (SEC-060). Cardapio vazio = `extracao_invalida`.
5. Conclui: `rascunho_pronto` + rascunho, `arquivo_bytes=null`; ou `erro` + codigo, `tentativas+1`, `arquivo_bytes=null`.

## Retry e erros
- Teto `MAX_TENTATIVAS = 3` (igual ao da api). Falha retentavel (rede, 5xx, rate limit, excecao inesperada):
  volta a `fila` com `tentativas+1` mantendo o arquivo; na 3a vira `erro` (`provedor_indisponivel`).
- Job preso em `processando` (consumidor caiu) e recuperado pela api (15 min, +1 tentativa).
- Codigos: `llm_nao_configurada` (sem credencial/chave recusada), `llm_sem_visao` (provedor recusou o arquivo),
  `limite_excedido` (teto diario), `extracao_invalida` (saida invalida, vazio, nao e cardapio),
  `arquivo_invalido`, `provedor_indisponivel`, `erro_interno`. Nunca texto cru do provedor.

## Tabelas e seguranca
- `importacoes_cardapio`: SELECT (id, loja_id, status, tipo_arquivo, mime, arquivo_bytes, tentativas,
  processando_desde, criado_em) e UPDATE (status, rascunho, erro, arquivo_bytes, tentativas, processando_desde).
- `uso_llm`: gravado pelo `ServicoLlm` (origem `importar_cardapio`; `tipo_uso` no default `geracao`, 2 linhas por job).
- Nunca loga bytes, rascunho, texto do modelo nem chave; so ids, codigo e nome do erro.
- Limitacao: PDF segue o mesmo caminho de visao (`image_url` data URL). Provedor/modelo que nao le PDF
  responde recusa e o job vira `llm_sem_visao`.
