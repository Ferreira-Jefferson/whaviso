# FR-entrega telas de entrega

- **ID:** FR-entrega  ·  **Área:** FR  ·  **Onda:** 3
- **Modelo sugerido:** Sonnet  ·  **Status:** `A FAZER`
- **Reivindicado por:** (preencher ao começar; um rótulo por tela)

## Objetivo

Entregar as telas da operação de entrega da loja: **zonas de entrega, motoboys, fechamento do dia e
despacho manual**. "Pronto" observável: o dono define bairros/zonas com taxa do cliente e valor do
motoboy, cadastra entregadores, atribui motoboy ao pedido e monta corridas manualmente, e fecha o dia
com soma automática mais lançamentos manuais, marcando como pago.

**Regra central (inegociável):** a PRIMEIRA etapa de cada tela é um **artifact visual** (desktop +
mobile, bonito e organizado, inspirado em referências de design de produto), aprovado antes de qualquer
código; só então transpor para React, fiel ao artifact, sem degradar. Ver
[../README.md](../README.md), "Front-end: design primeiro, código depois".

## Dependências

- `F6` front-shell (todas as telas).
- `FR-nucleo` (recomendado, não bloqueante de artifact): o despacho manual consome o cartão/detalhe de
  pedido; como módulo não importa módulo, o despacho tem a **própria** visão de pedido (DTO do
  contrato), sem importar `modules/pedidos`. Se o ui kit precisar de componente comum extra, criar no
  `shared` em commit separado.
- Por tela (código só com a API concluída; artifact pode adiantar):
  - Zonas: `API-zonas`.
  - Motoboys: `API-motoboys`.
  - Fechamento: `API-motoboys` (módulo "motoboys + fechamento").
  - Despacho manual: `API-despacho` (que depende de `API-pedidos`, `API-motoboys`, `API-zonas`).
  - `API-pagamentos` não bloqueia estas telas (aparece só como situação de pagamento no detalhe).

## Contratos e tabelas que toca

O front não toca tabela. Consome `frontend/src/shared/contracts/_generated/` (nunca editar à mão;
conferir os nomes finais gerados por F1 antes de codar):
- Zonas: zona_entrega (nome/bairro/polígono conforme contrato, taxa_cliente_centavos,
  valor_motoboy_centavos, ativa).
- Motoboys: motoboy (nome, veículo, placa, chave Pix mascarada, ativo).
- Fechamento: fechamento (dia, por motoboy, total automático, total lançado, status pago),
  motoboy_lancamento (valor, motivo, autor; trilha append-only, portanto o front só **adiciona**
  lançamento, nunca edita nem apaga).
- Despacho: pedido (visão de despacho), atribuição de motoboy, corrida (lote manual: 1 motoboy, N
  pedidos, ordem de parada).

## Arquivos (escopo de edição)

- `frontend/src/modules/zonas_entrega/**`
- `frontend/src/modules/motoboys/**` (inclui a subárea de fechamento, a menos que a tela de
  fechamento ganhe pasta própria: decisão abaixo)
- `frontend/src/modules/fechamento/**`
- `frontend/src/modules/despacho/**` (parte manual; o mapa fica em FR-avancado, sobre o mesmo módulo,
  e **só depois** deste arquivo concluir)
- Rotas: 1 linha por módulo no registry do shell.
- Sem HTML de artifact dentro de `frontend/src`.

## Convenções comuns (valem para todas as telas deste arquivo)

- TanStack Query com chaves por `lojaId`; `loja_id` nunca no payload escolhido pela tela.
- Dinheiro em centavos no estado, formatação só na borda; datas de negócio em America/Sao_Paulo (o dia
  do fechamento é o dia de negócio devolvido pela api, nunca derivado do relógio do navegador).
- Estados: carregando (skeleton), vazio (com ação), erro (envelope da api), sem permissão.
- Acessibilidade AA, teclado, alvo de toque >= 44px no mobile.
- Chave Pix do motoboy e placa tratados como dado sensível: mascarar na lista, nunca em log/URL/storage.
- Sem travessão em texto de UI/código/commit; sem menção a IA; copy neutra de gênero.

## Padrão de etapas por tela (1 linha = 1 commit atômico)

**A (artifact) -> B (transpor) -> C (testes)**; prefixo `T#` por tela. A1 cria o artifact (desktop >=1280
e mobile 390, estados vazio/erro/carregando, claro e escuro, 3 referências registradas); A2 aprova e
marca link/data; B só depois. Ao fim de B, comparar artifact x tela real (screenshots desktop e mobile)
e corrigir antes de seguir.

---

## T1 Zonas de entrega

Objetivo: configurar para onde a loja entrega e quanto cobra do cliente e paga ao motoboy por zona.

Etapas:
- [ ] T1-A1 Artifact desktop + mobile: lista de zonas com taxa do cliente e valor do motoboy lado a lado,
  margem da loja por zona em destaque, editor de zona (bairros e/ou polígono simples conforme o
  contrato), ativar/desativar
- [ ] T1-A2 Aprovação do artifact
- [ ] T1-B1 Rota `zonas_entrega` + tabela de zonas (leitura)  (commit: `feat(front/zonas): listagem`)
- [ ] T1-B2 Formulário de zona: nome, bairros, taxa e valor do motoboy (máscara em centavos), validação
  de que valor do motoboy não é negado pelo contrato  (commit: `feat(front/zonas): editor de zona`)
- [ ] T1-B3 Ativar/desativar com otimista e rollback; aviso de impacto ("pedidos em curso mantêm a taxa
  já gravada", conforme comportamento da api); estados e mobile  (commit: `feat(front/zonas): ativacao e estados`)
- [ ] T1-C1 Testes: máscara/validação de centavos, cálculo exibido da margem (apenas exibição de
  diferença entre dois valores vindos da api), rollback  (commit: `test(front/zonas): ...`)

Arquivos: `frontend/src/modules/zonas_entrega/**`. Contratos: zona_entrega. Depende de `API-zonas`.
Desenho de polígono em mapa é **fora** deste arquivo (decisão: nesta onda a zona é por bairro/lista;
polígono em mapa fica com FR-avancado se o contrato de `API-zonas` o suportar).

## T2 Motoboys (cadastro)

Objetivo: cadastrar e gerir entregadores com veículo, placa, Pix e status ativo.

Etapas:
- [ ] T2-A1 Artifact desktop + mobile: lista de cartões/tabela com status (ativo, inativo), ficha com
  veículo/placa/Pix mascarado, formulário de cadastro em passos curtos
- [ ] T2-A2 Aprovação do artifact
- [ ] T2-B1 Rota `motoboys` + lista  (commit: `feat(front/motoboys): listagem`)
- [ ] T2-B2 Formulário de cadastro/edição (nome, telefone, veículo, placa com máscara, Pix com validação
  por tipo de chave)  (commit: `feat(front/motoboys): cadastro e edicao`)
- [ ] T2-B3 Ativar/inativar (nunca excluir: registros de negócio mudam de estado), histórico resumido de
  entregas; estados e mobile  (commit: `feat(front/motoboys): status e estados`)
- [ ] T2-C1 Testes: máscaras e validações, Pix e telefone mascarados na lista, inativar em vez de
  excluir  (commit: `test(front/motoboys): ...`)

Arquivos: `frontend/src/modules/motoboys/**`. Contratos: motoboy. Depende de `API-motoboys`.

## T3 Fechamento do dia

Objetivo: ver, por motoboy, quanto receber no dia (soma automática das entregas), acrescentar
lançamentos manuais e marcar o dia como pago.

Etapas:
- [ ] T3-A1 Artifact desktop + mobile: seletor de dia, tabela por motoboy com total automático,
  lançamentos manuais (adicionar com motivo), total final, ação "marcar como pago" com confirmação,
  estado de dia já fechado (somente leitura), exportar/imprimir resumo
- [ ] T3-A2 Aprovação do artifact
- [ ] T3-B1 Rota `fechamento` + seletor de dia e tabela por motoboy (leitura)  (commit: `feat(front/fechamento): resumo do dia`)
- [ ] T3-B2 Detalhe por motoboy: entregas que compõem o total automático, cada uma com pedido e valor
  (commit: `feat(front/fechamento): detalhe por motoboy`)
- [ ] T3-B3 Lançamento manual (valor positivo ou negativo, motivo obrigatório); lista só de adição,
  **sem editar/apagar** (trilha append-only; correção = novo lançamento compensatório)
  (commit: `feat(front/fechamento): lancamento manual`)
- [ ] T3-B4 Marcar pago com diálogo de confirmação, bloqueio de edição após pago, estados e mobile,
  versão para impressão  (commit: `feat(front/fechamento): pagamento e impressao`)
- [ ] T3-C1 Testes: total exibido igual ao devolvido pela api (o front não recalcula regra), formulário
  de lançamento valida motivo, ausência de ação de editar/apagar, dia pago vira somente leitura
  (commit: `test(front/fechamento): ...`)

Arquivos: `frontend/src/modules/fechamento/**`. Contratos: fechamento, motoboy_lancamento. Depende de
`API-motoboys`. Decisão: pasta separada de `motoboys/` porque a tela tem ciclo de vida e rota próprios
(módulo não importa módulo, então não compartilham código por import).

## T4 Despacho manual

Objetivo: o operador atribui motoboy ao pedido e monta corridas à mão (um lote: 1 motoboy, N pedidos,
ordem de parada). Sem mapa nem sugestão automática (isso é FR-avancado).

Etapas:
- [ ] T4-A1 Artifact desktop + mobile: coluna "prontos para sair" e coluna de motoboys disponíveis;
  arrastar pedidos para uma corrida (desktop) ou selecionar e "criar corrida" (mobile), reordenar
  paradas, resumo da corrida (nº de pedidos, valor total ao motoboy), motoboy sem corrida em destaque
- [ ] T4-A2 Aprovação do artifact
- [ ] T4-B1 Rota `despacho` + lista de pedidos prontos e de motoboys ativos (leitura, realtime de
  entrada de pedido pronto via SSE)  (commit: `feat(front/despacho): painel de despacho`)
- [ ] T4-B2 Atribuir motoboy a um pedido (registra o nome no pedido para responsabilização), com
  rollback em erro  (commit: `feat(front/despacho): atribuicao simples`)
- [ ] T4-B3 Montar corrida manual: selecionar pedidos, escolher motoboy, ordem de parada reordenável
  (drag com fallback por botões)  (commit: `feat(front/despacho): corrida manual`)
- [ ] T4-B4 Desfazer/desmontar corrida antes da saída, fechar corrida (saiu), estados e mobile
  (commit: `feat(front/despacho): ciclo da corrida e estados`)
- [ ] T4-C1 Testes: reducer de reordenação, pedido já atribuído não aparece como disponível, conflito
  (outro operador atribuiu) tratado com refetch, regras de habilitação dos botões  (commit: `test(front/despacho): ...`)

Arquivos: `frontend/src/modules/despacho/**`. Contratos: pedido (visão despacho), corrida, atribuição.
Depende de `API-despacho`, `F5` para o tempo real.

---

## Divisão por tela (paralelismo)

T1, T2, T3 e T4 são módulos distintos e podem ser reivindicados em paralelo após `F6` e as respectivas
APIs. Ordem sugerida: T1 e T2 (base), depois T4, depois T3 (fechamento usa dados gerados pelas
entregas). Serializar apenas o que mexer em `shared/**` ou no registry de rotas.

## Testes e segurança exigidos

- Testes de componente/estado por tela (cada C1) + `npm run lint`, `typecheck`, `build` verdes.
- **SEC-025**: bundle sem `service_role`/segredo; nenhuma `VITE_*` carrega segredo (grep no `dist/`).
- **SEC-090**: sem script/estilo inline ou origem externa nova; compatível com a CSP e o CORS ao `APP_URL`.
- **SEC-001/SEC-002** (cliente): nenhum `loja_id` escolhido pela tela; troca de loja invalida o cache.
- Pix do motoboy e telefone: mascarados, fora de log/URL/storage.
- Trilha de lançamentos é append-only: a UI não oferece editar/apagar (SEC-033 espelhado na interface).

## Design (FR-*)

Um artifact por tela, desktop + mobile. Preencher ao aprovar:
- T1 Zonas: link `<pendente>`  ·  aprovado em `<data>`
- T2 Motoboys: link `<pendente>`  ·  aprovado em `<data>`
- T3 Fechamento: link `<pendente>`  ·  aprovado em `<data>`
- T4 Despacho manual: link `<pendente>`  ·  aprovado em `<data>`

Referências sugeridas: consoles de logística e entrega (DoorDash Merchant, Onfleet), painel financeiro
de repasse (Stripe Payouts), tabelas de cadastro com ficha (Linear, Notion). Tokens do ui kit de F6.

## Notas e decisões

- Despacho manual e mapa (FR-avancado) usam o **mesmo módulo** de front `despacho/`. Decisão: FR-avancado
  só começa depois de FR-entrega T4 `CONCLUIDO`, para não haver duas tarefas na mesma pasta.
- O front não recalcula valor de motoboy nem total do fechamento: exibe o que a api devolve.
- Correção de lançamento errado: novo lançamento compensatório, jamais edição (trilha append-only).
- Travou: escalar a especialista Opus ou pesquisar na web e registrar aqui.
