# Verificação — Épico 07: Interação do devedor

Fonte da verdade: `historias/07-interacao-devedor.md`. CLAUDE.md ignorado por instrução.
Código lido: `backend/apps/zap/src/modules/webhook_whatsapp/{service,repo,index}.ts`,
`backend/apps/zap/src/shared/templates/index.ts`, `backend/apps/zap/src/modules/enviar_lembretes/{index,render}.ts`,
`backend/apps/api/src/modules/acoes_devedor/service.ts`, migrations `0022/0024/0028/0039/0040`,
testes `webhook_whatsapp/tests/interacao_devedor.test.ts`.

## Veredito (40 [x] · 1 [~] · 0 [!] · 0 [+])

O épico está implementado de ponta a ponta e bem coberto por testes. Uma ressalva [~]:
o texto da 1a mensagem do Pix diverge do exemplo da história (contém a palavra "Pix",
embora a história só proíba a palavra no *rótulo do botão*, que está correto).

## Por história

### H7.1: O devedor só age por botão (sem chat)
| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Únicas ações = Já paguei / Chave de Pag. / Desativar lembretes | [x] | botões do ciclo definidos em `0024_ciclo_unificado.sql:19-22` (e 0039 renomeia rótulos); ações tratadas em `webhook_whatsapp/repo.ts:38` (`ACOES_CICLO`) | `interacao_devedor.test.ts` (vários) |
| Sem chat/IA/Pix automático; não responde livremente a texto | [x] | `service.ts:232-269` (`processarTexto`): texto livre só vira menu/silêncio, nunca conversa | `H7.1: texto livre...` |
| Texto livre free/sem conta = silêncio | [x] | `service.ts:253-258`: só responde se `combinados.find(c => c.menuLiberado)`; senão `return` sem enviar; `repo.ts:812-830` lê `menu_texto_livre` do plano | `H7.1: texto livre, dono FREE → silêncio` |
| Texto livre plano pago = menu de opções dos combinados ativos | [x] | `service.ts:256-258` envia `resposta.menu_opcoes` amarrado ao 1o acionável; template em `0040:85-96`; `listarCombinadosParaMenu` só `programado` (`repo.ts:823-825`) | `G-C1: texto livre com 1 programado + 1 informado_pago → menu só do programado` |
| Cada toque = evento autenticado por HMAC, payload com `aviso_id`/etapa, sem token nem PII | [x] | payload `acao:avisoId:etapa` parseado em `service.ts:42-55`; `aviso_id` validado como UUID; etapa no refId (`enviar_lembretes/index.ts:74`); webhook HTTP da Meta com validação HMAC (`X-Hub-Signature-256`, `META_APP_SECRET`) | testes via `processarBotao` direto |
| Respostas neutras de gênero, sem palavras proibidas | [x] | templates de resposta em `0022:56-77` e `0040:69-103` | (revisão de texto) |

### H7.2: Tocar "Já paguei"
| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Botão em todas as etapas (age só no último, H7.7) | [x] | `0024:20`, `0039:70` em `ciclo.*` e na variante revisao d_mais_1 | `H7.7: ...último aviso enviado age` |
| Toque → `informado_pago` e ciclo de lembretes para | [x] | `repo.ts:638` (`status='informado_pago'`) + `repo.ts:644-648` cancela envios pendentes exceto d_mais_1 | `G-M3: dois "Já paguei"...` |
| Cobrador notificado imediatamente (E10) | [x] | `repo.ts:656` `enfileirarNotificacao(...,'pagamento_informado')` | `G-M3` (conta notificacoes) |
| Resposta neutra de confirmação | [x] | `chaveResposta: 'resposta.ja_paguei'` (`repo.ts:657`); texto em `0022:60-61` | implícito |
| Idempotente: re-tap em informado_pago não faz/envia nada | [x] | `repo.ts:634-636` (`aviso.status !== 'programado'` → `aplicado:false`); `service.ts:128` (`if (!r.aplicado) return`) | `re-tap "Já paguei" em informado_pago é silencioso` |
| Transição registra evento append-only | [x] | `repo.ts:649-652` insere `ja_paguei_devedor` em `eventos_aviso` | `G-M3` (conta eventos = 1) |
| Confirmação/rejeição pelo cobrador no E8 | [x] | tratado em `repo.ts:474-520` (confirmar/rejeitar) — fora do escopo declarado de E7 | E8 tests |

### H7.3: Tocar "Chave de Pag." (ver o Pix)
| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Botão em todas as etapas; rótulo SEM "Pix"; editável (E12) | [x] | rótulo "Chave de Pag." em `0039:34` e `0024`; presente em todas as etapas | — |
| Resposta inclui titular + banco salvos | [x] | `repo.ts:698-699` retorna `pixTitular`/`pixBanco`; `service.ts:137,175` usa-os na 2a mensagem; template `0040:70-74` | `"Chave de Pag." envia 2 mensagens...` |
| Duas mensagens em sequência, até 3s entre elas | [x] | `service.ts:155-183`: 1a chave, `esperar(intervaloPixMs())` (`service.ts:144-147`, padrão 1500ms), 2a titular+banco | `"Chave de Pag." envia 2 mensagens` (intervalo 0 no teste) |
| 1a só a chave / 2a titular+banco | [~] | estrutura correta (`service.ts:171,175`), porém o texto da 1a em `0022:67` é `"Chave Pix:\n{{1}}"` (a história exemplifica "Chave de pagamento: [chave]"). Funcional, mas diverge do exemplo e contém "Pix" no corpo (a história só proíbe no rótulo, então não é violação de regra) | `whats.enviadas[0].texto contém chave` |
| Evento `solicitou_pix` só no 1o toque | [x] | `repo.ts:676-686`: insere só se `count=0` e só quando `!jaEntregue` | `G-C3: ...solicitou_pix gravado só uma vez` |
| Entrega uma vez por combinado; reenvio só após falha de servidor | [x] | `repo.ts:673,688-692` (jaEntregue → silencioso); `marcarChaveEntregue` só após as 2 saírem (`service.ts:178`); falha não marca (`service.ts:179-182`) | `G-C3: 1ª ok, 2ª falha → reentregável` |
| Não muda o estado | [x] | `ver_pix` não altera `status` (`repo.ts:660-703`) | `"Chave de Pag." ... status='programado'` |
| Chave/nome/banco nunca em log | [x] | sem logs de chave; comentários `repo.ts:769`, `service.ts:153,181` reforçam | — |

### H7.4: Tocar "Desativar lembretes"
| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Botão em toda mensagem do ciclo (opt-out sempre visível) | [x] | `optout` em `0024:22`/`0039` em todas as etapas | — |
| Toque → `desregistrado`, nenhum lembrete a partir daí | [x] | `repo.ts:743-750` (`status='desregistrado'`); trigger `encerrar_envios` suspende (`0028`, citado em `0040:5-6`) | `opt-out → desregistrado...` |
| Afeta só este combinado | [x] | update por `id` único (`repo.ts:748`); menu/listagem por `aviso.id` | implícito |
| Horário reservado → null (preserva `_orig`) | [x] | `repo.ts:745-747` zera `horario_reservado_seg`, guarda `_orig` | `opt-out ... h.seg null, h.orig 30000` |
| Confirmação com botão "Ativar lembretes" | [x] | template `resposta.optout` ganha botão `ativar` em `0040:56-63`; render monta `ativar:<aviso_id>` (`templates/index.ts:68-69`) | `whats.enviadas[0].botoes[0].id === ativar:<id>` |
| Notificação ao cobrador adiada 1min (anulável por reativação) | [x] | `repo.ts:757-760` `agendarAposSeg: 60`, grupo de coalescing | `E10b: reativar dentro de 1min anula...` |
| `desregistrado` não apaga; evento registrado | [x] | só update de status; `repo.ts:751-754` insere evento `optout` | `opt-out ... evento optout = 1` |
| `desregistrado` não é terminal (reversível, H7.5) | [x] | transição `desregistrado → programado` em `0028:89`; ação `ativar` (`repo.ts:705-731`) | `reativar (desregistrado → programado)` |

### H7.5: Reativar lembretes
| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Botão "Ativar lembretes": `desregistrado → programado`, ciclo volta | [x] | `repo.ts:705-716` (só de `desregistrado`); `0028:89` transição | `reativar (desregistrado → programado)` |
| Reativação pega NOVO horário reservado (regra de timestamp) | [x] | `repo.ts:717` `reprogramarCiclo` (realoca horário) | `reativar ... h.seg não nulo` |
| Mensagem de reativação SEM botão | [x] | `chaveResposta: 'resposta.reativacao'` (`repo.ts:730`); template `0040:77-81` sem `botoes` | `reativar ... botoes.length 0` |
| Reativar dentro do 1min: nada notificado ao cobrador | [x] | `repo.ts:726-729`: `cancelarOptoutPendente`; se anulou, NÃO enfileira reativação | `E10b: reativar dentro de 1min anula a notificação` |
| Reativar após notificação de saída: 2ª notificação | [x] | `repo.ts:727-729`: se `anuladas===0`, enfileira `reativacao` | `E10b: reativar após ... gera 2ª notificação` |
| Retoma pela etapa aplicável à data (catch-up) | [x] | `reprogramarCiclo` (`repo.ts:717`); catch-up vazio em vencido | `G-M2: reativar combinado VENCIDO (catch-up vazio)` |
| Reativação registrada como evento | [x] | `repo.ts:718-721` insere `reregistrado` | `reativar ... evento reregistrado = 1` |

### H7.6: O toque sempre cai no combinado certo
| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Usa `aviso_id` do payload, não "última mensagem do chat" | [x] | `aplicarAcaoBotao(pool, avisoId, ...)` localiza por id (`repo.ts:429-438`) | todos os testes de botão |
| Vários combinados ativos: afeta só o do botão | [x] | seleção `where a.id=$1` (`repo.ts:436`) | implícito (menu G-C1) |
| Só aplica se telefone respondente = `telefone_devedor`; senão ignora sem logar | [x] | `repo.ts:450-457`: ações do ciclo barram telefone divergente (`return null`) | `G-M1: botão do ciclo de telefone DIVERGENTE é ignorado` |
| Idempotente e registrado em auditoria | [x] | idempotência por estado em cada ramo; eventos append-only | `G-M3`, demais |

### H7.7: Só os botões do último aviso agem; encerrado/inválido
| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Só botões do último aviso enviado agem; botão antigo não dispara estado | [x] | `repo.ts:607-628`: `etapaUltimoAvisoEnviado` vs `etapaClicada`; etapa antiga → `encerrado:true`, sem ação | `H7.7: botão de etapa ANTERIOR ... inerte` / `...do ÚLTIMO ... age` |
| Vale para os 3 botões, inclusive Chave de Pag. (uma vez/combinado, só último) | [x] | check antes de processar `ja_paguei/ver_pix/optout` (`repo.ts:615`, exclui só `ativar`) | etapa testada com `ja_paguei` |
| Estado terminal (pago/cancelado/recusado/expirado): toque não reabre nem age | [x] | `repo.ts:595-605`: fora de `ESTADOS_ATIVOS` → `encerrado:true`, sem reabrir | `G-C2: terminal {pago,cancelado,recusado,expirado} não reabre` |
| Resposta neutra "já encerrado" respeitando cortesia free/pago | [x] | `service.ts:119-124`: só responde `resposta.encerrado` se `menuLiberado` (pago); free = silêncio; template `0040:99-103` | `G-C2: ... pago → cortesia, free → silêncio` |
| `aviso_id` inválido/desconhecido ignorado sem vazar | [x] | `service.ts:94-95` (`parsearPayloadBotao` retorna null → return); `repo.ts:439-440` (aviso ausente → null) | `H7.7: aviso_id inválido é ignorado sem vazar` |

## O que o código precisa mudar para seguir a história

1. **RESOLVIDO (webhook HMAC real).** A história pede "evento de webhook **autenticado por HMAC**"
   (linha 19) e "o webhook usa o `aviso_id` do payload (autenticado por HMAC)" (linha 83). O
   webhook HTTP da Meta com validação HMAC (`X-Hub-Signature-256`, `META_APP_SECRET`) já está
   implementado; roteamento por `aviso_id` no payload (não pela "última mensagem") também está
   satisfeito. Não há mais divergência a corrigir aqui.

2. **Texto da 1a mensagem do Pix (H7.3) — [~]**: a história exemplifica a 1a mensagem como
   *"Chave de pagamento: [chave]"* (linha 43). O template `resposta.ver_pix` (`0022:67`) usa
   *"Chave Pix:\n{{1}}"*. O rótulo do botão ("Chave de Pag.") está correto e a história só proíbe
   a palavra "Pix" no rótulo, então não há violação de regra de ouro; mas o corpo diverge do
   exemplo e mantém "Pix" num ponto onde a história optou por não usá-la. Considerar atualizar o
   texto do template para alinhar com o exemplo (via migration de catálogo, não no seed).

## Itens que a própria história marca como 🟡/fora de escopo (com a linha)

- "As notificações ao cobrador em si (texto, canal, janela de 1 min, sem conta) (Épico 10)." (linha 125)
- "Confirmação/rejeição do pagamento e o ciclo de vida do `informado_pago` (Épico 8)." (linha 126)
- "Abrangência ampla e compliance do opt-out (Épico 13)." (linha 127)
- "Como esses eventos (`solicitou_pix`, opt-out, reativação, já paguei) aparecem no painel (Épico 9)." (linha 128)
- "Fallback de resposta numerada (resiliência) ... o sistema mantém um fallback de resposta
  numerada como resiliência geral do canal, não como workaround pendente." (linha 111)
  Observação: o fallback numerado existe para o CONVITE (`service.ts:30-34,238-243`), não para os
  três botões do ciclo do devedor (a história não fecha critério [ ] específico para isso).

## Observações

- A maquinaria de "só o último aviso age" (H7.7) é elegante: o ciclo envia botões com
  `refId = <aviso>:<etapa>` (`enviar_lembretes/index.ts:74`), e o repo compara a etapa clicada
  com a do último envio entregue (`etapaUltimoAvisoEnviado`, `repo.ts:92-100`). O reengajamento do
  E8 (sem etapa) também supera o ciclo (`reengajamentoSuperaUltimoEnvio`, `repo.ts:108-121`).
- O caminho público por LINK na api (`acoes_devedor/service.ts`) espelha `ja_paguei` e `optout`
  do webhook (mesmo estado-alvo, mesmo adiamento de 1min, mesmo zeramento de horário). Ele
  corretamente NÃO faz `ver_pix`/entrega de chave nem `reativar` (esses são só por botão do
  WhatsApp, coerente com a história). Esse caminho não registra `solicitou_pix` (esperado).
- `ja_paguei` corretamente vai para `informado_pago` (não direto a `pago`) e cancela os envios
  pendentes exceto `d_mais_1` (empurrãozinho), conforme E6 H6.5.
- Idempotência e anti-corrida bem cobertas: `FOR UPDATE` do aviso serializa toques simultâneos;
  `dedupe_key` na outbox evita notificação dupla (teste `G-M3`).
