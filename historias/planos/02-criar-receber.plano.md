# Plano de desenvolvimento — Épico 2: Criar combinado (fluxo receber)

> Fonte da verdade: `historias/02-criar-combinado-receber.md`. Onde código/PROJETO.md/CLAUDE.md divergem, o trabalho é **mudar o código/doc** para bater com a história.
> Foco do épico: criação cobrador→devedor, **convite de 6 dígitos** (hash, unicidade por telefone), **Pix obrigatório** (+ titular + banco), editar com **reaprovação** (sub-ciclo `aguardando_aprovacao_aviso_editado`), **pausar/reativar** (`pausado`), cancelar.

---

## 1. Resumo do épico e escopo

**MVP 🟢 (tudo neste épico é 🟢):** H2.1 cadastro completo (com titular/banco da Pix, Pix obrigatório), H2.2 convite de 6 dígitos `xxx-xxx` + mensagem pronta com link `wa.me`, H2.3 limite de plano no servidor (free bloqueado, pessoal com teto), H2.4 nada antes do aceite, H2.5 edição com reaprovação (sub-ciclo + desfazer), H2.6 cancelar, H2.7 pausar/reativar.

**Gated / fora deste épico (apenas anotado, não implementado aqui):**
- Validação do convite no WhatsApp, anti-brute-force (3 tentativas), recusa, sinal "dado incorreto" → **Épico 5** (este épico só **gera** o número e modela a unicidade/hash + define a 3ª opção como reuso de edição-livre).
- Disparo/textos dos lembretes → **Épico 6**.
- Auto-envio do convite como template Meta com botões → gated (hoje compartilhamento por `wa.me` + link, mantido).

---

## 2. Estado atual vs história (por critério, baseado no código real)

Legenda: `[x]` ok · `[~]` parcial · `[!]` diverge (refatorar) · `[+]` não existe.

### H2.1 Cadastrar combinado a receber
- `[~]` Informo nome/motivo/valor/data/telefone/Pix: existe (`criarAvisoBody` + `NovoAviso.tsx`), **mas Pix é opcional** (`pix_chave: ...nullish()`, schema front `.optional()`) → diverge: deve ser **obrigatório no receber**.
- `[+]` **nome do titular** e **banco** da chave: **não existem** em lugar nenhum (`grep` em migrations/contracts/front = 0 ocorrências). Falta coluna/contrato/UI.
- `[x]` nome de quem cobra = do próprio cobrador (vem do perfil via `cobrador_id`; UI usa `usePerfil`).
- `[x]` valor em reais na UI, centavos no banco (`MoneyInput` → `valor_centavos` int; `valor_centavos bigint`).
- `[x]` data em America/Sao_Paulo, banco em UTC (`data_combinada` date; `dataCombinada` contrato).
- `[~]` validação de obrigatórios + valor>0: existe (`avisos_valor_positivo`, Zod), falta cobrir titular/banco e Pix obrigatório.
- `[x]` nasce em `aguardando_aceite` (service `status: 'aguardando_aceite'`).
- `[~]` linguagem das regras de ouro: copy atual ok; revalidar tela nova (titular/banco) no Épico 13.

### H2.2 Gerar convite (número 6 dígitos + mensagem com link)
- `[!]` Gera **token opaco base64url** (`gerarToken()` 32 bytes), **não** um número de 6 dígitos → refatorar para gerar `xxx-xxx`.
- `[!]` Exibição: hoje mostra link `${appUrl}/aceite/${token}` (site). História quer **número `xxx-xxx`** + link `wa.me` do **WhatsApp do Whaviso** com mensagem pré-preenchida *"Oi, aqui é [nome], meu convite é o xxx-xxx"*. `AvisoCriado.tsx` monta `wa.me` para o **telefone do convidado** (errado: deve ser o número do Whaviso).
- `[x]` Armazenamento só como hash: padrão já existe (`aceite_token_hash`, `sha256Hex`). Reaproveitar para o número.
- `[+]` **Unicidade por telefone de devedor:** não há; `aceite_token_hash` é `unique` global (colisão astronomicamente improvável com 256 bits, mas 6 dígitos = 1M → precisa de unicidade real por telefone). Falta índice/loop de geração.
- `[+]` Anti-brute-force 3 tentativas: não existe (é E5, só anotar).
- `[~]` Mensagem completa copiável: `CopyLinkButton` copia só o link; falta copiar a **mensagem inteira** (intro + número + link).
- `[+]` Fallback sem número: E5 (anotar).

### H2.3 Respeitar limite do plano ao criar
- `[!]` **Free bloqueado:** não existe plano `free`. `limiteDoPlano` faz `coalesce(..., 'pessoal')` → sem assinatura cai em **pessoal** (10 ativos), não em free read-only. Diverge da história (free não cria).
- `[~]` Teto do pessoal: existe (`contarAtivos` + `regraNegocio('limite_plano_atingido')`), mas o teto seed é **10**, a história cita "ex.: 5" (exemplo, não normativo → ok deixar no catálogo E11).
- `[x]` Checagem na API (não só UI): sim, em `criarAviso` dentro de `comTransacao`.
- `[~]` Terminais não contam: `contarAtivos` conta `('aguardando_aceite','pendente')` → ok hoje; ao renomear `pendente→programado` e somar `pausado`/`aguardando_aprovacao_aviso_editado`, precisa atualizar este filtro (devem contar como ativos).

### H2.4 Não enviar nada antes do aceite
- `[x]` Em `aguardando_aceite` não há envios: `criarAviso` não insere `envios`; eles só nascem no aceite (`aceite/service.ts`). Coberto.

### H2.5 Editar com reaprovação
- `[+]` **Não existe endpoint de edição** (`PATCH/PUT /avisos/:id`): grep não acha rota/serviço de editar.
- `[+]` Estado `aguardando_aprovacao_aviso_editado`: **não existe** no enum (`status_aviso` = aguardando_aceite|pendente|informado_pago|pago|cancelado|expirado), nem no trigger, nem nos contratos.
- `[+]` Pausa de lembretes durante reaprovação, desfazer edição, aprovar/recusar pelo devedor: nada.
- `[+]` Snapshot dos dados anteriores (para "desfazer" e "reativar nas condições anteriores"): não há onde guardar.
- `[+]` 3ª opção "dado incorreto" no aceite: E5 (anotar; este épico só decide que reusa edição-livre).
- `[~]` Eventos de auditoria: infra existe (`eventos_aviso` append-only, `inserirEvento`), faltam os **tipos** de evento de edição.

### H2.6 Cancelar
- `[~]` Existe `cancelarAviso` + `POST /avisos/:id/cancelar` + UI. **Mas:** cancelável só em `['aguardando_aceite','pendente']` → ao introduzir `pausado` e `aguardando_aprovacao_aviso_editado`, precisam virar canceláveis (são fases vivas).
- `[+]` **Notificar o devedor** quando já aceito: hoje `cancelarAviso` só muda status + evento, **não enfileira mensagem** ao devedor. Falta.
- `[x]` terminal/append-only: `cancelado` é terminal, sem DELETE. Coberto.

### H2.7 Pausar e reativar
- `[+]` Estado `pausado`: não existe (enum/trigger/contratos/serviço/UI). Nada feito.
- `[+]` Notificar devedor ao pausar/reativar: nada.
- `[+]` Eventos de pausa/reativação: faltam tipos.

---

## 3. Trabalho por camada

### 3.1 Arquitetura / Dados (migrations)

Novas migrations (sequência após `0024`). **Toda mudança de schema/catálogo precisa de `supabase db push` no CLOUD** (o seed não roda no cloud → catálogo via migration). Rodar `bash scripts/validate_migrations.sh whaviso_dev` a cada mudança de schema.

- **M-A `0025_estados_pausado_reaprovacao.sql`** — `alter type status_aviso add value 'pausado'`, `... add value 'aguardando_aprovacao_aviso_editado'`. Recriar `validar_transicao_aviso()` com as transições novas (ver §estados). Novos `tipo_evento`: `editado`, `edicao_desfeita`, `edicao_aprovada`, `edicao_recusada`, `pausado`, `reativado` (cada um `add value if not exists`). **Atenção Postgres:** `ALTER TYPE ... ADD VALUE` não roda dentro de transação com uso imediato do valor → separar de DML que use o valor, ou usar migrations distintas.
- **M-B `0026_aviso_convite_numero.sql`** — colunas para o número de convite de 6 dígitos: manter `aceite_token_hash` (reusar como hash do número) **ou** adicionar `convite_hash text` dedicado (decisão em aberto, ver §7). Índice de **unicidade por telefone de devedor**: `create unique index avisos_convite_unq on public.avisos (telefone_devedor, aceite_token_hash) where aceite_token_hash is not null`.
- **M-C `0027_aviso_pix_titular_banco.sql`** — titular/banco da chave. **Decisão (ver §7):** ou colunas no `avisos` (`pix_titular text`, `pix_banco text`) ou estender `chaves_pix` (titular/banco por chave) e copiar para o aviso no INSERT. Tornar **Pix obrigatório no receber** via CHECK: `check (direcao <> 'receber' or pix_chave is not null)`.
- **M-D `0028_aviso_snapshot_edicao.sql`** — guardar as condições anteriores para "desfazer"/"reativar nas condições anteriores": `dados_anteriores jsonb` em `avisos` (ou tabela `avisos_edicoes` append-only se quiser histórico — preferível pela regra de auditoria). Decisão em aberto §7.
- **M-E `0029_templates_convite_pausa_cancelamento.sql`** — catálogo (UPSERT, padrão das 0023/0024) de novos templates por chave para o **zap** transportar: `aviso.cancelado`, `aviso.pausado`, `aviso.reativado`, `aviso.edicao_a_aprovar`, `aviso.edicao_recusada_pelo_devedor` (mensagens ao devedor/cobrador). Linguagem das regras de ouro; sem travessão; neutro de gênero. (Convite em si: H2.2 é compartilhado por `wa.me`, não é template Meta ainda → **não** cria template de convite agora.)

### 3.2 Backend api

- **avisos/service.ts + repo.ts:**
  - `criarAviso`: gerar número de 6 dígitos com **retry de unicidade por telefone** (loop curto: gera, tenta inserir, em colisão `23505` regenera, N tentativas). Hash do número. Retornar na resposta o **número em claro** `xxx-xxx` (única vez que sai em claro) + a **mensagem pronta** + link `wa.me` do Whaviso. Persistir Pix obrigatório + titular/banco.
  - `editarAviso` (novo): aplica edição direta em `aguardando_aceite`; em `pendente`/`programado` salva snapshot, transiciona para `aguardando_aprovacao_aviso_editado`, **pausa o ciclo** (cancela/segura `envios` futuros), enfileira mensagem ao devedor, grava evento `editado`.
  - `desfazerEdicao` (novo): em `aguardando_aprovacao_aviso_editado` → restaura snapshot, volta a `programado`, evento `edicao_desfeita`.
  - `aprovarEdicao`/`recusarEdicao`: gatilhados pelo devedor (no aceite, E5) mas o estado e transição vivem aqui; recusa → notifica cobrador (`edicao_recusada`), cobrador escolhe reativar-anterior (=desfazer) ou reeditar.
  - `pausarAviso`/`reativarAviso` (novos): só a partir de aceito (`pendente`/`programado` ↔ `pausado`); enfileira mensagem ao devedor; eventos `pausado`/`reativado`; segura/retoma `envios`.
  - `cancelarAviso`: ampliar `cancelavel` para incluir `pausado` e `aguardando_aprovacao_aviso_editado`; se já aceito, **enfileirar notificação ao devedor** (via outbox de notificação ao destinatário — reusar mecanismo de envio do `envios`/template `aviso.cancelado`).
  - Limite (H2.3): tratar **free** explicitamente (free → erro `plano_nao_permite_criar`, sem cair em pessoal); ajustar `contarAtivos` para contar `pausado` e `aguardando_aprovacao_aviso_editado` como ativos.
- **avisos/index.ts (rotas):** `PATCH /avisos/:id` (editar), `POST /avisos/:id/desfazer-edicao`, `POST /avisos/:id/pausar`, `POST /avisos/:id/reativar`. Contratos novos em `packages/shared/src/contracts/payloads.ts` (`editarAvisoBody`, `criarAvisoResposta` com `numero_convite`/`mensagem_convite`/`link_whatsapp`).
- **Notificação ao devedor (pausa/reativa/cancela/edição):** decidir o transporte. O épico fala em "mensagem ao devedor". O mecanismo existente é a outbox `envios` (ciclo) e `notificacoes_cobrador` (cobrador). Para mensagens avulsas ao **devedor** fora do ciclo, ou se reusa `envios` com uma etapa/tipo avulso, ou cria nova fila. **Decisão em aberto §7.** A api só **enfileira**; o `zap` drena/envia (regra de fronteira).

### 3.3 Backend zap

- **Transporte das novas mensagens:** o `zap` já lê templates por chave (`shared/templates`) e drena outbox. Acrescentar o drenar/enviar das mensagens de `aviso.pausado/reativado/cancelado/edicao_a_aprovar` conforme a fila escolhida em §3.2. Sem lógica de negócio nova (zap é transporte). **Coalescing/espaçamento 10min** (H10.9) é do Épico 10 — se reusar a fila do cobrador, herda; se for fila nova, anotar dependência de E10.
- **Reconferência de estado no disparo:** garantir que o drainer de `envios` **descarta** envio quando o aviso está `pausado` ou `aguardando_aprovacao_aviso_editado` (não-ciclo). Verificar `enviar_lembretes` já reconfere status terminal; estender para os novos estados de pausa.

### 3.4 Frontend (`frontend/src/modules/avisos`)

- **schemas.ts:** Pix **obrigatório** no receber (`.refine` por direção); campos `pix_titular`, `pix_banco` (obrigatórios junto da chave). `SeletorChavePix` em `shared/pix` precisa expor/coletar titular+banco.
- **NovoAviso.tsx:** novos campos titular/banco; bloqueio de free (CTA de plano via Banner ao receber `plano_nao_permite_criar`/`limite_plano_atingido` — já há `limiteAtingido`).
- **AvisoCriado.tsx (H2.2):** mostrar o **número `xxx-xxx`** com destaque; botão **copiar a mensagem inteira** (intro + número + link); o botão WhatsApp deve abrir `wa.me` do **número do Whaviso** com texto *"Oi, aqui é [nome], meu convite é o xxx-xxx"*, não o telefone do convidado. Manter copiar-link.
- **DetalheAviso.tsx:** botões **Editar**, **Pausar/Reativar** (conforme estado), **Desfazer edição** (em `aguardando_aprovacao_aviso_editado`); ConfirmDialog de edição pós-aceite com o texto exato da H2.5 ("O Aviso editado precisa ser aprovado por [NOME]..."); rótulos/estados novos no dicionário de status do front (E13/E9). Página/modal de **edição** (reusa o form de NovoAviso).
- **api.ts:** hooks `useEditarAviso`, `useDesfazerEdicao`, `usePausarAviso`, `useReativarAviso`; estender `criarAvisoResposta` no contrato front.

### 3.5 Segurança / invariantes (Épico 13)

- Número de convite **só hash** no banco; claro só na resposta de criação (nunca persistir/logar). Reusar `sha256Hex`.
- Botão do WhatsApp leva **`aviso_id`** (não o número) no payload do webhook (já é o padrão; manter no E5).
- **Nunca logar** telefone/Pix/titular/banco/número de convite.
- Erros no envelope `{ error: { code, message } }` (helpers `regraNegocio/conflito/proibido` já fazem).
- Sem palavras proibidas (dívida/cobrança/atraso) nem travessão nas novas copies/templates; neutro de gênero. Validar templates novos contra `linguagem.ts` (api guarda ao salvar template, E13).
- Sem DELETE: edições/pausas são estado + evento append-only.

### 3.6 Testes

- **Unit:** geração de número 6 dígitos (formato `xxx-xxx`, aceita corrido e com hífen ao validar — função compartilhada com E5), hash, mapeamento.
- **Integração (vitest, banco `whaviso_dev`):**
  - H2.1: cria com Pix+titular+banco; rejeita sem Pix no receber; valor>0; nasce `aguardando_aceite`.
  - H2.2: **unicidade do número por telefone de devedor** sob colisão (forçar mesma seed → segundo INSERT regenera) — teste de corrida/colisão.
  - H2.3: free não cria (erro); pessoal estoura no teto; terminal não conta; `pausado`/`aguardando_aprovacao_aviso_editado` **contam** como ativo.
  - H2.4: nenhum `envio` criado em `aguardando_aceite`.
  - H2.5: editar antes do aceite = direto; depois = vai a `aguardando_aprovacao_aviso_editado` + lembretes pausados + snapshot; desfazer restaura; recusa notifica cobrador; transições inválidas barradas pelo trigger.
  - H2.6: cancelar em cada fase viva (incl. `pausado`/reaprovação); cancelar aceito enfileira notificação ao devedor; idempotente; terminal não re-cancela.
  - H2.7: pausar só de aceito; pausado não dispara; reativar volta ao ciclo; eventos gravados.
- **Corrida dedicada:** dois `criarAviso` concorrentes no limite do plano (sem janela de corrida — `SELECT ... FOR UPDATE`/constraint); geração de número sob concorrência no mesmo telefone.
- **Reconferência no disparo:** envio descartado quando aviso virou `pausado`/reaprovação entre o claim e o envio.

---

## 4. Sequência de passos

> Modelo: **sonnet** = mecânico/CRUD/copy/UI simples · **opus** = máquina de estados, corrida, idempotência, segurança.

1. **Migration de estados + transições + tipos de evento** (M-A). Recriar `validar_transicao_aviso()` com `pendente↔pausado`, `pendente↔aguardando_aprovacao_aviso_editado`, e voltas. Validar com `validate_migrations.sh`.
   *Arquivos:* `supabase/migrations/0025_*.sql`. *Critério:* H2.5/H2.7 (estados existem com transições). **Modelo: opus** — máquina de estados no banco, erro de transição quebra silenciosamente se mal feita.

2. **Migration número de convite + unicidade por telefone** (M-B). Índice único `(telefone_devedor, hash)`.
   *Arquivos:* `0026_*.sql`. *Critério:* H2.2 (unicidade, hash). **Modelo: opus** — a garantia de unicidade e o casamento com o loop de geração são a parte delicada.

3. **Migration Pix obrigatório + titular/banco** (M-C).
   *Arquivos:* `0027_*.sql`. *Critério:* H2.1 (Pix obrigatório, titular, banco). **Modelo: sonnet** — colunas + CHECK, mecânico.

4. **Migration snapshot de edição** (M-D, conforme decisão §7).
   *Arquivos:* `0028_*.sql`. *Critério:* H2.5 (desfazer/reativar-anterior). **Modelo: sonnet** — adiciona coluna/tabela; lógica fica no service.

5. **Catálogo de templates de notificação** (M-E): pausado/reativado/cancelado/edição.
   *Arquivos:* `0029_*.sql`. *Critério:* H2.5/H2.6/H2.7 (devedor é notificado). **Modelo: sonnet** — UPSERT de texto, padrão das 0023/0024; cuidar linguagem.

6. **Contratos compartilhados** (`packages/shared`): enums (`statusAviso`, `tipoEvento` novos), `criarAvisoBody` (Pix obrigatório receber + titular/banco), `criarAvisoResposta` (numero_convite/mensagem/link_whatsapp), `editarAvisoBody`. Função util de número `xxx-xxx` (gerar/normalizar) reusável por E5.
   *Arquivos:* `contracts/enums.ts`, `contracts/payloads.ts`, `contracts/entidades.ts`, novo util. *Critério:* H2.1/H2.2/H2.5. **Modelo: opus** — contrato é o casamento api↔front↔E5; normalização do número (corrido/hífen) é fácil de errar.

7. **criarAviso refeito** (geração número + retry unicidade + Pix/titular/banco + resposta nova).
   *Arquivos:* `apps/api/src/modules/avisos/service.ts`, `repo.ts`. *Critério:* H2.1, H2.2, H2.4. **Modelo: opus** — corrida de unicidade do número por telefone sob concorrência.

8. **Limite de plano: bloquear free + contar estados vivos** (H2.3).
   *Arquivos:* `avisos/service.ts`, `repo.ts` (`limiteDoPlano`/`contarAtivos`). Depende do catálogo `free` em E11 (ver §5). *Critério:* H2.3. **Modelo: opus** — validação sem janela de corrida (E11 H11.8).

9. **Endpoints + serviços de editar / desfazer-edição** (sub-ciclo de reaprovação, snapshot, pausa do ciclo, eventos, enfileira mensagem ao devedor).
   *Arquivos:* `avisos/index.ts`, `service.ts`, `repo.ts`. *Critério:* H2.5. **Modelo: opus** — sub-ciclo de estados + consistência (não deixar lembrete escapar durante reaprovação).

10. **Endpoints + serviços de pausar / reativar** (eventos, segura/retoma envios, enfileira mensagem).
    *Arquivos:* `avisos/index.ts`, `service.ts`, `repo.ts`. *Critério:* H2.7. **Modelo: opus** — interação com o scheduler/envios (não-disparo em pausado) é a parte sensível.

11. **cancelarAviso ampliado + notificação ao devedor quando aceito** (H2.6).
    *Arquivos:* `avisos/service.ts`, `repo.ts`. *Critério:* H2.6. **Modelo: opus** — abrange novos estados e enfileira mensagem (não pode logar telefone, idempotência).

12. **zap: transportar as novas mensagens + reconferir estado no disparo** (descarta envio em pausado/reaprovação).
    *Arquivos:* `apps/zap/src/modules/enviar_lembretes`, `notificar_cobrador` (ou fila nova conforme §7). *Critério:* H2.4/H2.5/H2.7 (nada dispara em pausa). **Modelo: opus** — claim `SKIP LOCKED` + reconferência de estado, ponto crítico do _CONTEXTO.

13. **Front: form de criar (Pix obrigatório + titular/banco) e bloqueio de free** (H2.1/H2.3).
    *Arquivos:* `frontend/src/modules/avisos/schemas.ts`, `pages/NovoAviso.tsx`, `shared/pix`. *Critério:* H2.1/H2.3. **Modelo: sonnet** — form + validação Zod, mecânico.

14. **Front: tela de convite com número `xxx-xxx` + copiar mensagem inteira + wa.me do Whaviso** (H2.2).
    *Arquivos:* `pages`/`components/AvisoCriado.tsx`. *Critério:* H2.2. **Modelo: sonnet** — UI de exibição/cópia; o `wa.me` aponta para o número do Whaviso (config), não para o convidado.

15. **Front: detalhe com Editar/Pausar/Reativar/Desfazer + ConfirmDialog de reaprovação + rótulos de status novos** (H2.5/H2.6/H2.7).
    *Arquivos:* `pages/DetalheAviso.tsx`, `api.ts`, dicionário de status. *Critério:* H2.5/H2.6/H2.7. **Modelo: sonnet** — UI sobre endpoints prontos; texto do ConfirmDialog literal da história.

16. **Testes de integração e corrida** (todos os critérios §3.6).
    *Arquivos:* `apps/api/src/modules/avisos/tests/*`, `apps/zap/.../tests/*`. *Critério:* todos H2.x + pontos críticos. **Modelo: opus** — escrever os testes de corrida (limite, unicidade, reconferência no disparo) exige raciocínio sobre concorrência.

17. **Atualizar docs/máquina de estados** (PROJETO.md §4, CLAUDE.md transições, `graphify update .`).
    *Arquivos:* `PROJETO.md`, `CLAUDE.md`. *Critério:* coerência da máquina de estados cross-épico. **Modelo: sonnet** — edição de doc.

---

## 5. Dependências de outros épicos

- **E1 (auth):** identidade do cobrador (nome pré-preenchido, `cobrador_id`); plano free read-only (H1.5).
- **E11 (planos/limites):** **catálogo `free`** precisa existir para H2.3 (hoje só pessoal/profissional/personalizado). A alavanca "qtd de edições por plano" (H2.5 último critério) é de E11. Validação no servidor (H11.8).
- **E12 (templates):** as mensagens de pausa/reativa/cancela/edição são templates por chave; o editor `/admin/mensagens/:chave` já existe.
- **E13 (linguagem):** invariantes de copy/lint/validação ao salvar template.
- **Máquina de estados (espinha cross-épico):** `pausado` e `aguardando_aprovacao_aviso_editado` são introduzidos **aqui** mas tocam E6 (scheduler ignora), E9 (painel exibe), E5 (3ª opção "dado incorreto"). A varredura `pendente→programado` do _CONTEXTO atravessa este épico (trigger+app+docs).
- **E5:** consome o número de convite (validação, anti-brute-force, recusa, "dado incorreto"). Este épico **entrega** o número + a unicidade + a decisão de que "dado incorreto" reusa edição-livre.
- **E10:** se a notificação ao devedor reusar a fila com espaçamento/coalescing, herda H10.9.
- **E6:** o ciclo só nasce no aceite (já é assim); pausa/reaprovação precisam que o scheduler reconfira estado.

---

## 6. Riscos e pontos de teste dedicado

- **Unicidade do número de 6 dígitos por telefone sob concorrência** (1M espaço, colisão real possível): loop de geração + índice único + teste de corrida. **Crítico.**
- **Sub-ciclo de edição** (editar→aguardando→aprovar/recusar/desfazer): risco de estado inconsistente ou lembrete escapando durante reaprovação. Teste de cada caminho + reconferência no disparo. **Crítico.**
- **Reconferência de estado no disparo** (`pausado`/reaprovação descartam envio entre claim e envio). **Crítico.**
- **Limite de plano sem janela de corrida** (dois POST simultâneos no teto). **Crítico.**
- **Notificação ao devedor** sem logar telefone/Pix; idempotência (cancelar duas vezes não duplica mensagem).
- **ALTER TYPE ADD VALUE** fora de transação que usa o valor (armadilha Postgres).
- **Pix obrigatório** retroativo: CHECK em tabela com linhas legadas sem Pix no cloud → backfill/condição (só novos, ou exigir só em `direcao=receber` criados após).

---

## 7. Decisões em aberto (confirmar com o humano — não inventadas)

1. **Hash do número:** reusar `aceite_token_hash` (já existe, já é unique) ou criar coluna dedicada `convite_hash`? Reusar mistura semântica (token opaco do link público de aceite vs número de convite); separar é mais limpo mas duplica. Afeta M-B e o aceite (E5).
2. **Onde guardar titular/banco da Pix:** colunas em `avisos` (denormalizado, simples) vs estender `chaves_pix` (titular/banco por chave reaproveitável) e copiar no INSERT. A 2ª é mais coerente com "chaves_pix é a fonte da verdade" (0012).
3. **Snapshot de edição:** coluna `dados_anteriores jsonb` em `avisos` vs tabela `avisos_edicoes` append-only (mais alinhada à regra de auditoria sem DELETE e ao "histórico de reedições" de E11). Recomendação: tabela append-only.
4. **Transporte da notificação ao devedor** (pausa/reativa/cancela/edição a aprovar): reusar a outbox `envios` com uma etapa/tipo avulso, criar fila nova `notificacoes_devedor`, ou reusar a maquinaria de `notificacoes_cobrador` generalizada? Decide se herda espaçamento/coalescing de E10. **Bloqueia §3.2/§3.3.**
5. **Free read-only:** confirmar que E11 cria o plano `free` (id) e que a regra é "free nunca cria" (vs "pessoal é o default sem assinatura"). Hoje o código cai em pessoal — precisa do catálogo free + decisão de qual é o plano default de quem não assinou.
6. **Recusa da edição pelo devedor (H2.5):** o fluxo "reativar nas condições anteriores OU reeditar" — o "reativar anterior" é o mesmo que "desfazer"? Confirmar para não criar dois caminhos.
7. **`wa.me` do Whaviso (H2.2):** o link de convite aponta para o **número do WhatsApp do Whaviso** (registrado na Meta Cloud API) com texto pré-preenchido. Confirmar de onde vem esse número (env/config) para o front montar o link.
