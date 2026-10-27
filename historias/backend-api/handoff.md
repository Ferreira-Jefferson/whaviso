# API-handoff conversas (handoff)

- **ID:** API-handoff  ·  **Área:** API  ·  **Onda:** 4
- **Modelo sugerido:** Sonnet  ·  **Status:** `A FAZER`
- **Reivindicado por:** (livre)

## Objetivo

Permitir que um **atendente humano assuma a conversa** que a IA estava conduzindo, responda ao cliente
pelo WhatsApp e depois **devolva** a conversa à IA (ou a encerre). Cobre também o estado "aguardando
atendente" (a IA pediu ajuda humana). Tudo ao vivo no painel via SSE.

"Pronto" observável: dois atendentes disputando a mesma conversa resultam em exatamente um
vencedor; enquanto a conversa está em `humano` o `atendente` (IA) não responde; a mensagem humana sai
pela outbox respeitando a janela de 24h; o painel recebe o evento em tempo real.

## Dependências

- `API-conversas`: tabelas e rotas-base de `conversas`/`mensagens` e o módulo que as possui.
- `F5` realtime-sse: publicação de eventos (`NOTIFY`) para atualizar o painel e o kanban de conversas.
- (herdadas) `F4`, `F3` escopo de loja.

## Contratos e tabelas que toca

- **Dono de escrita (nesta sub-fatia):** colunas de handoff de `conversas`: `status`,
  `atendido_por_membro_id`, `humano_desde`. Para não haver dois módulos escrevendo a mesma tabela, o
  handoff é uma **sub-fatia dentro do módulo `conversas`** (`modules/conversas/handoff/`), com seu
  próprio plugin de rotas registrado pelo mesmo registry, sem import cruzado de módulo.
- **Escreve também:** `mensagens` (`INSERT` com `autor = 'humano'`, `direcao = 'saida'`), `envios`
  (`INSERT`, outbox para o `zap`), `eventos` (`conversa.handoff_assumido|devolvido|encerrado`, sem PII).
- **Lê:** `conversas`, `membros` (nome/papel para exibir quem assumiu), `numeros_whatsapp` (`status`,
  para recusar envio com número pausado), `clientes` (só id; telefone nunca sai).
- **Estados e transições (`status_conversa`):**
  - `ia -> humano` (assumir; `atendido_por_membro_id` preenchido).
  - `humano` com `atendido_por_membro_id` **nulo** = aguardando atendente (pedido pela IA); `assumir`
    preenche.
  - `humano -> ia` (devolver; limpa `atendido_por_membro_id`).
  - `ia|humano -> encerrada` (encerrar; terminal).
- **Contratos Zod:** `HandoffAssumir`, `HandoffDevolver`, `MensagemHumanaEnviar` (`texto` até 4096),
  `ConversaHandoffDTO`, eventos SSE `conversa.atualizada` e `mensagem.nova`.
- **Rotas:** `POST /conversas/:id/assumir`, `POST /conversas/:id/devolver`,
  `POST /conversas/:id/encerrar`, `POST /conversas/:id/mensagens`.

## Arquivos (escopo de edição)

- `backend/apps/api/src/modules/conversas/handoff/**` (rotas, serviço, SQL, testes)
- `backend/packages/shared/src/contracts/handoff.ts`
- `backend/apps/api/src/routes.ts` (1 linha para o plugin de handoff)
- `backend/apps/api/test/security/handoff.*.test.ts`

## Etapas

- [ ] 1. Alinhar com `API-conversas` (já `CONCLUIDO`): confirmar que o módulo expõe só leitura/criação
  básica e que `handoff/` é a única escritora de `status`/`atendido_por_membro_id`; registrar a
  fronteira no `MODULE.md` de `conversas`  (commit: `docs(conversas): fronteira da sub-fatia de handoff`)
- [ ] 2. Contratos Zod + `gen_contracts`  (commit: `feat(contracts): contratos de handoff`)
- [ ] 3. Máquina de transições pura `transicoes.ts` (tabela explícita; transição inválida = erro de
  domínio `409`) e testes de unidade  (commit: `feat(handoff): maquina de estados da conversa`)
- [ ] 4. `assumir` atômico: `UPDATE conversas SET status='humano', atendido_por_membro_id=$m,
  humano_desde=now() WHERE id=$c AND loja_id = ANY($lojas) AND (status='ia' OR (status='humano' AND
  atendido_por_membro_id IS NULL)) RETURNING ...`; zero linhas = reconsulta e responde 409 com quem já
  assumiu (sem vazar dado além do nome). Sem lock longo  (commit: `feat(handoff): assumir conversa de forma atomica`)
- [ ] 5. `devolver` e `encerrar`: só quem assumiu **ou** papel `dono|gerente` pode devolver; `atendente`
  comum não devolve conversa de outro  (commit: `feat(handoff): devolver e encerrar conversa`)
- [ ] 6. Envio humano `POST /conversas/:id/mensagens`: exige `status = humano` e
  `atendido_por_membro_id = membro atual`; verifica **janela de 24h** por `ultima_entrada_em`
  (fora da janela: `409 janela_expirada`, sem enviar; template de reabertura é evolução); na mesma
  transação `INSERT mensagens` (autor `humano`) + `INSERT envios` (`numero_whatsapp_id` da conversa,
  `payload` de texto, `conversa_id`)  (commit: `feat(handoff): resposta humana via outbox`)
- [ ] 7. Publicar eventos SSE (`conversa.atualizada`, `mensagem.nova`) pelo helper de F5 após o
  commit da transação; o payload leva ids e status, nunca o texto do cliente  (commit: `feat(handoff): eventos em tempo real`)
- [ ] 8. `eventos` de auditoria de cada transição (membro, conversa, de/para; sem PII)
  (commit: `feat(handoff): auditoria de transicoes`)
- [ ] 9. Contrato com o `atendente`: documentar no `MODULE.md` e abrir nota em `AT-motor-min` para que o
  motor **releia `conversas.status` a cada turno** e só responda se `ia`; teste de integração
  simula a corrida (assumir durante processamento de uma mensagem)  (commit: `test(handoff): contrato com o motor de atendimento`)
- [ ] 10. Testes de integração e registro em `routes.ts`  (commit: `test(handoff): integracao e registro`)
- [ ] Testes passando; lint, typecheck, test

## Testes e segurança exigidos

- **SEC-001/002**: atendente de outra loja não assume nem envia; `loja_id` forjado ignorado; id de
  conversa de outra loja retorna 404.
- **SEC-003**: operador da plataforma não acessa estas rotas (conteúdo de conversa).
- **SEC-061**: o texto humano sai como dado pela outbox; nenhuma ação automática decorre dele.
- **SEC-051/031**: o envio só enfileira em `envios` (zap drena); a api não chama a Meta diretamente.
- **SEC-081/101**: Zod limita `texto` (1..4096); rate limit por membro no envio humano contra flood.
- Concorrência: duas requisições `assumir` simultâneas, uma vence e a outra recebe 409; `devolver`
  concorrente com mensagem humana não envia fora de estado.
- Unidade: tabela de transições completa, janela de 24h na borda (23:59:59 e 24:00:01).

## Notas e decisões

- **Sub-fatia de `conversas`, não módulo novo**, para manter dono único de escrita da tabela e evitar
  que dois módulos disputem `conversas`. Ela registra suas rotas por plugin próprio, sem importar nada de
  `conversas/` além de contratos do kernel.
- **Sem auto-devolução por timeout na v1.** Decisão: conversa em `humano` parada fica sinalizada
  (idade em `humano_desde`) no painel; devolver é ação explícita. Timeout automático exigiria um agendador
  (fora do escopo da api) e merece história própria.
- **Fora da janela de 24h:** a v1 bloqueia e avisa o atendente; envio de template de reabertura depende
  do catálogo de templates aprovados na Meta.
- **Pedido da IA por humano:** o `atendente` escreve `status = humano` com `atendido_por_membro_id` nulo
  (já permitido pelo grant dele em `conversas`); este módulo apenas trata o "aguardando".
- **Notificação de nova conversa aguardando** (push/som) é do front; aqui só o evento SSE.
