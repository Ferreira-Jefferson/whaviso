# Verificação — Épico 09: Painel de controle

## Veredito (32 [x] · 3 [~] · 1 [!] · 0 [+])

O painel está implementado de forma robusta e fiel à história: visões por papel, totais por papel calculados no backend, "precisa de você", filtros/faixas decididos no servidor, linha do tempo com ator relativo, status de entrega por etapa, só-leitura via API e revalidação. Uma divergência REAL ([!]): o evento de cancelamento gravado no banco (`cancelado_criador`, migration 0035) NÃO existe no enum `tipoEvento` dos contratos (backend e frontend) nem em `ROTULO_EVENTO`, então a linha do tempo (H9.4) quebra/omite o evento de cancelamento. As [~] são parciais de baixo risco (recorrência é 🟡 da própria história; "precisa de você" não cobre dado_incorreto/telefone_divergente que a própria história marca como gated).

---

## H9.1: Ver meus combinados organizados por papel

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Duas visões: "A receber" (cobrador) e "A pagar" (devedor) | [x] | `Painel.tsx:25-28` (ABAS por papel); `ListaAvisos.tsx:198-207` (SegmentedControl papel); filtro `papel` em `repo.ts:150-152` (cobrador_id/devedor_profile_id) | `listagem_papel.test.ts:50-66` |
| Separação por papel, não por fluxo (cobre receber e pagar invertido) | [x] | `repo.ts:148-152` filtra por posição (cobrador_id/devedor_profile_id), não por `direcao` | `listagem_papel.test.ts:58-66` (invertido direcao=pagar entra em papel=cobrador) |
| Sem conta -> conta (vínculo por telefone) aparece após vincular profile.id | [~] | A listagem é por `profile.id` (`repo.ts:150-152`); o vínculo por telefone é feito no aceite/signup (E5/E1), fora deste épico. Confirma-se que, com `profile.id` preenchido, aparece. Sem teste específico de "entrou sem conta e depois vinculou" neste épico | sem teste local (vínculo é E5/E1) |
| Cada item mostra: outra ponta (nome), motivo, valor (R$), data combinada e estado com rótulo | [x] | `ListaAvisos.tsx:140-175` (colunas nome/motivo/MoneyText/dataPtBR/StatusBadge) | n/d (UI) |
| Linguagem dos rótulos respeita regras de ouro | [x] | `format/index.ts:69-81` (ROTULO_STATUS_AVISO), `:160-163` (ROTULO_PAPEL "A receber"/"A pagar"), auditado pelo teste de linguagem | `linguagem.test.ts` |

## H9.2: Visão geral (totais)

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| "A receber": totais (qtd + R$) de a receber (ativos não pagos) e recebido (pago) | [x] | `painel/repo.ts:33-47` (a_receber_c/q via ATIVOS_SQL; recebido via status='pago' cobrador) | `painel.test.ts:58-62` |
| "A pagar": totais de a pagar (ativos não pagos) e pago | [x] | `painel/repo.ts:41-47` (a_pagar/pago via devedor_profile_id) | `painel.test.ts:63-66` |
| "Precisa de você": informado_pago (cobrador) + dado incorreto/telefone divergente + edições a aprovar | [~] | `painel/repo.ts:96-119` cobre `confirmar_pagamento` (informado_pago) e `aprovar_edicao`. `dado_incorreto`/`telefone_divergente` NÃO emitidos; o próprio contrato os marca como gated E5 (`payloads.ts:231-232`) | `painel.test.ts:126-145` |
| Totais calculados no backend a partir de estado + valor (centavos) | [x] | `painel/repo.ts:32-54` (sum filter no SQL, centavos); front só exibe (`Painel.tsx:155-184`) | `painel.test.ts:52-72` |
| Rótulos dos totais sem termos proibidos | [x] | `Painel.tsx:156-183` ("A receber"/"Recebido"/"A pagar"/"Pago") | `linguagem.test.ts` |
| Terminais não-pagos (cancelado/recusado/expirado) fora dos totais a receber/a pagar | [x] | `estados.ts:12-25` (ATIVOS_NAO_PAGOS exclui terminais; TERMINAIS_NAO_PAGOS à parte); `painel/repo.ts:35-44` usa ATIVOS_SQL | `painel.test.ts:44-46,58-59` (cancelado/expirado não contam) |

## H9.3: Filtrar, buscar e ver por estado

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Filtrar por estado com rótulos claros (sem_aviso/aguardando_aceite/programado/informado_pago(cobrador="Aguardando sua confirmação")/pago/pausado/aguardando_aprovacao/desregistrado/terminais no histórico) | [x] | `format/index.ts:69-92` (ROTULO_STATUS_AVISO + rotuloStatusAviso por papel); `ListaAvisos.tsx:45-65,238-249` (sub-filtro por faixa) | `linguagem.test.ts` |
| Buscar por nome da outra ponta ou motivo | [x] | `repo.ts:165-172` (ILIKE nome_devedor OR nome_cobrador OR motivo, server-side) | `listagem_papel.test.ts:68-75` |
| Ordenar por data combinada; ver o que está próximo (sem termo acusatório) | [x] | `repo.ts:178-184` (ordenar data_combinada); `ListaAvisos.tsx:114-117`; rótulo "Data combinada" `:166` | n/d (UI) |
| Faixa "Sem aviso" separável dos ativos, com ações de agenda | [x] | `estados.ts:30-31,39-48` (AGENDA separada); `ListaAvisos.tsx:33-40` (faixa própria); ações de agenda em `DetalheAviso.tsx:364-398` (ativar/editar/descartar/marcar pago) | `painel.test.ts` (grupo); `modo_agenda.test.ts` |
| Estados terminais num histórico consultável | [x] | `estados.ts:27-28` (HISTORICO); `ListaAvisos.tsx:39` ("Encerrados") | `listagem_papel.test.ts:77-84` (grupo=ativos exclui terminais) |

## H9.4: Detalhe com linha do tempo de eventos

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Detalhe: dados + estado atual + linha do tempo (auditoria append-only), ordem cronológica | [x] | `DetalheAviso.tsx:266-355` (dados + Histórico); `avisos/repo.ts:483-491` (listarEventosDoAviso order by criado_em asc) | n/d |
| Aparecem eventos: criado, convite gerado, aceite/recusa, lembretes enviados, "já paguei" (informado_pago), solicitou_pix, opt-out (desregistrado), reativação, confirmação/rejeição, pausa/reativação, edição/aprovação | [x] | `enums.ts:44-69` (tipoEvento inclui solicitou_pix, ja_paguei_devedor, optout, desregistrado, etc.); `format/index.ts:184-209` (ROTULO_EVENTO) | n/d |
| Distingue "informado pelo devedor" de "marcado/confirmado pelo cobrador", mostrando o ATOR | [x] | `format/index.ts:229-234` (rotuloAtor relativo ao papel: "Você"/"A outra pessoa"); `DetalheAviso.tsx:797-823` (ListaEventos usa rotuloAtor com meuPapel) | n/d |
| Nada sensível exibido onde não deve / em log: Pix p/ dono, telefone, nº convite (nunca em claro) | [x] | Pix exibido ao dono (`DetalheAviso.tsx:288-305`); convite só hash (`service.ts:90-93`); evento convite_gerado sem detalhes (`service.ts:216`) | `linguagem.test.ts`; redaction de log (E13) |
| Eventos refletem só o banco; detalhe não recalcula no front | [x] | `DetalheAviso.tsx:344-354` exibe `eventos.data.itens` cru; `papelDoUsuario`/`rotuloAtor` só derivam de ids | n/d |

> [!] PROBLEMA TRANSVERSAL desta história: o serviço grava o evento de cancelamento como `cancelado_criador` (`avisos/service.ts:598`, valor adicionado ao enum do banco em `0035_aviso_invertido_pix_convite.sql:54`), MAS o enum `tipoEvento` dos contratos compartilhados (`backend/packages/shared/src/contracts/enums.ts:44-69`) e o do frontend (`frontend/src/shared/contracts/enums.ts:47-72`) só têm `cancelado_cobrador`, NÃO `cancelado_criador`. Consequências: (1) `GET /avisos/:id/eventos` é validado por `listaEventosResposta = z.array(eventoAvisoSchema)` (`payloads.ts:301`) e `eventoAvisoSchema.tipo = tipoEvento` (`entidades.ts:108`); qualquer aviso cancelado terá um evento `cancelado_criador` que faz o parse falhar -> a rota 500/erro, e o front (que reparseia com `eventosResposta`, `avisos/api.ts:67,163`) cai no `throw e` de `buscarColecaoOpcional:137` (não é 404, então não vira "indisponivel"), exibindo erro. (2) `ROTULO_EVENTO` (`format/index.ts:184-209`) não tem a chave `cancelado_criador` -> rótulo `undefined` mesmo se passasse. Quebra a linha do tempo (H9.4) para combinados cancelados, justamente onde a história exige mostrar a transição com ator.

## H9.5: Agir conforme o estado

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Ações dependem do estado e do papel (exemplos por estado) | [x] | `DetalheAviso.tsx:139-170` (flags podeAtivar/podeConfirmar/podeRejeitar/podeDesmarcar/podeCancelar/podePausar/podeReativar/podeReengajar/podeEditar) + render `:364-499` | n/d |
| Painel só SOLICITA; API + trigger validam; erro do envelope sem travar a tela | [x] | Mutations em `avisos/api.ts:183-354` (só POST/PATCH); erro renderizado em `DetalheAviso.tsx:510-522` (Banner com message do envelope) | `avisos.test.ts` (transições inválidas via API) |
| Ações que disparam mensagem respeitam regras de origem (janela de 1 min ao confirmar) | [x] | `DetalheAviso.tsx:130-134,240-264` (janela ~1min sinalizada; "Reabrir" desmarca); autoridade é api/zap | n/d |
| Ações indisponíveis não aparecem (ou desabilitadas com motivo) | [x] | Render condicional por flag (`:364-499`); fallback "Nenhuma ação disponível" `:501-508` | n/d |
| Após agir, o painel relê do banco | [x] | `invalidarTudo` invalida detalhe+envios+eventos+lista+resumo (`avisos/api.ts:167-174`), chamado em onSettled/onSuccess de todas as mutations | n/d |

## H9.6: Recorrentes 🟡 (própria história marca como dependente de H6.10/H8.7)

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Progresso "k de N" + ocorrência corrente; mini-histórico; ações por ocorrência; desmembramento por período; conta nos totais por período | [~] | NÃO implementado. A própria história marca a H9.6 inteira como 🟡 (linha 94: "🟡 Depende da recorrência/cadência configurável, ainda não ligada") e as Decisões em aberto (linha 142) confirmam dependência de modelagem inexistente. `avisos` é um único combinado, sem modelo de ocorrência | n/d |

## H9.7: Status de entrega dos avisos

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Status de cada envio: enviado, falha, em retry, com etapa e horário | [x] | `CycleTimeline.tsx:82-122` (por envio: ROTULO_ETAPA + ROTULO_SITUACAO_ENVIO + dataHora); `format/index.ts:107-125` (situacaoEnvio com em_retry) | n/d |
| Status reflete a outbox (`envios`); não infere entrega não registrada | [x] | `avisos/repo.ts:468-480` (colunas de `envios`); front deriva situação só de status/tentativas/proxima_tentativa_em (`format/index.ts:109-117`) | n/d |
| Nada sensível junto do status nem logado | [x] | `envioSchema` (`entidades.ts:90-103`) não inclui telefone/Pix/conteúdo; CycleTimeline exibe só etapa/situação/entrega_status | n/d |
| Falhas persistentes (3 retries esgotados) visíveis | [x] | `format/index.ts:112` (`status==='falhou'` = persistente, rótulo "Não enviado" `:124`); `CycleTimeline.tsx:23-45` (aparência "falhou") | n/d |

## H9.8: Só leitura do banco; free só visualiza; sempre atualizado

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Front exibe o que vem da API e SOLICITA; nenhuma regra/cálculo de transição/totais no cliente | [x] | Totais 100% no backend (`painel/repo.ts:32-54`); faixas decididas no servidor (`avisos/service.ts:345-346` estadosDoGrupo); front só exibe | `painel.test.ts`; `listagem_papel.test.ts` |
| Dados via API REST (nunca PostgREST/supabase-js p/ dados); servidor via TanStack Query | [x] | `painel/api.ts:1-46` e `avisos/api.ts` usam apiClient + useQuery; comentário "nunca supabase.from()" `painel/api.ts:2` | n/d |
| Free só visualiza; ações que exigem plano levam a CTA, sem quebrar navegação | [x] | `DetalheAviso.tsx:169-170` (podeReengajar/podeAtivar exigem !somenteLeitura); CTA `:371-380,742-748`; flag vem do backend (`usePlanoSomenteLeitura`) | `billing.test.ts`, `modo_agenda.test.ts` |
| Cada usuário vê só os seus (isolamento por profile.id) | [x] | `repo.ts:148-152,196-198` (filtro por uid); `painel/repo.ts:52` (cobrador_id ou devedor_profile_id = uid) | `painel.test.ts:82-92,147-154`; `listagem_papel.test.ts:77-84` |
| Após ação, revalida (relê do banco) | [x] | `invalidarTudo` (`avisos/api.ts:167-174`); pendências/resumo invalidados via PAINEL_PREFIXO | n/d |
| Estados vazios (sem combinados/agenda/histórico) com telas próprias + CTA | [x] | `ListaAvisos.tsx:263-287` (EmptyState por faixa + CTA "Novo aviso"); `Painel.tsx:141-145` | n/d |

---

## O que o código precisa mudar para seguir a história (mudanças de CÓDIGO)

1. **[!] H9.4 — registrar `cancelado_criador` no enum de eventos e no rótulo.** O banco já grava `cancelado_criador` (migration `0035`, `avisos/service.ts:598`), mas:
   - Adicionar `'cancelado_criador'` ao `tipoEvento` em `backend/packages/shared/src/contracts/enums.ts:44-69` (senão `listaEventosResposta`/`eventoAvisoSchema` rejeita a resposta de `GET /avisos/:id/eventos` para qualquer aviso cancelado).
   - Espelhar em `frontend/src/shared/contracts/enums.ts:47-72`.
   - Adicionar a chave `cancelado_criador: 'Combinado cancelado'` em `ROTULO_EVENTO` (`frontend/src/shared/format/index.ts:184-209`); manter `cancelado_cobrador` por compatibilidade do histórico antigo do fluxo receber.
   - Recomendado: teste de timeline com um aviso cancelado, garantindo `GET /avisos/:id/eventos` 200 e o rótulo presente.

## Itens que a própria história marca como 🟡 / fora de escopo (citando a linha)

- **H9.6 inteira é 🟡** (cabeçalho linha 82: "H9.6 ... 🟡 (depende de H6.10/H8.7)"; critério linha 94: "🟡 Depende da recorrência/cadência configurável, ainda não ligada"). A ausência de progresso "k de N" e desmembramento por ocorrência NÃO é divergência: [~] alinhado ao 🟡.
- **"Precisa de você" sem dado_incorreto/telefone_divergente**: previstos em H9.2 (linha 27), mas contrato (`payloads.ts:231-232`) e repo (`painel/repo.ts:94`) os tratam como gated (E5), sem evento/flag que os emita. Como a emissão depende do E5 (convite por template Meta, ainda não ligado), [~] e não [!].
- Fora de escopo declarado (linhas 144-149): efeito de cada ação (E2-E8), notificações ao cobrador (E10), planos/CTA (E11), edição de textos (E12), telas de login (E1).

## Observações

- **Aderência por papel** (não por direção): `repo.ts:148-152` e `painel/repo.ts:52` filtram por posição (cobrador_id/devedor_profile_id), e `listagem_papel.test.ts` prova explicitamente que o invertido (direcao=pagar) cai na visão correta conforme o papel.
- **Totais e faixas decididos no backend** (estados.ts como fonte única) alinha com H9.2/H9.8 ("nada calculado no front"). O resumo carrega campos legados (`pendentes_centavos` etc.) só para `billing.useUsoAtivos`; documentado em `payloads.ts:214-220`, sem impacto na história.
- **Linguagem**: rótulos centralizados em `format/index.ts` e auditados por `linguagem.test.ts`; "informado_pago" tem variante por papel ("Aguardando sua confirmação" p/ cobrador), exatamente como pede H9.3 (linha 41).
- **Degradação graciosa** de envios/eventos no front (`avisos/api.ts:125-165`): 404 vira `indisponivel`. Cuidado: isso NÃO cobre o erro de schema do `cancelado_criador` (não é 404), que cairia no `throw e` de `buscarColecaoOpcional:137` exibindo erro genérico em vez do histórico.
