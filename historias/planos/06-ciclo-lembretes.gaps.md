# Relatório de validação — Épico 6: Ciclo de lembretes

> Revisor crítico (caça-gaps). Fonte da verdade: `historias/06-ciclo-lembretes.md`.
> Afirmações do plano sobre o código foram conferidas lendo: `enviar_lembretes/{index,repo,render}.ts`, `webhook_whatsapp/repo.ts`, `packages/shared/src/datas/index.ts`, `aceite/{service,repo}.ts`, migrations 0003/0004/0011/0017/0024.

## 1. Veredito

**aprovado_com_ressalvas.** O plano cobre bem a espinha dorsal (renomear estado, horário reservado por segundo, retry 20-60s, inversão do `informado_pago`, três botões fixos, catch-up, testes de corrida) e suas afirmações sobre o estado atual do código batem com o que li. Mas há **gaps críticos** que, se não tratados, quebram o ciclo no fluxo invertido e deixam buracos na máquina de estados e na liberação do horário. Devem entrar antes de implementar.

---

## 2. Gaps por severidade

### CRÍTICOS

**G1 — `carregarDados` quebra o ciclo no fluxo invertido (INNER JOIN em `cobrador_id`).**
`enviar_lembretes/repo.ts` carrega os dados do envio com `join public.profiles p on p.id = a.cobrador_id` e lê `p.nome as nome_cobrador`. No fluxo **invertido** (H17, criador = devedor), `cobrador_id` é **nullable** e fica `null` até o cobrador vincular conta; o nome do cobrador vive na coluna dedicada `avisos.nome_cobrador` (migration 0017). Com INNER JOIN, todo aviso invertido com `cobrador_id` null **não retorna linha** → `carregarDados` devolve `null` → o envio é cancelado como `aviso_inexistente`. Ou seja: **o ciclo de lembretes nunca sai para combinados invertidos sem conta de cobrador.** A história (cabeçalho e H6.1) diz explicitamente que o ciclo vale "nos dois fluxos (receber e pagar invertido)". O plano toca esse arquivo (P6/P7) mas **não menciona** o bug. Correção: trocar para `left join` e usar `coalesce(a.nome_cobrador, p.nome)` (ou ler `nome_cobrador` direto), validando que a variável `cobrador` do template é resolvida pela coluna, não pelo join.

**G2 — `recusado` não é produzido por E6, mas o plano nem sinaliza o conflito com H6.4.**
H6.4 lista `recusado` entre os estados terminais que descartam envio, e o `_CONTEXTO.md` confirma `recusado` como estado próprio (E5). O código atual de `webhook_whatsapp/repo.ts` envia a recusa do convite para **`cancelado`** (não `recusado`), e a transição `aguardando_aceite→recusado` não existe no `validar_transicao_aviso` (0011). O plano adiciona `recusado` ao gatilho `encerrar_envios_do_aviso` (M1/P1) e à máquina de estados, **mas não diz** que (a) a transição `aguardando_aceite→recusado` precisa existir para o estado ser alcançável e (b) hoje a recusa cai em `cancelado`. Como E6 só precisa "reconhecer" o estado para parar o ciclo, isso é defensável como dependência de E5, **mas o plano deve registrar explicitamente** que, enquanto E5 não trocar `cancelado→recusado`, o gating por `recusado` é inerte (e que isso não regride o "parar o ciclo", pois `cancelado` já cancela). Sem essa nota, fica a falsa impressão de que H6.4 está coberto por E6.

**G3 — Liberação do horário reservado em opt-out/terminal não está amarrada ao trigger correto, e o opt-out atual vai para `cancelado` (não `desregistrado`).**
H6.4 e H6.9 exigem que, ao entrar em terminal **ou em opt-out**, o `horario_reservado_seg` vire `null` (preservando `_orig`). O plano coloca isso "no trigger (P1)" mas a liberação precisa cobrir **todas** as portas de saída: terminal (`pago/cancelado/expirado/recusado`), opt-out (hoje `cancelado`, futuro `desregistrado` reversível de E7) e expiração no sweep. Pontos não resolvidos pelo plano: (a) se o opt-out futuro é `desregistrado` **reversível** (E7), liberar o segundo nele e depois precisar re-alocar na reativação contradiz a economia do "campo recuperável" — o plano deveria tratar `desregistrado` como **pausa** (suspende, mantém `_orig`) e não como liberação definitiva, igual a `pausado`; isso não está decidido. (b) A liberação por trigger no banco precisa rodar em **toda** transição para terminal, inclusive as disparadas pela própria api (marcar pago/cancelar), não só pelo zap — confirmar que o trigger `after update of status` cobre isso (o `encerrar_envios` já roda aí, então é o lugar certo, mas o plano fala em "trigger (P1)" sem especificar que a liberação de `horario_reservado_seg` entra **nesse mesmo trigger**).

**G4 — Reabertura `pago→programado` reusa `_orig`, mas o índice único global de segundo bloqueia o reuso se o segundo foi tomado.**
H6.9 (penúltimo critério) exige que na reabertura o aviso **reuse o mesmo segundo mesmo que já esteja ocupado** (exceção à unicidade). O plano (M2/P2) cria `create unique index idx_horario_seg_unico ... where horario_reservado_seg is not null`. Esse índice **impede** justamente o reuso que a história manda permitir: se outro aviso pegou o segundo enquanto este estava liberado, o `update` de reabertura para o mesmo `_orig` viola o índice único e falha. O plano cita a "exceção à unicidade" no risco (seção 6) mas **não resolve a contradição** com o índice que ele mesmo propõe. Precisa de uma estratégia concreta: ou o índice único não é viável (validar unicidade só na lógica de alocação, como já se faz com os 10 min), ou a reabertura precisa de um caminho que tolere colisão (e então a unicidade "global" deixa de ser garantida por constraint). Decisão de modelagem em aberto, não sinalizada.

### MÉDIOS

**G5 — H6.8 "resultado visível no painel (estado do envio)" e auditoria: o plano marca `[x]` mas a inversão do `informado_pago` muda o que o painel vê.**
Ao cancelar os envios normais quando entra `informado_pago` (P6), esses envios passam a `cancelado`. H6.5/H6.6 dizem que o acompanhamento segue no painel; o plano deveria especificar que cancelar os envios não pode poluir o `CycleTimeline` do E9 com "cancelado" onde o usuário espera "parou porque informou pagamento". É um ponto de contrato com E9 que o plano não trata (só diz "alimenta E9").

**G6 — Retry: índice base do backoff e contagem das 3 tentativas.**
H6.8 pede "até 3 tentativas, intervalo aleatório 20-60s entre cada". O código atual (`reagendarOuFalhar`) usa `BACKOFF_MIN[proxima]` com `proxima = tentativasAtuais+1`, ou seja o primeiro reagendamento usa índice 1, não 0 (sutileza de off-by-one herdada). Ao trocar para "random 20-60s" (P10) o plano deve garantir que continuam sendo **3 tentativas de envio no total** (não 3 reagendamentos = 4 envios) e definir se o intervalo é sorteado por tentativa (cada reagendamento sorteia um novo 20-60s). O plano diz só "substituir a fórmula" sem fixar a semântica do limite, que é justamente o ponto crítico do `_CONTEXTO.md` ("limite sem corrida"). Adicionar critério explícito no teste: exatamente 3 envios tentados, nunca 4.

**G7 — `janelaPerdida` + horário reservado: interação não revisada.**
`enviar_lembretes/index.ts` descarta o envio se `janelaPerdida` (passou 23:59 SP do dia da etapa). Com o horário reservado sempre dentro de 08:00-18:00, isso continua coerente, mas o plano reescreve `calcularAgendamentos` (P4) e não menciona reavaliar `janelaPerdida` para o empurrãozinho de D+1 em `informado_pago` (que pode ser agendado tarde) nem o caso de retry que cruza a meia-noite (envio agendado às 17:59:50, falha, reagenda +40s → ainda no mesmo dia; mas perto das 23:59 um retry poderia cair fora da janela do dia seguinte). Risco pequeno mas não coberto.

**G8 — H6.9 "se não couber 10 min, fallback registrando que o espaçamento ideal não coube".**
A história pede **registrar** que o espaçamento de 10 min não coube (auditoria). O plano implementa o fallback aleatório mas **não menciona o registro** desse fato. Sem campo/evento, perde-se a observabilidade que a história pede. Adicionar (evento ou flag/log não-sensível com `aviso_id`).

**G9 — Ordem de aplicação no cloud e `alter type ... rename value` dentro de transação.**
P1 faz `alter type status_aviso rename value 'pendente' to 'programado'` + `add value`. No Postgres, `ALTER TYPE ... ADD VALUE` historicamente **não pode rodar e ser usado na mesma transação** (em versões mais novas relaxou, mas o pipeline de migrations e o `validate_migrations.sh` podem rodar em transação). O plano não sinaliza esse risco operacional (CLAUDE.md frisa rodar `validate_migrations.sh` e `db push` no cloud). Como o rename do enum e a reescrita de funções que referenciam o valor antigo precisam estar coordenados, vale separar `ADD VALUE` em migration própria ou usar `COMMIT` entre os passos. Não tratado.

**G10 — `marcarFalhou` incrementa `tentativas`, e `reagendarOuFalhar` também; revisar a contagem ao mudar o retry.**
Em `marcarFalhou` o `tentativas=tentativas+1`; em `reagendarOuFalhar` o caminho de falha definitiva chama `marcarFalhou` (incrementa) após já ter `proxima=tentativasAtuais+1`. Ao reescrever o timing (P10), confirmar que a contabilidade de `tentativas` permanece consistente para o teste "exatamente 3". O plano não detalha.

### BAIXOS

**G11 — H6.2 "tom leve" e exemplos da história vs textos atuais.** O plano marca `[~]` e empurra a copy para E12/E13. Aceitável, mas a história dá textos-exemplo específicos (D-2 com "[quem recebe] pediu pra te lembrar"); ao migrar templates (P9), garantir que a variável `cobrador` vira "quem recebe" de forma neutra e que o invertido (criador=devedor) não gere texto sem sentido ("você pediu pra te lembrar"). Não há nota sobre o invertido na copy.

**G12 — `valoresCiclo` injeta `pix_chave` no mapa de variáveis mesmo sem uso no texto.** Inócuo, mas ao remover a supressão de `ver_pix` (P8) confirmar que nenhum template passa a vazar `pix_chave` no corpo (invariante: nunca logar/expor Pix indevidamente; aqui é conteúdo de mensagem ao próprio devedor, ok, mas validar que não entra em log).

---

## 3. Cobertura dos critérios de aceite

| História | Coberto pelo plano? |
|---|---|
| H6.1 | Sim (P1, P4, P5). |
| H6.2 | Sim (P8 botões fixos, P9 rótulos). Ressalva G11 (invertido na copy). |
| H6.3 | Sim (P8/P9). |
| H6.4 | **Parcial** — terminal/pausa cobertos (P1/P7); `recusado` inerte sem E5 (G2); liberação de horário em opt-out/`desregistrado` ambígua (G3). |
| H6.5 | Sim (P6). Ressalva: empurrãozinho no invertido quebra por G1. |
| H6.6 | Sim (P1/P4). |
| H6.7 | Sim (P4). Ressalva G7 (retry cruzando dia). |
| H6.8 | **Parcial** — retry coberto (P10) mas semântica do limite/contagem não fixada (G6, G10). |
| H6.9 | **Parcial** — alocação coberta (P2/P3); reuso na reabertura contradiz o índice único (G4); registro do fallback de 10 min ausente (G8); liberação amarrada de forma vaga (G3). |
| H6.10 | Sim, gated/dívida (P14). |

**Critérios sem passo claro no plano:** registro do fallback dos 10 min (H6.9), reuso de segundo na reabertura sem violar a unicidade (H6.9), funcionamento do ciclo no fluxo invertido (cabeçalho + H6.1, bloqueado por G1).

---

## 4. Testes

Pontos críticos do `_CONTEXTO.md` com teste dedicado no plano (seção 3.7/P13):
- Corrida na alocação de segundo (mesmo devedor 10 min + unicidade global): **coberto** (bom).
- Wrap 18→8, fallback aleatório, `_orig`/reabertura: **coberto** parcialmente — falta teste do **reuso que colide com o índice único** (G4) e do **registro do fallback de 10 min** (G8).
- Idempotência `SKIP LOCKED` / toque duplo / reinício: **coberto**.
- Reconferência de estado no disparo (terminal/pausa descarta): **coberto**.
- Inversão `informado_pago` (só empurrãozinho; nada depois de D+1; rejeição retoma): **coberto**.
- DST: coberto.

**Faltam testes dedicados para:** (a) ciclo completo no fluxo **invertido** (G1) — hoje passaria batido porque os testes existentes usam fluxo receber; (b) retry: **exatamente 3 tentativas, nunca 4**, com intervalo no range 20-60s (G6/G10); (c) liberação de `horario_reservado_seg` em **cada** porta de saída (terminal via api, opt-out, expiração) preservando `_orig` (G3).

---

## 5. Coerência cross-épico

- Dependências E5/E12/E11/E8/E9/E10 listadas corretamente.
- **Contradição a resolver:** a regra dos 10 min/devedor (H6.9) e a fila de saída com espaçamento 10 min + coalescing (E10 H10.9) são tratadas como "par" — coerente, mas são **outboxes diferentes** (`envios` vs `notificacoes_cobrador`) com mecânicas distintas; o plano não deve sugerir compartilhar a lógica de alocação de segundo entre elas (uma é horário reservado fixo por aviso, a outra é espaçamento dinâmico por destinatário com coalescing). Risco de over-engineering se misturar; o plano não confunde, mas vale a nota.
- `desregistrado` (E7) reversível: o plano deve alinhar com E7 que, no opt-out, o ciclo **suspende** (não libera o segundo) — caso contrário a reativação de E7 perde o horário (G3). Coordenar com o plano de E7 para não divergir.

---

## 6. Aderência às invariantes do Épico 13

- Sem travessão / palavras proibidas / gênero neutro: o plano sinaliza para o empurrãozinho e rótulos novos (3.6). OK; conferir o texto do empurrãozinho da história (usa "[nome de quem recebe]", neutro) e o caso invertido (G11).
- Centavos / fuso SP / cálculo no servidor: respeitados (alocação e agendamento no servidor; valor via `formatarValorBr`, data via `formatarDataBr`).
- Nunca logar telefone/Pix/token: o plano manda auditar os logs do alocador (logar só `aviso_id`/segundo). OK; reforçar no G8 que o registro do fallback de 10 min também não pode logar telefone.
- Sem DELETE de negócio: o plano **cancela** envios (status), não apaga — correto. Templates podem ser editados (exceção permitida). OK.
- Botão leva `aviso_id` no payload, webhook idempotente por estado: confirmado no código (`acao:avisoId`), mantido.

---

## 7. Recomendação de modelos

Sensata em geral: `opus` para máquina de estados, alocador por segundo, corrida, inversão do `informado_pago`, agendamentos/DST; `sonnet` para rótulos, retry isolado, docs, frontend. **Ressalva:** P10 (retry) está como `sonnet`, mas como toca o ponto crítico "limite sem corrida" (G6/G10) e a contabilidade de tentativas, o **teste** correspondente deve ser `opus` (já está dentro de P13 opus). P7 (reconferência + liberação) como `opus` é correto dado G3/G4.
