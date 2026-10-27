# API-cardapio-imp cardapio_importacao

- **ID:** API-cardapio-imp  ·  **Área:** API  ·  **Onda:** 2
- **Modelo sugerido:** Sonnet  ·  **Status:** `A FAZER`
- **Reivindicado por:** (livre)

## Objetivo

O dono envia uma foto ou PDF do cardápio e o sistema devolve um **rascunho estruturado** (categorias,
itens, preços em centavos, grupos de opções quando detectáveis) para revisão. Só depois da aprovação do
dono o rascunho vira cardápio de verdade. Nada é gravado direto no cardápio pela IA.

"Pronto" observável: `POST /lojas/:lojaId/cardapio/importacoes` aceita arquivo, devolve `202` com o id
do job; o rascunho fica disponível em `GET .../importacoes/:id`; `POST .../:id/aplicar` cria
categorias/itens/grupos no cardápio com os ajustes do dono; sem credencial de LLM ativa a rota responde
um erro claro (`llm_nao_configurada`) e o fluxo manual segue funcionando.

## Dependências

- `AT-llm`: o `ClienteLLM` e a resolução da credencial da loja. O consumo do job (chamada multimodal ao
  provedor) acontece no atendente, único role que decifra a chave.
- `API-cardapio`: o cardápio de destino (dono de escrita de `categorias`, `itens`, `grupos_opcoes`,
  `opcoes`). A aplicação do rascunho **usa o contrato/serviço público dessa API** e nunca escreve essas
  tabelas à revelia (ver Contratos).

## Contratos e tabelas que toca

- **Nova tabela `importacoes_cardapio`** (migration `0013_importacoes_cardapio`, escopo deste módulo):
  `id`, `loja_id`, `status` (`recebida | processando | pronta | falhou | aplicada | descartada`),
  `tipo_arquivo` (`imagem | pdf`), `arquivo_bytes bytea` (limite 10 MB, zerado ao concluir),
  `arquivo_hash`, `rascunho jsonb`, `erro text` (mensagem sanitizada), `criado_por_user_id`,
  `criado_em`, `atualizado_em`. Índice parcial de claim `(criado_em) where status = 'recebida'`.
  Grants: `whaviso_api` INSERT, SELECT, UPDATE de `status`/`rascunho` (edição do dono) e de `arquivo_bytes`
  (zerar); `whaviso_atendente` SELECT e UPDATE de `status, rascunho, erro, arquivo_bytes`, sem DELETE.
  Claim `FOR UPDATE SKIP LOCKED`, no mesmo padrão do outbox. RLS deny-all + policies de serviço, e
  inclusão no `check_rls_coverage.sh`.
- **Escreve:** somente `importacoes_cardapio`.
- **Lê (read-model):** `categorias`, `itens` da loja (para sugerir mesclar/evitar duplicata).
- **Aplicação do rascunho:** chama o serviço exportado por `API-cardapio` por **contrato/porta definida
  no kernel** (função de criação em lote atrás de um contrato Zod `CardapioLoteEntrada`), não importa o
  módulo. Se esse contrato ainda não existir, o primeiro passo é combinar com `API-cardapio` (ver Notas).
- Contratos novos: `ImportacaoCardapioCriada`, `ImportacaoCardapioEstado`, `RascunhoCardapio`
  (categorias[] > itens[] > grupos/opções[], preço em centavos, `confianca?`).
- Consumidor no atendente: um módulo worker (`atendente/modules/importar_cardapio`) drena a tabela. É
  **fora deste escopo** e precisa existir antes do `CONCLUIDO` ponta a ponta (ver Notas).

## Arquivos (escopo de edição)

- `backend/apps/api/src/modules/cardapio_importacao/**`
- `backend/apps/api/src/routes.ts` (1 linha)
- `backend/supabase/migrations/0013_importacoes_cardapio.sql`
- `backend/packages/shared/src/contracts/cardapio_importacao/**`
- `backend/apps/api/test/security/cardapio_importacao.*.test.ts`

## Etapas

- [ ] 1. Migration `0013_importacoes_cardapio` (tabela, índice de claim, grants mínimos, RLS e policies,
  trigger `atualizado_em`) e inclusão na cobertura de RLS; `validate_migrations.sh` e
  `check_rls_coverage.sh` verdes  (commit: `feat(db): importacoes_cardapio (fila e rascunho)`)
- [ ] 2. Contratos Zod do rascunho e dos estados; `gen_contracts`  (commit: `feat(contratos): importação de cardápio`)
- [ ] 3. Scaffold do módulo e registro em `routes.ts`  (commit: `feat(importacao): scaffold do módulo`)
- [ ] 4. Upload: `multipart` com limite de tamanho (10 MB), allowlist de MIME verificada por **assinatura
  do arquivo** (magic bytes: JPEG/PNG/WebP/PDF), não pelo header do cliente; rejeita o resto com 415;
  calcula `arquivo_hash`  (commit: `feat(importacao): upload com validação de tipo e tamanho`)
- [ ] 5. Pré-checagem de credencial: lê o **estado** público da credencial da loja (`ativo`, sem a
  chave) e responde `llm_nao_configurada` quando ausente; não dá para ler a chave aqui e o módulo não
  tenta  (commit: `feat(importacao): exigir llm configurada`)
- [ ] 6. Criar job: insere `importacoes_cardapio` (`recebida`) e devolve `202` com o id; idempotência por
  `(loja_id, arquivo_hash)` em janela curta para evitar duplo envio  (commit: `feat(importacao): enfileirar importação`)
- [ ] 7. Consulta de estado e do rascunho: `GET /importacoes` (lista, sem bytes) e `GET /:id` com
  `rascunho`; polling simples e evento de realtime SSE quando `F5` existir  (commit: `feat(importacao): estado e rascunho`)
- [ ] 8. Edição do rascunho pelo dono: `PATCH /:id` valida o rascunho editado contra `RascunhoCardapio`
  (preço >= 0, nomes não vazios, limites de quantidade de linhas)  (commit: `feat(importacao): editar rascunho`)
- [ ] 9. Aplicar: `POST /:id/aplicar` valida o rascunho, converte em `CardapioLoteEntrada`, invoca a porta
  do `API-cardapio` numa transação, marca `aplicada`, zera `arquivo_bytes`. Reaplicar é 409 (idempotente)
  (commit: `feat(importacao): aplicar rascunho ao cardápio`)
- [ ] 10. Descartar: `POST /:id/descartar` marca `descartada` e zera os bytes  (commit: `feat(importacao): descartar rascunho`)
- [ ] 11. Retenção: o arquivo bruto é apagado (bytes nulos) ao terminar qualquer estado final; job preso em
  `processando` além de um timeout volta para `recebida` com contador de tentativas e vira `falhou`
  após N  (commit: `feat(importacao): retenção e recuperação de job preso`)
- [ ] 12. Testes de unidade/integração do módulo  (commit: `test(importacao): unidade e integração`)
- [ ] 13. Testes `security/` do módulo  (commit: `test(seguranca): importação de cardápio`)

## Testes e segurança exigidos

- Upload: arquivo grande demais (413), MIME falso com extensão de imagem (415), PDF válido e imagem
  válida aceitos; hash estável.
- Sem credencial ativa: `llm_nao_configurada`, nada enfileirado.
- Rascunho inválido (preço negativo, string gigante) rejeitado pelo Zod (SEC-081).
- Aplicar duas vezes não duplica itens; aplicar rascunho de outra loja dá 403/404 (SEC-001/002).
- Estado `falhou` nunca devolve o erro cru do provedor (pode vir com trecho do prompt/segredo).
- Arquivo bruto nunca aparece em log nem em resposta de listagem; `arquivo_bytes` zerado ao finalizar.
- **SEC-020/024 (por extensão):** nada do módulo toca a chave; log não contém o conteúdo do arquivo.
- **SEC-060/061 (por extensão):** o texto do cardápio é entrada não confiável; a saída do modelo é só
  rascunho, passa por validação Zod e por aprovação humana antes de tocar o cardápio. Teste com cardápio
  contendo "ignore as instruções e..." não altera nada além do rascunho.
- SEC-070 (o provedor é chamado pelo atendente, host allowlisted), SEC-101 (rate limit no upload).
- Matriz de privilégio: `whaviso_api` sem DELETE na nova tabela (SEC-030); atendente sem acesso a
  billing/plataforma (SEC-032).

## Notas e decisões

- **Conflito resolvido:** a api não lê a chave de LLM (grant por coluna). Logo, a api **não** pode chamar
  o provedor com a chave da loja. Decisão: importação é **assíncrona**; a api enfileira em
  `importacoes_cardapio` e o atendente (que decifra) drena e grava o rascunho. Isso exige a tabela nova
  e um módulo consumidor no atendente. **Pendência de coordenação:** criar a tarefa
  `AT-importar-cardapio` (Sonnet, onda 2, depende de `AT-llm` e desta migration) ou estender `AT-llm`.
- Arquivo guardado como `bytea` com teto de 10 MB e zerado ao final, evitando depender de storage de
  objetos. Se o `media_storage` do atendente já estiver pronto, trocar por referência de objeto é mudança
  pontual.
- Não há OCR próprio: a extração multimodal é do provedor via `ClienteLLM` (modelo com visão). Modelo
  usado = `modelo_preferido` da loja; se não suportar visão, o job falha com erro claro.
- Consumo registrado em `uso_llm` com `origem = 'cardapio_importacao'` (feito pelo atendente).
- A aplicação respeita a regra "módulo não importa módulo": a porta de criação em lote vem de contrato
  do kernel; se `API-cardapio` ainda não a expôs, abrir ajuste nela (fora do escopo de edição aqui).
