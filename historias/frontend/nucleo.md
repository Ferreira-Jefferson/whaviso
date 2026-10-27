# FR-nucleo telas do núcleo

- **ID:** FR-nucleo  ·  **Área:** FR  ·  **Onda:** 1
- **Modelo sugerido:** Sonnet  ·  **Status:** `A FAZER`
- **Reivindicado por:** (preencher ao começar; um rótulo por tela, ver "Divisão por tela")

## Objetivo

Entregar as telas do painel da loja que fecham o loop do pedido: **lojas, números WhatsApp, cardápio,
pedidos (kanban ao vivo), clientes e conversas**. "Pronto" observável: o dono entra, escolhe a loja,
cadastra o cardápio, conecta o número, vê pedidos chegarem no kanban em tempo real (SSE), consulta
clientes e acompanha conversas, tudo só por REST + SSE da `api`, sem falar com o banco.

**Regra central (inegociável, vale para toda tela abaixo):** a PRIMEIRA etapa de cada tela é criar um
**artifact visual** (desktop + mobile, bonito e organizado, inspirado em referências de design de
produto), aprovar com o dono, e **só então** transpor para React, fiel ao artifact, sem degradar. Nenhuma
etapa de código começa antes do artifact da sua tela estar `aprovado`. Ver
[../README.md](../README.md), seção "Front-end: design primeiro, código depois".

## Dependências

- `F6` front-shell: SPA shell, `api_client`, auth (login), `_generated`, ui kit, tenant/branding,
  realtime client. Bloqueia todas as telas.
- Por tela (a tela só começa o **código** quando a API correspondente estiver `CONCLUIDO`; o artifact
  pode começar antes, pois não depende de API):
  - Lojas: `API-lojas` (e `API-conta` para seletor de loja e membros).
  - Números: `API-numeros`.
  - Cardápio: `API-cardapio`.
  - Pedidos: `API-pedidos` (+ `F5` realtime-sse no servidor; `API-cardapio`, `API-clientes` indiretos).
  - Clientes: `API-clientes`.
  - Conversas: `API-conversas` (+ `F5`). O handoff humano é `API-handoff` (onda 4): a tela nasce
    **somente leitura + resposta pelo fluxo existente**, e o botão "assumir" fica atrás de feature flag
    até `API-handoff` concluir (decisão registrada em Notas).

## Contratos e tabelas que toca

O front **não toca tabela** (API é a única porta). Consome apenas DTOs gerados em
`frontend/src/shared/contracts/_generated/` (F1 `gen_contracts`; commitado, **nunca editar à mão**). Por
tela, os grupos de contrato que ela importa (nomes finais definidos por F1; conferir o gerado antes de
codar, não inventar tipo local):
- Lojas: loja (perfil, branding, horários, área), membros/papéis da conta.
- Números: numero_whatsapp (status, `phone_number_id` mascarado, saúde); nunca token.
- Cardápio: categoria, item, grupo_opcoes, opcao, vínculos item_grupos (herança + exceção `incluir`).
- Pedidos: pedido, item_pedido (com snapshot), opções do item, enum `status_pedido`; evento SSE de pedido.
- Clientes: cliente (telefone mascarado), endereco.
- Conversas: conversa, mensagem, janela 24h (expira em), flag de handoff; evento SSE de mensagem.

## Arquivos (escopo de edição)

Módulo nunca importa módulo; só `shared/` (ui, api_client, auth, realtime, format, tenant).
- `frontend/src/modules/lojas/**`
- `frontend/src/modules/numeros/**`
- `frontend/src/modules/cardapio/**`
- `frontend/src/modules/pedidos/**`
- `frontend/src/modules/clientes/**`
- `frontend/src/modules/conversas/**`
- Rotas: 1 linha por módulo no registry de rotas do shell (arquivo declarado por F6; só essa linha).
- Artifacts: guardados fora do bundle (link no campo Design de cada tela). Nada de HTML de artifact em
  `frontend/src`.
- `frontend/src/shared/**` só para componente realmente comum **e combinado**; se uma tela precisar de
  algo novo no ui kit, abrir etapa dedicada de commit separado ("feat(ui): ...") em vez de espalhar.

## Convenções comuns a toda tela (não repetir em cada tela)

- Estado de servidor via TanStack Query; chaves de cache sempre com `lojaId` do tenant do shell. O
  `loja_id` **nunca** vai no corpo/URL escolhido pela tela: o escopo vem do token + tenant do shell
  (SEC-002 do lado do cliente: não montar payload com `loja_id` próprio).
- Dinheiro em centavos (int) no estado; formatar só na borda com `shared/format`. Datas de negócio em
  America/Sao_Paulo; o front só formata, nunca calcula etapa/agendamento.
- Todo estado coberto: carregando (skeleton), vazio (com ação), erro (envelope `{ error: { code, message } }`
  mapeado para mensagem humana), sem permissão (papel), offline/SSE caído.
- Acessibilidade: foco visível, rótulos, contraste AA, navegação por teclado; alvo de toque >= 44px no mobile.
- Sem telefone, Pix, token ou número de convite em `console.*`, mensagens de erro, URL ou analytics.
- Sem travessão em texto de UI, comentários e commits; sem menção a IA; copy neutra quanto a gênero.

## Padrão de etapas por tela (cada linha = 1 commit atômico)

Cada tela segue **A (artifact) -> B (transpor) -> C (testes)**. O prefixo `T#` identifica a tela.
- **A1 Artifact (obrigatório, sempre o primeiro):** construir o artifact visual **desktop (>=1280) e
  mobile (390)**, com os estados vazio/carregando/erro e a interação principal, em tema claro e escuro.
  Inspiração declarada (3 referências de produto, registradas no Design). Commit: não há (artifact é
  publicado; registrar o link no arquivo da tela, `docs(front): artifact da tela X`).
- **A2 Aprovação:** dono aprova o artifact (ou pede ajuste e refaz A1). Marcar link e data. **Gate:** B
  não começa antes.
- **B#:** transpor para React, em fatias (esqueleto + rota; leitura/lista; formulário/mutação;
  estados vazio/erro/skeleton; responsivo mobile; realtime quando houver), cada fatia fiel ao artifact.
- **Fidelidade:** ao fim de B, comparar lado a lado artifact x tela real (desktop e mobile via
  screenshot) e corrigir diferenças antes de seguir. "Sem degradar" é critério de pronto.
- **C#:** testes de componente/estado + a parte de segurança de front; lint + typecheck + build verdes.

---

## T1 Lojas (seletor de loja, perfil, branding, horários, área, membros)

Objetivo: o usuário troca de loja, edita perfil/branding/horários/área de atendimento e vê/gerencia
membros e papéis (dono, gerente, atendente) conforme permissão.

Etapas:
- [ ] T1-A1 Artifact desktop + mobile: seletor de loja no topo, página de perfil em abas (Perfil, Marca,
  Horários, Área, Equipe), preview do branding aplicado (logo, cor), grade semanal de horários  (artifact, sem commit de código)
- [ ] T1-A2 Aprovação do artifact (registrar link/data em Design)
- [ ] T1-B1 Rota `lojas` + esqueleto de layout das abas, integração com o seletor/tenant do shell
  (commit: `feat(front/lojas): esqueleto e rota`)
- [ ] T1-B2 Leitura do perfil e formulário de edição (react-hook-form + Zod do `_generated`), mutação
  com invalidação de cache  (commit: `feat(front/lojas): perfil editavel`)
- [ ] T1-B3 Branding: upload de logo (limite de tamanho/tipo validado no cliente e erro da api tratado),
  preview ao vivo  (commit: `feat(front/lojas): branding`)
- [ ] T1-B4 Horários (grade semanal, exceções/feriado conforme contrato) e área de atendimento
  (commit: `feat(front/lojas): horarios e area`)
- [ ] T1-B5 Equipe: lista de membros, convidar, trocar papel, remover; controles escondidos por papel
  (commit: `feat(front/lojas): equipe e papeis`)
- [ ] T1-B6 Estados vazio/erro/skeleton + responsivo mobile + comparação artifact x tela
  (commit: `feat(front/lojas): estados e responsivo`)
- [ ] T1-C1 Testes de componente (formulário valida, erro da api exibido, papel sem permissão não vê
  ações), estado (troca de loja invalida cache)  (commit: `test(front/lojas): ...`)

Arquivos: `frontend/src/modules/lojas/**`. Contratos: loja, membro, papel. Depende de `API-lojas`,
`API-conta`.

## T2 Números WhatsApp (cadastro e saúde do número)

Objetivo: conectar o número da loja (Embedded Signup da Meta), ver status/saúde, reconectar. Nunca exibe
nem trafega token.

Etapas:
- [ ] T2-A1 Artifact desktop + mobile: estado "sem número" (CTA forte), fluxo de conexão em passos,
  cartão de número com selo de saúde (conectado, atenção, desconectado), histórico de status
- [ ] T2-A2 Aprovação do artifact
- [ ] T2-B1 Rota `numeros` + lista/cartão de número  (commit: `feat(front/numeros): lista e status`)
- [ ] T2-B2 Fluxo de conexão: carregar o SDK do Embedded Signup da Meta **somente nesta tela** (carga
  sob demanda, host allowlisted na CSP), receber o `code`, enviar à `api`; o front não troca nem vê
  token  (commit: `feat(front/numeros): conexao embedded signup`)
- [ ] T2-B3 Estados de saúde e reconexão, vazio/erro/skeleton, mobile  (commit: `feat(front/numeros): saude e estados`)
- [ ] T2-C1 Testes: cartão por estado de saúde, falha da conexão mostra erro humano, resposta nunca é
  persistida em storage, nenhum token em props/DOM  (commit: `test(front/numeros): ...`)

Arquivos: `frontend/src/modules/numeros/**`. Contratos: numero_whatsapp. Depende de `API-numeros`.
Atenção SEC: **SEC-090**: o domínio do SDK da Meta precisa estar na CSP de `script-src`/`frame-src`;
registrar como pedido explícito ao dono do módulo de headers, não afrouxar a CSP globalmente.

## T3 Cardápio (categorias, itens, grupos de opções, herança + exceção)

Objetivo: gerir o cardápio completo. Grupos de opções reutilizáveis, herdados por categoria e com exceção
por item (`incluir`), preço em centavos, disponibilidade rápida (pausar item), ordenação por arrastar.

Etapas:
- [ ] T3-A1 Artifact desktop + mobile: árvore categorias/itens à esquerda, editor de item à direita,
  painel de grupos de opções, indicação visual de herança vs exceção, toggle de disponibilidade, busca
- [ ] T3-A2 Aprovação do artifact
- [ ] T3-B1 Rota `cardapio` + lista de categorias e itens (leitura)  (commit: `feat(front/cardapio): listagem`)
- [ ] T3-B2 CRUD de categoria e reordenação (drag com fallback por botões, acessível)  (commit: `feat(front/cardapio): categorias`)
- [ ] T3-B3 Editor de item: nome, descrição, preço (máscara em centavos), foto, disponibilidade
  (commit: `feat(front/cardapio): editor de item`)
- [ ] T3-B4 Grupos de opções e opções (min/max, obrigatório, preço adicional)  (commit: `feat(front/cardapio): grupos de opcoes`)
- [ ] T3-B5 Vínculos categoria-grupo e item-grupo com herança + exceção (`incluir`), com resumo
  "efetivo" de quais grupos o item realmente exibe  (commit: `feat(front/cardapio): heranca e excecao`)
- [ ] T3-B6 Pausar/retomar item com atualização otimista e rollback em erro; estados e mobile
  (commit: `feat(front/cardapio): disponibilidade e estados`)
- [ ] T3-C1 Testes: máscara de preço (centavos), cálculo do conjunto efetivo de grupos exibido, rollback
  otimista, validação min/max  (commit: `test(front/cardapio): ...`)

Arquivos: `frontend/src/modules/cardapio/**`. Contratos: categoria, item, grupo_opcoes, opcao,
item_grupos. Depende de `API-cardapio`. Fora desta tela: importar por foto/PDF (`API-cardapio-imp`, onda
2, tela própria em outro plano) e preços por região.

## T4 Pedidos (kanban ao vivo)

Objetivo: a tela mais crítica. Colunas por `status_pedido`, cartões que chegam e mudam de coluna em tempo
real via SSE, detalhe do pedido, mudança de status, impressão.

Etapas:
- [ ] T4-A1 Artifact desktop + mobile: kanban em colunas (desktop), lista por status em abas com
  swipe (mobile), cartão com número, cliente, itens resumidos, total, tempo no status (cor por atraso),
  painel de detalhe lateral/gaveta, som/indicador de novo pedido, estado de conexão ao vivo
- [ ] T4-A2 Aprovação do artifact
- [ ] T4-B1 Rota `pedidos` + carga inicial por status (leitura) e cartões estáticos  (commit: `feat(front/pedidos): kanban estatico`)
- [ ] T4-B2 Assinatura SSE via `shared/realtime`: aplicar eventos no cache (insere, move, atualiza),
  deduplicação por id/versão, reconexão com resync (refetch) ao reconectar, indicador "ao vivo/offline"
  (commit: `feat(front/pedidos): realtime`)
- [ ] T4-B3 Mudança de status por botão e por arrastar, apenas transições permitidas pelo contrato,
  atualização otimista com rollback  (commit: `feat(front/pedidos): transicao de status`)
- [ ] T4-B4 Detalhe do pedido (itens, opções com snapshot, endereço, pagamento, histórico de status)
  (commit: `feat(front/pedidos): detalhe`)
- [ ] T4-B5 Impressão do pedido (view dedicada com CSS de impressão, usa o recurso de impressão da api)
  (commit: `feat(front/pedidos): impressao`)
- [ ] T4-B6 Aviso sonoro/visual de pedido novo (opt-in, respeita política de autoplay), estados
  vazio/erro, mobile  (commit: `feat(front/pedidos): alerta e responsivo`)
- [ ] T4-C1 Testes: reducer de eventos SSE (ordem trocada, duplicado, evento de pedido desconhecido),
  transição inválida bloqueada, rollback, resync pós-reconexão  (commit: `test(front/pedidos): ...`)

Arquivos: `frontend/src/modules/pedidos/**`. Contratos: pedido, item_pedido, status_pedido, evento SSE.
Depende de `API-pedidos`, `F5`. O front não calcula etapa/valor: exibe o que a api manda.

## T5 Clientes

Objetivo: lista e ficha dos clientes da loja (busca, histórico de pedidos, endereços). Telefone sempre
mascarado na lista; revelar só sob ação explícita se a api permitir.

Etapas:
- [ ] T5-A1 Artifact desktop + mobile: tabela com busca e filtros, ficha do cliente (endereços, pedidos
  recentes, ticket médio), vazio
- [ ] T5-A2 Aprovação do artifact
- [ ] T5-B1 Rota `clientes` + tabela paginada com busca (debounce)  (commit: `feat(front/clientes): lista`)
- [ ] T5-B2 Ficha do cliente: dados, endereços, histórico  (commit: `feat(front/clientes): ficha`)
- [ ] T5-B3 Edição permitida pelo contrato (nome, observações, endereços), estados e mobile
  (commit: `feat(front/clientes): edicao e estados`)
- [ ] T5-C1 Testes: máscara de telefone, paginação/busca, nenhuma PII em log  (commit: `test(front/clientes): ...`)

Arquivos: `frontend/src/modules/clientes/**`. Contratos: cliente, endereco. Depende de `API-clientes`.

## T6 Conversas

Objetivo: caixa de entrada das conversas WhatsApp da loja, thread de mensagens ao vivo, indicador da
janela de 24h, marcação de handoff, vínculo com o pedido da conversa.

Etapas:
- [ ] T6-A1 Artifact desktop + mobile: lista de conversas (não lidas, status), thread estilo mensageiro
  com balões do cliente, bot e humano, banner da janela 24h (aberta/expirada), painel lateral do
  cliente e do pedido; no mobile, lista e thread em telas separadas
- [ ] T6-A2 Aprovação do artifact
- [ ] T6-B1 Rota `conversas` + lista com não lidas e busca  (commit: `feat(front/conversas): lista`)
- [ ] T6-B2 Thread com paginação reversa (carregar mais antigas) e mídia (imagem/áudio) por URL
  fornecida pela api  (commit: `feat(front/conversas): thread`)
- [ ] T6-B3 Realtime: novas mensagens e recibos via SSE, rolagem inteligente, indicador de ao vivo
  (commit: `feat(front/conversas): realtime`)
- [ ] T6-B4 Banner da janela 24h e bloqueio do envio fora dela (mensagem de template fica de fora desta
  fase)  (commit: `feat(front/conversas): janela 24h`)
- [ ] T6-B5 Handoff: botão assumir/devolver atrás de feature flag até `API-handoff` concluir; painel do
  cliente/pedido; estados e mobile  (commit: `feat(front/conversas): handoff e painel`)
- [ ] T6-C1 Testes: reducer de mensagens (ordem, duplicado por id), janela 24h calculada a partir do
  valor que a api manda (nunca do relógio local para decidir regra), flag de handoff, render de mídia
  segura  (commit: `test(front/conversas): ...`)

Arquivos: `frontend/src/modules/conversas/**`. Contratos: conversa, mensagem. Depende de
`API-conversas`, `F5` (e `API-handoff` só para habilitar a flag). Texto de mensagem do cliente é
**dado não confiável**: renderizar sempre como texto (sem `dangerouslySetInnerHTML`), links com
`rel="noopener noreferrer"`.

---

## Divisão por tela (paralelismo)

Após `F6`, T1..T6 são independentes entre si (módulo não importa módulo) e podem ser reivindicadas por
subagents distintos, cada uma no seu rótulo. O que **não** paraleliza: etapas que tocam `shared/**` ou o
registry de rotas (serializar). Ordem sugerida de valor: T4 (pedidos), T3 (cardápio), T1, T2, T6, T5.

## Testes e segurança exigidos

Testes de componente/estado por tela (listados em cada C1), mais:
- `npm run lint`, `npm run typecheck`, `npm run build` verdes em `frontend/` a cada commit.
- **SEC-025** (front): o build do front não contém `service_role` nem segredo; só a anon key esperada.
  Checar com grep no `dist/` ao fim de cada tela que adicione variável `VITE_*`. Nenhuma variável de
  segredo pode receber prefixo `VITE_`.
- **SEC-090** (front): nenhuma tela introduz script/estilo inline nem origem externa sem registrar a
  necessidade (compatível com a CSP e o CORS restrito ao `APP_URL`); T2 é a única com origem extra
  (SDK Meta), declarada.
- **SEC-001/SEC-002** (lado cliente): requests nunca carregam `loja_id` escolhido pela tela; ao trocar de
  loja o cache é invalidado por inteiro (sem mostrar dado da loja anterior).
- Nenhuma PII (telefone, endereço completo, Pix) em log, URL ou storage.
- Sem teste verde, a tela não está `CONCLUIDO`.

## Design (FR-*)

Um artifact por tela, desktop + mobile. Preencher ao concluir A2:
- T1 Lojas: link `<pendente>`  ·  aprovado em `<data>`
- T2 Números: link `<pendente>`  ·  aprovado em `<data>`
- T3 Cardápio: link `<pendente>`  ·  aprovado em `<data>`
- T4 Pedidos: link `<pendente>`  ·  aprovado em `<data>`
- T5 Clientes: link `<pendente>`  ·  aprovado em `<data>`
- T6 Conversas: link `<pendente>`  ·  aprovado em `<data>`

Referências de inspiração sugeridas (o artifact registra as realmente usadas): quadros kanban de
produto (Linear, Trello), painéis de operação de pedidos (Toast, iFood Gestor), caixa de entrada de
mensageria (Intercom, WhatsApp Web), editor de catálogo (Shopify admin). Tokens de design (cor,
tipografia, espaçamento) **vêm do ui kit de F6**; o artifact usa os mesmos tokens para a transposição ser
direta.

## Notas e decisões

- Handoff na T6: `API-handoff` é onda 4. Decisão: entregar a tela sem ação de assumir, com flag, em vez
  de bloquear FR-nucleo por uma dependência de onda posterior.
- Tela de importação de cardápio por foto/PDF e configuração de chave de LLM **não** estão neste
  arquivo (pertencem às ondas 2); este arquivo cobre só as seis telas do STATUS.
- Impressão no T4 usa CSS de impressão do navegador; integração com impressora térmica direta fica fora.
- Se o shell (F6) não oferecer um componente necessário (tabela, gaveta, drag), criar em commit
  separado no ui kit com aprovação, nunca copiar variantes dentro dos módulos.
- Travou ou dúvida de UX/arquitetura: escalar a um especialista Opus ou pesquisar na web e registrar a
  decisão aqui, em vez de insistir.
