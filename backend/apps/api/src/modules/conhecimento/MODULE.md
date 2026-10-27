# conhecimento

## Proposito
Curadoria da base de conhecimento (RAG) da loja pelo dono/gerente: documentos versionados
(rascunho -> aprovado -> arquivado), golden set (`base_avaliacao`) e triagem da realimentacao
(`rag_feedback`: novo -> triado -> promovido | descartado). So conteudo ESTAVEL e textual: dado vivo
(preco, disponibilidade, status), telefone/Pix e segredo sao barrados (422 `conteudo_nao_estavel`).
A api nao embedda: o vetor e do atendente.

## Entry points
`index.ts` (plugin, prefixo `conhecimento`, rotas `/v1/conhecimento/*`), permissao `loja:gerir`:
- `GET|POST /documentos`, `GET|PATCH /documentos/:id`, `GET /documentos/:id/versoes`,
  `POST /documentos/:id/aprovar`, `POST /documentos/:id/arquivar`
- `GET|POST /avaliacao`, `PATCH /avaliacao/:id`
- `GET /feedback`, `POST /feedback/:id/triar|descartar|promover`

## Regras
- Editar rascunho = no lugar; editar aprovado = nova versao (rascunho, `substitui_id`); aprovar a nova
  arquiva a anterior na mesma transacao (indice nunca fica sem a versao ativa). 409 `versao_pendente`.
- Aprovar revalida a trava e grava o evento `conhecimento.documento_aprovado` em `eventos` (sem
  conteudo). Elo com a ingestao: ver "Pendencia".
- `duplicado_de`: aviso (nao bloqueia) por `hash_conteudo` do conteudo normalizado.
- Golden set: `docs_esperados` precisam ser da loja (422 `documento_invalido`); pergunta pode citar
  preco, mas nao PII/segredo.
- Promover feedback exige `triado` e o dono escreve o documento (rascunho `realimentado` com a fonte).
- Sem DELETE (grants): remover = arquivar/`ativo=false`/`descartado`.

## Pendencia (elo aprovacao -> ingestao)
Nao existe outbox dedicado. O atendente deve consumir `eventos` (`tipo = 'conhecimento.documento_aprovado'`
e `conhecimento.documento_arquivado`, `entidade_id` = documento) ou varrer `documentos` aprovados sem
`chunks`, chamando `ingerirDocumento` (e apagando chunks de arquivados).

## Tabelas
- dono de (escrita): `documentos`, `base_avaliacao`; atualiza `rag_feedback`; le `chunks` (contagem)
- escreve: `eventos` (auditoria `conhecimento.*`, sem PII)
