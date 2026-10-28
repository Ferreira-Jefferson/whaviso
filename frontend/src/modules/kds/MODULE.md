# kds (frontend)

## Propósito
Tela de cozinha (Kitchen Display System) da loja ativa: os pedidos ativos (`novo` e `em_preparo`)
como tickets grandes, legíveis e touch, para a cozinha ver o que preparar e avançar cada pedido.
Duas lanes (Na fila | Preparando); cada ticket mostra código, tempo decorrido (com realce quando
atrasa), modalidade (entrega/retirada), cliente e os itens com opções e observações. Um botão grande
avança: "Iniciar preparo" (`novo -> em_preparo`) e "Pronto" (`em_preparo -> saiu_entrega` na entrega
ou `-> entregue` na retirada). Rota `/cozinha`. Vai ao vivo pelo realtime, sem recarregar.

## Entry points
- `index.ts`: export default da página (para `lazy(() => import('@/modules/kds'))` no registry de rotas).

## Dados (api.ts)
- `GET /v1/pedidos` (kanban do dia; a cozinha usa só as colunas `novo` e `em_preparo`),
  `GET /v1/pedidos/:id` (detalhe, via `useQueries`, para os itens que o kanban não traz) e
  `POST /v1/pedidos/:id/status` (avançar). Mesmos endpoints do painel de pedidos.
- Contratos: `@/shared/contracts/_generated/pedidos` e enums. Não redefinir.
- Cache: raiz `['pedidos']` (a MESMA do painel). O realtime (`pedido.atualizado`) invalida essa raiz
  via `MAPA_INVALIDACAO`, então a cozinha reflete ao vivo; a página também assina `pedido.atualizado`
  só para realçar o ticket que mudou. Um `refetchInterval` suave sustenta o tempo mesmo sem evento.

## Permissão
A rota fica sob `RequireAuth` + `AppShell` (como o módulo pedidos). O controle efetivo é do servidor:
todos os endpoints de pedidos exigem `pedidos:gerir`, então quem não tem a permissão recebe 403 e a
tela mostra o erro. Não há gating de permissão no cliente (espelha o padrão do painel).

## Fronteiras
- **Módulo não importa módulo.** A leitura de estado (ação principal, tom do tempo) vive em
  `estados.ts` deste módulo, espelhando o painel por contrato, nunca importando `@/modules/pedidos`.
  A validade da transição vem sempre do servidor (`card.destinos`); a tela só escolhe rótulo e realce.

## Notas
- PII: os DTOs nunca trazem telefone; o cliente aparece por `nome`. Nada sensível é exibido ou logado.
- Legibilidade de cozinha: tickets e botões grandes (alvo de toque ≥ 56 px), tipografia ampliada,
  grid responsivo (1 lane por vez no mobile, 2 lanes no desktop, 2 colunas de tickets em telas largas).

## Primitivos locais (candidatos a promover)
- Nenhum. A tela usa só primitivos de `@/shared/ui`. `components/CartaoCozinha.tsx` é específico da
  cozinha (ticket de produção com itens/opções/observações e ação de avanço) e fica no módulo.
