# motor_fluxo (AT-motor-min)

Motor **deterministico** do pedido: conduz a conversa por um grafo fixo de botoes e regras, **SEM
LLM**. Fecha o laco do pedido no backend: inbound enfileirado pelo zap -> pedido `novo` no kanban ->
resposta enfileirada em `envios`.

## Fronteira sagrada (HARNESS-ATENDENTE.md)

O node **ENTENDE e PROPOE** (`SaidaNode`: `proximo` + `mensagens` + `efeitos`, tudo dado); o **motor
EFETIVA**. Nenhuma acao (confirmar pedido, preco, taxa) acontece sem passar pela regra deterministica
do node no estado certo (SEC-061). Texto livre nunca e comando: "confirmar pedido" fora do estado
`confirmar` nao confirma. Ids de botao/lista sao entrada nao confiavel: so valem se foram
apresentados por este motor E revalidados contra a loja da conversa (SEC-002).

## Como e disparado

O scheduler do app chama `drenarInbound`/`processarProximaMensagem`. Cada turno roda numa transacao:

1. **claim** da proxima mensagem de entrada nao processada (`FOR UPDATE SKIP LOCKED`, como o dreno de
   `envios` do zap) + trava a conversa (`FOR UPDATE`): serializa o turno por conversa.
2. conversa em `humano` (handoff) ou `encerrada`: **nao responde**, so marca processada.
3. monta o contexto (loja/cliente/cardapio **vivo**/estado), roda o node de `estado.etapa`, aplica os
   efeitos (estado, criar_endereco, criar_pedido, cobranca_pix, handoff, encerrar), enfileira as
   respostas em `envios` (texto/interativo, janela de 24h) e registra as saidas, e marca a entrada processada.

## Pix na conversa (nó de pagamento = pix, grant 0058)

Quando o cliente escolhe **Pix** no pagamento, o motor efetiva a cobranca de forma DETERMINISTICA
(nunca o LLM; gerar um BR Code NAO e confirmar pagamento, SEC-061). Apos `criar_pedido` (precisa do
id/total/codigo), o efeito `cobranca_pix` (`pix.ts`) le a chave cifrada da PROPRIA loja
(`repo_leitura.lerPixLoja`, grant 0058 SELECT por coluna em `loja_pix`), DECIFRA em memoria com a
MESMA `MASTER_KEY` da api (kernel `@whaviso/shared/cifra`), monta o "copia e cola" com a MESMA funcao
pura da api (`@whaviso/shared/pix.gerarPayloadPixCopiaCola`) e enfileira o texto. A chave em claro vive
so dentro de `montarCobrancaPix`, o tempo minimo: NUNCA e logada, devolvida nem persistida (SEC-024).
Integracao so pelo banco: o motor nunca importa o modulo `pagamentos` da api, e o atendente NAO cria
nem concilia linha em `pagamentos` (a conciliacao e manual, na api). `DepsMotor.pixDecifra` e injetado
pelo app-root a partir de `MASTER_KEY`; **degradacao elegante** sem lancar: loja sem chave, decifra
indisponivel ou valor invalido viram um aviso ao cliente (pagar na entrega ou falar com atendente).

## Texto livre pelo harness (texto_livre.ts)

Os nodes sao deterministicos. So o TEXTO LIVRE de `pedir_categoria` e `montar_pedido` (flag `usaLlm`,
lista `NODES_COM_LLM` validada no boot), fora de menu/numero/sub-passo/coleta de opcoes, passa antes
pelo `rodarTurno` do harness (`DepsMotor.llm`, injetado pelo app-root). O harness propoe; o motor
efetiva: `resposta` enfileira as mensagens, `escalar_humano` vira `status='humano'` + handoff,
`rascunho_pedido` e validado contra o cardapio vivo (`montarLinha`) e vira carrinho em `confirmar`
(confirmacao so por botao); `silencio` so consome a mensagem; `sem_llm`, erro ou rascunho invalido
seguem pelo node (botoes). Rascunho com `observacao` nao e aplicado (carrinho nao tem o campo).

## Grafo (grafo.ts, dados) e fonte publicada (fluxo_fonte.ts)

`saudacao -> pedir_categoria -> montar_pedido -> confirmar -> endereco -> pagamento -> acompanhar`.
Lacos cobrem "adicionar mais", reapresentacao e sub-passos de texto. O estado do fluxo vive em
`conversas.contexto` (jsonb), unica fonte.

O **builder visual** (API-fluxo, onda 5) personaliza o fluxo por loja. O motor le a versao **publicada**
do fluxo ativo direto do banco (`fluxos`/`fluxo_versoes`, grant SELECT de `whaviso_atendente`, migration
0049), read-only, sem importar o modulo `fluxo` da api (integracao so pelo banco). Sem fluxo publicado,
cai no `FLUXO_PADRAO` do kernel (o mesmo grafo fixo): loja que nunca editou segue intacta.

- **Fixacao por conversa:** no primeiro turno a conversa fixa a versao vigente em
  `estado.fluxo_versao_id` (uuid de uma versao publicada ou `padrao`). Versao publicada e imutavel, entao
  a conversa termina na versao em que comecou; uma nova publicacao so vale em conversa nova. Cache do
  grafo parseado por id de versao (invalida sozinho: id novo => chave nova).
- **O que a publicacao DIRIGE hoje (P1):** a config do node da etapa atual e passada ao `executar`
  (casada por `tipo`); a saudacao usa `config.mensagem` para personalizar o texto de boas-vindas. Sem
  config, vale o default do node.
- **Limite conhecido (P1):** a TOPOLOGIA (reordenar/religar arestas por handle) ainda nao e dirigida pelo
  grafo publicado: os nodes fixam a proxima etapa no proprio efeito de estado. Dirigir topologia arbitraria
  exige os nodes emitirem HANDLES do catalogo (evolucao do NodeContract no kernel), fora do escopo desta
  lane. Config de nodes alem de saudacao (max_tentativas, pagamento.metodos, ...) segue o mesmo cano quando
  cada node passar a ler sua config.

## Loja pausada (G7, migration 0053)

Com a loja pausada agora (`pausada` e sem prazo ou prazo no futuro), a trilha de aceite
(`saudacao`..`pagamento`) NAO cria nem avanca pedido: o motor informa o cliente (linguagem neutra) e
consome a mensagem, mantendo a etapa. So `acompanhar` (status de um pedido ja feito, leitura pura) segue
respondendo. A pausa e lida no contexto do turno pelo relogio injetavel (nao por `now()`).

### montar_pedido (coleta de opcoes)

Por item, monta a fila de grupos independentes (sem `aplica_a_opcao_id`): obrigatorios exigem o
minimo, opcionais podem ser pulados ("0"). Respeita `min_escolhas`/`max_escolhas` por grupo
(acumula ate o maximo; grupo de escolha unica avanca sozinho). Ao escolher uma opcao, injeta os
grupos que dependem dela (`aplica_a_opcao_id`, ex.: adicional so no tamanho grande). A linha so
fecha quando a fila esvazia, e e revalidada por `montarLinha` antes de entrar no carrinho.

### endereco (bairro e area)

"Ultimo endereco" reusa o endereco do cliente, mas aplica o gate de area: se a loja tem zonas e o
bairro do ultimo endereco nao esta entre elas, e **fora da area** (resposta fixa de recusa) e
oferece informar outro. "Informar outro" cadastra um endereco novo: escolhe o BAIRRO numa lista de
zonas ativas (isso resolve a zona/taxa e restringe a area) e depois informa a rua; sem zonas
configuradas, informa por texto (taxa 0, sem restricao). A taxa e calculada no motor pela zona do
bairro na criacao do pedido.

## Robustez (anti-poison)

A criacao do pedido e a prova de falha: linha que nao reprecifica contra o cardapio vivo (item
sumiu/opcao invalida) NAO cria pedido divergente e NUNCA sobe erro para abortar a transacao do
turno (senao a mensagem nunca recebe `processada_em` e trava a fila global). Degradacao elegante:
retira as linhas invalidas, avisa o cliente e volta a confirmar (ou a escolher, se o carrinho
esvaziou). Alem disso, um SAVEPOINT por turno garante que qualquer erro inesperado ainda consome a
mensagem e passa a conversa para humano, sem deixar o cliente sem resposta.

## Limitacoes conhecidas do motor-min (aceitas)

- Apos o 1o pedido a conversa fica em `acompanhar` (nao ha 2o pedido na mesma conversa sem passar
  por handoff/encerrar); aceitavel no motor-min.
- `sugerivel` (cross-sell de item, "quer adicionar?") a nivel de ITEM nao e implementado; os grupos
  opcionais do item ja sao oferecidos. Entra numa onda posterior.
- Area fora de zona: o ultimo endereco com bairro NULO (desconhecido) nao e bloqueado (taxa 0); so
  bairro conhecido fora das zonas e recusado.

## Tabelas

- **Le** (vivo, nunca cache): `lojas`, `clientes`, `enderecos`, `categorias`, `itens`, `grupos_opcoes`,
  `opcoes`, `categoria_grupos`, `item_grupos`, `zonas_entrega`, `conversas`, `mensagens`, `pedidos`,
  `loja_pix` (so as colunas minimas do BR Code, grant 0058; a cifra e decifrada em memoria, nunca logada).
- **Escreve** (grant whaviso_atendente): `mensagens` (saida + `processada_em`), `conversas` (contexto
  e status), `enderecos`, `pedidos`/`itens_pedido`/`itens_pedido_opcoes`, `envios` (enfileira),
  `eventos` (append-only, sem PII). Preco e taxa calculados no servidor, centavos.

## Regras

- Dinheiro em centavos; datas de negocio em America/Sao_Paulo.
- Dados so via `@whaviso/shared/db` (SEC-080). Nunca logar telefone/conteudo (SEC-024).
- Nodes nao se importam entre si; o compartilhado e funcao/dado puro (`comum`, `ids`, `acoes`).
- Criar pedido e idempotente por conversa (guarda `estado.pedido_id`); respostas deduplicam por
  `dedupe_chave = <mensagem_id>:<indice>`.
