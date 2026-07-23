# Grupo 1G — Templates/mensagens (admin)

Origem: `docs/feedback-2026-07-22.md` + `.claude/plans/snazzy-sleeping-music.md`. Fonte de verdade de regra de negócio: `historias/`.

## Escopo desta wave

**Arquivos que este grupo TEM QUE SER O ÚNICO A TOCAR:**
- `frontend/src/modules/admin/pages/DetalheMensagem.tsx`
- `frontend/src/modules/admin/catalogo_mensagens.ts`
- `frontend/src/modules/admin/templates_catalogo.ts`
- Migrations novas: **use exatamente os números `0095` e `0096`** (confira `ls backend/supabase/migrations | tail` antes, mas não reuse número ocupado por outro grupo).

## Itens

- **Item 20:** nova migration (`0095`) de conteúdo pra `ciclo.d_mais_1`/`revisao`, alinhando ao texto já decidido na H6.5 (empurrãozinho "ainda não confirmou"), **sem** a frase "pode desconsiderar" (essa promessa já é feita, corretamente, em `resposta.ja_paguei`, texto livre fora deste grupo). Como é template Meta (`comoTemplate: true`), muda de versão pendente e precisa passar pelo fluxo de aprovação (H12.5) antes de ativar — **não é instantâneo**, deixe isso claro no resumo final (lead time de aprovação da Meta).
- **Item 22:** nova migration (`0096`) de conteúdo pra `resposta.ver_pix`/`padrao`, adicionando `motivo` e `valor` ao texto e ao array de variáveis (`pix_tipo, pix_chave, motivo, valor`). Esta é texto livre (não passa por aprovação Meta), pode editar a versão ativa in place (mesmo precedente já usado na migration `0087`). Atualizar `catalogo_mensagens.ts` com as novas variáveis pra aparecerem no editor.

## Coordenação de deploy (não é problema de código agora, é nota pra depois)

- O item 22 deve subir pra produção junto com a mudança do grupo 1E que popula `motivo`/`valor` (mesma leva de deploy). O item 20 não tem pressa de coordenação (é só correção de texto órfão). Deixe isso registrado no resumo final.

## Verificação

- `cd backend && npm run lint && npm run typecheck && npm test`.
- `bash scripts/validate_migrations.sh whaviso_dev` (migrations novas).
- `cd frontend && npm run lint && npm run typecheck`.
- Migrations novas ficam pendentes de aplicar no Supabase cloud — não aplique, isso é decidido depois com o Jeff.
- Rodar `/graphify . --update` ao final, se a ferramenta existir no ambiente.
