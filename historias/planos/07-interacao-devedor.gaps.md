# Validação de gaps: Épico 07 — Interação do devedor

> Revisão adversarial do plano `historias/planos/07-interacao-devedor.plano.md` contra a fonte da verdade `historias/07-interacao-devedor.md` e o estado real do código (grafo + leitura de `webhook_whatsapp`, `acoes_devedor`, migrations, `baileys_client`).

## 1. Veredito

**Aprovado com ressalvas.**

O plano é forte: o diagnóstico "estado atual vs história" (seção 2) bate com o código real em todos os pontos que verifiquei (opt-out cai em `cancelado` na api e no zap; `horario_reservado` não existe em nenhuma migration; `desregistrado`/`reativacao` não existem no enum; `titular`/`banco` ausentes em `chaves_pix`; `solicitou_pix` gravado a cada toque; `EventoBotao.wamid` é o id da **resposta** do devedor, não da mensagem citada; texto livre descartado sem distinção de plano). A modelagem (estado novo, controle de entrega, vínculo clique→envio) é sensata e as decisões em aberto são honestas (implementação, não produto). As ressalvas abaixo são detalhes de cobertura de critério e de teste que, se ignorados, deixam buracos no comportamento exigido pela história.

## 2. Gaps por severidade

### Críticos

- **[G-C1] H7.1 / H7.2: "menu por combinado" e "silêncio total **por combinado** após Já paguei" não estão modelados com a granularidade que a história exige.**
  A história (H7.1) diz que o menu do plano pago é "referente ao(s) **combinado(s) ativo(s)**" e a H7.2 diz que, após "Já paguei", o devedor "**não recebe nada (nem confirmação, nem menu, mesmo no plano pago)**". O passo 10 fala em "localiza combinados ativos do telefone, responde menu (pago) ou nada (free)", mas não resolve: (a) o menu deve **excluir** os combinados já em `informado_pago` (senão um texto livre re-oferece ações de um combinado que já está silenciado); (b) o silêncio da H7.2 é **por combinado**, não global, então um devedor com 2 combinados (um em `informado_pago`, outro `pendente`) ainda deve ver no menu o combinado pendente. Como o texto livre não traz `aviso_id`, a regra "silêncio total após Já paguei" só faz sentido **se todos** os combinados ativos do número estiverem em `informado_pago` → aí silêncio; senão menu só dos que ainda agem. **Correção:** o passo 10 deve definir explicitamente que o menu lista apenas combinados em estado que **ainda aceita ação** (exclui `informado_pago`, terminais e `desregistrado`), e que o silêncio ocorre quando não sobra nenhum. Adicionar teste para "1 informado_pago + 1 pendente → menu só do pendente".

- **[G-C2] H7.7: estados terminais `recusado` e `expirado` não estão na máquina de estados atual, e o plano não garante que o trigger/repo os trate como terminais para os 3 botões.**
  A história H7.7 lista os terminais como `pago, cancelado, recusado, expirado`. O enum atual (`0001_enums.sql`) tem só `aguardando_aceite, pendente, pago, cancelado, expirado` — **não tem `recusado`** (ele aparece como `tipo_evento` na 0017, mas como `status` o código manda recusa para `cancelado`, ver `repo.ts` linha 56). O passo 8 menciona "tratar `recusado`/`expirado`" en passant, mas nenhum passo cria/garante o **status** `recusado` nem confirma que `expirado` é alcançável. **Correção:** confirmar com o Épico 5 (dono de `recusado`) se `recusado` vira status próprio; se sim, este plano deve listar `recusado` na lista de terminais que disparam a resposta de cortesia da H7.7; se a recusa continua caindo em `cancelado`, documentar que H7.7 cobre `recusado` via `cancelado`. Não deixar ambíguo: a cortesia "combinado já encerrado" precisa cobrir **todos** os 4 terminais da história.

- **[G-C3] H7.3: ambiguidade na reentrega quando só a 2ª mensagem (titular+banco) falha.**
  A história pede "duas mensagens em sequência" e "entrega uma vez por combinado, reenvio só após falha de servidor confirmada". O plano marca `entrega_chave_status` como `null|entregue|falhou` (passo 2/3.1.4) e nos riscos nota "marcar entrega antes de soltar a 2ª". Mas o critério da história é satisfeito só quando **as duas** mensagens chegaram. Se a 1ª (chave) entrega e a 2ª (titular+banco) falha após os retrys, o estado `entregue` esconde uma entrega parcial e o devedor fica sem titular/banco. **Correção:** o passo 9 deve definir que `entrega_chave_status='entregue'` só após **confirmação de ambas**; ou modelar duas marcas; ou, no mínimo, registrar a falha da 2ª como reentregável. Adicionar teste "1ª ok, 2ª falha → reentregável".

### Médios

- **[G-M1] H7.6: a história diz "telefone que respondeu corresponde ao alvo do combinado (`telefone_devedor`)". No fluxo invertido (pagar), o alvo dos lembretes ainda é `telefone_devedor`** (convenção do CLAUDE.md), e a validação do passo 7 está correta ao usar `telefone_devedor`. **Mas** o `repo.aplicarAcaoBotao` atual reusa o mesmo caminho para `aceite`/`recusa`, onde quem tapa é o **convidado** (pode ser o cobrador no invertido, `telConvidado`). O passo 7 precisa explicitar que a validação `telefone == telefone_devedor` se aplica **só aos três botões do ciclo** (ja_paguei/ver_pix/optout/ativar), não a aceite/recusa (que validam contra `telConvidado`). Sem isso, o plano arrisca barrar o aceite do cobrador no invertido. **Correção:** condicionar a validação à ação.

- **[G-M2] H7.5: a história diz "a reativação retoma o ciclo pela etapa aplicável à data (catch-up)". Falta cobrir o caso em que a data combinada já passou** (combinado vencido) na hora de reativar: catch-up pode não gerar nenhuma etapa futura (todas D-2..D+1 já passaram). O plano (passo 5) diz "recria envios por catch-up filtrando etapas ainda aplicáveis" mas não define o comportamento quando o resultado é vazio (reativar para um combinado já vencido: fica em `programado` sem nenhum envio? envia um lembrete imediato?). **Correção:** definir o degenerate case e adicionar teste.

- **[G-M3] H7.2: idempotência de "não cria notificação duplicada" não tem teste explícito para o caminho da notificação.**
  A história H7.2 exige que re-tap "não cria evento/notificação duplicados". A idempotência por estado já garante isso (em `informado_pago`, `ja_paguei` retorna `aplicado:false`), mas o teste do §3.6 cita "sem 2º evento/notificação" só para o re-tap simples. Falta o cenário de **corrida** (dois "Já paguei" simultâneos) provando que só **uma** linha em `notificacoes_cobrador` é criada. O passo 14/§6 cobre corrida genérica de `for update`, mas não nomeia a outbox de notificação. **Correção:** incluir asserção sobre `notificacoes_cobrador` no teste de corrida.

- **[G-M4] H7.4: "horário reservado setado para `null`" depende de E6 (campo inexistente). O plano deixa como TODO até E6, o que é honesto, mas o critério da H7.4 fica não cumprido no MVP deste épico se E6 não vier antes.** O plano deve ser explícito de que H7.4 (e H7.5 novo horário) **não fecham** sem E6 H6.9 — está dito na seção 5 mas não refletido no critério de aceite do passo 4 (que só cita H7.4 sem ressalva). **Correção:** marcar no passo 4/5 que o sub-critério "zerar/pegar horário reservado" fica gated em E6.

- **[G-M5] H7.1: a história fala em payload "autenticado por HMAC". O plano (seção 2 H7.1, `[~]`) documenta corretamente que o canal Baileys autentica por sessão pareada, não por HMAC HTTP, e propõe "documentar a equivalência". Bom — mas nenhum passo da seção 4 carrega essa documentação** (só o passo 15 genérico de docs). **Correção:** anexar ao passo 15 a nota explícita "HMAC da história = equivalência com canal Baileys autenticado por sessão" em PROJETO.md/CLAUDE.md, para não parecer que o critério HMAC foi ignorado.

### Baixos

- **[G-B1] H7.3: o rótulo do botão sem a palavra "Pix" (passo 12/13) muda também o **template do ciclo (0024)**, não só o catálogo do front e a resposta. O plano cita `catalogo_mensagens.ts` e o rótulo, mas a migration 0024 (`conteudo.botoes.ver_pix`) também tem o rótulo. **Correção:** o passo 13 deve incluir a migration de catálogo que corrige o rótulo no template do **ciclo**, não só as chaves de resposta novas.

- **[G-B2] H7.7: "aviso_id inválido ignorado sem vazar" — o plano confirma que não vaza, mas não cobre o **rate limit / flood** de buttonIds inválidos (alguém martelando o webhook). Fora do escopo estrito da história, mas vale uma nota de risco.

- **[G-B3] Linguagem (E13): o texto exemplo da H7.5 da própria história usa "registrado/desregistrado". O plano propõe label de front "Pausado pelo destinatário" — cuidar para não introduzir conotação. "Sem lembretes" é mais seguro. Apenas confirmar neutralidade de gênero em todos os templates novos (`menu_opcoes`, `encerrado`, `ver_pix_titular`, `reativacao`) no passo 13 — está citado, ok.

## 3. Cobertura dos critérios de aceite

Todos os critérios H7.1..H7.7 têm passo correspondente no plano. Critérios cobertos parcialmente / com ressalva (não "sem passo", mas incompletos):

- **H7.1** menu por combinado ativo / silêncio por combinado: passo 10, **incompleto** (G-C1).
- **H7.2** sem notificação duplicada em corrida: passo 14, **teste incompleto** (G-M3).
- **H7.3** reentrega de entrega parcial (2ª falha): passo 9, **ambíguo** (G-C3); rótulo no template do ciclo: passo 13, **incompleto** (G-B1).
- **H7.4** zerar horário reservado: gated em E6, **critério não fechável neste épico isolado** (G-M4).
- **H7.5** catch-up com combinado vencido (resultado vazio): passo 5, **caso não definido** (G-M2).
- **H7.6** validação de telefone condicionada à ação (não barrar aceite invertido): passo 7, **precisa ressalva** (G-M1).
- **H7.7** terminais `recusado`/`expirado`: passo 8, **ambíguo quanto a status `recusado`** (G-C2).

Nenhum critério ficou **sem nenhum passo**.

## 4. Testes

Os pontos críticos têm teste dedicado previsto (§3.6 e passo 14): idempotência de "Já paguei" re-tap, ver_pix duas mensagens + intervalo + `solicitou_pix` 1x + entrega única + reentrega só em falha, opt-out→`desregistrado`, reativar→`programado` + recriação de envios, telefone divergente, botão de aviso antigo inerte, terminal→cortesia/silêncio, `aviso_id` inválido sem vazar, transições no trigger, e **corrida** (dois toques no mesmo `aviso_id`; reativação concorrente com drenagem da notificação de saída).

Lacunas de teste a fechar:
- Corrida provando **uma única** linha em `notificacoes_cobrador` (G-M3).
- "1 combinado em informado_pago + 1 pendente → menu só do pendente" (G-C1).
- "1ª mensagem do Pix ok, 2ª falha → reentregável" (G-C3).
- Reativação de combinado vencido (catch-up vazio) (G-M2).

## 5. Coerência cross-épico

Correta e sem contradições graves. Dependências bem mapeadas: E6 (horário reservado H6.9, catch-up H6.7) como bloqueante parcial; E10 (janela 1 min, anulação/2ª notificação, coalescing H10.9) como dono da janela — este épico só enfileira sinais, o que evita duplicar a lógica crítica de coalescing; E8 (ciclo de `informado_pago`); E5 (terminal `recusado`, remoção do site → `acoes_devedor` vira fallback); E2/E3 (coleta de titular+banco); E12/E13 (templates/linguagem). A renomeação global `pendente→programado` é tratada com compatibilidade (usar o nome vigente no banco), coerente com a nota do _CONTEXTO.md de que "a varredura toca trigger + app + docs".

Ponto a vigiar (não contradição, coordenação): G-C2 — o **status** `recusado` é dono do E5; este plano não deve criá-lo unilateralmente; deve apenas consumir o que E5 decidir.

## 6. Aderência às invariantes do Épico 13

- **Sem travessão / palavras proibidas / gênero neutro:** plano cita validação por CHECK + `linguagem.ts` nos templates novos (passo 13, §3.6). O próprio plano não usa travessão. OK; reforçar G-B3.
- **Centavos / fuso:** não toca dinheiro diretamente; datas/etapas via `calcularAgendamentos` (servidor), nunca no cliente. OK.
- **Hash sha256 / nunca logar sensível:** validação de telefone e segunda mensagem de Pix com auditoria de log (passos 7, 9, 10, §3.5). `acoes_devedor` usa `sha256Hex(token)`. OK; titular/banco (novos) incluídos na regra de "nunca logar".
- **Sem DELETE de negócio / append-only:** `desregistrado` é estado (não apaga), eventos append-only, sem DELETE novo. OK.
- **Estado terminal nunca mais envia / opt-out sempre visível:** botão `optout` em todo template do ciclo; terminal não reabre. OK.

Aderência boa; sem violação de invariante.

## 7. Recomendação de modelo por passo

Sensata. `opus` concentrado na máquina de estados/trigger (1), modelagem de "último aviso"/entrega (2), opt-out/reativação (4,5), validação de telefone (7), núcleo H7.7 (8), sequência temporizada do Pix (9), texto livre/menu (10) e testes de corrida (14). `sonnet` para colunas nullable (3), wiring de ação/rótulo (6), alinhamento api (11), labels de front (12), conteúdo de template (13) e docs (15). Coerente com o _CONTEXTO.md (opus para estados/scheduler/fila/segurança). Sem reparos.
