# ZAP-webhook webhook_whatsapp

- **ID:** ZAP-webhook  ·  **Área:** ZAP  ·  **Onda:** 1
- **Modelo sugerido:** Opus  ·  **Status:** `A FAZER`
- **Reivindicado por:** (ninguem)

## Objetivo

Receber o webhook da Meta, validar a assinatura, rotear por `phone_number_id` até a loja certa e **só
enfileirar**: mensagens de entrada viram linhas em `mensagens` (criando `clientes` e `conversas` quando
preciso) para o `atendente` processar de forma assíncrona; recibos (sent, delivered, read, failed)
atualizam `envios`. Idempotente por `wamid`. "Pronto" observável: replay do mesmo evento não duplica
nada; um inbound de texto aparece como `mensagens` + `conversas` + `clientes` corretos; um recibo atualiza
o estado do envio; payload sem assinatura válida é descartado com resposta rápida.

## Dependências

- `F4` (api-core): config, logger com redaction e fronteira `shared/db` (convenções comuns).
- `API-conversas`: dono do modelo de `conversas`/`mensagens` e da regra de janela 24h; este módulo insere
  nessas tabelas conforme os grants do zap e **não** reimplementa regra de conversa.
- `API-clientes`: dono do modelo de `clientes` (hash + cifra de telefone); este módulo faz upsert mínimo.
- `ZAP-meta`: assinatura, normalização de inbound.

## Contratos e tabelas que toca

- **Escrita:** `webhook_eventos_processados` (idempotência), `mensagens` (insert de entrada), `conversas`
  (insert e marca de última mensagem de entrada), `clientes` (upsert por `(loja_id, telefone_hash)`),
  `envios` (UPDATE só das colunas permitidas: `status`, `entrega_status`, `wamid`, `erro`, SEC-031).
- **Leitura:** `numeros_whatsapp` (resolver loja por `phone_number_id`, status do número).
- Contratos: eventos normalizados de inbound/recibo do kernel (F1/F2).
- **Verificar antes de começar:** os grants reais do `whaviso_zap` na `0006` (conversas/clientes/mensagens).
  Se o zap não puder inserir em alguma delas, **não** contornar: registrar em Notas e escalar para ajuste
  de migration (fora do escopo deste módulo).

## Arquivos (escopo de edição)

- `backend/apps/zap/src/modules/webhook_whatsapp/**` (existe base legada; adaptar ao domínio de pedidos)
- `backend/apps/zap/src/routes.ts` (uma linha de registro do módulo)
- `backend/apps/zap/test/**` para testes de integração do módulo

## Etapas

- [ ] Rota `GET /webhook` de verificação (hub.challenge com `verify_token` de config, comparação em tempo
      constante)  (commit: `feat(zap): verificacao do webhook da meta`)
- [ ] Rota `POST /webhook` com **corpo cru** preservado (necessário para o HMAC) e verificação via
      `ZAP-meta`; inválida: 401 e descarte sem processar, sem log do corpo  (commit: `feat(zap): post do webhook com assinatura`)
- [ ] Responder 200 rápido: só a validação mínima na request (a Meta reentrega se demorar)  (commit: `feat(zap): ack rapido do webhook`)
- [ ] Idempotência: reivindicar `wamid` (ou id do status) com `INSERT ... ON CONFLICT DO NOTHING` em
      `webhook_eventos_processados`; se já existe, encerra sem efeito colateral  (commit: `feat(zap): idempotencia por wamid`)
- [ ] Roteamento: `phone_number_id` -> `numeros_whatsapp` -> `loja_id`; número desconhecido ou `removido`:
      descarta e registra evento sem PII  (commit: `feat(zap): roteamento por phone_number_id`)
- [ ] Upsert de cliente: telefone do remetente vira `telefone_hash` (sha256) + `telefone_cifrado`; telefone
      claro nunca persiste nem loga  (commit: `feat(zap): upsert de cliente por telefone hash`)
- [ ] Achar ou criar a `conversa` aberta do cliente naquele número; atualizar a marca de última mensagem
      de entrada (base da janela de 24h)  (commit: `feat(zap): resolucao de conversa`)
- [ ] Inserir `mensagens` de entrada (texto, interativo, áudio, imagem) com `wamid`, direção, tipo e
      `media_id` quando houver; **a mídia é baixada pelo `atendente`**, não aqui (zap fino)  (commit: `feat(zap): insercao de mensagens de entrada`)
- [ ] Sinalizar o atendente: o inbound fica disponível ao consumidor por claim no banco (estado de
      processamento em `mensagens`, ver Notas) e, se existir, `NOTIFY` para acordar o worker  (commit: `feat(zap): enfileirar inbound para o atendente`)
- [ ] Conversa em `humano` ou `encerrada`: inserir a mensagem mas **não** sinalizar o atendente (handoff é
      regra de conversas)  (commit: `feat(zap): respeitar handoff no inbound`)
- [ ] Recibos: casar `wamid` com `envios`; atualizar `entrega_status` e, em `failed`, `status` e `erro`
      (sem PII); recibo de `wamid` desconhecido é ignorado com contador  (commit: `feat(zap): recibos atualizam envios`)
- [ ] Testes de unidade e de integração (ver abaixo)  (commit: `test(zap): webhook_whatsapp`)
- [ ] Revisão (Opus) contra SEGURANCA.md

## Testes e segurança exigidos

- Integração contra `whaviso_dev` com payloads fixture: texto, botão, áudio, imagem, cada recibo.
- **SEC-050**: sem assinatura, assinatura trocada, corpo alterado: nada é gravado, resposta 401.
- **SEC-051**: replay do mesmo `wamid` N vezes grava exatamente 1 mensagem, 1 cliente e 1 conversa; replay
  concorrente (duas requests simultâneas) também.
- **SEC-001/002**: o `loja_id` vem só do `phone_number_id` resolvido no banco, nunca do payload; payload
  forjando outro número não escreve em outra loja.
- **SEC-031**: o zap só atualiza as colunas permitidas de `envios`.
- **SEC-024**: telefone, corpo de mensagem e token ausentes dos logs (a redaction cobre campos aninhados).
- **SEC-101**: rate limit por IP no `POST /webhook`, folgado o bastante para não prejudicar a Meta.

## Notas e decisões

- Decisão: **ack rápido, trabalho mínimo**. A única "inteligência" aqui é rotear, deduplicar e persistir;
  toda interpretação fica no `atendente`.
- Decisão: o sinal ao atendente é pelo **banco** (claim `FOR UPDATE SKIP LOCKED` sobre `mensagens` de
  entrada pendentes), não por import nem por HTTP. Se `mensagens` não tiver coluna de estado de
  processamento, registrar a necessidade para o dono do schema em vez de improvisar aqui.
- Decisão: mensagem de entrada de tipo não suportado (sticker, contato) é gravada como `tipo=outro` e
  tratada pelo fluxo, não descartada.
- Decisão: mídia não é baixada no webhook para manter o ack rápido e o zap fino.
