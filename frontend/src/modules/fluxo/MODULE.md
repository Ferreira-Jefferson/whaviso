# fluxo (frontend)

## Propósito
Construtor do fluxo de conversa do atendente. Rota `/fluxo` (grupo config). Lista os fluxos; abrir um
leva ao editor, com duas visões da MESMA edição (toggle `SegmentedControl`):
- **Mapa do fluxo** (`canvas/`, padrão): grafo visual com React Flow (zoom, pan, minimapa,
  controles). Node = etapa, aresta = transição rotulada pelo handle. Interação leve: selecionar uma
  etapa abre a configuração ao lado; arrastar reposiciona (a posição vira rascunho). Node no mesmo
  visual Calmo Editorial do cartão em lista (ícone, selos, borda vermelha com erro).
- **Lista de etapas**: o editor estruturado (cartões expansíveis), alternativa acessível e boa no
  mobile (a edição completa é melhor no desktop).

Ambas compartilham: tipo, configuração gerada do catálogo, destino de cada saída, etapa inicial,
adicionar/remover. O corpo de edição de uma etapa é o `ConfigNode` (usado pela lista e pelo painel do
canvas). Ações: salvar rascunho, validar, publicar, ativar/desativar, histórico de versões (restaurar
vira rascunho). A validação, a publicação e as versões não mudaram: o canvas só desenha sobre elas.

## Entry points
- `index.ts`: export default da página (`lazy(() => import('@/modules/fluxo'))`).

## Dados
- `GET /v1/fluxo/catalogo`, `GET|POST /v1/fluxo`, `GET /:id`, `PUT /:id/rascunho` (controle otimista),
  `POST /:id/rascunho/validar|publicar`, `POST /:id/ativar|desativar`, `GET /:id/versoes`,
  `POST /:id/versoes/:versao/restaurar`.
- Contratos: `@/shared/contracts/_generated/fluxo`. Cache: raiz `['fluxo']`.

## Regras do editor
- A validade do grafo é só do servidor (alcançabilidade, ciclos, etapa obrigatória, ação irreversível
  após confirmação). O cliente não replica regra: salva o rascunho e chama `validar`; publicar com 422
  `grafo_invalido` roda `validar` e lista os problemas.
- O formulário de config sai do JSON Schema do catálogo (`CampoConfig`); chave vazia é removida (padrão do servidor).
- Operações puras em `grafo.ts` (com testes). Cada handle tem no máximo uma ligação; sem ligação = fim do turno.
- Edição não salva fica só em estado local; `atualizado_em_base` evita sobrescrever rascunho alheio (409).

## Canvas (dependência de lib)
- **React Flow** `@xyflow/react@12.12.0` (licença MIT, peer `react >= 17`). Carregado **lazy**
  (`canvas/FluxoCanvas` faz `React.lazy(() => import('./FluxoCanvasReactFlow'))`): o React Flow e seu
  CSS saem em chunk próprio, fora do bundle principal. Escolha: é a lib padrão para grafo de nós no
  ecossistema React, acessível (teclado nos nós/arestas) e sem backend.
- O canvas é controlado pelo grafo (fonte da verdade): arrastar comita a posição via `onMover`; a
  reconstrução dos nós só ocorre quando a estrutura/dados mudam (não a cada arrasto), evitando o nó
  "pular" de volta. Restaurar versão remonta o editor (key no `EditorFluxo`), então relê as posições.
