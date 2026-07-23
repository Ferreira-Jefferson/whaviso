# Grupo — Auditoria de SQL (item 15, transversal)

Origem: `docs/feedback-2026-07-22.md` + `.claude/plans/snazzy-sleeping-music.md`.

## Escopo desta wave

**Este grupo só cria migrations novas (índices e grants). Não toca em código de módulo nenhum** (a correção de `inserirOcorrencias` (P2) foi incorporada ao grupo 1B, que já edita `backend/apps/api/src/modules/avisos/repo.ts` — não duplique essa correção aqui).

- Migrations novas: **use exatamente os números `0097` e `0098`** (confira `ls backend/supabase/migrations | tail` antes, mas não reuse número ocupado por outro grupo).

## Achados a corrigir (já verificados no código, não é lista de tarefas genéricas)

- **P0 → migration `0097`:** falta índice em `creditos_lancamentos (ref_tipo, ref_id)` — o check de idempotência de consumo de crédito, chamado a cada envio de mensagem, hoje varre a tabela inteira (livro-razão append-only, cresce pra sempre).
- **P1 → migration `0098`:** grants de `creditos_hold` violam privilégio mínimo — `whaviso_api` nunca faz `select`/`update` nessa tabela (só usa) e tem esse grant; `whaviso_zap` nunca faz `insert` e tem esse grant. Revogar o que não é usado (confirme lendo o código de fato antes de revogar, não assuma).
- **P1 → migration `0097`:** falta índice parcial em `envios (enviado_em) where status='enviado'` para o espaçamento de 10min do drainer de lembretes — o mesmo padrão já foi resolvido corretamente em `notificacoes_cobrador`, mas nunca replicado em `envios`. Confira como foi feito lá pra replicar o mesmo padrão.
- **P1 → migration `0097`:** falta índice em `creditos_hold (aviso_id) where resolvido_em is null` — consultado a cada clique em "Ativar".
- **Verificado sem achado (não mexer):** RLS deny-all em todas as tabelas ativas, `FOR UPDATE SKIP LOCKED` correto em todo claim de outbox, nenhum DELETE fora de `templates`/`aviso_categorias` (ambos documentados), nenhum dado sensível em log.

## Verificação

- `bash scripts/validate_migrations.sh whaviso_dev` (obrigatório, migrations de schema/grants).
- `cd backend && npm run test` (garantir que nada quebrou com os grants revogados).
- Migrations novas ficam pendentes de aplicar no Supabase cloud — não aplique, isso é decidido depois com o Jeff.
