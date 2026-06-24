# Verificação — Épico 08: Confirmação de pagamento

Direção: a história é a fonte da verdade. Divergência = corrigir o CÓDIGO.

## Veredito (X [x] · Y [~] · Z [!] · W [+])

- [x] cumpridos: 36
- [~] parciais: 3
- [!] divergências: 0
- [+] faltando: 1

Total de critérios avaliados: 40 (entre H8.1 e H8.9; H8.7 é 🟡 gated pela própria história).

## Por história

### H8.1: Cobrador confirma o pagamento (informado_pago → pago) 🟢

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Confirmação só de `informado_pago` ou `programado` | [x] | recebimentos/service.ts:82-84 (guarda `!== 'programado' && !== 'informado_pago'` → 409 estado_invalido) | confirmacao_pagamento_e8.test.ts:255-261 |
| Simples → `pago` terminal | [x] | service.ts:87 `update ... status='pago'`; trigger 0028:86 só sai de `pago` por reabertura | confirmacao_pagamento_e8.test.ts:83-102 |
| Recorrente fecha só a ocorrência | [~] | service.ts:75 comenta "H8.7 recorrência: GATED (não modelada); o caminho simples sempre vira terminal" | it.todo confirmacao_pagamento_e8.test.ts:264 |
| Liberação do horário só sem mais ocorrências | [x] | trigger libera `_seg=null`/preserva `_orig` no terminal (0038); simples libera ao confirmar | confirmacao_pagamento_e8.test.ts:179-201 |
| Envio pendente descartado ao virar `pago` | [x] | trigger `encerrar_envios_do_aviso` cancela agendado/processando em `pago` (0028:107-122); drainer reconfere (enviar_lembretes/index.ts:42-46) | transicao_estado.test.ts |
| Mensagem ao devedor com atraso ~1min | [x] | service.ts:92-95 `enfileirarNotificacaoDevedor(...'encerramento', {agendarAposSeg: 60, coalesceGrupo})` | confirmacao_pagamento_e8.test.ts:96-101 |
| Mensagem de encerramento neutra e sem botões | [x] | 0042:61-66 `devedor.encerramento` padrao, sem `botoes` | (template) |
| Confirmação registrada como evento append-only com quem/quando | [x] | service.ts:51-62 grava `confirmado_cobrador` com `detalhes.cobrador_id`; `eventos_aviso` append-only (0005) | confirmacao_pagamento_e8.test.ts:91-94 |
| Confirmar de novo é idempotente | [x] | service.ts:81 `if status==='pago' return` | confirmacao_pagamento_e8.test.ts:104-113 |

### H8.2: Cobrador rejeita o pagamento informado (informado_pago → programado) 🟢

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Rejeição só de `informado_pago` | [x] | service.ts:111-113 (guarda → 409) | confirmacao_pagamento_e8.test.ts:131-144 |
| Volta a `programado` + catch-up | [x] | service.ts:114-118 `update programado` + `reprogramarCiclo` | confirmacao_pagamento_e8.test.ts:141-143 (4 etapas reagendadas) |
| Horário não muda (não realoca) | [x] | service.ts:118 reusa horário reservado; não toca `_seg`/`_orig` | confirmacao_pagamento_e8.test.ts:141-143 |
| Evento `rejeitado_cobrador`, evento de "informou" permanece | [x] | service.ts:115; `eventos_aviso` append-only | confirmacao_pagamento_e8.test.ts:136-138 |
| Devedor notificado neutro/sem acusação | [x] | service.ts:121 enfileira `rejeicao`; 0042:89-94 texto sem palavra proibida | confirmacao_pagamento_e8.test.ts:139 |

### H8.3: Reengajar quando o pagamento não foi localizado (pós-ciclo) 🟢

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Disponível só pós-ciclo (passou de D+1) e `programado` | [x] | service.ts:179-192 (guarda status + `pos_ciclo` em fuso SP → 409 ciclo_em_andamento) | confirmacao_pagamento_e8.test.ts:213-218 |
| Dispara UMA mensagem ao devedor | [x] | service.ts:219 `enfileirarNotificacaoDevedor(...'reengajamento')` | confirmacao_pagamento_e8.test.ts:220-229 |
| Três botões padrão e vira o último aviso | [x] | 0042:99-111 (`ja_paguei`/`ver_pix`/`optout`); M2: webhook trata como último (repo.ts:108-121, 615-628) | (template + interacao_devedor) |
| Não muda de estado; disparo é evento | [x] | service.ts:215-220 (retorna status atual; grava `reengajamento_cobrador`) | confirmacao_pagamento_e8.test.ts:223-228 |
| Sai na janela 8-18 no horário reservado, respeita limite do plano | [~] | service.ts:217-219 comenta que a outbox/drainer cuida do horário; o enfileiramento aqui não força janela 8-18 (a entrega segue o drain). Limite do plano (E11) é checado | (sem teste de janela aqui) |
| Limite de reengajamentos por plano (E11) | [x] | service.ts:194-214 (`travarConta`, `reengajamento_max`, nunca 2/dia) | confirmacao_pagamento_e8.test.ts:231-252 |

### H8.4: Cobrador marca como pago direto 🟢

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| De `programado` (ou `informado_pago`) marca `pago` direto | [x] | service.ts:82-87 aceita ambos | confirmacao_pagamento_e8.test.ts:116-128 |
| Mesmo efeito da H8.1 (terminal, descarte, mensagem ~1min, recorrência) | [x] | service.ts:87-95 caminho único; recorrência gated igual H8.1 | confirmacao_pagamento_e8.test.ts:116-128 |
| Não depende de "Já paguei" | [x] | service.ts:82 aceita `programado` sem passar por `informado_pago` | confirmacao_pagamento_e8.test.ts:116-119 |
| Registra quem marcou (distingue informado x marcado) | [x] | service.ts:86 evento `marcado_pago_cobrador` vs `confirmado_cobrador` | confirmacao_pagamento_e8.test.ts:116-128 |

### H8.5: Confirmar/rejeitar por botão no WhatsApp (qualquer cobrador) 🟢

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Notificação ao cobrador leva botões Confirmar / Ainda não recebi, com ou sem conta | [x] | 0042:138-149 adiciona `botoes` a TODAS as versões de `cobrador.pagamento_informado` | (migration) |
| Confirmar → efeito H8.1; Ainda não recebi → H8.2 | [x] | webhook repo.ts:484-519 (confirmar→pago+encerramento adiado; rejeitar→programado+rejeicao) | webhook/confirmacao_pagamento_e8.test.ts:39-68 |
| Quem tem conta também usa o painel | [x] | recebimentos/index.ts:11-27 endpoints de painel coexistem | confirmacao_pagamento_e8.test.ts (painel) |
| Webhook HMAC, carrega `aviso_id`, valida telefone do alvo (profile/`telefone_cobrador`), senão ignora sem vazar | [x] | service.ts:42-55 parseia `acao:aviso_id`; repo.ts:474-482 roteia por `cobrador_profile_telefone` (com conta) / `telefone_cobrador` (sem) e ignora divergente | webhook/confirmacao_pagamento_e8.test.ts:71-121 |
| Ação idempotente + só o último aviso age | [x] | repo.ts:487-488/506-507 (silencioso fora de `informado_pago`) | webhook/confirmacao_pagamento_e8.test.ts:124-136 |
| CTA discreta de criar conta junto da confirmação (sem-conta) | [+] | NÃO existe. Só há `cobrador.pagamento_informado` contexto `padrao` (0023:18-27) com texto "confirme no painel"; sem variante sem-conta e sem CTA de criar conta. O comentário 0042:115-116 afirma que a CTA "fica no texto da própria notificação", mas o texto não a contém | (sem teste) |
| Risco do canal: pode exigir fallback numerado | [~] | há fallback numerado para o CONVITE (service.ts:30-34, 238-243), mas NÃO para confirmar/rejeitar do cobrador; a própria história marca como risco/"pode exigir" | (sem teste) |

### H8.6: Reabrir um combinado pago por engano (pago → programado) 🟢

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| `pago → programado`, só o cobrador, painel ou WhatsApp | [x] | service.ts:137-149 (`exigirPapel` cobrador; guarda `!=='pago'`); painel via index.ts:17-21 | confirmacao_pagamento_e8.test.ts:203-210 (devedor→403) |
| Reuso do mesmo horário via `_orig`, fora da regra de timestamp, aceitando colisão | [x] | service.ts:149 `reprogramarCiclo` reusa `_orig`; `_orig` nunca vira null (M3) | confirmacao_pagamento_e8.test.ts:179-201 |
| Volta ao ciclo por catch-up sem reenviar vencidas em lote | [x] | service.ts:149 `reprogramarCiclo` (catch-up) | confirmacao_pagamento_e8.test.ts:141-143 (padrão catch-up) |
| Reabrir dentro do minuto: devedor não recebe nada; depois: 2ª mensagem | [x] | service.ts:153-156 (`cancelarEncerramentoPendente`; se 0 anuladas → `status_alterado`) | confirmacao_pagamento_e8.test.ts:147-177 |
| Reabertura é evento; histórico (inclusive `pago`) não apagado | [x] | service.ts:146 `reaberto_cobrador`; append-only | confirmacao_pagamento_e8.test.ts:160-163 |
| Única saída de `pago`; só ação humana reabre | [x] | trigger 0028:86 só permite `pago → programado`; nenhum fluxo automático sai de `pago` | confirmacao_pagamento_e8.test.ts:203-210 |

### H8.7: Combinados recorrentes: confirmação por ocorrência 🟡 (depende de H6.10)

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Toda a história | 🟡 gated | A própria H8.7 marca 🟡 (linha 94: depende do estudo de cadência H6.10, "ainda não ligado"). Código documenta gating: service.ts:75-76; variante recorrente do encerramento criada INATIVA (0042:68-76) | it.todo confirmacao_pagamento_e8.test.ts:264 |

### H8.8: Acompanhamento enquanto está em informado_pago 🟢

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Em `informado_pago` o ciclo normal NÃO dispara; só o empurrãozinho de D+1 | [x] | enviar_lembretes/index.ts:37-41 (cancela toda etapa exceto d_mais_1 quando status `informado_pago`); webhook `ja_paguei` repo.ts:644-648 já pré-cancela exceto d_mais_1 | enviar_lembretes.test.ts / interacao_devedor.test.ts |
| `informado_pago` é não-terminal, sem prazo automático | [x] | trigger não expira `informado_pago` por tempo; nenhuma transição automática | (estados) |
| Aparece destacado como "aguardando sua confirmação", com Confirmar/Rejeitar, e mostra quando o devedor informou | [~] | painel/repo.ts:103-107 emite pendência `confirmar_pagamento` para `informado_pago` do cobrador; mas NÃO traz o "quando o devedor informou" (timestamp do `ja_paguei_devedor`). A história remete o detalhe ao E9 (linha 103: "detalhe no Épico 9") | painel.test.ts:126 |
| Nenhuma transição de `informado_pago` por tempo; só o cobrador ou terminais legítimos | [x] | nenhum job tira de `informado_pago`; só service.ts (confirmar/rejeitar) e cancelado/expirado (fora do épico) | (estados) |

### H8.9: Toda transição de pagamento é auditável e segura 🟢

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Só transições válidas; resto rejeitado com envelope `{error:{code,message}}` | [x] | trigger 0028:80-93 + guardas no service (409 estado_invalido) | confirmacao_pagamento_e8.test.ts:255-261 |
| Defesa em profundidade; nenhuma regra de negócio no front | [x] | front chama API (frontend DetalheAviso.tsx/DetalheCombinado.tsx via api.ts); API valida + trigger valida | confirmacao_pagamento_e8.test.ts (todos via HTTP) |
| Cada transição grava evento append-only com ator/origem/destino/timestamp | [x] | service.ts:51-62 e webhook repo.ts; `eventos_aviso` sem DELETE (0005/0008) | confirmacao_pagamento_e8.test.ts:90-94 |
| Só o cobrador confirma/rejeita/marca/reabre; devedor não confirma o próprio | [x] | service.ts:40-43 `exigirPapel('cobrador')`; webhook repo.ts:474-482 (M4: telefone do devedor não confirma) | confirmacao_pagamento_e8.test.ts:203-210; webhook test:98-109 |
| Toda ação idempotente | [x] | guardas `if status === alvo return` em service.ts e repo.ts | confirmacao_pagamento_e8.test.ts:104-113; webhook test:124-136 |
| Nunca logar telefone/Pix/token; valor em centavos sem recálculo | [x] | service.ts grava só `cobrador_id`/`via:'telefone'` em detalhes; valores em centavos no banco | (redaction; revisão de código) |

## O que o código precisa mudar para seguir a história (mudanças de CÓDIGO)

1. **[+] H8.5 — CTA discreta de criar conta para cobrador SEM conta.** A história exige uma CTA discreta de criar conta junto da confirmação para o cobrador sem conta (nunca obrigatória). Hoje existe só `cobrador.pagamento_informado` contexto `padrao` (migration 0023), com texto "Confira e confirme o recebimento no painel" e sem qualquer convite a criar conta. Não há variante/segmento para o cobrador sem conta. O comentário em 0042:115-116 afirma que a CTA "fica no texto da própria notificação", mas esse texto não a inclui. Falta: criar a variante (ou texto condicional) com a CTA discreta de conta para o alvo sem conta. (O texto/canal em si é refinado no E10, mas a presença da CTA é critério da H8.5.)

2. **[~] H8.8 — "quando o devedor informou" não é exposto.** A pendência `confirmar_pagamento` (painel/repo.ts:96-131) não retorna o instante em que o devedor informou (evento `ja_paguei_devedor`). A história remete o detalhe ao E9; se a apresentação ficar só no E9, garantir lá que o dado seja lido de `eventos_aviso`.

3. **[~] H8.1/H8.8 — assimetria de mecanismo entre os canais ao informar pagamento (sem divergência de comportamento, mas vale alinhar).** Ao informar pagamento: o canal do WhatsApp (`ja_paguei`, webhook repo.ts:644-648) PRÉ-CANCELA os envios do ciclo (exceto d_mais_1) na hora; o canal do devedor logado (recebimentos/service.ts:253-271 `marcarPagoDevedor`) e o link público (acoes_devedor/service.ts:48-58) NÃO pré-cancelam, apenas mudam o estado para `informado_pago`. O ciclo PARA igualmente nos três casos porque o drainer reconfere o estado e cancela toda etapa exceto d_mais_1 (enviar_lembretes/index.ts:37-41), então o comportamento observável (ciclo para, só empurrãozinho D+1 possível) é IGUAL nos dois canais. Recomendação opcional: padronizar o pré-cancelamento também no caminho da api/link, deixando os três caminhos simétricos e reduzindo a janela em que os envios ficam `agendado`.

4. **[~] H8.3 — janela 8-18 no reengajamento.** `reengajar` (service.ts:175-221) só enfileira a notificação e delega o horário ao drainer; o critério pede "dentro da janela 8h-18h e no horário reservado". Confirmar que o drainer de `notificacoes_cobrador` aplica a janela comercial à mensagem ao devedor (sem teste cobrindo o horário neste épico).

## Itens que a própria história marca como 🟡/fora de escopo (com a linha)

- **H8.7 inteira é 🟡 gated** pela linha 94: "A própria recorrência ... depende do estudo de cadência configurável (Épico 6 H6.10), ainda não ligado; a lógica de confirmação por ocorrência ... pressupõe esse mecanismo." Coberta no código como gated (service.ts:75-76; variante recorrente inativa em 0042:68-76; it.todo no teste). Por isso não conta como [+].
- **Texto/canal das notificações ao cobrador** (incl. sem conta): linha 149 "❌ Texto, canal e janela das notificações ao cobrador (incl. cobrador sem conta) (Épico 10)." Por isso a wording exata fica no E10; a presença da CTA (item [+] acima) continua sendo critério da H8.5.
- **Apresentação no painel** (`informado_pago`, fila de confirmação, progresso do recorrente): linha 150 "❌ ... aparecem no painel (Épico 9)." Daí o "quando informou" ser [~] e não [!].
- **Empurrãozinho D+1 e parada do ciclo em si**: linha 151 "❌ ... (Épico 6)."
- **Risco do canal Baileys/fallback** (H8.5 linha 69): a própria história diz "pode exigir fallback ... até a Meta oficial" — por isso a ausência de fallback numerado para confirmar/rejeitar do cobrador é [~], não [+].

## Observações

- Cobertura de teste muito boa: api (confirmacao_pagamento_e8.test.ts: H8.1/2/3/4/6/9) e zap (webhook/confirmacao_pagamento_e8.test.ts: H8.5 com conta, sem conta, C4, M4, divergente, idempotência). H8.7 é it.todo (gated).
- A janela de reversão de ~1min (H8.1/H8.6) é coerente nos dois canais: ambos enfileiram `encerramento` com `agendarAposSeg=60` e `grupoEncerramento(id)`; a reabertura coalesce/anula a linha pendente.
- `_orig` nunca vira null (M3): garante reuso do mesmo horário em reaberturas repetidas (testado).
- Linguagem: templates de E8 sem palavra proibida e sem travessão; os emojis usados (🙂) são permitidos (a proibição é de travessão, não de emoji).
