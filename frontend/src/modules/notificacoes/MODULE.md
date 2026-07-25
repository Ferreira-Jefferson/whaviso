# Módulo: notificacoes

Central de notificações (H10.10, item 6 do feedback 2026-07-22): página própria
(`/app/notificacoes`) que reúne o "precisa de você" (H9.2, pendências ABERTAS por
combinado que aguardam ação, movida da Visão geral do Painel) e o feed cronológico
paginado das notificações do usuário logado (pagamento informado, dado incorreto
reportado, solicitação de créditos). O sino no header comum (AppShell) é só um atalho
(ícone + contador de não lidas) para essa página, sem dropdown próprio.

**Papel:** user/owner (o sino aparece em qualquer área logada, `/app`, `/meus`, `/admin`;
a página fica sob `/app`, mesma seção do Painel que ela substitui parcialmente)
**Onde aparece:** sino em `AppShell` (sidebar lg+ e topbar mobile); página em
`/app/notificacoes`, com item de navegação próprio

> Fronteira: este módulo NUNCA importa de outro módulo (nem `painel`, mesmo servindo o
> "precisa de você" dele). Coordene via `@/shared/*` (ui, format, api_client, contracts)
> ou contratos: `usePendencias()` em `api.ts` espelha `painelPendenciasResposta` de
> `@/shared/contracts` (kernel compartilhado, não um módulo) e chama `/painel/pendencias`
> direto, do mesmo jeito que o módulo `painel` chama `/avisos` sem importar o módulo
> `avisos`.

## Estado

- `api.ts`:
  - `useNotificacoesCentral(page?, perPage?)` → `GET /v1/notificacoes`. Contrato Zod
    PRÓPRIO (espelha manualmente `notificacaoCentralSchema`/`notificacoesCentralResposta`
    do backend, não importa o pacote). Paginado (`page`/`per_page`, resposta traz
    `total`); `nao_lidas` é o total pendente, independente da página. `refetchInterval`
    de 60s mantém o contador do atalho do sino perto do estado real (sem websocket).
  - `useMarcarNotificacaoLida()` → `POST /v1/notificacoes/:id/marcar-lida`, marca UMA
    notificação (nunca em massa), invalida a central ao concluir.
  - `usePendencias()` → `GET /v1/painel/pendencias` ("precisa de você", H9.2), contrato
    mirado de `@/shared/contracts`.
- `components/SinoNotificacoes.tsx`: ícone + contador, SEM painel dropdown. Ao clicar,
  navega direto para `/app/notificacoes`; não marca nada como lido.
- `pages/Notificacoes.tsx`: a página em si. Seção "Precisa de você" no topo (só aparece
  com itens); seção "Histórico" embaixo, com a lista paginada. Clique num item do
  histórico marca aquele item como lido (se ainda não estava) e navega ao contexto:
  origem `cobrador` → `/app/avisos/:id`; origem `billing` → `/app/creditos`. Rótulos
  próprios por `tipo` (NÃO reutiliza `ROTULO_EVENTO` de `shared/format`: aquele é de
  `TipoEvento`, a linha do tempo dentro de um combinado; aqui é `TipoNotificacaoCentral`,
  a outbox).

## Escopo (mesma decisão do backend, H10.10)
Só 3 categorias aparecem no histórico: `pagamento_informado`, `combinado_dado_incorreto`
e `recarga`. Os demais eventos do produto (optout, reativação, encerramento, edição,
reengajamento...) continuam só WhatsApp, fora da central por decisão deliberada nesta
leva.
