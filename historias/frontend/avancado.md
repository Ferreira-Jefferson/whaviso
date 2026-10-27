# FR-avancado telas avançadas

- **ID:** FR-avancado  ·  **Área:** FR  ·  **Onda:** 5
- **Modelo sugerido:** Sonnet  ·  **Status:** `A FAZER`
- **Reivindicado por:** (preencher ao começar; um rótulo por tela)

## Objetivo

Entregar as duas telas de maior complexidade: o **mapa de despacho (roteirização)** e o **editor visual
de fluxo** (builder do grafo de atendimento). "Pronto" observável: o operador vê pedidos e motoboys no
mapa, recebe sugestões de corridas agrupadas por preparo e proximidade e as aceita ou ajusta; o dono
edita o fluxo do atendimento arrastando nodes, valida e publica.

**Regra central (inegociável):** a PRIMEIRA etapa de cada tela é um **artifact visual** (desktop +
mobile, bonito e organizado, inspirado em referências de design de produto), aprovado antes de qualquer
código; só então transpor para React, fiel ao artifact, sem degradar. Nestas duas telas o artifact
também **prova a interação** (arrastar, selecionar, zoom), não só o estático. Ver
[../README.md](../README.md), "Front-end: design primeiro, código depois".

## Dependências

- `F6` front-shell.
- `FR-entrega` T4 (despacho manual) `CONCLUIDO`: o mapa estende o **mesmo módulo** `despacho/` do front
  (uma tarefa por vez nessa pasta).
- Mapa: `API-roteiriza` (que depende de `API-despacho` e `F2` ClienteMapas). A API devolve
  geometrias/coordenadas e sugestões; o front **não** chama provedor de mapas de dados (geocode, matriz,
  rota ficam na api atrás de `ClienteMapas`). O front só renderiza tiles do mapa base.
- Editor de fluxo: `API-fluxo` (depende de `AT-motor-min`, `F1`: o `NodeContract` é a fonte do que cada
  node declara de entradas, saídas e campos de configuração).

## Contratos e tabelas que toca

O front não toca tabela. Consome `frontend/src/shared/contracts/_generated/`:
- Mapa: pedido (visão despacho com `lat/lng`), motoboy, corrida sugerida (lote, ordem de parada, tempo
  estimado, distância), corrida confirmada, parâmetros de agrupamento (janela de preparo, raio).
- Fluxo: grafo (nodes, arestas, posições), `NodeContract` por tipo (saudacao, pedir_categoria,
  montar_pedido, confirmar, endereco, pix, acompanhar, etc.): esquema de configuração por tipo é o que
  **gera o formulário do node**; resultado de validação do grafo; versões publicada/rascunho.

## Arquivos (escopo de edição)

- `frontend/src/modules/despacho/**` (subpasta `mapa/`; sem mexer no que FR-entrega entregou, só estender)
- `frontend/src/modules/fluxo/**`
- Rotas: 1 linha por módulo no registry do shell.
- Dependências novas de npm (lib de mapas, lib de grafo): **registrar a escolha e a justificativa**
  nas Notas, versão fixa, sem CDN, instalada em `frontend/`. Sem HTML de artifact em `frontend/src`.

## Convenções comuns

- TanStack Query com chaves por `lojaId`; `loja_id` nunca no payload escolhido pela tela.
- Estado local complexo (seleção, viewport, grafo em edição) isolado em store do módulo; nada de estado
  de domínio duplicado: o servidor é a fonte, o front guarda só rascunho de edição.
- Performance: virtualização/clustering de marcadores no mapa, memo nos nodes do grafo; meta
  documentada (ex.: 300 pedidos no mapa e grafo de 60 nodes sem queda perceptível de fluidez).
- Acessibilidade: tudo que se faz arrastando tem alternativa por teclado/botões (selecionar e mover);
  mapa tem lista equivalente dos mesmos dados.
- Sem travessão em texto/código/commit; sem menção a IA; copy neutra de gênero.

## Padrão de etapas por tela (1 linha = 1 commit atômico)

**A (artifact) -> B (transpor) -> C (testes)**; prefixo `T#`. A1 artifact desktop (>=1280) e mobile (390)
com interação demonstrada, estados vazio/erro/carregando, claro e escuro, 3 referências; A2 aprova e
registra link/data; B só depois; ao fim de B, comparar artifact x tela real e corrigir.

---

## T1 Mapa de despacho (roteirização)

Objetivo: mapa com pedidos prontos/em preparo e motoboys, sugestões de corrida por preparo +
proximidade, aceitar, ajustar à mão ou recusar, e acompanhar corridas em curso.

Etapas:
- [ ] T1-A1 Artifact desktop + mobile: mapa com marcadores de pedido coloridos por urgência de preparo,
  clusters, painel de sugestões ("corrida A: 3 pedidos, 18 min, 6,2 km") que ao passar o mouse destaca
  o trajeto e a ordem de paradas, aceitar/ajustar/recusar, ajuste por arrastar parada na lista;
  mobile com mapa em tela cheia e gaveta inferior de corridas
- [ ] T1-A2 Aprovação do artifact
- [ ] T1-B1 Escolha e instalação da lib de mapas (decisão registrada), componente base de mapa em
  `despacho/mapa`, camada de tiles configurável por env (sem segredo em `VITE_*`; chave de tile pública
  restrita por domínio, se houver)  (commit: `feat(front/despacho): base do mapa`)
- [ ] T1-B2 Marcadores de pedidos e motoboys com clustering, popup/detalhe, legenda de urgência, sincronia
  com a lista (selecionar em um destaca no outro)  (commit: `feat(front/despacho): marcadores e lista`)
- [ ] T1-B3 Sugestões de corrida: consumir `API-roteiriza`, desenhar trajeto (polyline devolvida pela
  api), ordem de paradas numerada, resumo de tempo e distância  (commit: `feat(front/despacho): sugestoes de corrida`)
- [ ] T1-B4 Aceitar, recusar e ajustar sugestão (reordenar paradas, mover pedido entre corridas, trocar
  motoboy); reaproveita a mutação de corrida manual, sem duplicar regra; recalcula pela api após ajuste
  (commit: `feat(front/despacho): aceitar e ajustar`)
- [ ] T1-B5 Realtime (SSE): novos pedidos prontos e mudança de corrida atualizam o mapa sem perder a
  seleção; estados de pedido sem geocodificação ("endereço não localizado", com ação de corrigir
  endereço); responsivo mobile com gaveta  (commit: `feat(front/despacho): realtime e estados do mapa`)
- [ ] T1-C1 Testes: reducer de sugestões/ajustes, conversão de coordenadas, pedido sem lat/lng tratado,
  seleção sincronizada mapa/lista, alternativa em lista presente; teste de que nenhuma chamada sai do
  front para provedor de geocode/rota (só tiles)  (commit: `test(front/despacho-mapa): ...`)

Arquivos: `frontend/src/modules/despacho/**`. Depende de `API-roteiriza`, FR-entrega T4.
Atenção SEC: **SEC-070** (lado servidor) por isso o front não fala com provedor de dados; **SEC-090**: a
CSP precisa permitir apenas o host de tiles escolhido em `img-src`; registrar o host ao dono do módulo
de headers, não afrouxar globalmente.

## T2 Editor visual de fluxo

Objetivo: o dono vê o grafo do atendimento (hardcoded hoje, agora editável), arrasta nodes, configura
cada um pelo formulário gerado do `NodeContract`, valida e publica uma versão.

Etapas:
- [ ] T2-A1 Artifact desktop + mobile: canvas com nodes e arestas (zoom, pan, minimapa), paleta de
  nodes à esquerda, painel de configuração do node selecionado à direita (formulário vindo do
  contrato), barra de validação com erros ligados aos nodes, rascunho vs publicado; mobile em modo
  leitura/edição simples (lista de passos) com aviso de que a edição completa é no desktop
- [ ] T2-A2 Aprovação do artifact
- [ ] T2-B1 Escolha da lib de grafo (decisão registrada) e canvas base somente leitura do fluxo atual,
  com layout automático inicial  (commit: `feat(front/fluxo): canvas de leitura`)
- [ ] T2-B2 Paleta e adição/remoção de nodes e arestas, regras de conexão derivadas do `NodeContract`
  (entradas/saídas compatíveis), desfazer/refazer  (commit: `feat(front/fluxo): edicao do grafo`)
- [ ] T2-B3 Painel de configuração do node: **formulário gerado do esquema do `NodeContract`** (um
  renderizador genérico por tipo de campo, não um formulário escrito à mão por node)
  (commit: `feat(front/fluxo): formulario por contrato`)
- [ ] T2-B4 Validação (cliente: estrutura básica; servidor: autoritativa via api), erros destacados no
  node, bloqueio de publicar com erro  (commit: `feat(front/fluxo): validacao`)
- [ ] T2-B5 Rascunho e publicação de versão, histórico de versões, restaurar versão anterior,
  proteção contra perder alterações (aviso ao sair), estados e mobile  (commit: `feat(front/fluxo): versoes e publicacao`)
- [ ] T2-C1 Testes: regras de conexão, serialização grafo <-> contrato (round trip sem perda), render do
  formulário por tipo de campo, publicar bloqueado com erro, desfazer/refazer  (commit: `test(front/fluxo): ...`)

Arquivos: `frontend/src/modules/fluxo/**`. Depende de `API-fluxo`. Texto livre de configuração
(mensagens do fluxo) é validado pela api (linguagem, tamanho); o front só espelha limites do contrato.

---

## Divisão por tela (paralelismo)

T1 e T2 são módulos distintos e podem andar em paralelo **depois** de FR-entrega T4 (para T1) e `API-fluxo`
(para T2). Os artifacts (T1-A1 e T2-A1) não dependem de API e podem ser adiantados. Serializar apenas
mudanças em `shared/**`.

## Testes e segurança exigidos

- Testes de componente/estado por tela (cada C1) + `lint`, `typecheck`, `build` verdes.
- **SEC-025**: bundle sem `service_role`/segredo; nenhuma `VITE_*` com segredo (grep em `dist/`); chave
  de tiles, se existir, é pública e restrita por domínio.
- **SEC-090**: sem script/estilo inline ou origem externa além do host de tiles declarado.
- **SEC-001/SEC-002** (cliente): sem `loja_id` escolhido pela tela; troca de loja invalida cache e
  descarta rascunho de fluxo em memória.
- **SEC-061** (espelho na UI): o editor de fluxo nunca promete que a saída do modelo executa ação; ações
  sensíveis (confirmar pedido, Pix) são nodes determinísticos, a UI não permite ligar saída de LLM direto
  a eles sem passar pela regra do contrato (a regra é do `NodeContract`, o front a respeita).
- Telefone/endereço de cliente no mapa: só o necessário ao despacho, fora de log/URL/storage.

## Design (FR-*)

Um artifact por tela, desktop + mobile. Preencher ao aprovar:
- T1 Mapa de despacho: link `<pendente>`  ·  aprovado em `<data>`
- T2 Editor de fluxo: link `<pendente>`  ·  aprovado em `<data>`

Referências sugeridas: operação de entrega e roteirização (Onfleet, Routific, Uber Eats Manager),
editores de grafo/automação (n8n, Zapier, Typeform logic jumps, Figma FigJam). Tokens do ui kit de F6.

## Notas e decisões

- Mapa: o front nunca chama geocode/matriz/rota; a api faz via `ClienteMapas` e devolve coordenadas e
  trajetos. Decisão tomada por SSRF (SEC-070) e para trocar de provedor sem mexer no front.
- Libs de mapa e grafo: **candidatas** a avaliar em B1 de cada tela (mapa: MapLibre GL ou Leaflet por
  serem livres e compatíveis com tiles gratuitos; grafo: React Flow); a escolha final e a versão fixa
  são registradas aqui pelo executor com a justificativa (licença, bundle, acessibilidade).
- Edição do fluxo no mobile: decisão de produto, somente leitura/simplificada; edição completa no
  desktop.
- Travou ou dúvida de UX/arquitetura: escalar a especialista Opus ou pesquisar na web e registrar aqui.
