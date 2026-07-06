# Plano de desenvolvimento: Épico 07 — Interação do devedor (Já paguei / Chave de Pag. / Desativar lembretes)

> Fonte da verdade: `historias/07-interacao-devedor.md`. Onde o código diverge, o plano descreve como mudar o código para bater com a história.
> Contexto base: `historias/planos/_CONTEXTO.md`.

---

## 1. Resumo do épico e escopo

O devedor **não conversa**: só interage pelos **três botões** que acompanham toda mensagem do ciclo (E6): **Já paguei**, **Chave de Pag.** e **Desativar lembretes**. Cada toque chega ao `zap` pelo webhook HTTP da Meta (autenticado por HMAC, `X-Hub-Signature-256`), carrega o **`aviso_id`** no `buttonId`/payload (`acao:<avisoId>`), nunca o token. O épico define o que cada botão faz e a resposta ao devedor, mais a **idempotência**, o **roteamento ao combinado certo por `aviso_id`** (não pelo "último chat"), a regra de **só o último aviso enviado age**, e o estado novo **`desregistrado`** (opt-out reversível).

**MVP (🟢, tudo neste épico é 🟢):**
- H7.1 só age por botão; texto livre: free silêncio, pago menu de opções; respeito a linguagem.
- H7.2 "Já paguei" → `informado_pago`, para o ciclo, notifica cobrador (E10), confirmação, **idempotente e silencioso na repetição**.
- H7.3 "Chave de Pag.": duas mensagens (chave; depois titular + banco, até 3s), `solicitou_pix` só no 1º toque, **uma vez por combinado** (reenvio só após falha confirmada de servidor), não muda estado, nada de Pix em log.
- H7.4 "Desativar lembretes" → `desregistrado`, zera horário reservado, confirmação com botão "Ativar lembretes", notificação ao cobrador **atrasada 1 min** (E10), não apaga, não terminal.
- H7.5 "Ativar lembretes" → `desregistrado → programado`, pega novo horário reservado, mensagem sem botão, catch-up por etapa da data, notificação ao cobrador conforme a janela.
- H7.6 toque sempre cai no combinado certo (por `aviso_id`); valida telefone == `telefone_devedor`; idempotente; auditoria.
- H7.7 só os botões do último aviso agem; terminal não reabre; `aviso_id` inválido ignorado sem vazar.

**Gated (🟡):** nenhum item gated **neste** épico. Dependências gated estão em outros épicos (horário reservado E6 H6.9; janela de 1 min e roteamento conta/telefone da notificação E10).

**Fora de escopo:** o **conteúdo/canal/janela** das notificações ao cobrador (E10); o ciclo de vida de `informado_pago` e a confirmação/rejeição do cobrador (E8); abrangência/compliance do opt-out (E13); como os eventos aparecem no painel (E9).

---

## 2. Estado atual vs história (por critério, baseado no código real)

Legenda: `[x]` ok · `[~]` parcial · `[!]` diverge (refatorar) · `[+]` não existe.

Arquivos centrais inspecionados: `apps/zap/src/modules/webhook_whatsapp/{service,repo,index}.ts`, `apps/zap/src/shared/meta_client/{inbound,tipos,index}.ts`, `apps/zap/src/shared/templates/index.ts`, `apps/zap/src/modules/notificar_cobrador/{repo,render}.ts`, `apps/api/src/modules/acoes_devedor/service.ts`, migrations `0001/0003/0004/0010/0011/0012/0014/0016/0024`.

### H7.1 Só age por botão (sem chat)
- `[x]` Únicas ações = os três botões: o inbound só extrai clique (`meta_client/inbound.ts::extrairBotao`); texto livre é descartado. Os três botões já vivem no template do ciclo (`migration 0024`, `conteudo.botoes` = `ja_paguei`/`ver_pix`/`optout`).
- `[+]` Texto livre no **plano pago** → **menu de opções** dos combinados ativos: não existe (texto livre é sempre descartado, sem distinção de plano).
- `[x]` Texto livre no free / sem conta → silêncio: é o comportamento atual (descarte total).
- `[x]` Toque é evento autenticado, payload com `aviso_id`: `parsearPayloadBotao` valida `acao:<uuid>`; autenticidade vem do webhook HTTP da Meta com validação HMAC (`X-Hub-Signature-256`).
- `[~]` Linguagem: respostas vêm de templates (sem strings fixas no código), mas o **menu** (novo) e as respostas de **encerrado** (novas) precisam ser templates com linguagem limpa.

### H7.2 "Já paguei"
- `[x]` Botão em todas as etapas (template uniforme do ciclo, 0024).
- `[x]` `pendente → informado_pago` + para o ciclo (trigger `encerrar_envios_do_aviso` NÃO cancela em `informado_pago`, e o repo só transiciona; lembretes seguem por design). Confere com E6 H6.5.
- `[~]` Cobrador notificado: enfileira `notificacoes_cobrador` (repo linhas 103-108) **só se `cobrador_id` não-nulo**; no invertido sem conta não enfileira (TODO no código). Roteamento/atraso é E10.
- `[x]` Resposta neutra de confirmação: template `resposta.ja_paguei`.
- `[~]` **Idempotente e silencioso na repetição**: o repo NÃO reaplica (`status != 'pendente' → aplicado:false`), e o service só envia se `aplicado` (service linha 69). MAS hoje, em `informado_pago`, o `ver_pix`/`optout` ainda agem e respondem — H7.2 pede silêncio só para o **re-tap de "Já paguei"**, o que já ocorre. Falta cobrir o caso "último aviso" (H7.7) e o caso de `aviso_id` de mensagem antiga.
- `[x]` Evento append-only (`ja_paguei_devedor`).

### H7.3 "Chave de Pag." (ver o Pix)
- `[!]` Rótulo "não contém Pix": o template (0024) e o front (`catalogo_mensagens.ts`) usam "Ver chave Pix" / "Ver Pix". Diverge da regra "o rótulo não contém a palavra Pix". Rótulo editável pelo owner (E12) já existe.
- `[!]` **Titular + banco**: a chave salva é só `avisos.pix_chave` (text) e `chaves_pix` tem `chave/tipo/rotulo`, **sem titular nem banco**. A 2ª mensagem (titular + banco) não tem dados. (Divergência do épico; captura em E2/E3.)
- `[!]` **Duas mensagens em sequência (até 3s)**: hoje envia **uma** mensagem (`resposta.ver_pix` com `{pix_chave}`). Não há 2ª mensagem nem o intervalo.
- `[~]` `solicitou_pix` só no 1º toque: o evento é gravado **a cada toque** (repo linha 114), não "só no primeiro". Diverge.
- `[!]` **Entrega uma vez por combinado** (reenvio só após falha de servidor): hoje reenvia a cada toque. Não há marca de "chave já entregue".
- `[x]` Não muda estado (`ver_pix` retorna `novoStatus` igual; nenhum `update` de status).
- `[~]` Chave/nome/banco nunca em log: hoje não loga a chave; falta garantir que titular/banco (novos) também nunca entrem em log.

### H7.4 "Desativar lembretes"
- `[x]` Botão em toda mensagem (template do ciclo, `optout`).
- `[!]` **Estado**: hoje opt-out vai para **`cancelado`** (terminal) — tanto no zap (`webhook_whatsapp/repo.ts` linha 121) quanto na api (`acoes_devedor/service.ts` linha 50). O alvo é **`desregistrado`** (reversível). Diverge.
- `[~]` Abrangência só este combinado: já é por `aviso_id`, ok; mas como hoje cai em `cancelado`, o trigger cancela os envios — comportamento certo de parar, estado errado.
- `[+]` **Zerar horário reservado**: o campo `horario_reservado` **não existe** (depende de E6 H6.9). Setar `null` não tem onde acontecer.
- `[!]` Confirmação **com botão "Ativar lembretes"**: hoje `resposta.optout` é texto sem botão. Falta o botão + payload `ativar:<avisoId>`.
- `[+]` Notificação ao cobrador atrasada 1 min (E10): hoje opt-out não notifica o cobrador de forma alguma; a janela é nova.
- `[!]` Não-DELETE: ok (estado, não apaga). Mas `cancelado` é terminal e impede reativar; precisa do estado `desregistrado`.
- `[x]` Evento `optout` registrado.

### H7.5 Reativar lembretes
- `[+]` Botão/payload "Ativar lembretes" (`ativar`): a ação não existe em `ACOES_BOTAO`.
- `[+]` `desregistrado → programado`: estado e transição não existem.
- `[+]` Novo horário reservado na reativação: depende de E6 H6.9 (campo inexistente).
- `[+]` Mensagem de reativação sem botão (template `resposta.reativacao`): não existe.
- `[+]` Notificação ao cobrador conforme janela (anula dentro de 1 min; 2ª notificação se já saiu): lógica de E10, ainda não existe.
- `[+]` Catch-up por etapa da data (E6 H6.7): a recriação de envios na reativação não existe.
- `[+]` Evento de reativação: não há `tipo_evento 'reativacao'`.

### H7.6 O toque sempre cai no combinado certo
- `[x]` Usa `aviso_id` do payload (não "último chat"): `parsearPayloadBotao` + lookup por `id`.
- `[x]` Vários combinados no mesmo telefone → só o do botão: o lookup é por `id`, isola.
- `[!]` **Validação telefone == `telefone_devedor`**: o `EventoBotao` traz `telefone`, mas `processarBotao` **não o compara** com o alvo do aviso. Qualquer número que envie um `buttonId` válido aplica a ação. Diverge (segurança).
- `[~]` Idempotente + auditoria: idempotência por estado existe; falta a regra "último aviso" (H7.7) e o filtro de telefone.

### H7.7 Só o último aviso age; encerrado/inválido
- `[+]` **Só o último aviso enviado age**: não há vínculo entre o clique e qual envio o originou. O `buttonId` é `acao:<avisoId>` (sem etapa/`envio_id`); o `EventoBotao` traz o `wamid` da **resposta** do devedor (`m.key.id`), não o `wamid` da mensagem **citada/respondida**. Não dá para saber se foi o último aviso. Diverge (núcleo do épico).
- `[~]` Vale p/ os três botões inclusive "Chave de Pag.": consequência do item acima + "uma vez por combinado" (H7.3).
- `[x]` Terminal não reabre: estados não-ativos retornam `aplicado:false` (repo linhas 85-87). Falta adicionar `desregistrado` à lista de "não-ativo para Já paguei" e tratar `recusado`/`expirado`.
- `[+]` **Resposta neutra "combinado já encerrado"** (cortesia free/pago): hoje terminal → `aplicado:false` → **nenhuma** resposta. Falta a resposta de cortesia condicionada a plano.
- `[~]` `aviso_id` inválido ignorado sem vazar: `parsearPayloadBotao` retorna `null` e `processarBotao` sai cedo; `aplicarAcaoBotao` retorna `null` para id inexistente. Não vaza. Ok, mas confirmar que nada é logado.

---

## 3. Trabalho por camada

### 3.1 Arquitetura / Dados (migrations, estados, índices)

1. **Estado `desregistrado`** (migration nova `0025_desregistrado.sql`):
   - `alter type status_aviso add value if not exists 'desregistrado';`
   - Atualizar `validar_transicao_aviso()` (substituindo a versão da 0011): acrescentar `programado/pendente → desregistrado` e `desregistrado → programado/pendente`. Manter compat com `pendente` enquanto a renomeação global `pendente→programado` (cross-épico) não passou: usar o nome vigente no banco no momento da migration.
   - Atualizar `encerrar_envios_do_aviso()` (0004): hoje cancela envios em `pago/cancelado/expirado`. `desregistrado` **também** deve cancelar/parar os envios pendentes (parar de enviar), mas **sem** ser terminal. Acrescentar `desregistrado` ao `if`, e garantir que a **reativação** recrie os envios (não há "descancelar"). Decisão de modelagem: ou recriar envios no app na reativação (catch-up), ou marcar `status='cancelado'` e recriar — preferir recriar via `calcularAgendamentos` no app (igual ao aceite).
   - Manter espelho em `packages/shared/src/contracts/enums.ts` (`statusAviso`) e no front (`frontend/src/shared/contracts/enums.ts`).
2. **Eventos novos** (`tipo_evento`): `reativacao` (e confirmar que `optout`/`solicitou_pix`/`ja_paguei_devedor` cobrem o resto). Migration + `enums.ts` dos dois lados.
3. **Titular + banco do Pix** (divergência H7.3): a captura é dos Épicos 2/3, mas o **dado** precisa existir para a 2ª mensagem. Acrescentar `titular` e `banco` em `chaves_pix` e propagar para o aviso. **Decisão de modelagem (sinalizar):** snapshot no `avisos` (colunas `pix_titular`/`pix_banco`, como `pix_chave` já é snapshot) vs join em `chaves_pix`. Recomendado: snapshot no aviso, coerente com `pix_chave`. Migration `0026_pix_titular_banco.sql`. **Este épico só consome**; a coleta no formulário é E2/E3. Marcar dependência.
4. **Controle "chave entregue uma vez por combinado" e "último aviso"** (H7.3 + H7.7) — **núcleo**:
   - "Chave entregue": coluna `avisos.chave_entregue_em timestamptz null` (ou evento `solicitou_pix` consultado como marca). Recomendado: derivar de `eventos_aviso` (já existe `solicitou_pix`) **+** flag de entrega bem-sucedida. Como a entrega pode falhar (reenvio só após falha de servidor), guardar `entrega_chave_status` no aviso (`null|entregue|falhou`) é mais simples que reconstruir do evento. Migration.
   - "Último aviso": vincular o clique ao envio que o originou. Caminho recomendado: incluir a **etapa** no `buttonId` (`acao:<avisoId>:<etapa>`) e comparar a etapa clicada com o **último envio enviado** do aviso (max `enviado_em`). Alternativa: capturar no inbound o id da mensagem **citada** (a Meta expõe `context.id` na resposta) e cruzar com `envios.wamid`. A 1ª é mais robusta (não depende de o cliente citar a mensagem). Sinalizar a decisão. Em ambos os casos: índice/consulta do "último envio" por `aviso_id`.
5. **Grants/RLS:** nenhuma tabela nova de negócio; só novas colunas em tabelas já com policy. `whaviso_zap` já tem update em `avisos`/`envios`/`eventos_aviso`/`notificacoes_cobrador` (conferir grants ao adicionar colunas — colunas herdam o grant da tabela). Não introduzir DELETE.

### 3.2 Backend api (`apps/api`)

- O módulo `acoes_devedor` é o **caminho público por link** (token). O épico move o aceite/ações para 100% WhatsApp (E5), mas enquanto o link existir, alinhar o **opt-out** para `desregistrado` (não `cancelado`) e adicionar **reativar** se o link for mantido. **Decisão (sinalizar):** o épico não pede explicitamente o link; se E5 remove o site, este módulo vira só fallback. No mínimo: trocar `cancelado → desregistrado` no opt-out aqui também, para não criar dois comportamentos divergentes (api manda para `cancelado`, zap para `desregistrado`). Arquivo: `apps/api/src/modules/acoes_devedor/service.ts`.
- Painel (E9) lê eventos; este épico só garante que os eventos novos (`reativacao`) e o estado `desregistrado` sejam **legíveis** (label). O trabalho de painel é E9.

### 3.3 Backend zap (`apps/zap`) — coração do épico

- `webhook_whatsapp/service.ts` (`processarBotao`):
  - **Validar telefone** (H7.6): comparar `evento.telefone` (normalizado) com `telefone_devedor` do aviso; divergente → ignorar sem logar dado sensível. O repo já carrega `telefone_devedor`; passar o telefone do evento ao repo e barrar lá (dentro da transação, com o `for update`).
  - **Roteamento por etapa/último aviso** (H7.7): parsear `acao:<avisoId>:<etapa>` (ou o stanzaId citado) e descartar ação de estado quando não for o último envio. Resposta de cortesia "encerrado" condicionada a plano (H7.1/H7.7).
  - **Nova ação `ativar`** (H7.5): adicionar a `ACOES_BOTAO` e a `chaveResposta` (`resposta.reativacao`, sem botão).
  - **"Chave de Pag." duas mensagens** (H7.3): após `resposta.ver_pix` (só a chave), enviar a 2ª (`resposta.ver_pix_titular`, variáveis `nome`/`banco`) com `setTimeout`/delay até 3s. **Idempotência da entrega**: só envia se `entrega_chave_status != 'entregue'`; em falha de envio (após os 3 retrys do canal) deixa reentregável. `solicitou_pix` só no 1º toque (mover a gravação do evento para condicional "primeira vez").
  - **Texto livre → menu (pago) / silêncio (free)** (H7.1): hoje o inbound descarta texto livre. Acrescentar no inbound um caminho para **mensagem de texto** (não-botão) que: localiza combinados ativos do telefone, checa plano do cobrador/dono, e responde menu (pago) ou nada (free). **Importante:** o `meta_client` é transporte genérico; o "menu" é negócio → expor no `ClienteWhats` um `onTexto(handler)` análogo ao `onBotao`, e implementar a regra no módulo `webhook_whatsapp`. Não colocar negócio no `meta_client`.
- `webhook_whatsapp/repo.ts` (`aplicarAcaoBotao`):
  - opt-out: `update status='desregistrado'` (não `cancelado`); **zerar `horario_reservado`** (quando o campo existir, E6); evento `optout`.
  - reativar: `desregistrado → programado`, recriar envios (catch-up via `calcularAgendamentos` filtrando etapas ainda aplicáveis), **pegar novo horário reservado** (E6), evento `reativacao`. Notificação ao cobrador é decisão de E10 (enfileirar conforme a janela).
  - "Já paguei": acrescentar `desregistrado` aos estados onde **não** transiciona (só de `pendente`); manter idempotência/silêncio.
  - ver_pix: gravar `solicitou_pix` **só na primeira vez**; marcar entrega.
  - terminal/`desregistrado` → retornar info de "encerrado" para o service responder cortesia (não só `aplicado:false`).
- `notificar_cobrador`: este épico **não** muda o conteúdo, mas a **janela de 1 min** (opt-out) e a **anulação/2ª notificação** (reativação) são E10. Aqui só **enfileirar** os sinais (opt-out, reativação) na outbox de forma que E10 aplique a janela. Coordenar com o plano de E10 (não duplicar a lógica de janela).

### 3.4 Frontend (`frontend/`)

- Label do estado `desregistrado` em `frontend/src/shared/contracts/enums.ts` + dicionário/labels (lista de status em `modules/avisos/pages/ListaAvisos.tsx`, formatação em `shared/format`). Linguagem neutra, sem palavra proibida (ex.: "Sem lembretes" / "Pausado pelo destinatário").
- Catálogo de mensagens do admin (`modules/admin/catalogo_mensagens.ts`): registrar as novas chaves de template editáveis (`resposta.ver_pix_titular`, `resposta.reativacao`, `resposta.menu_opcoes`, `resposta.encerrado`) e **ajustar o rótulo do botão** "Ver chave Pix" para um que **não contenha "Pix"** (H7.3) — ex.: "Chave de pagamento". A edição é E12, mas o catálogo/labels e a entrada precisam existir.
- Nenhuma tela nova de devedor (o devedor age só por WhatsApp). O painel (E9) exibirá os eventos.

### 3.5 Segurança

- **Validação de telefone** no toque (H7.6) — barra ações de números que não são o alvo.
- **Nunca logar** chave/titular/banco/telefone/token (H7.3/H7.6/E13). Auditar logs novos (menu, reativação).
- **Idempotência** por estado + "último aviso" (toque duplo / botão antigo não dispara).
- `aviso_id` inválido/terminal → sem vazar existência (H7.7); respostas de cortesia não revelam dados do combinado.
- Sem DELETE; eventos append-only.

### 3.6 Testes

- **zap** (`webhook_whatsapp/tests/`): idempotência de "Já paguei" (re-tap silencioso, sem 2º evento/notificação); ver_pix duas mensagens com intervalo, `solicitou_pix` só 1x, "uma vez por combinado", reentrega só após falha; opt-out → `desregistrado` + botão "Ativar lembretes"; reativar → `programado` + recriação de envios + evento; telefone divergente ignorado; botão de aviso antigo (etapa != último) inerte; terminal → resposta de cortesia (pago) / silêncio (free); `aviso_id` inválido sem vazar.
- **Texto livre**: menu no pago, silêncio no free, silêncio total após "Já paguei".
- **Banco** (migration): transições novas no trigger (`programado↔desregistrado`); `encerrar_envios` em `desregistrado`; rejeição de transições inválidas (`desregistrado → pago` deve falhar — só via `programado`).
- **Corrida** (dedicado): dois toques simultâneos no mesmo `aviso_id` (claim `for update` já serializa; provar que só um aplica). Reativação concorrente com a drenagem da notificação de saída (coordenar com E10).
- **Linguagem**: templates novos passam no CHECK do banco e no `linguagem.ts` (sem palavra proibida, sem travessão, neutro).

---

## 4. Sequência de passos

Cada passo: objetivo · arquivos prováveis · critério (HNN.x) · **modelo**.

1. **Migration: estado `desregistrado` + transições + encerrar_envios.**
   Arquivos: `supabase/migrations/0025_desregistrado.sql`, `packages/shared/src/contracts/enums.ts`, `frontend/src/shared/contracts/enums.ts`. Critério: H7.4 (`programado→desregistrado`), H7.5 (`desregistrado→programado`); rejeita `desregistrado→pago`. Validar com `scripts/validate_migrations.sh whaviso_dev`.
   **opus** — máquina de estados + trigger + interação com `encerrar_envios`; erro aqui corrompe o ciclo.

2. **Migration: evento `reativacao` + colunas de controle (`entrega_chave_status`, marca de "último aviso" se for por etapa).**
   Arquivos: `0025/0026_*.sql`, `enums.ts` (dois lados). Critério: H7.3 (entrega única), H7.7 (último aviso), H7.5 (evento). 
   **opus** — modelagem do "último aviso" e da entrega idempotente define a corretude de H7.3/H7.7.

3. **Migration: `pix_titular`/`pix_banco` (snapshot no aviso) + `titular`/`banco` em `chaves_pix`.**
   Arquivos: `0026_pix_titular_banco.sql`. Critério: H7.3 (2ª mensagem). **Consumo aqui; coleta é E2/E3** (marcar dependência).
   **sonnet** — adição de colunas nullable + backfill trivial; sem lógica.

4. **zap repo: opt-out → `desregistrado` (zera horário reservado quando existir), evento `optout`.**
   Arquivos: `apps/zap/src/modules/webhook_whatsapp/repo.ts`. Critério: H7.4. 
   **opus** — transição de estado + acoplamento com horário reservado (E6) e com a notificação atrasada (E10).

5. **zap repo: ação `reativar` (`desregistrado→programado`, recria envios por catch-up, novo horário reservado, evento `reativacao`).**
   Arquivos: `repo.ts`, usa `@whaviso/shared/datas::calcularAgendamentos`. Critério: H7.5. 
   **opus** — recriação de envios + catch-up + horário reservado; corrida com a notificação de saída.

6. **zap service/index: ação `ativar` no parser e em `chaveResposta` (`resposta.reativacao`, sem botão); confirmação do opt-out com botão "Ativar lembretes".**
   Arquivos: `webhook_whatsapp/service.ts`, template `resposta.optout` ganha botão `ativar:<avisoId>`. Critério: H7.4 (botão na confirmação), H7.5 (mensagem sem botão).
   **sonnet** — wiring de ação/rótulo e seleção de template; lógica já está no repo.

7. **zap: validação de telefone do toque == `telefone_devedor` (H7.6).**
   Arquivos: `service.ts` (passa `evento.telefone`), `repo.ts` (barra na transação). Critério: H7.6 (ação só se telefone corresponde; ignora sem logar).
   **opus** — segurança; precisa casar com a transação `for update` sem janela.

8. **zap: "só o último aviso age" + terminal/inválido (H7.7).**
   Arquivos: `inbound.ts` (extrair etapa/stanzaId), `service.ts`/`repo.ts` (comparar com último envio enviado), templates `resposta.encerrado`. Critério: H7.7 (botão antigo inerte; terminal não reabre; inválido sem vazar).
   **opus** — núcleo do épico: vínculo clique→envio, comparação com último, idempotência.

9. **zap: "Chave de Pag." duas mensagens (chave; titular+banco até 3s), `solicitou_pix` 1x, entrega única, reenvio só em falha.**
   Arquivos: `service.ts`, `repo.ts`, templates `resposta.ver_pix`/`resposta.ver_pix_titular`. Critério: H7.3.
   **opus** — sequência temporizada + idempotência de entrega + condicional do evento; sensível a corrida e a falha de envio.

10. **zap: texto livre → menu (pago) / silêncio (free); silêncio total pós "Já paguei".**
    Arquivos: `meta_client/{tipos,inbound,index}.ts` (novo `onTexto`), `webhook_whatsapp/service.ts` (regra de plano + montar menu), template `resposta.menu_opcoes`. Critério: H7.1.
    **opus** — toca o transporte (novo hook genérico) + regra de plano + linguagem; risco de virar "conversa" se mal feito.

11. **api: alinhar opt-out por link para `desregistrado` (e reativar, se o link for mantido).**
    Arquivos: `apps/api/src/modules/acoes_devedor/service.ts`. Critério: H7.4/H7.5 (coerência de estado entre api e zap).
    **sonnet** — troca de string de estado + um insert de evento; transição já modelada no passo 1.

12. **Frontend: label de `desregistrado` + filtro de status; rótulo do botão sem "Pix"; entradas de catálogo das chaves novas.**
    Arquivos: `frontend/src/shared/contracts/enums.ts`, `shared/format`, `modules/avisos/pages/ListaAvisos.tsx`, `modules/admin/catalogo_mensagens.ts`. Critério: H7.3 (rótulo), H7.4/H7.5 (estado visível). 
    **sonnet** — rótulos/labels e config; mecânico.

13. **Templates (catálogo + seed/migration de catálogo no cloud): `resposta.reativacao`, `resposta.ver_pix_titular`, `resposta.menu_opcoes`, `resposta.encerrado`; rótulo do botão de Pix.**
    Arquivos: migration de catálogo (upsert, não seed — dados de catálogo vão em migration), `frontend` catálogo. Critério: H7.1/H7.3/H7.5/H7.7 (textos existem e são editáveis E12). Linguagem limpa (CHECK).
    **sonnet** — conteúdo de template + upsert; cuidar de linguagem/neutralidade.

14. **Testes (unit + integração + corrida) cobrindo §3.6.**
    Arquivos: `apps/zap/src/modules/webhook_whatsapp/tests/webhook.test.ts`, novos testes de migration/trigger. Critério: todos os H7.x.
    **opus** — testes de idempotência, corrida e "último aviso" exigem montar cenários concorrentes corretos.

15. **Atualizar grafo + MODULE.md + docs (PROJETO.md §4 opt-out, CLAUDE.md transições).**
    Arquivos: `webhook_whatsapp/MODULE.md`, `acoes_devedor/MODULE.md`, `PROJETO.md`, `CLAUDE.md`, `graphify update .`. Critério: divergência "opt-out vira `desregistrado`" refletida na doc.
    **sonnet** — doc + atualização do grafo; mecânico.

---

## 5. Dependências de outros épicos (precisam estar prontos antes)

- **E6 (ciclo de lembretes) — bloqueante parcial:** o campo **`horario_reservado`** (H6.9) não existe; H7.4 (zerar) e H7.5 (novo horário) dependem dele. O **catch-up** (H6.7) é reusado na reativação. Implementar E6 H6.9/H6.7 antes dos passos 4/5, ou deixar os hooks de horário como TODO explícito até E6 chegar.
- **E10 (notificações ao cobrador) — bloqueante parcial:** a **janela de 1 min** do opt-out e a **anulação/2ª notificação** da reativação são de E10. Este épico só **enfileira os sinais**; a janela/coalescing fica em E10 (H10.9). Coordenar para não duplicar.
- **E8 (confirmação):** o ciclo de vida de `informado_pago` (sair de revisão) é de E8; aqui só **entra** em `informado_pago`.
- **E5 (convite/aceite):** se E5 remove o site, o `acoes_devedor` por link vira fallback (passo 11). Os botões/rótulos vêm de E12.
- **E2/E3:** coleta de **titular + banco** do Pix (passo 3 só consome).
- **E12 (templates):** edição dos novos templates; **E13 (linguagem):** lint/CHECK e neutralidade.
- **Máquina de estados (cross-épico):** a renomeação global `pendente→programado` toca trigger + app + docs. Este plano cria `desregistrado` e suas transições e referencia `programado` como alvo; onde o código ainda lê `pendente`, manter compatível até a varredura global.

---

## 6. Riscos e pontos de teste dedicado

- **"Último aviso age" (H7.7), maior risco:** hoje não há vínculo clique→envio. Se a solução for por etapa no `buttonId`, validar que botões de etapas anteriores ficam inertes mesmo com a etapa correta repetida; se for pelo id da mensagem citada, validar que a Meta entrega esse dado de forma confiável (pode não vir se o cliente não "responder" a mensagem). **Teste dedicado** + fallback decidido.
- **Fallback de resposta numerada (resiliência do canal):** além dos botões interativos oficiais da Meta, prever **fallback de resposta numerada** e testar cedo. Afeta H7.1..H7.7 inteiros.
- **Idempotência / toque duplo:** `for update` serializa, mas a 2ª mensagem do Pix (passo 9) é fora da transação (delay até 3s) — garantir que dois toques não disparem duas sequências (marcar entrega **antes** de soltar a 2ª, ou lock por aviso). **Teste de corrida.**
- **Entrega da chave "uma vez" vs falha de servidor:** distinguir falha de envio (reentregável) de "já entregue" sem reenviar; testar o caminho de falha confirmada após os 3 retrys (E6 H6.8).
- **Opt-out/reativação dentro de 1 min** (anula notificação): corrida entre a reativação e a drenagem da notificação de saída por E10. **Teste de corrida coordenado com E10.**
- **Vazamento em log:** chave/titular/banco/telefone nunca em log (passos 7, 9, 10).
- **`desregistrado` não-terminal mas para envios:** o `encerrar_envios` precisa parar sem impedir a recriação na reativação; testar que reativar recria os envios certos (catch-up).

---

## 7. Decisões em aberto (confirmar com o humano)

> O épico declara "Nenhuma pendente neste épico". As decisões abaixo são de **implementação/modelagem** (não de produto), surgidas do estado real do código; não inventam comportamento de produto.

1. **Como identificar "o último aviso" (H7.7):** (a) incluir a **etapa** no `buttonId` (`acao:<avisoId>:<etapa>`) e comparar com o último envio enviado, ou (b) usar o **stanzaId citado** do inbound cruzado com `envios.wamid`. Recomendação: (a), mais robusta. Confirmar.
2. **Onde guardar titular + banco do Pix:** snapshot em `avisos` (coerente com `pix_chave`, recomendado) vs join em `chaves_pix` no momento do toque. Confirmar.
3. **Marca de "chave já entregue":** coluna `entrega_chave_status` no aviso (recomendado) vs derivar de `eventos_aviso`. Confirmar.
4. **Destino do `acoes_devedor` por link na api:** alinhar para `desregistrado` (mínimo) e/ou aposentar o link se E5 remover o site. Confirmar com E5.
5. **Fallback de canal (resposta numerada):** ligar já no MVP como resiliência geral, ou só se observarmos falha em produção? (Não é decisão de produto, é de robustez.)
