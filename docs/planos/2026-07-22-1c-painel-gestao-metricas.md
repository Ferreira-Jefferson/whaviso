# Grupo 1C — Painel + Gestão/Resultados + Métricas usuário + Métricas admin (item 18)

Origem: `docs/feedback-2026-07-22.md` + `.claude/plans/snazzy-sleeping-music.md`. Fonte de verdade de regra de negócio: `historias/`.

## Escopo desta wave (wave 1)

**Arquivos que este grupo TEM QUE SER O ÚNICO A TOCAR:**
- `frontend/src/modules/painel/pages/Painel.tsx`
- `frontend/src/modules/painel/pages/Metricas.tsx`
- `frontend/src/modules/painel/api.ts`
- `backend/apps/api/src/modules/painel/repo.ts`
- `frontend/src/modules/pessoas/pages/Clientes.tsx`
- `frontend/src/modules/produtos/pages/Produtos.tsx`
- `frontend/src/shared/ui/StatCard.tsx`
- Novo(s) arquivo(s) de admin para o item 18 (ex.: `backend/apps/api/src/modules/admin/repo.ts` se já existir aproveite, ou crie uma função nova; frontend: alguma página de admin existente que mostre visão geral do sistema — investigue `frontend/src/modules/admin/` antes de criar página nova).

Este grupo importa (consome, não edita) `IconePendencia` de `shared/ui/IconePendencia.tsx` (grupo 1A). **Se esse arquivo ainda não existir quando você chegar no item 8**, implemente o resto e deixe `// TODO: usar <IconePendencia/> quando disponível (grupo 1A)` no lugar certo, sem bloquear o resto do grupo.

## Itens

- **Item 5:** trocar o fallback de `lerGrupo` de `'ativos'` para `'todos'`. Mudança de uma linha.
- **Item 8 (consumo):** mapa `aviso_id → tipo de pendência` a partir de `usePainelPendencias()` (já existe, alimenta o card "Precisa de você"); usar o `IconePendencia` do 1A na lista de combinados do Painel.
- **Item 10 (busca em Gestão):** filtro client-side simples (useState + Input) em `Clientes.tsx` e `Produtos.tsx`. Sem paginação/busca no servidor nesta leva (listas hoje são pequenas).
- **Item 14 (cards piscando):** `usePainelResumo` ganha `placeholderData: keepPreviousData`; `Painel.tsx` deixa de desmontar os `StatCard` no loading, usa `isFetching` pra acender um `Skeleton` só na linha do valor (nova prop `carregando?` em `StatCard`, opcional e aditiva).
- **Item 16 (resumo de resultado no Painel, redesenhado):** Painel ganha uma seção compacta de resumo de resultado (recebido, a receber, ticket médio, os números principais de `painel/metricas`), ao lado dos `StatCard`s que já existem. **Não mexe em Gestão** (sem remover aba, sem redirect, sem tocar `GestaoLayout`/`router.tsx` — H18.1 permanece exatamente como está). Reaproveita `usePainelMetricas(periodo)` já existente, mesmo filtro de período do resto do Painel. Exibir só quando o usuário tem algum histórico como cobrador (evitar seção vazia pra quem só é devedor). Escrever nova história/critério em `historias/09-painel.md` (Épico 9) descrevendo esse resumo.
- **Item 17 (mais indicadores em Gestão > Resultados):** infraestrutura de dados já existe, sem tabela nova — `eventos_aviso` já grava `solicitou_pix` (cliques em "ver pix") e `envios.entrega_status` já tem `'read'` (mensagem lida). Agregar isso em `painel/repo.ts::metricas()`, expor em `painelMetricasResposta` (aditivo), mostrar na aba Resultados existente. **Cuidado de linguagem:** nunca usar "calote" (cai no regex de palavras proibidas de `linguagem.ts`) — usar termos neutros ("taxa de combinados concluídos", "tempo médio até confirmação"). **Decisão (default, sem confirmação explícita do Jeff — implemente assim e registre a ressalva no resumo final):** agregar só total, **não** por cliente nesta leva (mais simples, menor exposição, reversível/aditivo depois se o Jeff quiser quebrar por cliente). Registrar critério novo em `historias/18-gestao.md` (H18.2).
- **Item 18 (métricas do sistema, painel ADMIN):** o painel ADMIN mostra um resumo do mesmo tipo do item 16, mas agregado pro sistema todo (visão do owner: total recebido/a receber/ticket médio no sistema inteiro, não por usuário). **Cuidado com privilégio:** owner vê métricas agregadas do sistema, mas isso não é "ver conteúdo de cliente" — não pode incluir nome/telefone de devedor nem dado individual de combinado, só números agregados (mesma régua do owner-só-vê-templates-de-config, não conteúdo de cliente). Investigue se já existe alguma página/rota admin de visão geral em `frontend/src/modules/admin/` e `backend/apps/api/src/modules/admin/` antes de criar arquivo novo. Verifique se existe história cobrindo métricas de admin/uso do sistema; se não existir, escreva uma nova (provavelmente uma extensão do épico de admin, veja `historias/README.md` para achar o número certo) definindo o que "cumprir o objetivo do produto" significa em métrica agregada.

## Verificação

- `cd backend && npm run lint && npm run typecheck && npm test`.
- `cd frontend && npm run lint && npm run typecheck`.
- Testar manualmente Painel e Gestão > Resultados localmente, se `npm run dev` estiver disponível.
- Rodar `/graphify . --update` ao final, se a ferramenta existir no ambiente.
