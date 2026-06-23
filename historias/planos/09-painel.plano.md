# Plano de desenvolvimento: Épico 09 — Painel de controle

> Fonte da verdade: `historias/09-painel.md`. Onde o código diverge da história, o trabalho é mudar o código.
> Estado do código inspecionado em 2026-06-22 (graphify CLI indisponível nesta máquina; leitura direta dos módulos `painel`, `avisos`, `recebimentos` no backend e `painel`/`avisos` no frontend, e dos contratos compartilhados).

---

## 1. Resumo do épico e escopo

O painel é a casa de quem tem conta: ver e agir sobre os combinados, **organizado por papel** ("A receber" = sou cobrador; "A pagar" = sou devedor), nunca por direção/fluxo. É **só leitura do banco + solicitação de ação**: nenhuma regra de negócio roda no front. Cobre o que o painel **mostra** (listas por papel, totais, "precisa de você", filtros por estado, detalhe com linha do tempo de eventos com ator, status de entrega dos avisos) e quais **ações** oferece por estado/papel (o efeito de cada ação vive nos épicos de origem 2 a 8).

**MVP 🟢 (entra agora):**
- H9.1 Listas por papel (a receber/a pagar), independentemente de quem criou.
- H9.2 Totais por papel no backend (a receber/recebido, a pagar/pago) + bloco "precisa de você"; terminais não-pagos fora dos totais.
- H9.3 Filtros por estado (rótulos novos), busca por nome/motivo no servidor, ordenação por data combinada, faixa "Sem aviso" separada, histórico de terminais.
- H9.4 Detalhe com linha do tempo de eventos (ator por transição; distingue "informado pelo devedor" de "marcado pelo cobrador"); sem dado sensível em log.
- H9.5 Ações por estado/papel (só solicita à API; relê após agir; envelope de erro).
- H9.7 Status de entrega por etapa (enviado/falha/retry) a partir de `envios`.
- H9.8 Espelho seguro do banco; free só visualiza + CTA de plano; isolamento por `profile.id`; revalida após ação; estados vazios.

**Gated 🟡 (fora do MVP, depende de modelagem de recorrência):**
- H9.6 Combinados recorrentes (progresso "k de N", uma linha por ocorrência nos filtros temporais, totais por período da ocorrência). Depende de E6 H6.10 / E8 H8.7, inexistentes. **Não implementar** além de deixar a UI/contratos preparados para um campo de recorrência futuro.

**Decisão de design transversal (em aberto):** layout/agrupamento do painel ("precisa de você" + totais + listas + Sem aviso sem poluir) exige estudo com a skill `frontend-design`/`artifact-design`, **mantendo o design system atual** (tokens salvia/papel/tinta, componentes `@/shared/ui`). Listado em §7.

---

## 2. Estado atual vs história (por critério)

Legenda: `[x]` ok · `[~]` parcial · `[!]` diverge (refatorar) · `[+]` não existe.

### H9.1 — Listas por papel
- `[~]` Painel tem abas "A receber"/"A pagar", **mas** são `SegmentedControl` que só navegam por rota para `/app/avisos?direcao=...`. O filtro é por **direção** (`receber`/`pagar`), **não por papel**. No fluxo *pagar invertido* o criador é o devedor, então `direcao=pagar` ≠ "sou devedor": isso **diverge** do critério "separação por papel, não por fluxo". (`frontend/src/modules/painel/pages/Painel.tsx`, `backend .../avisos/repo.ts#listarAvisos` filtra por `direcao`, não por papel.)
- `[!]` Listagem por papel inexistente no backend: `listarAvisos` aceita `status`/`direcao`, não `papel`.
- `[~]` Vínculo por telefone após criar conta: já há `devedor_profile_id`/`cobrador_id`; o item aparece se vinculado. OK na leitura, mas o backfill por telefone é de E1 (fora deste épico).
- `[x]` Cada item mostra nome/motivo/valor(R$)/data/estado (`ListaAvisos.tsx` colunas + `StatusBadge`).
- `[~]` Linguagem dos rótulos: a maioria respeita as regras, mas `expirado`="Encerrado sem confirmação" e abas usam "No ciclo"/"Em revisão"; precisam alinhar aos rótulos canônicos da história.

### H9.2 — Visão geral / totais / "precisa de você"
- `[!]` `/painel/resumo` existe e soma em centavos no backend, **mas**: (a) "a receber" = `aguardando_aceite + pendente` juntos no mesmo total `pendentes_centavos` (a história quer "ativos ainda não pagos", o que é defensável, porém o rótulo e a quebra divergem); (b) usa `status='pendente'` (estado antigo) em vez de `programado`; (c) **não exclui** explicitamente terminais não-pagos por construção (hoje só conta `aguardando_aceite/pendente/pago`, então terminais já ficam de fora — OK por acidente, vai quebrar quando entrarem `pausado`/`informado_pago`/`desregistrado`/`aguardando_aprovacao_aviso_editado`, que precisam contar como "ativos não pagos").
- `[+]` Bloco "precisa de você": inexistente no backend e no front. Nenhum endpoint agrega `informado_pago` (como cobrador) + "dado incorreto"/"telefone divergente" (E5) + edições a aprovar.
- `[x]` Totais calculados no backend (agregação SQL).
- `[~]` Rótulos sem termos proibidos: "A receber"/"A pagar"/"Recebidos"/"Pagos" OK; falta validar que nada novo introduza termo proibido.
- `[~]` Terminais não-pagos fora dos totais: hoje funciona por a query só somar 3 estados; precisa ser **intencional e completo** quando os estados novos existirem.

### H9.3 — Filtrar / buscar / por estado
- `[~]` Filtro por estado existe (`Select` na `ListaAvisos`), mas só com os 6 estados antigos. Faltam `sem_aviso`, `programado`, `pausado`, `aguardando_aprovacao_aviso_editado`, `desregistrado`, `recusado` (não existem no enum).
- `[!]` Busca por nome é **no cliente sobre a página carregada** (`per_page:100`, filtro `.includes`); a história quer busca por nome **ou motivo**; e a busca client-side falha além da 1ª página. Refatorar para parâmetro `busca` no servidor.
- `[+]` Ordenação por data combinada / "próximo da data": hoje a lista ordena por `criado_em desc`; não há ordenação por `data_combinada` nem destaque de proximidade.
- `[+]` Faixa "Sem aviso" separada (E4 H4.2): estado `sem_aviso` não existe; faixa inexistente.
- `[+]` Histórico de terminais separado da lista ativa: hoje terminais aparecem como abas comuns; não há separação ativos×histórico.

### H9.4 — Detalhe com linha do tempo
- `[x]` Detalhe mostra dados + estado + linha do tempo de eventos cronológica (`DetalheAviso.tsx`, `GET /avisos/:id/eventos`, `eventos_aviso` append-only com `ator`).
- `[~]` Eventos novos: `solicitou_pix`, `optout`, `recusado` já estão no enum de `tipoEvento` e no `ROTULO_EVENTO`; **faltam** eventos de pausa/reativação, edição/aprovação, e "reativação"/"reregistro" (`desregistrado`→`programado`) que dependem dos estados novos (E2/E7).
- `[!]` Distinção ator: o backend já grava `ator` por evento. Mas o front mapeia `ROTULO_ATOR.cobrador='Você'` e `devedor='A pessoa'` **fixo**, assumindo que o usuário logado é sempre o cobrador. Na visão "A pagar" (sou devedor) isso fica invertido e errado. Precisa resolver o rótulo do ator **relativo ao papel do usuário naquele combinado**.
- `[~]` Nada sensível em log: o detalhe exibe Pix/telefone para o dono (OK), mas confirmar que nenhum log do backend imprime esses campos (invariante E13). Hoje o serviço não loga; manter guarda.
- `[x]` Eventos refletem só o banco; sem recálculo no front.

### H9.5 — Agir conforme o estado
- `[~]` Ações por estado existem no detalhe (confirmar/rejeitar/desmarcar/cancelar) com gating client-side (`podeConfirmar` etc.) e endpoints reais (`recebimentos`, `avisos/cancelar`). **Mas**: faltam ações dos estados novos (ativar/editar/descartar/marcar-pago de `sem_aviso`; pausar/reativar; desfazer edição; reabrir de `pago`; reengajar; reenviar/compartilhar convite em `aguardando_aceite`). Reabrir `pago→pendente` existe como "desmarcar" (`desmarcarRecebimento`) — alinhar nome/UX a "reabrir" (E8 H8.6).
- `[x]` Painel só solicita; API+trigger validam; erro mostrado.
- `[~]` Erro do envelope `{error:{code,message}}`: o front hoje mostra mensagem genérica ("Não foi possível concluir") em vez do `message` do envelope. Melhorar para exibir a mensagem do backend sem travar.
- `[~]` Ações indisponíveis não aparecem: o gating client-side faz isso, mas está incompleto e usa estados antigos.
- `[x]` Relê após agir: invalidação de query (TanStack) já cobre detalhe+lista+resumo.

### H9.6 — Recorrentes 🟡
- `[+]` Nada existe. Sem modelagem de recorrência (E6 H6.10/E8 H8.7). **Gated**, não implementar.

### H9.7 — Status de entrega
- `[x]` `GET /avisos/:id/envios` serve `envios` (etapa, status, tentativas, horário) e o front mostra `CycleTimeline`.
- `[~]` Rótulos enviado/falha/retry: `ROTULO_STATUS_ENVIO` cobre agendado/enviado/falhou/cancelado; **não há rótulo de "retry"/"em nova tentativa"** explícito (depende de E6 H6.8 expor tentativas/`proxima_tentativa_em`; campos já existem em `envios`). Falhas persistentes (3 retries esgotados) não têm tratamento visual distinto.
- `[x]` Nada sensível junto do status.

### H9.8 — Só leitura / free / sempre atualizado
- `[x]` Front exibe API e solicita; dados via REST; TanStack Query.
- `[+]` **Plano free só visualiza**: o painel **não** desabilita ações nem mostra CTA de plano para free. Botões "Novo aviso"/ações aparecem sempre. Diverge.
- `[~]` Isolamento por `profile.id`: as queries filtram por `cobrador_id`/`devedor_profile_id = uid`. OK. RLS deny-all é de E1/infra.
- `[x]` Revalida após ação.
- `[~]` Estados vazios: `EmptyState` existe na lista; faltam telas vazias próprias para "precisa de você", agenda vazia e histórico vazio.

### Divergências da seção do épico (cada uma é trabalho)
- `[+]` Rótulos/filtros de estados novos (`sem_aviso`, `programado`, `pausado`, `aguardando_aprovacao_aviso_editado`, `recusado`, `desregistrado`).
- `[+]` "Precisa de você" (agrega `informado_pago` + dado incorreto + telefone divergente + edição a aprovar).
- `[~/+]` Linha do tempo com eventos novos e **ator relativo ao papel**.
- `[~]` Status de entrega com retry/falha persistente.
- `[+]` Recorrência (🟡 gated).
- `[+]` Free visualiza tudo (inclusive agenda) mas sem ações de envio.

---

## 3. Trabalho por camada

### 3.1 Arquitetura / Dados
- **Estados novos no enum** (`backend/packages/shared/src/contracts/enums.ts` + migration de `enum`): a história depende de `sem_aviso`, `programado` (renomeado de `pendente`), `pausado`, `aguardando_aprovacao_aviso_editado`, `recusado`, `desregistrado`. **Estes estados pertencem a E2/E4/E5/E7** — o painel **consome** e **rotula**, não os cria. O plano do E9 deve **assumir que esses estados já existem** (dependência) e tratar o caso de eles **ainda não existirem**: rotular só os que houver e não quebrar. A varredura `pendente→programado` (trigger + app + PROJETO.md/CLAUDE.md) é cross-épico (E6/máquina de estados); o E9 só ajusta seus rótulos/queries quando ela ocorrer.
- **Sinalizações de "dado incorreto"/"telefone divergente" (E5):** precisam de uma fonte consultável (coluna/flag em `avisos` ou evento específico em `eventos_aviso`). É de E5; o E9 lê. Confirmar com o plano de E5 qual o formato (provável: eventos `dado_incorreto`/`telefone_divergente` + um estado/flag).
- **Índices:** o painel filtra por `(cobrador_id, status)` e `(devedor_profile_id, status)` e ordena por `data_combinada`. Avaliar índices parciais por papel+status e um por `data_combinada` para a ordenação/agenda (migration nova, append-only ao schema). Não há DELETE.
- **Sem nova tabela neste épico** (recorrência fica gated). `notificacoes_cobrador` e `envios` já existem; o painel só lê.

### 3.2 Backend api
- **Listagem por papel** (`avisos` módulo): adicionar parâmetro `papel: 'cobrador'|'devedor'` em `listarAvisosQuery` e no `repo.listarAvisos` (filtra por `cobrador_id=uid` quando papel=cobrador; `devedor_profile_id=uid` quando papel=devedor). Manter `direcao` opcional, mas a UI passa a usar **papel**.
- **Busca no servidor**: parâmetro `busca` (ILIKE em `nome_devedor`/`nome_cobrador`/`motivo`), com índice trigram ou simples `lower(...)`. Remover a busca client-side.
- **Ordenação**: parâmetro `ordenar=data_combinada|criado_em` e `dir=asc|desc`; default por `data_combinada asc` para os ativos.
- **Agrupamento ativos × histórico**: a API expõe estados; o front decide a faixa. Opcional: endpoint/flag `grupo=ativos|historico|sem_aviso` que mapeia conjuntos de estados no servidor (evita o front "saber regra de negócio" sobre quais estados são terminais). **Preferir o servidor decidir o conjunto** (alinha com H9.8).
- **Resumo `/painel/resumo`**: reescrever a agregação para:
  - `a_receber` = soma+contagem de avisos onde sou cobrador e status ∈ {ativos-não-pagos} (`aguardando_aceite`, `programado`, `informado_pago`, `pausado`, `aguardando_aprovacao_aviso_editado`, `desregistrado`);
  - `recebido` = sou cobrador e `pago`;
  - `a_pagar` = sou devedor e status ∈ {ativos-não-pagos};
  - `pago` = sou devedor e `pago`;
  - terminais não-pagos (`cancelado`/`recusado`/`expirado`) **nunca** entram.
  - Definir o conjunto "ativos-não-pagos" **em um só lugar** (constante compartilhada) para casar resumo + listagem + histórico.
- **Endpoint "precisa de você"** (`/painel/pendencias` ou campo no `/painel/resumo`): retorna os combinados que aguardam ação do usuário: como cobrador, os em `informado_pago` (+ contagem) e sinalizações de dado incorreto/telefone divergente (quando E5 existir); como qualquer papel, edições a aprovar (`aguardando_aprovacao_aviso_editado`). Itens identificados por `aviso_id` + tipo de pendência (sem dado sensível).
- **Detalhe de eventos**: já existe (`/avisos/:id/eventos`). Garantir que o `ator` venha sempre e adicionar, se faltar, os tipos de evento novos (pausa/reativação/edição/aprovação) ao enum `tipoEvento` quando os épicos de origem os gravarem.
- **Ações novas** (em seus módulos de origem, o E9 só as **expõe/aciona**): `reabrir` (pago→programado, E8 H8.6 — hoje é `desmarcar-recebimento`, alinhar rota/semântica), `pausar`/`reativar` (E2), `desfazer-edicao` (E2 H2.5), `ativar`/`descartar`/`editar`/`marcar-pago` de agenda (E4), `reenviar/compartilhar convite` (E5). O E9 garante que o painel **chame** a ação certa e relê.
- **Free read-only**: a API já valida limite na criação. Para o painel, expor no perfil/billing o flag de "pode agir" (plano) para o front decidir CTA, **mas** a autoridade continua na API (ação proibida → envelope de erro). Não duplicar regra no front.

### 3.3 Backend zap
- **Sem trabalho direto neste épico.** O painel não fala com o zap. O E9 apenas **lê** o que o zap grava em `envios` (status/tentativas/retry, E6 H6.8) e em `eventos_aviso` (via api). Dependência: o zap precisa registrar `enviado`/`falhou`/retry e `proxima_tentativa_em` corretamente (E6) para H9.7. Garantir (com E6) que o zap **não loga** telefone/conteúdo junto do status.

### 3.4 Frontend
- **Painel por papel real**: trocar as abas que navegam por `direcao` por uma seleção de **papel** que filtra a lista via `papel=cobrador|devedor`. Atualizar `ROTULO_DIRECAO`/criar `ROTULO_PAPEL` ("A receber"/"A pagar").
- **StatCards** alimentados pelo resumo reescrito: a receber/recebido (papel cobrador), a pagar/pago (papel devedor). Linguagem sem termos proibidos.
- **Bloco "precisa de você"**: novo componente no topo do painel, alimentado pelo endpoint de pendências; destaca `informado_pago` ("Aguardando sua confirmação"), dado incorreto, telefone divergente, edição a aprovar; cada item leva ao detalhe.
- **Filtros por estado** (`ListaAvisos`): atualizar `ABAS`/`Select` com os rótulos canônicos da história:
  `sem_aviso`→"Sem aviso", `aguardando_aceite`→"Aguardando aceite", `programado`→"Programado", `informado_pago`→"Pagamento informado" (cobrador: "Aguardando sua confirmação"), `pago`→"Pago/Recebido", `pausado`→"Pausado", `aguardando_aprovacao_aviso_editado`→"Aguardando aprovação da edição", `desregistrado`→"Lembretes desativados", terminais (`cancelado`/`recusado`/`expirado`)→Histórico. Atualizar `ROTULO_STATUS_AVISO` em `shared/format`.
- **Faixa "Sem aviso"**: seção/aba separada (não mistura com ativos), com acesso às ações de agenda (de E4).
- **Histórico**: aba/seção própria para terminais, fora da lista ativa.
- **Busca**: passar `busca` ao backend (debounce); remover filtro client-side.
- **Ordenação**: controle de ordenar por data combinada; destaque visual de proximidade da data (sem palavra "vencimento").
- **Detalhe / linha do tempo**: rótulo do **ator relativo ao papel** — calcular se o usuário é cobrador ou devedor naquele aviso e mapear `ator` para "Você" / "A outra pessoa" corretamente nos dois lados. Adicionar rótulos para eventos novos. Distinguir "informado pelo devedor" × "marcado/confirmado pelo cobrador".
- **Ações por estado**: ampliar o painel de ações do detalhe (e/ou ações inline na lista) para os estados novos, sempre só **solicitando** à API; exibir o `message` do envelope de erro sem travar; relê após agir.
- **Status de entrega**: na `CycleTimeline`, distinguir retry/"em nova tentativa" e falha persistente (3 retries) usando `tentativas`/`proxima_tentativa_em`. Adicionar rótulo de retry em `ROTULO_STATUS_ENVIO` (ou derivar).
- **Free read-only + CTA**: quando o plano for free, esconder/desabilitar ações que exigem plano e mostrar CTA de plano (E1 H1.5/E11), sem quebrar navegação; visualização (incluindo agenda) permanece.
- **Estados vazios**: telas próprias para painel sem combinados, "precisa de você" vazio, agenda vazia, histórico vazio.
- **Contratos Zod do front** (`frontend/src/shared/contracts`): espelhar os estados novos, o parâmetro `papel`/`busca`/`ordenar`, e o payload de pendências.

### 3.5 Segurança
- Isolamento por `profile.id` em **toda** query nova (listagem por papel, pendências, resumo): nunca aceitar id de outro usuário; sempre derivar de `req.userId`.
- Envelope `{error:{code,message}}` em todos os erros; nada de stack/SQL vazando.
- **Nunca logar** telefone/Pix/titular/token (E13). Revisar que os novos endpoints (pendências, resumo) não logam payload com esses campos. Pix aparece **só** para o dono no detalhe; número de convite nunca em claro (já é hash).
- Free read-only: a autoridade da restrição é a **API** (ação proibida retorna erro), o front só esconde/CTA. Não confiar no front para barrar.
- Pendências e status de entrega expostos **sem** conteúdo de mensagem nem telefone.

### 3.6 Testes
- **Unit (api):** resumo por papel (centavos corretos; terminais não-pagos excluídos; estados novos contados como ativos-não-pagos); listagem por papel (cobrador vê só onde é cobrador; devedor idem; invertido cai no papel certo, não na direção); busca por nome/motivo; ordenação por data combinada.
- **Unit (api):** "precisa de você" agrega só os do usuário; `informado_pago` só para o cobrador; nada vaza de outro usuário.
- **Integração:** após uma ação (confirmar/rejeitar/cancelar/pausar/reabrir), o resumo e as listas refletem o novo estado (relê do banco).
- **Segurança:** usuário A não vê/age sobre avisos de B (isolamento) em todos os novos endpoints; free recebe erro ao tentar ação que exige plano.
- **Linguagem (E13):** teste que varre rótulos/respostas dos novos endpoints e do dicionário do front por palavras proibidas e travessão (idealmente reusar o lint/validação de `contracts/linguagem.ts`).
- **Frontend:** rótulo de ator relativo ao papel (cobrador vê "Você" no evento de cobrador; devedor vê "A outra pessoa"); estados vazios; CTA de plano em free; gating de ações por estado.
- **Não há ponto de corrida próprio do E9** (o painel não escreve). As corridas (fila/coalescing, horário reservado) são de E6/E8/E10; o E9 só relê. Não duplicar esses testes aqui.

---

## 4. Sequência de passos

> Modelo: **sonnet** = mecânico/UI/CRUD/rótulos; **opus** = agregação correta sem termo proibido, semântica de estados/ator, decisões de fronteira de segurança.

**P1. Alinhar enum de estados e rótulos (front + shared) — preparar o vocabulário do painel.**
Objetivo: refletir os estados-alvo (`sem_aviso`, `programado`, `pausado`, `aguardando_aprovacao_aviso_editado`, `recusado`, `desregistrado`) e seus rótulos canônicos; tratar ausência graciosa enquanto E2/E4/E5/E7 não os criam.
Arquivos: `backend/packages/shared/src/contracts/enums.ts`, `frontend/src/shared/contracts/enums.ts`, `frontend/src/shared/format/index.ts` (`ROTULO_STATUS_AVISO`).
Critério: H9.3 (rótulos por estado), Divergência "rótulos de novos estados".
Modelo: **sonnet** — é mapeamento de rótulos/enum, mecânico. (Atenção: a migration do enum em si é de E2/E4/E5/E7; aqui só o lado de contrato/rótulo.)

**P2. Reescrever `/painel/resumo` por papel, com conjunto "ativos-não-pagos" único.**
Objetivo: totais a receber/recebido (cobrador) e a pagar/pago (devedor) em centavos, excluindo terminais não-pagos; constante compartilhada de estados ativos.
Arquivos: `backend/apps/api/src/modules/painel/index.ts`, `backend/packages/shared/src/contracts/payloads.ts`, possível `shared` p/ a constante de estados.
Critério: H9.2 (totais no backend, terminais fora, rótulos sem termo proibido).
Modelo: **opus** — agregação precisa por papel com semântica de estados e invariante de linguagem; erro aqui distorce números.

**P3. Endpoint "precisa de você".**
Objetivo: agregar pendências de ação do usuário (informado_pago como cobrador; dado incorreto/telefone divergente quando E5 existir; edição a aprovar), por `aviso_id`, sem dado sensível.
Arquivos: módulo `painel` (novo handler/serviço), `payloads.ts`, contratos do front.
Critério: H9.2 (destaque "precisa de você").
Modelo: **opus** — define a fronteira de "o que exige ação" cruzando vários estados/eventos e segurança (só do usuário, sem vazar).

**P4. Listagem por papel + busca/ordenação no servidor + agrupamento ativos/histórico/sem_aviso.**
Objetivo: `papel`, `busca` (nome/motivo), `ordenar=data_combinada`, e o servidor decidir o conjunto de cada faixa.
Arquivos: `backend/apps/api/src/modules/avisos/index.ts`, `service.ts`, `repo.ts`, `payloads.ts` (`listarAvisosQuery`), índices (migration de índice).
Critério: H9.1 (por papel), H9.3 (busca/ordenar/faixas/histórico).
Modelo: **opus** — papel ≠ direção (invertido), e o agrupamento ativos×terminal é regra de negócio que deve viver no servidor (H9.8).

**P5. Painel front por papel: StatCards do novo resumo + bloco "precisa de você" + abas por papel.**
Objetivo: substituir a navegação por direção por seleção de papel; consumir resumo e pendências.
Arquivos: `frontend/src/modules/painel/pages/Painel.tsx`, `frontend/src/modules/painel/api.ts`, novo componente "PrecisaDeVoce".
Critério: H9.1, H9.2.
Modelo: **sonnet** — montagem de UI sobre endpoints prontos, sem regra de negócio.

**P6. Lista front: filtros por estado (rótulos novos), busca/ordenação via servidor, faixa "Sem aviso" e histórico separados.**
Objetivo: refletir P1/P4 na `ListaAvisos`; remover busca client-side; seções ativos/Sem aviso/histórico.
Arquivos: `frontend/src/modules/avisos/pages/ListaAvisos.tsx`, `api.ts`, `schemas.ts`.
Critério: H9.3.
Modelo: **sonnet** — UI de filtros/listas sobre API pronta.

**P7. Detalhe: ator relativo ao papel + eventos novos + distinção informado×marcado.**
Objetivo: rótulo de ator correto nos dois lados (cobrador/devedor); rótulos de eventos novos; deixar claro quem fez o quê.
Arquivos: `frontend/src/modules/avisos/pages/DetalheAviso.tsx`, `frontend/src/shared/format/index.ts` (`ROTULO_EVENTO`/`ROTULO_ATOR`), possivelmente uma função `rotuloAtor(papelDoUsuario, ator)`.
Critério: H9.4.
Modelo: **opus** — a lógica do ator relativo ao papel é sutil e fácil de inverter; a história destaca explicitamente essa distinção.

**P8. Ações por estado no painel/detalhe (acionar endpoints de origem) + erro do envelope + relê.**
Objetivo: oferecer só ações válidas por estado/papel (ativar/editar/descartar/marcar-pago de agenda; pausar/reativar; desfazer edição; reabrir; reenviar convite; confirmar/rejeitar); exibir `message` do envelope; revalidar.
Arquivos: `frontend/src/modules/avisos/pages/DetalheAviso.tsx`, `api.ts`; alinhar rota `desmarcar-recebimento`→semântica "reabrir" com E8 (`backend .../recebimentos`).
Critério: H9.5.
Modelo: **opus** — o mapa estado×papel→ações é a parte crítica de "não sugerir transição inválida"; depende de acertar a máquina de estados.

**P9. Status de entrega: retry/"em nova tentativa" e falha persistente na timeline.**
Objetivo: distinguir agendado/enviado/em retry/falhou definitivo a partir de `tentativas`/`proxima_tentativa_em`.
Arquivos: `frontend/src/shared/ui/CycleTimeline.tsx`, `frontend/src/shared/format/index.ts`; confirmar que o backend (E6) popula esses campos em `envios`.
Critério: H9.7.
Modelo: **sonnet** — derivação de rótulo a partir de campos já existentes; sem regra de negócio nova.

**P10. Free read-only + CTA de plano + estados vazios.**
Objetivo: quando free, esconder/desabilitar ações de envio e mostrar CTA (E1/E11); telas vazias próprias; visualização (inclusive agenda) intacta. Autoridade da restrição na API.
Arquivos: front (guarda de plano vindo de billing/perfil), `Painel.tsx`, `ListaAvisos.tsx`, `DetalheAviso.tsx`, `EmptyState`s.
Critério: H9.8.
Modelo: **sonnet** — gating de UI + CTA, sem regra de negócio (a API barra de fato).

**P11. Testes (api + front) e varredura de linguagem.**
Objetivo: cobrir resumo por papel/terminais excluídos, listagem/busca por papel, pendências só do usuário, isolamento, free barrado pela API, ator relativo ao papel, ausência de termos proibidos nos novos rótulos/respostas.
Arquivos: `backend/apps/api/src/modules/painel/tests/`, `.../avisos/tests/`, `.../recebimentos/tests/`, testes do front.
Critério: todos os H9.x + invariantes E13.
Modelo: **opus** — desenhar os casos de isolamento/semântica de papel e a varredura de linguagem exige cuidado; a execução pode ser mecânica.

**P12. (🟡 gated, NÃO implementar agora) Recorrência no painel.**
Objetivo: registrar como dependente de E6 H6.10 / E8 H8.7. Deixar UI/contratos com um ponto de extensão (campo de recorrência opcional) sem lógica.
Critério: H9.6.
Modelo: **sonnet** — só anotação/stub; nenhuma regra até a modelagem existir.

---

## 5. Dependências de outros épicos (precisa estar pronto antes)
- **Máquina de estados** (espinha cross-épico): `programado` (renome de `pendente`), `pausado`, `sem_aviso`, `aguardando_aprovacao_aviso_editado`, `recusado`, `desregistrado`. O painel rotula/filtra/conta esses estados; sem eles, P1/P2/P4/P6 ficam parciais.
- **E2/E3** (criar/editar/pausar/cancelar; `aguardando_aprovacao_aviso_editado`): origem das ações de P8 e do estado de edição.
- **E4** (modo agenda, `sem_aviso`): faixa "Sem aviso" (H9.3) e ações de agenda (P6/P8).
- **E5** (aceite WhatsApp, `recusado`, dado incorreto, telefone divergente): alimenta "precisa de você" (P3) e eventos da timeline (P7).
- **E6** (ciclo de lembretes, `envios` com status/retry, E6 H6.8): status de entrega (P9).
- **E7** (`solicitou_pix`, `desregistrado`, reativação): eventos da timeline (P7).
- **E8** (informado_pago→pago/programado, reabrir, ator das transições): "precisa de você", ações e distinção de ator (P3/P7/P8).
- **E10** (notificações ao cobrador): não bloqueia o painel; o painel só mostra o estado resultante. Não importar.
- **E11/E1** (planos/free read-only, CTA): P10.
- **E13** (linguagem): invariante de todos os rótulos/respostas.

---

## 6. Riscos e pontos de teste dedicado
- **Papel × direção no fluxo invertido (alto):** o erro mais provável é o painel filtrar por `direcao` e colocar o invertido no lado errado. Teste dedicado: um aviso *pagar invertido* (criador=devedor) tem de aparecer em "A pagar" do criador e em "A receber" de quem aceitou como cobrador.
- **Totais com estados novos (alto):** ao entrarem `pausado`/`informado_pago`/`desregistrado`/`aguardando_aprovacao_aviso_editado`, eles devem contar como "ativos não pagos"; terminais não-pagos jamais. Constante única + teste por estado.
- **Ator relativo ao papel (médio):** fácil inverter "Você"/"A outra pessoa" no lado devedor. Teste nos dois lados.
- **Free barrado de fato (médio):** garantir que esconder no front não é a única barreira; a API recusa a ação (envelope de erro). Teste de API.
- **Vazamento de dado sensível (médio):** pendências/status de entrega não podem conter telefone/Pix/conteúdo; Pix só no detalhe do dono; nada em log. Teste + revisão de logs.
- **Busca/ordenação no servidor (baixo):** confirmar que a busca cobre nome e motivo e que a ordenação por data combinada não quebra a paginação.
- **Sem ponto de corrida no E9:** o painel não escreve; não recriar testes de fila/coalescing/horário reservado (são E6/E8/E10).

---

## 7. Decisões em aberto (confirmar com humano — não inventar)
- **Visual/UX do painel (design):** como acomodar "precisa de você" + totais + listas + faixa "Sem aviso" + histórico sem poluir. Exige estudo com a skill `frontend-design`/`artifact-design`, mantendo o design system (tokens e `@/shared/ui` atuais). Decidir o layout antes de P5/P6.
- **Quebra dos totais de "a receber":** somar `aguardando_aceite` junto com `programado` num único total, ou separar "aguardando aceite" de "no ciclo"? A história pede "ativos ainda não pagos" (sugere somar), mas o resumo atual já separa contagens. Confirmar a apresentação.
- **Forma de "dado incorreto"/"telefone divergente" (E5):** evento(s) em `eventos_aviso` vs flag/coluna em `avisos`. O E9 consome; precisa do contrato de E5 para "precisa de você" (P3). Alinhar com o plano de E5.
- **"Reabrir" (E8 H8.6) vs "desmarcar-recebimento" atual:** unificar nome/rota/semântica (pago→programado). Confirmar com o plano de E8 para não duplicar endpoint.
- **Recorrência (H9.6 🟡):** depende inteiramente da modelagem de ocorrências (E6 H6.10/E8 H8.7), inexistente. Confirmar que fica fora do MVP e qual a fonte de dados de ocorrências quando vier.
- **Faixa "Sem aviso" no servidor vs front:** preferência por o servidor decidir o conjunto de estados de cada faixa (alinha H9.8). Confirmar.
