# Módulo: notificacoes

Sino de notificações (H10.10, item 6 do feedback 2026-07-22): feed cronológico das
notificações do usuário logado (pagamento informado, dado incorreto reportado,
solicitação de créditos), com contador de não lidas no header comum (AppShell).
NÃO é o "precisa de você" do painel (pendências abertas por combinado, módulo
`painel`); é o histórico do que já aconteceu.

**Papel:** user/owner (qualquer área logada; o AppShell é o layout comum de /app, /meus
e /admin)
**Onde aparece:** `AppShell` (sidebar lg+ e topbar mobile)

> Fronteira: este módulo NUNCA importa de outro módulo. Coordene via `@/shared/*`
> (ui, format, api_client) ou contratos. Diferente dos demais módulos (que só exportam
> páginas lazy), `index.ts` exporta o componente `SinoNotificacoes` direto (sem lazy):
> não é uma rota, é montado sempre no header.

## Estado

- `api.ts`:
  - `useNotificacoesCentral(limit?)` → `GET /v1/notificacoes`. Contrato Zod PRÓPRIO
    (espelha manualmente `notificacaoCentralSchema`/`notificacoesCentralResposta` do
    backend, não importa o pacote). `refetchInterval` de 60s mantém o badge perto do
    estado real (sem websocket).
  - `useMarcarNotificacoesLidas()` → `POST /v1/notificacoes/marcar-lidas`, invalida a
    central ao concluir.
- `components/SinoNotificacoes.tsx`: ícone + contador + painel dropdown. Ao abrir, marca
  TUDO como lido (mecanismo escolhido no backend). Clique num item fecha o painel e
  navega: origem `cobrador` → `/app/avisos/:id`; origem `billing` → `/app/creditos`.
  Rótulos próprios por `tipo` (NÃO reutiliza `ROTULO_EVENTO` de `shared/format`: aquele
  é de `TipoEvento`, a linha do tempo dentro de um combinado; aqui é
  `TipoNotificacaoCentral`, a outbox).

## Escopo (mesma decisão do backend, H10.10)
Só 3 categorias aparecem: `pagamento_informado`, `combinado_dado_incorreto` e `recarga`.
Os demais eventos do produto (optout, reativação, encerramento, edição, reengajamento...)
continuam só WhatsApp, fora da central por decisão deliberada nesta leva.
