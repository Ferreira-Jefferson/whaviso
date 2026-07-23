# Grupo 1F — zap: notificar_cobrador + enviar_lembretes

Origem: `docs/feedback-2026-07-22.md` + `.claude/plans/snazzy-sleeping-music.md`. Fonte de verdade de regra de negócio: `historias/`.

## Escopo desta wave

**Arquivos que este grupo TEM QUE SER O ÚNICO A TOCAR:**
- `backend/apps/zap/src/modules/notificar_cobrador/index.ts`
- `backend/apps/zap/src/modules/enviar_lembretes/index.ts`

## Itens

- **Item 6 (central de notificações, lado zap) — escopo reduzido, decidido:** 3 das 4 categorias já enfileiram hoje (`pagamento_informado`, `combinado_dado_incorreto` em `notificacoes_cobrador`; "solicitação de créditos" em `notificacoes_billing`, fora deste grupo). "Pagamento reportado" é tratado como sinônimo de "pagamento informado" no texto do Jeff — não crie um evento distinto pra isso, só confirme lendo o código que o enfileiramento de `pagamento_informado` já cobre esse caso.
  - **Fora de escopo nesta leva (não implementar):** a coluna/cursor de "lida" em `notificacoes_cobrador` e o endpoint de leitura pra montar uma central de notificações na UI. Isso não estava claramente atribuído a nenhum grupo no plano original e envolve decisão de formato (coluna por linha vs. cursor por conta) e um módulo novo na api — não tente inventar isso agora. Registre no resumo final que este pedaço do item 6 ficou de fora e precisa de planejamento próprio.
- **Item 20 (texto pós "já paguei") — a lógica de cadência já está correta.** `enviar_lembretes/index.ts` já garante no máximo uma mensagem extra (o empurrãozinho de D+1), e o ciclo só encerra por confirmação do cobrador. O problema é textual (conteúdo do template, isso é do grupo 1G, não seu). Sua parte aqui é só código/garantia:
  - Reforce comentários no código apontando que `('ciclo.d_mais_1', 'revisao')` é o único par autorizado a mencionar encerramento de ciclo.
  - Adicione um teste de regressão garantindo que nenhuma outra etapa/template sai em estado `informado_pago`.

## Verificação

- `cd backend && npm run lint && npm run typecheck && npm test`.
- Rodar `/graphify . --update` ao final, se a ferramenta existir no ambiente.
