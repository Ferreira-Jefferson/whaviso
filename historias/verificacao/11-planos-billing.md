# Verificação — Épico 11: Planos, limites e billing

## Veredito (35 [x] · 2 [~] · 0 [!] · 0 [+]): divergências de preço/modelo RESOLVIDAS em 2026-06-25

O catálogo de 4 planos, o balde único de agenda, os gates de criação/ativação no servidor (com lock anti-corrida), o arquivamento soft, o billing stub trial e a CTA de upgrade no front estão todos implementados e testados. As duas divergências de **preço/modelo do Plus** foram **RESOLVIDAS em 2026-06-25**: o dono confirmou o modelo do Plus **por volume de envios** e definiu os números finais (Profissional **R$ 29,90**; Plus **26 a 200 envios**, total de R$ 31,10 a R$ 140,00), além dos tetos de **vagas de aviso ativo** (vendidas como "envios de aviso": Free 0, Start 10, Profissional 25, Plus 26-200). A **história canônica (épico 11) foi atualizada** para este modelo e a **migration 0049** fixou os valores. Portanto o código NÃO volta ao modelo "por unidade": foi a história que se alinhou ao código (direção invertida por decisão de negócio registrada).

## Por história

### H11.1: Catálogo de planos
| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Catálogo com alavancas por plano (vagas ativas, agenda, recorrência, cadência, menu, informado_pago, totais) | [x] | `0026_planos_balde_unico.sql:28-48` cria as colunas; `0033` adiciona `edicoes_max` | `billing.test.ts:23-57` |
| 4 planos: free, start, profissional, plus (chaves estáveis) | [x] | `0026:66-73` upsert dos 4 ids | `billing.test.ts:30` |
| Cada plano com chave, nome e preço (centavos, pode 0) | [x] | `0026:66-73`; `planos_preco_nao_negativo` em `0007:9` | `billing.test.ts:33,38` |
| Preços: Free 0, Start 990, Profissional **R$ 29,90**, Plus por volume de envios | [x] | RESOLVIDO 2026-06-25 (história alinhada ao código): Free 0 / Start 990 (`0026:66-68`); Profissional **2990** (`0049`); Plus por **volume de envios**, faixa **26..200**, piso **3110** / topo **14000** (`0045`/`0046`/`0049`). A história agora define este mesmo modelo | `billing.test.ts:33-56` |
| Catálogo em migration upsert idempotente, não no seed | [x] | `0026:60-90` insert ... on conflict do update; comentário `0026:18` confirma seed não roda no cloud | (n/a) |
| Toda conta referencia um plano vigente, default free na criação | [x] | `handle_new_user()` cria assinatura free no signup (`0026:129-145`); backfill `0026:117-124` | `billing.test.ts:59-67` |
| Linguagem do catálogo respeita regras de ouro e gênero neutro | [x] | nomes "Whaviso Free/Start/Profissional/Plus"; sem termos proibidos nas migrations | (n/a) |

### H11.2: Plano free, visualizar e agendar sem ativar
| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Free cria itens de agenda (sem_aviso) até o limite e visualiza tudo | [x] | `exigirCapacidadeDeAgenda` (sem guard free) no modo agenda (`service.ts:125-128`, `planos/index.ts:165-176`) | `modo_agenda.test.ts:143` (FREE cria agenda até 50) |
| Free não ativa nada; ativar leva à CTA de upgrade, sem erro feio | [x] | `exigirVagaDeAtivo` lança `plano_somente_leitura` (`planos/index.ts:206-216`); chamado em ativar (`service.ts:292`) | `modo_agenda.test.ts:3` ("ativar ... free -> CTA") |
| Menu de texto livre no free = silêncio | [x] | `donoTemMenuLiberado` lê `menu_texto_livre` (`zap webhook_whatsapp/repo.ts:123-136`); free=false silencia | `interacao_devedor.test.ts:27-30` |
| Free não tem recorrência/cadência/totais; aparecem bloqueados/CTA, não somem | [x] | catálogo: free com tudo false (`0026:66-67`); front mostra recursos com check/minus (`Plano.tsx:374-376,301-312`) | `billing.test.ts:35` |
| Nada no free dispara mensagem | [x] | gate free no envio (`exigirVagaDeAtivo`) + fila de saída checa `not somente_leitura` (`0041:81`) | (coberto pelos gates) |

### H11.3: Ativação de envio por plano
| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Ativar = sai da agenda e passa a enviar (sem_aviso -> aguardando_aceite) | [x] | `ativarAviso` em `service.ts:292+`, gera convite (`service.ts:298`) | `modo_agenda.test.ts:3` |
| Free não ativa nada; ativação leva à CTA | [x] | `exigirVagaDeAtivo` guard `somente_leitura` (`planos/index.ts:211-216`) | `modo_agenda.test.ts:3` |
| Start e Profissional têm teto de vagas de aviso ativo (10 e 25) | [x] | `vagas_ativas` agora explícito: Start 10, Profissional 25 (`0049`), imposto por `exigirVagaDeAtivo` (`planos/index.ts:206-228`, chamado em `service.ts:291`). Antes era null (= capacidade da agenda) | `billing.test.ts:33-56` (assertivas de vagas) |
| Plus por volume de envios: 1 envio = 1 vaga ativa + 1 anotação (1:1) | [x] | RESOLVIDO 2026-06-25 (história alinhada): `agenda_por_unidade=1`/`ativaveis_por_unidade=1`, `unidades` guarda os envios/mês escolhidos (`0045:48-52`, `0049`). A história agora define o Plus por volume de envios | `billing.test.ts:69-89` |
| pausado ocupa vaga; sem_aviso conta na agenda | [x] | `contarAtivos` exclui só terminais e sem_aviso (`planos/index.ts:184-193`); `contar_agenda` conta tudo não-arquivado (`0026:214-224`) | `modo_agenda.test.ts:2` |
| Ativar além do permitido: API recusa com envelope, front mostra CTA, item fica na agenda | [x] | `regraNegocio('limite_plano_atingido' / 'plano_somente_leitura')` (`planos/index.ts:213-225`); front trata no formulário (`Plano.tsx:4-6`) | `modo_agenda.test.ts:3` |
| Contagem por conta, validada no servidor | [x] | funções SQL por papel + lock (`planos/index.ts:108-121`) | `avisos.test.ts:180-204` (corrida) |

### H11.4: Limite de capacidade de agenda
| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Agenda balde único: toda anotação conta igual | [x] | `contar_agenda` conta todo aviso não-arquivado do criador (`0026:214-224`) | `avisos.test.ts:150-178` |
| Item ativado continua ocupando o lugar | [x] | ativar só muda status, não arquiva; contagem não exclui ativos (`0026:219-223`) | (coberto) |
| Valores (capacidade de agenda): Free 50, Start 100, Profissional 150, Plus 1 por envio | [x] | RESOLVIDO 2026-06-25 (história alinhada): Free 50 / Start 100 / Profissional 150 (`0026:66-71`); Plus escala 1:1 com os envios, `agenda_por_unidade=1` (`0045:49`). A história agora define "Plus 1 por envio contratado" | `billing.test.ts:34-56` |
| Ao encher, criar nova é recusado no servidor com CTA, sem apagar nada | [x] | `agenda_cheia` em `exigirCapacidadeDeAgenda`/`exigirVagaDeAgenda` (`planos/index.ts:148-154,169-174`) | `avisos.test.ts:144-145` |
| Terminais continuam contando; sistema nunca remove sozinho | [x] | `contar_agenda` não exclui terminais, só arquivados (`0026:220-223`) | `avisos.test.ts:170-175` |
| Só o usuário tira da agenda = arquivamento (flag), não DELETE físico | [x] | `arquivado_em` (`0026:151`); `arquivarAviso` faz `set arquivado_em=now()` (`repo.ts:441-442`, `service.ts:608-616`); rota POST `/avisos/:id/arquivar` (`avisos/index.ts:91-93`) | `avisos.test.ts:150-178` |
| Contagem por conta, validada no servidor | [x] | função SQL por papel (`0026:214-224`) | `avisos.test.ts:198-202` |

### H11.5: Recursos por plano
| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Recorrência só em plano que habilite (🟡 enquanto recorrência não está ligada) | [~] | alavanca `permite_recorrente` existe e é publicada (`0026`, `billing/index.ts:83`), mas a recorrência em si não está ligada; história marca 🟡 (linha 63) | (n/a, 🟡) |
| Cadência configurável só Profissional e Plus (Free e Start não) | [x] | catálogo: free/start false, prof/plus true (`0026:67-73`); nota de dono em `planos/index.ts:43-46` | `billing.test.ts:40,44` |
| Menu de texto livre habilitado nos pagos, silêncio no free | [x] | `menu_texto_livre` lido pelo zap (`webhook_whatsapp/repo.ts:123-136,819`) | `interacao_devedor.test.ts:27-30` |
| Confirmação / informado_pago: free não recebe como cobrador (não ativa avisos) | [x] | estrutural: free não ativa (`exigirVagaDeAtivo`), logo não tem aviso a confirmar; alavanca `informado_pago_habilitado` publicada (`billing/index.ts:86`) | (coberto pelo gate de ativar) |
| Histórico/totais por período recurso de pago; free vê o básico | [x] | `totais_periodo` no catálogo (free false, prof/plus true) (`0026`); consumido em `recebimentos/service.ts:195` | `billing.test.ts:45` |
| Reengajamento manual: até 3 por combinado, nunca 2 no mesmo dia | [x] | `reengajamento_max` (start/prof/plus=3, free=0) (`0026:69-73`); mecânica em `recebimentos/service.ts:196-214` (teto + "1 hoje") | `confirmacao_pagamento_e8.test.ts` |
| Cada recurso bloqueado aparece como CTA, não some | [x] | `Plano.tsx:301-312,374-376,457-460` | (front) |

### H11.6: CTA de upgrade nos pontos de bloqueio
| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Toda recusa por limite/recurso mostra CTA discreta e clara | [x] | mensagens de `regraNegocio` (`planos/index.ts:141-145,150-153,213-216,221-224`); banners no front (`Plano.tsx:272-291`) | `modo_agenda.test.ts:3` |
| CTA nunca destrói trabalho: item fica na agenda, dados salvos, nada enviado | [x] | gates lançam antes de transitar; item permanece | `avisos.test.ts:160-175` |
| CTA usa linguagem das regras de ouro (sem termos proibidos, gênero neutro, sem travessão) | [x] | mensagens em `planos/index.ts` e `Plano.tsx:274-276` usam "avisos/agenda/plano"; sem travessão | (revisão de texto) |
| CTA aparece em ativar (H4.3) e nas ações de recurso (H11.5) | [x] | ativar -> `plano_somente_leitura`; recurso -> `reengajamento_indisponivel` (`recebimentos/service.ts:197`); banner free (`Plano.tsx:272`) | (coberto) |

### H11.7: Billing como stub trial no MVP
| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Associar a plano pago é manual/stub (sem gateway); limite vale, sem pagamento real | [x] | `assinar` grava status 'trial' (`billing/index.ts:136-145`); `provedorStub` sem pagamento real (`provedor.ts:48-77`) | `billing.test.ts:147-180` |
| Conta nasce free; limites do free valem desde o 1º acesso | [x] | `handle_new_user` cria free (`0026:129-145`) | `billing.test.ts:59-67` |
| 🟡 Gateway real (assinatura recorrente, faturas, dunning) é futuro | [~] | estrutura agnóstica pronta (`provedor.ts`, `0019` pagamentos/eventos), mas só stub; história marca 🟡 (linha 88) | (n/a, 🟡) |
| 🟡 Estado de assinatura e queda da assinatura ficam para billing real | [~] | há status (ativa/cancelada/trial em `0007:15-18`), webhook ativa (`billing/index.ts:238-243`); queda sobre avisos ativos fica 🟡 (linha 89) | (n/a, 🟡) |
| Não logar dado sensível de pagamento | [x] | `eventos_pagamento.dados` sem campo sensível; comentário `0019:75` | (n/a) |

### H11.8: Validação do limite no servidor (defesa em profundidade)
| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Front antecipa, mas decisão final é da API + banco | [x] | front espelha sem reimplementar regra (`Plano.tsx:2-6`); gates no service | `avisos.test.ts:180-204` |
| Tentativa de burlar pelo front é recusada no servidor com envelope | [x] | `regraNegocio` retorna `{ error: { code, message } }` | `billing.test.ts:110-145` |
| Contagem na transação que ativa/cria, sem janela de corrida (ponto de teste dedicado) | [x] | `travarConta` (`for update`) na mesma tx (`planos/index.ts:119-121,135,167,207`) | `avisos.test.ts:180-203` (corrida) |
| Limites lidos do catálogo, não fixados em código | [x] | `alavancas_do_plano` lê do catálogo (`0026:158-207`); `alavancasDoPlano` na api (`planos/index.ts:53-67`) | `billing.test.ts:23-57` |

### H11.9: Mudar de plano (upgrade / downgrade) 🟡
| Critério | Status | Evidência | Teste |
|---|---|---|---|
| 🟡 Upgrade aplica novos limites imediatamente | [x] | `assinar` faz upsert do plano; alavancas relidas a cada checagem (`billing/index.ts:135-145`) | `billing.test.ts:69-89` |
| 🟡 Downgrade com excedente mantém ativo, só trava criar/ativar novos | [x] | checagem é ">= ao criar/ativar novo", nunca retroativa; nota em `planos/index.ts:47-50` | (coberto pelos gates) |
| 🟡 Nenhuma troca dispara DELETE de negócio | [x] | `assinar` é upsert de assinatura; sem DELETE | (n/a) |
| 🟡 Depende do billing real (fora do MVP) | [~] | UX/billing da troca fica para o gateway; stub já permite trocar (linha 110 marca 🟡) | (n/a, 🟡) |

## Resolução das divergências (2026-06-25)

As duas divergências de preço/modelo foram **resolvidas a favor do código** (o dono confirmou o modelo e a história canônica foi atualizada; migration 0049). **Nenhuma mudança de código é necessária.**

1. **Plus por volume de envios (não "por unidade"):** confirmado. A história (H11.1/H11.3/H11.4 e Decisões) agora define o Plus vendido por volume de envios (26 a 200), com cada envio valendo 1 vaga de aviso ativo + 1 anotação de agenda (1:1) e a curva linear piso **3110** (R$ 31,10, R$ 1,196/envio, contínuo com o Profissional) a topo **14000** (R$ 140,00, R$ 0,70/envio). `por_envio`/`envios_min`/`envios_max`/`preco_max_centavos` e `precoPorEnvioCentavos` permanecem.

2. **Profissional R$ 29,90:** confirmado e fixado (`0049`, `billing.test.ts:164`). Não há degrau "49"; a história foi atualizada para R$ 29,90.

3. **Novo eixo comercial, vagas de aviso ativo ("envios de aviso") com teto explícito:** Free 0, Start 10, Profissional 25, Plus 26-200 (`0049`). Imposto por `exigirVagaDeAtivo`; a história (H11.3) registra o teto. É alavanca separada da capacidade de agenda (anotar).

## Itens que a própria história marca como 🟡/fora de escopo (com a linha)

- **Recorrência como recurso de plano**: "🟡 enquanto a recorrência em si não estiver ligada" (linha 63). Alavanca existe e é publicada; mecânica é do E6/E8.
- **Gateway de pagamento real** (assinatura recorrente, faturas, falha, dunning): "é futuro: não existe no MVP" (linha 88); "❌ Gateway de pagamento ... billing real, 🟡" (linha 144).
- **Estado de assinatura e queda da assinatura** sobre avisos ativos: "ficam para a fase de billing real" (linha 89).
- **Toda a H11.9 (mudar de plano)** marcada 🟡 (linhas 104, 107-110): "Depende do billing real (H11.7); fora do MVP".
- **Textos finais das CTAs**: "❌ ... entram com o épico de Templates/mensagens e o design do painel" (linha 145).
- **Mecânica de cada recurso** (recorrência, cadência, menu): "❌ ... definida nos épicos 6, 7 e 8; aqui só o liga/desliga por plano" (linha 146).
- **Limites de envio do WhatsApp/Baileys**: "❌ ... restrição operacional do transporte (Épico 10)" (linha 147).
- **Expiração de convite (7 dias)**: "é fixa e não é alavanca de plano ... não entra no catálogo" (linha 138). Confirmado: não há coluna disso no catálogo.

## Observações

- **Comentários corrigidos (2026-06-25):** os cabeçalhos stale de `billing/index.ts` e `Plano.tsx` que descreviam o Plus "por unidade" foram atualizados para o modelo por volume de envios.
- **Coerência do balde único bem feita:** `contar_agenda` e `contarAtivos` usam a mesma dupla condição por papel (cobrador_id / devedor_profile_id), contando certo no fluxo invertido. Índices parciais por papel/arquivado (`0026:228-233`).
- **Anti-corrida sólido:** `travarConta` com `for update` dentro da mesma transação do insert/update fecha a janela do H11.8, com teste dedicado (`avisos.test.ts:180-204`).
- **Arquivamento (soft-delete) correto:** `arquivado_em` sai da contagem e da visão sem DELETE físico; teste confirma que o registro permanece.
- **Migrations antigas (`0007`, `0019`, planos pessoal/profissional/personalizado) preservadas** e migradas (não apagadas), respeitando a regra de não-DELETE; `0026` migra pessoal->start e personalizado->plus.
- **A constraint `assinaturas_unidades_minima >= 1`** (`0026:99-100`) permite Plus com 1 unidade, mas o `assinarBody` aceita `unidades` 1..2000 validando contra `envios_min`/`envios_max` (**26..200**) do catálogo (`billing/index.ts:118-127`). Coerente com o modelo por volume de envios, que a história agora também adota.
