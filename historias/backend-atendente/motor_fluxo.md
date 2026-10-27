# AT-motor-min motor_fluxo (hardcoded)

- **ID:** AT-motor-min  ·  **Área:** AT  ·  **Onda:** 1
- **Modelo sugerido:** Opus  ·  **Status:** `A FAZER`
- **Reivindicado por:** (ninguem)

## Objetivo

Novo app `apps/atendente`: o worker que consome o inbound enfileirado pelo zap e conduz o pedido por um
**grafo fixo, hardcoded, de botões e regras, sem LLM**: saudação, escolha de categoria, escolha de item e
opções (tamanho, adicionais), carrinho, confirmação, endereço (repetir último ou novo), forma de pagamento,
confirmação final e acompanhamento. Cada passo é um node que implementa o `NodeContract` reservado no
kernel, num registry, de modo que o builder visual (API-fluxo, onda 5) venha depois **sem refazer o motor**.
"Pronto" observável: uma conversa real de ponta a ponta (inbound -> pedido `novo` no kanban -> resposta
enfileirada em `envios`) funciona só com botões e listas.

## Dependências

- `API-pedidos`: dono do modelo de `pedidos`/`itens_pedido` (snapshot) e da máquina de status; o motor
  cria o pedido em `rascunho` e o confirma por contrato, sem reimplementar regra.
- `API-cardapio`: modelo de categorias, itens, grupos de opções e disponibilidade (leitura, sempre ao vivo).
- `API-conversas`: modelo de `conversas`/`mensagens`, janela 24h e handoff (o motor respeita `humano`).
- `ZAP-enviar`: o motor responde enfileirando em `envios`; quem entrega é o zap.

## Contratos e tabelas que toca

- **Papel de banco:** `whaviso_atendente` (privilégio mínimo; SEC-032).
- **Lê** (read-model, sempre ao vivo, nunca cache): `categorias`, `itens`, `grupos_opcoes`, `opcoes`,
  `categoria_grupos`, `item_grupos`, `zonas_entrega`, `clientes`, `enderecos`, `lojas` (horários/área),
  `loja_pix`.
- **Escreve:** `mensagens` (saída e marca de entrada processada), `conversas` (estado do fluxo),
  `pedidos` e `itens_pedido`/`itens_pedido_opcoes` (rascunho e confirmação), `envios` (enfileira respostas),
  `eventos` (sem PII).
- Contratos do kernel: `NodeContract` (entrada: contexto da conversa + evento do usuário; saída: ações
  declarativas + próximo node), eventos de conversa. **Reservado** nesta onda, só com as implementações
  fixas.
- Não toca billing, plataforma, credencial Meta (SEC-032) nem `credenciais_llm` (isso é do `llm_client`).

## Arquivos (escopo de edição)

- `backend/apps/atendente/**` (novo app: `package.json`, `src/server.ts`, `src/routes.ts`, worker)
- `backend/apps/atendente/src/modules/motor_fluxo/**`
- `backend/apps/atendente/src/nodes/<tipo>/**` (saudacao, pedir_categoria, montar_pedido, confirmar,
  endereco, pagamento, acompanhar)
- `backend/apps/atendente/test/**`
- `backend/packages/shared/...` **somente** o `NodeContract` se F1 ainda não o tiver exportado (combinar)

## Etapas

- [ ] Scaffold do app `atendente` pelo `scaffold_module.sh`/convenções do monorepo, com AGENTS.md próprio,
      config e logger com redaction, fronteira `shared/db`  (commit: `chore(atendente): scaffold do app`)
- [ ] Consumidor do inbound: claim `FOR UPDATE SKIP LOCKED` de `mensagens` de entrada pendentes (por
      conversa, serializando: **uma mensagem por vez por conversa**), com `LISTEN` como acelerador e
      polling como piso  (commit: `feat(atendente): consumidor de inbound com claim`)
- [ ] Carregar o contexto da conversa: loja, cliente, estado do fluxo (persistido em `conversas`),
      carrinho em andamento; recusar processar se a conversa está em `humano` ou `encerrada`  (commit: `feat(atendente): contexto da conversa`)
- [ ] Reservar `NodeContract` e o **registry de nodes** (tipo -> implementação) com validação do contrato
      na carga; nodes são slices que não se importam entre si  (commit: `feat(atendente): registry de nodes e contrato`)
- [ ] Node `saudacao`: boas-vindas com branding da loja, checagem de horário de funcionamento e de área;
      fora do horário, resposta fixa e encerra  (commit: `feat(atendente): node saudacao`)
- [ ] Node `pedir_categoria`: lista de categorias **ativas e programadas para agora** (regra de dia/horário
      da categoria) como mensagem de lista  (commit: `feat(atendente): node pedir_categoria`)
- [ ] Node `montar_pedido`: escolha de item (lista paginada), seções obrigatórias/opcionais por herança
      categoria -> item com exceção `item_grupos`, limite por grupo, addon dependente de tamanho, `sugerivel`
      ("quer adicionar?"); respeita `ativo` e `esgotado_ate`; preço calculado no servidor em centavos  (commit: `feat(atendente): node montar_pedido`)
- [ ] Node `confirmar` (carrinho): resumo com snapshot de nome/preço e botões confirmar/editar/cancelar  (commit: `feat(atendente): node confirmar carrinho`)
- [ ] Node `endereco`: repetir último endereço (botão) ou informar novo; resolve a `zona_entrega` e a taxa;
      fora da área, resposta fixa  (commit: `feat(atendente): node endereco`)
- [ ] Node `pagamento`: forma de pagamento por botões (Pix, dinheiro, cartão na entrega); a geração do
      BR Code é do módulo `pagamentos` (onda 3): aqui, só o ponto de extensão e o estado  (commit: `feat(atendente): node pagamento`)
- [ ] Persistência do pedido: cria `rascunho` ao iniciar o carrinho, grava itens com **snapshot**, e na
      confirmação final transiciona para `novo` (aparece no kanban) numa transação; idempotente por
      conversa  (commit: `feat(atendente): persistencia do pedido`)
- [ ] Node `acompanhar`: responde "cadê meu pedido" lendo o status real do pedido (sempre ao vivo)  (commit: `feat(atendente): node acompanhar`)
- [ ] Enfileirar respostas em `envios` (texto/interativo) com `numero_whatsapp_id` e `conversa_id` da
      conversa; respeitar janela 24h (dentro da janela, texto livre)  (commit: `feat(atendente): resposta via outbox`)
- [ ] Tratamento de entrada fora do esperado: texto livre quando se espera botão reapresenta a pergunta e,
      após N falhas, oferece falar com humano (muda a conversa para `humano` via contrato de conversas, não
      por escrita cruzada)  (commit: `feat(atendente): fallback e handoff`)
- [ ] Grafo hardcoded versionado: arquivo único declarando os nodes e transições (dados, não lógica
      espalhada), base do futuro builder  (commit: `feat(atendente): grafo fixo do pedido`)
- [ ] Testes de unidade e de ponta a ponta (ver abaixo)  (commit: `test(atendente): motor_fluxo`)
- [ ] Revisão (Opus) contra SEGURANCA.md (SEC-061)

## Testes e segurança exigidos

- Unidade por node: transições, validação de entrada, cálculo de preço (herança + exceção + addon
  dependente), `esgotado_ate` expirado volta a vender, categoria fora de horário não aparece.
- Ponta a ponta em `whaviso_dev` com `ClienteWhats` falso: inbound -> pedido `novo` + resposta em `envios`;
  a mesma mensagem processada duas vezes (reentrega) não duplica pedido nem resposta.
- Concorrência: duas mensagens da mesma conversa não são processadas em paralelo.
- **SEC-061**: neste módulo **não há LLM**, mas o contrato fica fixado: nenhuma ação (confirmar pedido,
  preço, Pix) acontece sem passar pelas regras determinísticas do node; o motor nunca confia em texto
  livre como comando. Teste: texto "confirmar pedido" fora do estado `confirmar` não confirma.
- **SEC-001/002**: toda leitura e escrita filtra pela `loja_id` da conversa; item de outra loja não é
  aceito mesmo se o id for forjado em payload de botão.
- **SEC-032**: o role `whaviso_atendente` não consegue tocar billing/plataforma/credencial Meta.
- **SEC-024**: telefone e corpo de mensagem fora dos logs.

## Notas e decisões

- Decisão: o grafo é **dados + nodes pequenos**, não um monólito de `if`. O que o builder (onda 5) trocará
  é a fonte do grafo (de arquivo para banco), não o motor.
- Decisão: **preço e disponibilidade nunca vêm de cache**: lidos do banco a cada decisão.
- Decisão: ids em botões/listas carregam referência opaca e são **revalidados** contra a loja da conversa
  (o id do botão é entrada não confiável).
- Decisão: o ponto de extensão para LLM (`entender_mensagem`) entra como um node/pré-passo opcional na onda
  2, sem alterar o grafo fixo; sem credencial de LLM da loja, o fluxo segue 100% por botões.
- Pendência a registrar: o estado de processamento de `mensagens` (claim do inbound) deve existir no schema;
  confirmar com `ZAP-webhook` e o dono do schema antes de implementar o consumidor.
