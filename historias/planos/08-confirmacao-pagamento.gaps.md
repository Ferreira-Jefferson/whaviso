# Relatório de validação: Épico 08, Confirmação de pagamento (`informado_pago`)

> Revisão adversarial do `08-confirmacao-pagamento.plano.md` contra `historias/08-confirmacao-pagamento.md` (fonte da verdade), o código real e as invariantes do Épico 13.

## 1. Veredito

**Aprovado com ressalvas.** O plano é sólido, mapeia o estado do código com precisão (confirmei `recebimentos/service.ts`, `enviar_lembretes`, trigger `0011`, eventos em `0001`/`0011`, numeração de migrations até `0024`) e cobre a maioria dos critérios. Há gaps **críticos** de cobertura (notificação de rejeição/status ao devedor em alguns canais, idempotência no caminho recorrente, ausência de teste de coalescing real, e tratamento de mensagens-avulsas vs a fila de saída do E10) e várias ressalvas médias que precisam ser explicitadas antes de codar.

## 2. Gaps por severidade

### Críticos

**C1 — H8.6: anulação confirmação+reabertura tem corrida não tratada no MVP da fila avulsa.**
O critério H8.6 exige: reabrir dentro de ~1 min → "o devedor **não recebe nada**". O plano agenda o encerramento com `agendado_para = now()+1min` e cancela via `update ... set status='cancelado' where status='agendado'`. Mas o drainer (`enviar_mensagens_avulsas`) pode ter feito o claim (`status='processando'` via `FOR UPDATE SKIP LOCKED`) **exatamente** no instante da reabertura: o `update` de cancelamento não pega linhas em `processando`, e o drainer ainda vai enviar. O plano cita "reconferência de estado no disparo", mas o encerramento é uma mensagem que **só existe porque** o aviso virou `pago`; ao reabrir, o aviso volta a `programado` → a reconferência DEVE checar que o aviso ainda está `pago` antes de enviar o encerramento. Isso não está dito explicitamente (a reconferência genérica "terminal/pausado descarta" não cobre "encerramento só se status==pago"). **Correção:** especificar a regra exata de reconferência da mensagem de encerramento (enviar somente se `aviso.status='pago'` no instante do disparo) e adicionar teste de corrida claim-vs-reabertura.

**C2 — H8.2: o devedor é notificado da rejeição, mas o plano só enfileira em `mensagens_avulsas` quando há `telefone_devedor`; não há garantia de canal nem cobertura do caso sem WhatsApp pareado.** Mais grave: o critério H8.2 diz "O devedor é notificado". O plano enfileira `rejeicao.padrao` mas **não define idempotência** dessa notificação (rejeitar duas vezes em `informado_pago` é bloqueado pelo estado, ok), porém o webhook de cobrador (`rejeitar` por botão) e o painel podem ambos disparar. Falta dizer que a inserção em `mensagens_avulsas` deve ser idempotente por `(aviso_id, chave_template, janela)` para o caso de toque-duplo no botão antes do estado mudar. **Correção:** unique parcial / coalescing por `(aviso_id, chave)` enquanto `agendado/processando`, e teste de toque-duplo.

**C3 — Coalescing real (E10 H10.9) declarado fora de escopo, mas a `mensagens_avulsas` introduz uma SEGUNDA outbox ao devedor sem alinhar com a fila de saída espaçada (10 min + coalescing).** O `_CONTEXTO.md` marca a fila de saída com espaçamento 10 min por destinatário + coalescing como ponto **crítico** que vive nas "duas outboxes". O plano cria uma terceira via (`mensagens_avulsas`) e diz "espaçamento/coalescing é E10". Risco real: encerramento, status-alterado, rejeição e reengajamento saem para o **mesmo devedor** sem respeitar o espaçamento de 10 min que o E6/E10 impõem aos `envios`, podendo gerar rajada. **Correção:** decidir e documentar (Decisão em aberto 3 já aponta isso, mas precisa virar requisito): ou `mensagens_avulsas` passa pela mesma disciplina de espaçamento/coalescing por destinatário, ou o plano justifica por que mensagens avulsas são isentas. Não pode ficar implícito.

**C4 — H8.5: anti-vazamento por telefone está descrito, mas falta o caso do cobrador COM conta cujo telefone do profile não bate / profile sem telefone verificado.** O critério: "cobrador com conta: telefone do profile". Hoje o login é Google OAuth ou WhatsApp OTP; um cobrador que logou por Google **pode não ter telefone verificado no profile**. O plano roteia "profile → telefone do profile" sem tratar profile sem telefone. Nesse caso a ação por WhatsApp do cobrador não tem como ser validada e deve ser **rejeitada** (cair só no painel), não aceita por engano. **Correção:** especificar: se o alvo da notificação é um cobrador com conta sem telefone verificado, a ação por botão não é roteável → ignora; teste dedicado.

**C5 — Teste de "limite sem corrida" (reengajamento H8.3) ausente.** `_CONTEXTO.md` lista "validação de limite no servidor sem janela de corrida" como ponto crítico. H8.3 fala em "limite de reengajamentos manuais por plano (E11)". O plano coloca como stub e não prevê teste de corrida (dois reengajamentos simultâneos furando o limite). Mesmo sendo stub no MVP, o **mecanismo de contagem** precisa nascer sem corrida. **Correção:** ao menos um teste/nota de que a contagem de reengajamentos usa o mesmo padrão atômico de limite do E11.

### Médios

**M1 — H8.1: a mensagem de encerramento recorrente ("Pagamento deste mês confirmado...") é um critério 🟢 da H8.1, não só da H8.7.** O critério H8.1 traz literalmente o texto do recorrente como exemplo de mensagem. O plano joga `encerramento.recorrente` para "🟡 criar inativo". Como recorrência é 🟡, é aceitável **não enviar** a variante, mas o plano deveria registrar que a mensagem do caso simples (`encerramento.padrao`) é a única ativa no MVP e que a variante recorrente fica pendente, ligando-a explicitamente à H8.7. Está implícito; tornar explícito evita ambiguidade na cobertura da H8.1.

**M2 — H8.3: "essa mensagem passa a ser o último aviso do combinado (os botões dela é que valem, E7 H7.7)" não tem passo concreto de invalidação dos botões anteriores.** O plano menciona "marca essa mensagem como o último aviso (ver E7 H7.7)" mas não diz COMO (o reengajamento não muda o estado e não cria um `envio` de etapa; como o webhook saberá que o último payload válido é o do reengajamento?). H7.7 normalmente se ancora no último `envio`/wamid. Mensagem avulsa não é etapa. **Correção:** especificar o mecanismo (ex.: registrar o `wamid`/identificador do reengajamento como o aviso corrente para o casamento de botões), senão tocar "Já paguei" numa mensagem antiga de ciclo poderia ainda agir. Risco de furar a invariante "só o último aviso age".

**M3 — H8.6: "campo recuperável" guarda `horario_reservado_original`, mas o plano não trata o caso de MÚLTIPLAS reaberturas nem a recorrência.** Se o cobrador reabre, reconfirma e reabre de novo, `horario_reservado_original` precisa continuar válido (não sobrescrito por `null` no segundo ciclo). O plano grava `horario_reservado_original = horario_reservado` ao virar `pago`; na segunda ida a `pago`, `horario_reservado` já foi restaurado, então funciona, mas isso depende da ordem exata e não tem teste. **Correção:** teste de duplo reabrir/reconfirmar preservando o horário; nota de que `horario_reservado_original` nunca é setado para `null`.

**M4 — H8.9 / H8.5: o plano não cobre explicitamente "devedor não confirma o próprio pagamento" no caminho SEM conta.** O plano cita isso em 3.5 (segurança) como nota, mas não há critério-passo nem teste listado para: payload `confirmar:avisoId` chegando do `telefone_devedor` (que é o alvo dos lembretes) deve ser rejeitado. O teste em 3.6 menciona "devedor não confirma (403)" só para o caminho com conta (api). **Correção:** teste dedicado no webhook: remetente == `telefone_devedor` tentando `confirmar` → ignorado.

**M5 — Rename `pendente→programado`: o plano não inventaria TODOS os pontos de `pendente` no código de negócio.** A varredura toca `recebimentos/service.ts` (5 ocorrências de `'pendente'`), o guard de `enviar_lembretes/index.ts` (`status !== 'pendente'`), `repo.ts` do enviar_lembretes, MODULE.md, testes que fazem `update ... set status='pendente'`, e o enum `status_aviso` em `0001`. O plano lista trigger + função de envios + docs + enums, mas **não** lista o guard do scheduler nem os testes existentes que referenciam `'pendente'` como dado. **Atenção:** `billing` (`0019`) usa `'pendente'` como status de **pagamento/cobrança** (outro enum/contexto) — NÃO renomear esses. **Correção:** o passo 1 deve enumerar os arquivos exatos e excluir explicitamente o `'pendente'` de billing para não corromper.

**M6 — H8.1: descarte de envios pendentes "antes de sair" no virar terminal — o plano confia no trigger `encerrar_envios_do_aviso`, mas a janela de 1 min cria uma inconsistência sutil.** Ao virar `pago`, o trigger cancela os `envios` de ciclo imediatamente (correto), mas a mensagem de encerramento só sai 1 min depois. Se o cobrador reabre dentro do minuto, os `envios` de ciclo **já foram cancelados** pelo trigger e a reabertura precisa recriá-los/retomar por catch-up. O plano diz "reabrir volta ao ciclo por catch-up (E6)", o que cobre conceitualmente, mas não alerta que o cancelamento dos envios é **imediato** (não atrasado como a mensagem), então reabrir SEMPRE depende do catch-up recriar, mesmo dentro do minuto. **Correção:** documentar essa assimetria (envios cancelam já; só a mensagem ao devedor atrasa) — o plano até menciona em 3.2 mas não conecta ao fluxo de reabertura dentro do minuto.

### Baixos

**B1 — H8.5 fallback de botões (resposta numerada) via Baileys** é citado como risco do canal na história, mas o plano não cria passo nem nota de fallback. `_CONTEXTO.md` pede prever fallback. Adicionar nota (mesmo que "herda o fallback do E7").

**B2 — Evento de auditoria "com quem confirmou e quando" (H8.1):** o plano nota que `eventos_aviso` grava ator e `criado_em`, mas não confirma se grava o **id do ator** (qual cobrador, em combinado com cobrador sem conta o ator é o telefone). Verificar se `eventos_aviso` tem coluna para identificar o ator concreto além do papel; senão o painel E9 não distingue.

**B3 — Decisão em aberto 1 (enum órfão `pendente`)** é razoável, mas o `ADD VALUE` de enum em Postgres não roda dentro de transação em versões antigas e exige `COMMIT` antes do `UPDATE` que usa o valor novo. O plano deveria notar que a migration `0025` pode precisar separar o `ADD VALUE` do `UPDATE` em statements/migrations distintos (Postgres 18 local; checar no cloud). Risco operacional, não de design.

## 3. Cobertura de critérios de aceite

Todos os critérios H8.x têm ao menos um passo associado. Critérios cobertos de forma **parcial/com ressalva** (não totalmente "sem passo", mas frouxos):

- **H8.1** (mensagem recorrente): variante recorrente adiada (aceitável, é 🟡), mas ligação explícita faltando — ver M1.
- **H8.2** (devedor notificado da rejeição): enfileira, mas sem idempotência/coalescing explícitos — ver C2.
- **H8.3** (último aviso age): mecanismo de invalidação dos botões antigos não especificado — ver M2.
- **H8.5** (telefone do profile / sem conta / devedor não confirma): lacunas C4 e M4.
- **H8.6** (anulação dentro do minuto / múltiplas reaberturas): C1 e M3.
- **H8.9** (ator concreto): B2.

Nenhum critério ficou **totalmente sem passo**; os listados em `criterios_nao_cobertos` abaixo são os que carecem de passo *concreto e testável* apesar de mencionados.

## 4. Testes (pontos críticos)

Cobertos no plano: janela de 1 min, webhook idempotente + anti-vazamento por telefone, drainer SKIP LOCKED, regressão `informado_pago` sem ciclo, migrations.

**Faltando teste dedicado:**
- Corrida claim-do-drainer vs reabertura (C1) — não basta "reconferência genérica".
- Coalescing/espaçamento das mensagens avulsas ao mesmo devedor (C3) — declarado E10 mas a outbox nova precisa de teste de não-duplicação.
- Limite de reengajamento sem corrida (C5).
- Devedor (telefone_devedor) tentando `confirmar` por botão (M4).
- Duplo reabrir/reconfirmar preservando horário (M3).

## 5. Coerência cross-épico

Em geral correta. Dependências E6/E7/E9/E10/E11/E12/E13 bem mapeadas. Ressalvas:

- **Contradição potencial com E10:** o plano cria `mensagens_avulsas` como nova outbox ao devedor; o E10 é dono da "fila de saída com espaçamento 10 min + coalescing" nas outboxes. Risco de duas filas concorrentes ao mesmo destinatário. Decisão em aberto 3 reconhece, mas precisa ser resolvida **com** o dono do E10 antes do passo 4/10 (ver C3).
- **Coordenação com E6 (passo 11, parar ciclo em `informado_pago`):** o plano admite que toca o scheduler do E6. Correto em flaggar, mas é uma mudança que o plano do E6 também reivindica (divergência H6.5 compartilhada) — risco de dois planos editarem o mesmo guard. Deve ficar explícito QUEM implementa (sugiro: E6 implementa, E8 só adiciona o teste de regressão).
- Rename `pendente→programado` é cross-épico (E2/E3/E6); o plano assume a varredura como passo 1 dele. Coerente com `_CONTEXTO.md`, mas atenção ao billing `pendente` (M5) que NÃO é o mesmo enum.

## 6. Aderência às invariantes do Épico 13

- Sem travessão / palavras proibidas / gênero neutro: os textos de exemplo no plano e nas chaves de template estão limpos; a constraint de linguagem da tabela `templates` reforça (plano cita E13). OK, mas a copy final dos novos templates (`encerramento`, `status_alterado`, `rejeicao`, `reengajamento`) precisa passar pelo lint/validação ao salvar — o plano cita, mantenha.
- Centavos / fuso America/Sao_Paulo: o plano mantém valor em centavos e horário reservado em timestamptz/segundo do dia; o "agendado_para = now()+1min" é UTC no banco, correto.
- Sem DELETE de negócio: `eventos_aviso` append-only mantido; `mensagens_avulsas` usa `status='cancelado'` em vez de DELETE — correto.
- Hash sha256 / token nunca persiste / payload leva `aviso_id`: respeitado (payload `acao:avisoId`, sem token).
- Nunca logar telefone/Pix/token: plano reitera. OK.
- JWKS / envelope de erro `{ error: { code, message } }`: mantidos.

Nenhuma violação de invariante detectada; ressalva única é garantir o lint de linguagem nos templates novos (já previsto).
