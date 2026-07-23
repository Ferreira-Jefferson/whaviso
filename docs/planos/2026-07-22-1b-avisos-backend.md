# Grupo 1B — Avisos (backend + DetalheAviso.tsx)

Origem: `docs/feedback-2026-07-22.md` + `.claude/plans/snazzy-sleeping-music.md`. Fonte de verdade de regra de negócio: `historias/`.

## Escopo desta wave (wave 1)

**Arquivos que este grupo TEM QUE SER O ÚNICO A TOCAR:**
- `backend/apps/api/src/modules/avisos/service.ts`
- `backend/apps/api/src/modules/avisos/repo.ts`
- `backend/apps/api/src/modules/avisos/index.ts`
- `frontend/src/modules/avisos/pages/DetalheAviso.tsx`
- `frontend/src/modules/avisos/api.ts`
- `backend/packages/shared/src/contracts/enums.ts`
- `frontend/src/shared/contracts/entidades.ts` (este grupo é o ÚNICO dono deste arquivo nesta rodada inteira — outros grupos vão consumir os tipos que você publicar aqui, mas não o editam)
- Migrations novas: **use exatamente os números `0092` e `0093`** (o repositório está em `0091` no momento em que este plano foi escrito; confirme com `ls backend/supabase/migrations | tail` antes de criar, mas não reuse um número já ocupado por outro arquivo).

**NÃO tocar** `frontend/src/modules/avisos/components/AvisoCriado.tsx` (é do grupo 1A/wave 2). **NÃO tocar** `historias/07-interacao-devedor.md` para o item 7 (o zap-side + a redação da história de aceite deste item ficam concentrados no grupo 1E, wave 2, pra não haver dois agentes editando o mesmo arquivo de história).

## Itens

- **Item 1 (erro de saldo engolido):** o problema real está no fluxo de **Reengajar** em `DetalheAviso.tsx` (o de Ativar já trata `isLimiteDeSaldo` corretamente). Implemente de forma genérica: extraia um helper que pega o primeiro erro real de **qualquer** mutação da tela (não uma lista fixa de nomes de botão) e, quando for erro de saldo insuficiente, sempre mostra o mesmo `Banner` + link para `/app/creditos` usado hoje só no Ativar. Fazer genérico cobre tanto Reengajar quanto qualquer outro botão que hoje engula esse erro, sem precisar confirmar qual botão exatamente o Jeff viu.
- **Item 7 (aprovação de dado incorreto) — só a parte backend/api nesta wave:**
  - Campos que o devedor pode reportar como incorretos (decidido): **valor, data, nome/motivo**. Chave Pix **não** entra nesta lista.
  - Migration `0092`: novo status `aguardando_aprovacao_dado_incorreto` no enum de status de aviso, novos tipos de evento em `eventos_aviso`, nova tabela `avisos_reportes` (aviso_id, campo reportado — enum valor/data/nome_motivo —, resolução pendente/aprovado/recusado, timestamps, sem DELETE, é auditoria/negócio: nunca some, só muda de estado).
  - Novas funções `aprovarDadoIncorreto` / `recusarDadoIncorreto` em `service.ts`.
  - **Decisão já tomada sobre o comportamento de aprovar:** ao aprovar, o sistema reabre automaticamente o fluxo de edição do campo reportado, **já com os valores corretos pré-preenchidos** (os valores que o devedor informou como corretos ao reportar), e destaca visualmente (cor de destaque ou ícone) quais campos foram alterados por causa da aprovação, para o cobrador saber o que mudou antes de confirmar/enviar a edição. Modele o dado de forma que dê pra saber, no fluxo de edição existente (`aprovarEdicao`/`recusarEdicao`, já existe no `service.ts` — espelhe o mesmo mecanismo), quais campos vieram de uma aprovação de reporte vs. edição manual normal.
  - Contrato com o grupo 1E (que roda depois, wave 2, quando esta migration já estiver aplicada localmente): o zap escreve em `avisos_reportes` quando o devedor reporta; a api enfileira notificação ao devedor quando o cobrador resolve (aprova/recusa).
  - Publique em `frontend/src/shared/contracts/entidades.ts` o novo status e o novo tipo `AvisoReporte` (espelhando o enum/schema do backend), para que o grupo 1A (wave 2) e 1C consigam consumir os tipos.
- **Item 8 (regra de pendência):** função pura `pendenciaDoAviso(aviso)` cobrindo: `informado_pago` (confirmar/rejeitar), `aguardando_aprovacao_dado_incorreto` (novo), `aguardando_aprovacao_aviso_editado`, sem saldo pra ativar. Consome o componente `IconePendencia` publicado pelo grupo 1A em `shared/ui/IconePendencia.tsx` — **se esse arquivo ainda não existir quando você chegar nesta etapa**, implemente tudo o mais (a função `pendenciaDoAviso` e a lógica de estado) e deixe um comentário `// TODO: usar <IconePendencia/> quando disponível (grupo 1A)` no lugar exato onde o ícone entraria, reportando isso claramente no resumo final. Não bloqueie o resto do grupo por causa disso.
- **Item 21 (código do combinado, lado backend):** nova migration `0093`, coluna `codigo` em `avisos` (formato: alfanumérico curto, 6 caracteres, maiúsculas, excluindo caracteres ambíguos `0/O/1/I/L`, gerado com fonte de aleatoriedade criptográfica, não sequencial — para não vazar volume de combinados nem exigir lock de sequence; trate colisão com retry). Gerado em `criarAviso`. Exponha no contrato de resposta (`avisos` em `entidades.ts` e no schema Zod do backend). Escreva o critério novo na história do épico que cobre "criar combinado" (provavelmente Épico 2 ou 3 — confira `historias/README.md` pra achar o arquivo certo) registrando o formato do código decidido.

## Historias/ a atualizar

- Item 21: adicionar critério do formato do código na história de "criar combinado" (Épico 2/3, confirme o arquivo certo lendo `historias/README.md`).
- Item 7: **não mexer em `historias/07-interacao-devedor.md` nesta wave** — fica com o grupo 1E (wave 2), que consolida item 7 (zap-side) + item 23 no mesmo arquivo de história pra evitar dois agentes editando o mesmo doc.

## P2 da auditoria de SQL, incorporado aqui (mesmo arquivo, evita conflito com outro agente)

- `inserirOcorrencias` em `repo.ts` faz até 60 INSERTs sequenciais em vez de 1 batch com `unnest` (cap duro de 60 pelo `MAX_OCORRENCIAS`, severidade baixa mas é uma correção de código simples). Aproveite que você já está neste arquivo e resolva junto.

## Verificação

- `cd backend && npm run lint && npm run typecheck && npm test`.
- `bash scripts/validate_migrations.sh whaviso_dev` (migration nova).
- `cd frontend && npm run lint && npm run typecheck`.
- Migrations novas ficam pendentes de aplicar no Supabase cloud — não aplique, isso é decidido depois com o Jeff.
- Rodar `/graphify . --update` ao final, se a ferramenta existir no ambiente.
