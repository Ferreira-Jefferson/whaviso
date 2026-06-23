# Plano de desenvolvimento: Épico 04 — Modo agenda

> Fonte da verdade: `historias/04-modo-agenda.md`. Onde o código diverge, o plano descreve como mudar o código para bater com a história.
> Estado do código inspecionado (jun/2026): migrations 0001..0024; `apps/api/modules/{avisos,aceite,recebimentos,billing,painel}`; `frontend/src/modules/{avisos,painel}`.

## 1. Resumo do épico e escopo

O Whaviso passa a servir como **agenda particular**: o criador cadastra um combinado **sem enviar nada** (nem convite, nem lembrete) e decide depois se ativa. Estado novo **`sem_aviso`** (exibido "Sem aviso"), anterior ao convite, do qual nenhum aviso sai. Vale nos dois fluxos (receber e pagar invertido).

**MVP 🟢 (tudo deste épico é MVP):**
- H4.1 Cadastrar em modo agenda (nasce `sem_aviso`, sem convite, sem envio, telefone opcional).
- H4.2 Acompanhar/filtrar a agenda no painel (faixa "Sem aviso").
- H4.3 Ativar (`sem_aviso → aguardando_aceite`): gera o número de convite, pede dado faltante, consome vaga de plano, free não ativa.
- H4.4 Editar livre (sem reaprovação) e descartar (`sem_aviso → cancelado`, append-only).
- H4.5 Marcar como pago manual (`sem_aviso → pago`).

**Decisões já tomadas pelo épico (não reabrir):** nome `sem_aviso`; limite de agenda separado do limite de ativos (free 10 / start 20 / por-envio = 10×envios / flexível até 2000, nomes finais no E11); H4.5 entra no MVP.

**Fora de escopo (outros épicos):** validação/aceite do convite no WhatsApp (E5); ciclo/textos de lembrete (E6); `informado_pago` (E8); layout completo do painel e valores finais de plano (E9/E11).

> Nota de vocabulário cruzado (E13 / `_CONTEXTO.md`): o épico do estado-alvo renomeia `pendente → programado`. **Este plano NÃO faz essa varredura** (é trabalho do épico da máquina de estados / E6); aqui mantenho o nome `pendente` que está no código e apenas **acrescento** `sem_aviso` e suas transições, para não colidir com a varredura. Sinalizado em Decisões em aberto.

## 2. Estado atual vs história

| Critério | Estado | Observação (código real) |
|---|---|---|
| H4.1 escolher modo agenda na criação | `[+]` | `criarAvisoBody` (`payloads.ts`) não tem flag de modo; `service.criarAviso` **sempre** gera `aceiteToken`/`acaoToken` e nasce `aguardando_aceite`. |
| H4.1 nasce `sem_aviso`, sem convite, sem envio | `[+]` | enum `status_aviso` (0001/0011 + `enums.ts`) não tem `sem_aviso`; sempre gera token e (no aceite) envios. |
| H4.1 telefone da outra ponta opcional na agenda | `[!]` | constraint `avisos_convite_tem_destino` (0017) + refines do `criarAvisoBody` exigem telefone já na criação (receber: `telefone_devedor`; invertido: `telefone_cobrador`). Precisa relaxar quando `sem_aviso`. |
| H4.1 mesmos campos de negócio | `[x]` | `nome_devedor/motivo/valor_centavos/data_combinada` já existem e validados. |
| H4.1 funciona nos dois fluxos | `[~]` | criação cobre os dois fluxos (`direcao` + `criador_papel`), falta só o ramo agenda. |
| H4.1 free cria agenda (até limite) | `[!]` | `service.criarAviso` aplica `limiteDoPlano`/`contarAtivos` a TODA criação; free hoje nem cria. Precisa: free **cria agenda** (limite de agenda), não **ativa**. |
| H4.1 linguagem (regras de ouro, gênero neutro) | `[~]` | invariante E13; rótulo "Sem aviso" e copy novos precisam respeitar. |
| H4.2 agenda marcada/separada no painel | `[+]` | `Painel.tsx` mostra `qtd_pendentes`/`qtd_aguardando_aceite`; sem faixa/contador "Sem aviso". |
| H4.2 filtrar agenda vs ativo | `[~]` | `listarAvisosQuery` aceita `status` opcional → filtrar por `sem_aviso` é trivial assim que o estado existir; falta UI. |
| H4.2 ações a partir da agenda (editar/ativar/descartar/pago) | `[+]` | nenhuma existe para `sem_aviso`. |
| H4.3 ativar gera convite + mensagem | `[+]` | hoje o convite nasce na criação; não há endpoint "ativar". Lógica de gerar token + montar `link_aceite` existe em `criarAviso` (reaproveitável). |
| H4.3 transição `sem_aviso → aguardando_aceite` | `[+]` | trigger `validar_transicao_aviso` (0011) não conhece `sem_aviso`. |
| H4.3 pede dado faltante (telefone/Pix) antes de ativar | `[+]` | inexistente. |
| H4.3 ativar consome vaga; free não ativa | `[!]` | a checagem de limite existe em `criarAviso`; precisa **migrar** para o "ativar". |
| H4.3 sem ciclo antes, ciclo completo depois | `[~]` | inserção de envios já está no `aceite` (não na ativação); ativar só gera o convite, o ciclo continua nascendo no aceite (E5/E6). Coerente. |
| H4.4 edição livre sem reaprovação em `sem_aviso` | `[+]` | **não existe endpoint de editar aviso** (`avisos/index.ts` só tem criar/listar/detalhar/cancelar/envios/eventos). |
| H4.4 descartar → `cancelado` (não DELETE) | `[~]` | `cancelarAviso` existe e grava evento, mas `cancelavel` = `['aguardando_aceite','pendente']`; falta incluir `sem_aviso` (e o trigger permitir). |
| H4.4 operação registrada como evento | `[~]` | `inserirEvento` já é append-only; falta cobrir os novos atos (editado/ativado). |
| H4.5 marcar pago manual `sem_aviso → pago` | `[!]` | `confirmarRecebimento` (recebimentos) só aceita `pendente`/`informado_pago`; trigger não permite `sem_aviso → pago`. |
| H4.5 `pago` terminal, entra no histórico | `[x]` | `pago` já é terminal (só desmarca p/ pendente); painel já soma `pagos_centavos`. |

Legenda: `[x]` ok · `[~]` parcial · `[!]` diverge (refatorar) · `[+]` não existe.

## 3. Trabalho por camada

### Arquitetura / Dados (migrations, estados, índices)

A1. **Migration `0025_modo_agenda.sql`** (nova; aplicar no local via `validate_migrations.sh` e no cloud via `supabase db push`):
- `alter type status_aviso add value if not exists 'sem_aviso';` (enums Postgres só append; ordem não importa para o app).
- Reescrever `validar_transicao_aviso()` (substitui a de 0011) acrescentando:
  - `sem_aviso → aguardando_aceite` (ativar, H4.3)
  - `sem_aviso → cancelado` (descartar, H4.4)
  - `sem_aviso → pago` (registro manual, H4.5)
  - manter TODAS as transições atuais intactas.
- **Relaxar a constraint de destino** (`avisos_convite_tem_destino`, 0017): o telefone do alvo do convite passa a ser obrigatório **só quando `status <> 'sem_aviso'`**. Recriar a constraint com `status = 'sem_aviso' OR (case … receber → telefone_devedor not null; pagar+devedor → telefone_cobrador not null; else true)`.
  - Atenção: no invertido em `sem_aviso` o `telefone_devedor` é o do próprio criador (perfil) e pode ser null se o perfil não tiver telefone; manter tolerante.
- Índice parcial para a agenda/contagem por plano: `create index idx_avisos_agenda_criador on public.avisos (cobrador_id, devedor_profile_id) where status = 'sem_aviso';` (apoia `contarAgenda` e o filtro do painel).

A2. **Migration `0026_limite_agenda.sql`** (catálogo de planos; via `db push`, **não** seed — regra do projeto: catálogo em migration upsert):
- `alter table public.planos add column max_agenda integer;` (null = ilimitado).
- `update`/upsert dos valores do épico: free 10, start 20, por-envio = `max_avisos_ativos * 10`, flexível 2000. (Os nomes/ids finais dos planos pertencem ao E11; aqui só preencher os ids existentes — ver Decisão D3.)
- Espelhar no plano `pessoal` (free) o `max_agenda = 10`.

A3. **Enum no contrato compartilhado**: `packages/shared/src/contracts/enums.ts` → adicionar `'sem_aviso'` em `statusAviso` (mantém a ordem dos demais). Espelhar no contrato **próprio do front** (`frontend/src/shared/contracts`), conforme regra "front tem Zod próprio".

> Sincronização obrigatória (CLAUDE.md): enum no banco (A1) + `enums.ts` (A3) + Zod do front. O comentário do `0001_enums.sql` cita esse espelhamento.

### Backend api

B1. **Contrato `criarAvisoBody`** (`payloads.ts`): adicionar `modo: z.enum(['enviar','agenda']).default('enviar')`. Ajustar os `.refine` de telefone: exigir telefone do alvo **só quando `modo === 'enviar'`** (em `agenda`, telefone/Pix opcionais). Manter os campos de negócio obrigatórios sempre.

B2. **`avisos/service.criarAviso`**: ramificar por `modo`:
- `modo === 'agenda'`: não gera `aceiteToken`/`acaoToken`; insere com `status: 'sem_aviso'`, `aceite_token_hash/acao_token_hash = null`; **não** insere envios; evento `criado` com `detalhes: { modo: 'agenda' }`; resposta `link_aceite: null`. Checa **limite de agenda** (B4), não o de ativos.
- `modo === 'enviar'`: comportamento atual (gera convite, `aguardando_aceite`, checa limite de ativos).

B3. **Novo endpoint `POST /v1/avisos/:id/ativar`** (módulo `avisos`): `sem_aviso → aguardando_aceite`. Reaproveita a geração de token de `criarAviso`:
- carrega como criador (`buscarComoCriador` + `for update`); 404 se não for dele; 409 se `status <> 'sem_aviso'` (idempotência: se já `aguardando_aceite`, retorna o link existente? NÃO — token claro não persiste; ver Decisão D2).
- valida dado faltante: receber → `telefone_devedor`; invertido → `telefone_cobrador` (alvo do convite) e Pix (regra do invertido, mesma da criação). Erro `dado_obrigatorio_ativacao` (`regraNegocio`) listando o que falta. **Não** transita se faltar.
- valida **limite de avisos ativos** (mesma `limiteDoPlano`/`contarAtivos` hoje em `criarAviso`) → se atingido, `regraNegocio('limite_plano_atingido', …)` que o front converte na CTA de plano (H1.5/E11). Free (limite 0/atingido) cai aqui.
- gera `aceiteToken`/`acaoToken`, grava hashes, `aceite_token_expira_em = aceiteExpiraEm(data)`, transita para `aguardando_aceite`, evento `ativado` (ator = criador_papel), responde `{ aviso, link_aceite }`.
- **NÃO** insere envios (o ciclo nasce no aceite, E5/E6) — coerente com o fluxo atual.

B4. **Limite de agenda** (`avisos/repo`): `contarAgenda(uid)` (count `status='sem_aviso'` do criador, espelhando `contarAtivos`) e `limiteAgendaDoPlano(uid)` (lê `planos.max_agenda`/quantidade contratada). `criarAviso` (modo agenda) usa esses. **Refatorar a regra de plano para distinguir "criar agenda" de "ativar"** (divergência do épico): free passa a poder criar agenda.

B5. **Novo endpoint `PATCH /v1/avisos/:id`** (editar livre, H4.4): só permitido em `status = 'sem_aviso'` (409 `edicao_nao_permitida` caso contrário — em `aguardando_aceite`+ a reaprovação é da H2.5, fora deste épico). Body = subconjunto editável de `criarAvisoBody` (nome/telefone/motivo/valor/data/pix/nome_cobrador/telefone_cobrador), todos opcionais. Atualiza no banco, evento `editado` (ator = criador_papel, `detalhes` com os campos alterados — sem logar telefone/Pix em claro; só os nomes dos campos). Sem reaprovação.

B6. **Descartar** (H4.4): estender `cancelarAviso` (`avisos/service`) para incluir `sem_aviso` em `cancelavel`. Evento já existe (`cancelado_cobrador`). Reusar `POST /v1/avisos/:id/cancelar`.

B7. **Marcar pago manual** (H4.5): novo `POST /v1/avisos/:id/marcar-pago-agenda` no módulo `recebimentos` (ou estender `confirmarRecebimento` para aceitar `sem_aviso`). Preferir endpoint dedicado para deixar o contrato claro: só `sem_aviso → pago`, exige ser o **criador** (não só `cobrador_id`, pois no invertido o criador é o devedor e o cobrador pode nem ter conta). Evento `confirmado_cobrador` com `detalhes: { origem: 'agenda' }` (reusar o tipo existente; ver Decisão D4 sobre ator). Idempotente se já `pago`.

> Fronteira (lint): `recebimentos` e `avisos` são módulos distintos e não se importam — coordenam via banco. O "marcar-pago-agenda" cabe em `recebimentos` (dono das transições de pagamento) ou em `avisos`; decidir por coesão (ver D4).

### Backend zap

Sem trabalho neste épico. O `zap` (scheduler/`enviar_lembretes`, `expirar_avisos`) só age sobre `envios` e estados ativos. Como `sem_aviso` **não tem envios** e **não tem token de expiração**, nada é varrido:
- Verificar `expirar_avisos`: garantir que o critério de expiração filtra `status = 'aguardando_aceite'` (e não pega `sem_aviso`). Provavelmente já filtra por `aceite_token_expira_em not null`; `sem_aviso` tem null. **Confirmar** com 1 teste (T-zap).
- `enviar_lembretes` claim por `envios` → `sem_aviso` não cria envios → nada a fazer.

### Frontend

F1. **Form de criação** (`avisos/pages/NovoAviso.tsx` + `schemas.ts`): adicionar escolha **"Gerar convite agora"** vs **"Só anotar na agenda (não enviar)"**. No modo agenda, telefone do alvo deixa de ser obrigatório (ajustar refine do schema do front). Enviar `modo` no payload. Copy respeitando E13 (sem "cobrança/dívida", gênero neutro).

F2. **Pós-criação** (`avisos/components/AvisoCriado.tsx`): se `modo === 'agenda'` (resposta `link_aceite: null`), mostrar confirmação "salvo na agenda, nada foi enviado" + CTA "Ativar quando quiser", **sem** bloco de link `wa.me`.

F3. **Painel** (`painel/pages/Painel.tsx`): faixa/contador **"Sem aviso"** separada do ciclo ativo; filtro/aba para listar só agenda (usa `GET /v1/avisos?status=sem_aviso`). Layout fino fica no E9 (cross-ref); aqui só o mínimo para "não se misturar".

F4. **Lista/detalhe** (`avisos/pages/ListaAvisos.tsx`, `DetalheAviso.tsx`): para itens `sem_aviso`, expor ações **Editar** (H4.4), **Ativar** (H4.3, abre modal pedindo telefone/Pix se faltar e mostra a CTA de plano se free/limite), **Descartar** (H4.4) e **Marcar como pago** (H4.5). Badge "Sem aviso".

F5. **API client + schemas do front** (`avisos/api.ts`, `schemas.ts`): `ativarAviso`, `editarAviso`, `marcarPagoAgenda`; tratar erro `limite_plano_atingido` na ativação → CTA de plano (E11).

### Segurança

S1. **Token claro nunca persiste** (invariante): a geração no "ativar" segue o mesmo padrão de `criarAviso` (gera, guarda só `sha256`, devolve link uma vez). Não relogar.
S2. **Autorização**: editar/ativar/descartar/marcar-pago só pelo **criador** (`buscarComoCriador`), não por qualquer parte vinculada. Marcar-pago-agenda especialmente: no invertido o criador é o devedor.
S3. **Sem logar** telefone/Pix nos eventos `editado`/`ativado` (só nomes de campos alterados). Erros no envelope `{error:{code,message}}`.
S4. **Limite no servidor sem corrida**: a checagem de limite de ativos no "ativar" e de agenda no "criar" deve rodar **dentro da transação** com `for update` na linha (ativar) e contagem consistente — espelha o cuidado de `criarAviso`. (Risco menor que E11 H11.8, mas mesma classe.)

### Testes

- **T-api-1 (vitest, api):** criar em modo agenda → `status=sem_aviso`, sem token (hashes null), sem envios, `link_aceite=null`, evento `criado{modo:agenda}`. (H4.1)
- **T-api-2:** telefone opcional na agenda; obrigatório só ao ativar (receber e invertido). (H4.1/H4.3)
- **T-api-3:** free CRIA agenda até `max_agenda`, recusa no limite; free **não** ativa (limite_plano_atingido). (H4.1/H4.3, divergência do épico)
- **T-api-4 (opus-grade, máquina de estados):** ativar `sem_aviso→aguardando_aceite` gera token e link; ativar sem telefone/Pix → erro sem transição; idempotência/duplo-tap (ver D2); ativar consome vaga. (H4.3)
- **T-api-5:** editar livre em `sem_aviso` (sem reaprovação), bloqueado fora de `sem_aviso`; evento `editado`. (H4.4)
- **T-api-6:** descartar `sem_aviso→cancelado`, append-only (linha não some, evento gravado). (H4.4)
- **T-api-7:** marcar pago `sem_aviso→pago`, terminal, idempotente; só o criador. (H4.5)
- **T-db (trigger):** transições novas aceitas; transições inválidas a partir de `sem_aviso` (ex.: `sem_aviso→informado_pago`, `sem_aviso→pendente`) rejeitadas. (defesa em profundidade)
- **T-zap:** `expirar_avisos` ignora `sem_aviso`; nenhum envio é criado/varrido para agenda. (escopo zap)
- **Corrida (limite):** dois "ativar" concorrentes no mesmo limite → só um passa (transação + lock). (S4)

## 4. Sequência de passos

> Modelo: **opus** para máquina de estados, transição, limite sem corrida, segurança; **sonnet** para schema/CRUD/UI/copy.

1. **A1 — Migration estado + transições + constraint** (`0025_modo_agenda.sql`). Critério: H4.1/H4.3/H4.4/H4.5 (estado e transições existem). **opus** — mexe na máquina de estados (trigger) e na constraint de destino, núcleo do épico.
2. **A3 — Enum no `enums.ts` + Zod do front.** Critério: H4.1. **sonnet** — adição mecânica de um valor, com espelhamento conhecido.
3. **B1 — `criarAvisoBody` com `modo` + refines condicionais.** Critério: H4.1 (telefone opcional na agenda). **sonnet** — ajuste de schema/validação.
4. **B4 — `contarAgenda`/`limiteAgendaDoPlano` + A2 (migration `max_agenda`).** Critério: H4.1 (free cria agenda até limite). **opus** — refatora a regra de plano (distinguir criar-agenda de ativar) e contagem consistente.
5. **B2 — `criarAviso` ramificado por `modo`.** Critério: H4.1 (nasce `sem_aviso`, sem convite/envio). **opus** — toca a criação que hoje sempre gera convite; ramo crítico.
6. **B3 — `POST /avisos/:id/ativar`.** Critério: H4.3 (gera convite, pede faltante, consome vaga, free não ativa, transita). **opus** — transição + validação de limite sem corrida + geração de token (segurança).
7. **B5 — `PATCH /avisos/:id` (editar livre).** Critério: H4.4 (edição imediata sem reaprovação em `sem_aviso`). **sonnet** — CRUD com guarda de estado simples.
8. **B6 — descartar (estender `cancelarAviso`).** Critério: H4.4 (`sem_aviso→cancelado`, evento). **sonnet** — incluir um estado na lista cancelável.
9. **B7 — marcar-pago-agenda.** Critério: H4.5 (`sem_aviso→pago`, criador, idempotente). **opus** — transição de pagamento + autorização por criador no invertido (sutil).
10. **F1/F2 — form com modo agenda + pós-criação sem link.** Critério: H4.1. **sonnet** — UI/copy.
11. **F3 — faixa/filtro "Sem aviso" no painel.** Critério: H4.2. **sonnet** — UI sobre `status=sem_aviso`.
12. **F4/F5 — ações na lista/detalhe (editar/ativar/descartar/pago) + client + tratamento da CTA de plano.** Critério: H4.2/H4.3/H4.4/H4.5. **sonnet** — UI + chamadas; lógica pesada está no backend.
13. **Testes T-api-1..7, T-db, T-zap, corrida.** Critério: todos os HNN. **opus** para T-api-4 e o teste de corrida (estados/limite); **sonnet** para os demais.
14. **Atualizar grafo + docs**: `graphify update .`; ajustar PROJETO.md/CLAUDE.md (transições de `avisos`: acrescentar `sem_aviso→{aguardando_aceite,cancelado,pago}`) — **sem** fazer a varredura `pendente→programado` (fica no épico de estados). **sonnet** — doc/manutenção.

## 5. Dependências de outros épicos

- **E2/E3 (criação receber/invertido):** base reaproveitada (criação, `criador_papel`, geração de token, `aceite`). Já existe; este épico ramifica.
- **E11 (planos/limites):** valores e ids finais dos planos e o `max_agenda` por plano; a CTA "free não ativa" liga em H1.5/E11. Aqui entram valores provisórios (D3).
- **E1 (auth/free read-only):** a divergência "free passa a criar agenda" reescreve a regra do E1/H1.5; coordenar.
- **E5 (convite/aceite):** o que acontece **depois** de ativar (validação/aceite no WhatsApp) é do E5; aqui só geramos o convite e transitamos para `aguardando_aceite`.
- **E6 (ciclo de lembretes):** o ciclo nasce no aceite (já hoje), não na ativação; coerente.
- **Máquina de estados (espinha cross-épico):** este épico **acrescenta** `sem_aviso` e transições; a renomeação `pendente→programado` é do épico de estados e **não** é feita aqui (D1).

## 6. Riscos e pontos de teste dedicado

- **R1 (alto) — colisão com a varredura `pendente→programado`:** mexer no trigger `validar_transicao_aviso` aqui e no épico de estados pode conflitar. Mitigação: passo A1 só **adiciona** ramos `sem_aviso`, sem tocar os existentes; T-db cobre regressão.
- **R2 (alto) — limite sem corrida na ativação:** dois "ativar" simultâneos podem furar a vaga. Teste de corrida dedicado (S4).
- **R3 (médio) — constraint de destino relaxada demais:** relaxar para `sem_aviso` não pode deixar passar ativo sem telefone. T-api-2 cobre que ativar exige telefone.
- **R4 (médio) — free read-only do E1 vs free cria agenda:** regra de plano precisa distinguir criar-agenda de ativar em UM lugar (B4), senão volta a bloquear. T-api-3.
- **R5 (médio) — zap varrer agenda:** garantir que `expirar_avisos` ignora `sem_aviso` (sem token de expiração). T-zap.
- **R6 (baixo) — idempotência/duplo-tap do "ativar":** token claro não persiste, então re-ativar não pode "reentregar" o link sem violar S1 (D2).

## 7. Decisões em aberto (confirmar com o humano)

- **D1 — Renomear `pendente→programado` agora?** O `_CONTEXTO.md` aponta a renomeação como espinha cross-épico. Recomendo **NÃO** fazer aqui (só adicionar `sem_aviso`), deixando a varredura para o épico da máquina de estados, para evitar conflito de migrations. Confirmar a ordem dos épicos.
- **D2 — Idempotência do "ativar":** como o token claro não persiste (S1), re-ativar um aviso já `aguardando_aceite` não pode devolver o mesmo link. Opções: (a) 409 "já ativado" e o usuário usa o link já compartilhado; (b) **reemitir** novo token (invalida o anterior) a cada "ativar". Recomendo (a) no MVP. Decidir.
- **D3 — Ids/valores de plano para `max_agenda`:** o épico fixa free 10 / start 20 / por-envio 10× / flexível 2000, mas os **ids/nomes finais** dos planos são do E11. Hoje só existem `pessoal`/`profissional` (0007) + personalizado (0019). Confirmar o mapeamento provisório (ex.: `pessoal.max_agenda=10`) até o E11 fechar o catálogo.
- **D4 — Onde mora "marcar-pago-agenda" e qual evento/ator:** módulo `recebimentos` (dono das transições de pagamento) vs `avisos`. E no invertido, o criador é o **devedor** marcando o próprio combinado como pago: o tipo de evento `confirmado_cobrador` e o `ator='cobrador'` ficam semanticamente errados. Opções: novo `tipo_evento`='pago_manual' + ator = `criador_papel`, ou reusar com `detalhes`. Recomendo novo tipo de evento. Decidir (afeta migration 0001/enums e E9 linha do tempo).
- **D5 — Limite de agenda conta itens já ativados?** A contagem de agenda deve ser só `status='sem_aviso'` (ao ativar, sai da agenda e entra no balde de ativos). Confirmar que "balde único" do E11 não soma os dois.
