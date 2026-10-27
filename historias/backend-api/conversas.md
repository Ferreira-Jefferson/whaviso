# API-conversas conversas

- **ID:** API-conversas  ·  **Área:** API  ·  **Onda:** 1
- **Modelo sugerido:** Sonnet  ·  **Status:** `A FAZER`
- **Reivindicado por:** (livre)

## Objetivo

Conversas e mensagens do WhatsApp no painel: lista de conversas da loja, histórico de mensagens,
**janela de 24h** da Meta calculada pelo servidor, envio de resposta pelo painel (enfileirada no outbox)
e **leitura ao vivo** por SSE (consome F5). O handoff humano completo (assumir/devolver, Onda 4) é o
`API-handoff`; aqui o módulo só **lê e exibe** o estado `status` da conversa e permite responder quando já
for `humano` ou encerrar. "Pronto" observável: mensagem que chega pelo `zap` aparece na tela sem
recarregar; a conversa mostra "janela aberta/fechada" e o tempo restante; responder dentro da janela grava
a mensagem e enfileira o envio; fora da janela a resposta de texto livre é recusada com orientação.

## Dependências

- `F4` api-core: registry, erros, config, logger, `shared/db`. Transitivas: `F0` (tabelas, grants), `F1`
  (contratos), `F3` (escopo).
- `F5` realtime-sse: canal SSE sobre `LISTEN/NOTIFY` (o módulo publica/consome eventos por loja; não
  reimplementa o transporte).
- Dependentes: `ZAP-webhook` (grava mensagens de entrada e `ultima_entrada_em` por grant próprio),
  `AT-motor-min`, `API-pagamentos`, `API-handoff`.

## Contratos e tabelas que toca

- **Dono de escrita pelo painel:** `conversas` (update de `status` para `encerrada` e de campos de
  atendimento; criação é do `zap`), `mensagens` (**só insert**; mensagem é registro imutável, sem
  UPDATE/DELETE), e `envios` (insert da resposta humana no outbox; dono do enfileiramento **desta**
  origem, o zap é quem drena e atualiza).
- **Lê por read-model:** `clientes` (nome e hash para exibir "cliente"; telefone **mascarado** só;
  nunca o decifrado aqui), `numeros_whatsapp` (colunas não sensíveis: `id`, `loja_id`, `status`),
  `pedidos` (existe pedido ligado à conversa, só `id`/`codigo`/`status`).
- **Janela de 24h (regra do servidor, função pura no kernel):**
  `janelaAbertaAte = ultima_entrada_em + 24h`; aberta se `agora < janelaAbertaAte`. Cliente nunca é
  fonte desse cálculo. Fora da janela só template aprovado (`envios.template_chave`) pode sair; texto livre
  é negado pela api.
- **Contratos Zod (F1):** `ConversaListaSaida` (cliente mascarado, `status`, última mensagem prévia
  truncada, `nao_lidas`, `janela_aberta_ate`, `janela_aberta`), `ConversaDetalheSaida`,
  `MensagemSaida`, `MensagemEnviarEntrada` (`texto`, tamanho máximo), `ConversaEncerrarEntrada`,
  `EventoConversaSse` (`tipo`, `conversa_id`, `loja_id`; **sem conteúdo de mensagem**, o cliente busca
  via REST).
- Evento SSE: `conversa.mensagem_nova`, `conversa.status_alterado`.
- Evento de auditoria (sem PII): `conversa.encerrada`, `conversa.resposta_enviada`.

## Arquivos (escopo de edição)

- `backend/apps/api/src/modules/conversas/**`
- `backend/apps/api/src/routes.ts` (1 linha, combinado)
- `backend/packages/shared/src/contracts/conversas*.ts`
- `backend/packages/shared/src/janela24h/**` (função pura, se ainda não existir)
- `backend/supabase/migrations/<proxima>_notify_conversas.sql` (trigger `NOTIFY`, ver Notas; só se F5 não
  entregar a função genérica)

## Etapas

- [ ] 1. Scaffold `conversas` + MODULE.md (dono de `mensagens`/status de `conversas`; leituras cruzadas
  de `clientes`, `numeros_whatsapp`, `pedidos`)  (commit: `chore(api-conversas): scaffold do modulo conversas`)
- [ ] 2. Função pura `janela24h(ultimaEntradaEm, agora)` no kernel com testes de borda (exatamente 24h,
  `ultima_entrada_em` NULL = fechada, relógio)  (commit: `feat(shared): calculo da janela de 24h`)
- [ ] 3. Contratos Zod do módulo + regenerar `_generated`  (commit: `feat(contracts): contratos de conversas e mensagens`)
- [ ] 4. Conferir com F5 se existe função/trigger genérica de `NOTIFY` por loja. Se não, migration com
  trigger em `mensagens` (insert) e `conversas` (update de `status`) chamando `pg_notify` num canal por
  tipo, payload só com `{loja_id, tipo, conversa_id}`; `validate_migrations.sh` + `check_rls_coverage.sh`
  (commit: `feat(db): notify de mensagens e conversas sem conteudo`)
- [ ] 5. Repo SQL parametrizado: listar conversas por loja (filtros `status`, busca por nome do
  cliente), paginação por cursor de `atualizado_em`; contar não lidas; detalhe; mensagens paginadas
  (commit: `feat(api-conversas): repositorio de conversas e mensagens`)
- [ ] 6. `GET /conversas` e `GET /conversas/:id` (inclui `janela_aberta`, `pedido_ligado`)
  (commit: `feat(api-conversas): listar e abrir conversas`)
- [ ] 7. `GET /conversas/:id/mensagens` (paginado, cronológico, histórico para trás); mídia devolvida só
  como referência (`midia_ref`), nunca binário  (commit: `feat(api-conversas): historico de mensagens`)
- [ ] 8. Controle de "não lidas": decisão registrada em Notas (cursor por membro vs coluna); implementar
  `POST /conversas/:id/lida` conforme a decisão  (commit: `feat(api-conversas): marcar conversa como lida`)
- [ ] 9. `POST /conversas/:id/mensagens` (dono, gerente, atendente): só quando `status = 'humano'` e
  janela aberta; insere `mensagens` (direcao `saida`, autor `humano`) e `envios` (texto livre,
  `destinatario_hash` do cliente, `conversa_id`, `numero_whatsapp_id`) **na mesma transação** (o outbox é
  a única via para sair); fora da janela devolve 409 `JANELA_FECHADA`; conversa `ia` devolve 409
  `CONVERSA_COM_IA` (assumir é do `API-handoff`)  (commit: `feat(api-conversas): responder pelo painel via outbox`)
- [ ] 10. `POST /conversas/:id/encerrar` (status `encerrada`; libera a unicidade da conversa aberta)
  (commit: `feat(api-conversas): encerrar conversa`)
- [ ] 11. Integração SSE: registrar no realtime (F5) o canal de conversas da loja, com autorização pelo
  escopo (usuário só assina lojas dele) e payload sem conteúdo; reenvio de último evento por
  `Last-Event-ID` se F5 oferecer  (commit: `feat(api-conversas): eventos ao vivo de conversas`)
- [ ] 12. Auditoria sem PII  (commit: `feat(api-conversas): auditoria de conversas`)
- [ ] 13. Testes de unidade e integração do módulo  (commit: `test(api-conversas): suite de conversas`)
- [ ] 14. Testes de segurança (SEC-001/002/003/024/101)  (commit: `test(api-conversas): sec de isolamento e conteudo`)

## Testes e segurança exigidos

**Unidade/integração:**
- Janela: aberta, fechada, borda, sem entrada; envio fora da janela negado; template permitido fora
  (a seleção de template é do `AT`/`zap`; aqui só se valida a regra).
- Resposta cria `mensagens` e `envios` de forma atômica (falha em um desfaz o outro); `envios.status`
  inicial `agendado`; nenhuma chamada direta à Meta (a api não fala com o provedor).
- Conversa `ia` não aceita resposta humana; `encerrada` idem.
- Paginação estável com mensagens simultâneas; `wamid` duplicado não duplica (índice único).
- SSE: assinante da loja A não recebe evento da loja B; payload sem conteúdo.
- Matriz de papéis: os três papéis respondem; sem membership nega.

**SEC aplicáveis:**
- `SEC-001`: loja A não lê conversas/mensagens da loja B.
- `SEC-002`: `loja_id`/`conversa_id` coerentes; resposta só em conversa do escopo.
- `SEC-003`: escopo de **operador** da plataforma nega todos os endpoints (conteúdo de cliente).
- `SEC-024`: texto de mensagem e telefone nunca em log; redaction cobre `conteudo`, `transcricao`,
  `texto`.
- `SEC-033`: `mensagens` não aceita UPDATE/DELETE pela api (grant só `select, insert`; confirmado por
  `SET ROLE`).
- `SEC-081`: Zod com tamanho máximo de texto. `SEC-101`: rate limit na resposta por conversa.
- `SEC-051` (lado banco): `wamid` único evita duplicata de inbound; este módulo não a reimplementa.

## Notas e decisões

- **Escopo x handoff:** a mudança de `ia` para `humano` (e a volta) é `API-handoff` (Onda 4), que
  depende deste módulo. Nesta onda a tela só mostra o estado e permite encerrar. Resposta humana só
  funciona quando o `status` já é `humano`, o que pode ser forçado por seed/teste até o handoff existir.
- **Não lidas:** o baseline não tem tabela de leitura por membro. Decisão: na Onda 1, "não lida" =
  existe mensagem de `entrada` mais recente que o último `saida` da conversa (derivado, sem coluna).
  Marcar como lida individual por membro fica como migration futura; a etapa 8 implementa o derivado
  (e `POST /conversas/:id/lida` vira no-op documentado) caso o dono não peça a tabela.
- **Sem conteúdo no SSE:** o evento só avisa; o cliente busca pelo REST autenticado. Evita vazar
  mensagem por um canal com escopo de assinatura mal configurado.
- **Mensagens imutáveis:** correção de mensagem não existe; erro operacional é uma nova mensagem.
- **Envio:** o outbox `envios` é o único caminho. O `zap` drena com claim `SKIP LOCKED`; a api nunca
  chama a Meta (consistência com a arquitetura de três runtimes).
- **Telefone:** as telas deste módulo mostram o nome ou o telefone mascarado; revelar é do
  `API-clientes`.
