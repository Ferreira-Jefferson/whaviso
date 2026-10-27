# F0 db-baseline

- **ID:** F0  ·  **Área:** F  ·  **Onda:** 0
- **Modelo sugerido:** —  ·  **Status:** `CONCLUIDO`
- **Reivindicado por:** baseline (2026-10-27)

## Objetivo

Baseline do banco do restaurante, substituindo todo o schema de cobrança. Entrega o fundamento de que
todos os módulos dependem: multi-tenant por `loja_id`, três roles de serviço de privilégio mínimo, RLS
deny-all, grants por coluna no outbox e nos segredos, auditoria append-only e a tabela de credenciais
de LLM cifrada. "Pronto" observável: `validate_migrations.sh` e `check_rls_coverage.sh` verdes.

## Dependências

Nenhuma. É a raiz do grafo.

## Contratos e tabelas que toca

Cria o schema inteiro de `public` (ver [../../docs/pivot/BANCO.md](../../docs/pivot/BANCO.md)): contas,
lojas, membros, numeros_whatsapp; cardápio (grupos_opcoes, opcoes, categorias, categoria_grupos, itens,
item_grupos); pedidos, itens_pedido, itens_pedido_opcoes; conversas, mensagens; clientes, enderecos;
zonas_entrega, motoboys, fechamentos, motoboy_lancamentos, corridas; pagamentos, loja_pix; operadores,
prospectos, prospecto_atividades, assinaturas, faturas; templates, envios, webhook_eventos_processados;
eventos, eventos_auth; base_conhecimento, cache_semantico; credenciais_llm, uso_llm.

## Arquivos (escopo de edição)

- `backend/supabase/migrations/0001_*.sql` .. `0012_*.sql`
- `backend/supabase/seed.sql`

## Etapas

- [x] Apagar as 103 migrations de cobrança
- [x] Baseline 0001..0011 (roles/RLS, núcleo, cardápio, pedidos, conversas/clientes, entrega, pagamentos, plataforma, templates/outbox, eventos/auth)
- [x] `0012_credenciais_llm` (credenciais_llm + uso_llm, cifrado, grants por coluna)
- [x] Seed de dev (conta/loja/número + cardápio mínimo)
- [x] `validate_migrations.sh whaviso_dev` verde
- [x] `check_rls_coverage.sh whaviso_dev` verde

## Testes e segurança exigidos

Cobertura de RLS (SEC-011) verde. A matriz de privilégio por `SET ROLE` (SEC-021/022/030..033) nasce
aqui e é formalizada em `F7 seguranca-harness`.

## Notas e decisões

- `pgvector` ausente no Postgres local: a 0001/0011 criam `embedding` só se a extensão existir; o
  caminho com vetor deve ser exercitado num Postgres com pgvector antes do `db push` no cloud.
- Decisões de modelagem do baseline (telefone `*_hash` + `*_cifrado`, `status_pedido` com `rascunho`,
  `loja_pix`, `item_grupos.incluir`, etc.) estão no relatório do reset; revisar conforme o produto evolui.
- O check de linguagem de `templates` ainda é o vocabulário de cobrança: **resquício a corrigir**.
- Cloud intocado: o wipe e o primeiro `db push` são janela manual à parte.
