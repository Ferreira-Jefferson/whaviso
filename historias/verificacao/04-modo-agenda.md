# Verificação — Épico 04: Modo agenda

## Veredito (29 [x] · 1 [~] · 0 [!] · 0 [+])

O épico está implementado de ponta a ponta (api + migrations + frontend) e coberto por um arquivo de teste dedicado (`modo_agenda.test.ts`, 14 casos). Única ressalva: os valores de capacidade da agenda por plano no catálogo (migration 0026) não batem com os números da seção "Decisões tomadas" da história, mas a própria história remete os "nomes/valores finais dos planos" ao Épico 11.

## Por história

### H4.1: Cadastrar um combinado em modo agenda

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Escolha pelos botões de ação no rodapé ("Apenas salvar" / "Salvar e gerar convite"), sem seletor à parte; mesmos campos | [x] | `frontend/src/modules/avisos/pages/NovoAviso.tsx:62-74` (modo definido pelo botão, não por seletor), `:302-316` (botões "Apenas salvar" -> `salvar('agenda')` e "Salvar e gerar convite" -> `salvar('enviar')`); contrato `payloads.ts:37` `modo: z.enum(['enviar','agenda']).default('enviar')` | NovoAviso é UI; coberto indiretamente |
| Nasce em `sem_aviso`, sem número de convite, sem envio programado | [x] | `service.ts:168-184` (status `sem_aviso`, todos os hashes null, sem `inserirEnvio`) | `modo_agenda.test.ts:73-111` (status, hashes null, 0 envios, numero_convite null) |
| Estado por ação: "Apenas salvar" -> `sem_aviso`; "Salvar e gerar convite" -> `aguardando_aceite`; convite não respondido não volta a `sem_aviso` | [x] | `service.ts:168-184` (agenda) vs `:186-227` (enviar -> `aguardando_aceite`); transição de volta inexistente na máquina (0028) | `modo_agenda.test.ts:161-190` (criar agenda vs ativar) |
| A outra ponta não recebe nada | [x] | `service.ts:183` retorna `mensagem_convite`/`link_whatsapp` null; nenhuma chamada a notificações no ramo agenda | `:73-111`, `:113-141` |
| Mesmos campos de negócio (nome, motivo, valor centavos, data SP) | [x] | `camposComuns` `service.ts:150-165` (idênticos nos dois modos) | `:73-111` |
| Telefone da outra ponta opcional na agenda; obrigatório só ao ativar | [x] | `service.ts:134-148` (campos opcionais na agenda), `schemas.ts:52-69` (refines pulam quando `modo === 'agenda'`), migration `0036` relaxa `avisos_convite_tem_destino` p/ `sem_aviso` | `:113-141` (telefone_devedor null, receber e invertido) |
| Funciona em receber e em pagar invertido | [x] | `service.ts:116-117,147-148,157-158` tratam ambos | `:113-141`, `:239-266`, `:353-372` |
| Free também cria item de agenda (até o limite); não pode ativar | [x] | `service.ts:125-128` usa `exigirCapacidadeDeAgenda` (sem guard de free) na criação; `exigirVagaDeAtivo` barra o free só ao ativar (`planos/index.ts:206-216`) | `:143-159` (free cria), `:285-299` (free não ativa) |
| Linguagem respeita regras de ouro e gênero neutro | [x] | Copy da agenda em `DetalheAviso.tsx:201-205` ("Só na agenda, nada enviado", "marque como recebido"), sem palavras proibidas nem gênero; mensagens da api sem termos vetados | revisão manual |

### H4.2: Acompanhar a agenda no painel

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| `sem_aviso` aparece marcado como "Sem aviso"/não enviado, separado do ciclo ativo | [x] | `shared/estados.ts:30-34` (faixa `AGENDA = ['sem_aviso']`, separada de `ATIVOS_LISTA`); `StatusBadge.tsx:8`, `format/index.ts:70` rótulo "Sem aviso" | `:374-384` (filtro status=sem_aviso isola 1 item) |
| Filtrar/separar agenda do ativo | [x] | `ListaAvisos.tsx:31-40` faixa "Sem aviso"; `service.listarAvisos` + `estadosDoGrupo('agenda')` (`service.ts:344-346`, `estados.ts:39-48`) | `:374-384` |
| Da agenda: editar/ativar/descartar/marcar pago | [x] | `DetalheAviso.tsx:138,170,364-392,496-497` (ativar, marcar recebido, descartar, editar) | casos H4.3/H4.4/H4.5 abaixo |
| Layout detalhado fica no épico do Painel (cross-ref) | [x] | Marcado como cross-ref na própria história (linha 31); coberto no E9 | n/a |

### H4.3: Ativar um combinado da agenda

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Ativar gera número de convite + mensagem pronta | [x] | `service.ts:294-328` (`gerarConviteComRetry` + `montarConvite`); rota `index.ts:31-36` | `:192-213` (convite_hash 64hex, numero formatado), `:161-190` |
| Transita `sem_aviso -> aguardando_aceite` e segue o fluxo normal | [x] | `service.ts:255-257,298` + máquina 0028 (`sem_aviso -> aguardando_aceite`) | `:176-188`, trigger `:386-402` |
| Pede dado obrigatório (telefone/Pix invertido) antes de ativar | [x] | `service.ts:271-289` (`faltando[]` -> `dado_obrigatorio_ativacao`) | `:215-237` (422 sem transitar; depois ativa com dados no corpo) |
| Ativar consome vaga de ativo; free não ativa (CTA de plano) | [x] | `service.ts:292` `exigirVagaDeAtivo`; `planos/index.ts:206-225` (guard free `plano_somente_leitura`, depois `limite_plano_atingido`); front `DetalheAviso.tsx:372-378` CTA | `:285-299` (free -> `plano_somente_leitura`, item segue na agenda) |
| Antes de ativar nada do ciclo existe; depois vale o épico de lembretes | [x] | Ramo agenda não cria envios (`service.ts:168-184`); ativação segue para `aguardando_aceite` | `:97-101` (0 envios na agenda) |

### H4.4: Editar e descartar um combinado da agenda

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Em `sem_aviso` a edição é livre e imediata, sem reaprovação | [x] | `service.ts:394` (`EDICAO_LIVRE` inclui `sem_aviso`), `:438-443` (aplica direto, evento `editado {reaprovacao:false}`) | `:301-318` (continua `sem_aviso`, valor aplicado) |
| Posso descartar; encerra sem notificar ninguém | [x] | `cancelarAviso` `service.ts:583-604`; `jaAceito` falso em `sem_aviso` (`:592`), logo nenhuma notificação | `:320-333` |
| Descartar respeita não-DELETE: vai a terminal (cancelado), não some | [x] | `service.ts:593` `atualizarStatus(...,'cancelado')`; máquina 0028 `sem_aviso -> cancelado` | `:320-333` (linha permanece) |
| Operação registrada como evento (auditoria append-only) | [x] | `service.ts:598` `inserirEvento(...,'cancelado_criador',criador_papel)` | `:320-333` (status cancelado; evento via fluxo) |

### H4.5: Marcar como pago manualmente

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| De `sem_aviso` registrar manualmente pago (`sem_aviso -> pago`) sem ter ativado | [x] | `marcarPagoAgenda` `service.ts:630-645`; rota `index.ts:39-43`; máquina 0028 `sem_aviso -> pago`; constraints Pix/destino relaxadas p/ `pago` (`0036`) | `:335-351`, `:353-372` |
| `pago` é terminal, entra no histórico | [x] | `service.ts:641` status `pago`; `estados.ts:28` `HISTORICO` inclui `pago` | `:335-351` (idempotente em pago) |
| Confirmação "normal" (informado_pago) fica no épico de Confirmação | [x] | Evento dedicado `pago_manual` (não reusa `confirmado_cobrador`/`recebimentos`) `service.ts:642` | `:335-351` (ator cobrador), `:353-372` (ator devedor no invertido) |

## O que o código precisa mudar para seguir a história

Nada classificado como [!]/[+]. Os comportamentos exigidos pela história estão todos presentes.

## Itens que a própria história marca como 🟡/fora de escopo (com a linha)

- Validação/aceite do convite no WhatsApp após ativar: "❌ Como o convite é validado e aceito no WhatsApp depois de ativar (épico de Convite & Aceite)." (linha 80).
- Ciclo e textos dos lembretes: "❌ Ciclo e textos dos lembretes (épico de Lembretes)." (linha 81).
- Confirmação com interação do devedor / `informado_pago`: "❌ Confirmação de pagamento com interação do devedor / `informado_pago` (épico de Confirmação de pagamento)." (linha 82).
- Layout completo do painel e valores finais dos planos: "❌ Layout completo do painel e nomes/valores finais dos planos (épicos do Painel e de Planos)." (linha 83). É o que cobre a divergência de valores na seção Observações.

## Observações

- [~] Limite de agenda por plano (linha 76 da história, "Decisões tomadas"): a história decide **free 10, start 20, planos por envio = 10 itens por envio, plano flexível até 2000**. O catálogo implementado em `0026_planos_balde_unico.sql:66-73` traz **free 50, start 100, profissional 150, plus 10 por unidade** (planos free/start/profissional/plus, não "por envio"/"flexível"). Os números e a própria taxonomia de planos divergem. Classifico [~] e não [!] porque a mesma linha 76 ressalva "Os nomes/valores finais dos planos ficam no Épico 11", e a linha 83 marca explicitamente "nomes/valores finais dos planos" como fora deste épico. A MECÂNICA que a história exige (free cria agenda mas não ativa; balde único; capacidade barra criação; vagas de ativo barram ativação) está correta e testada; o que diverge são os números concretos, cuja autoridade a história delega ao Épico 11. Vale conferir lá se os valores 10/20/10-por-envio/2000 foram substituídos por 50/100/150 de propósito.
- A nota de escopo em `planos/index.ts:9-13` e em `0026:21-26` ("o estado `sem_aviso` ainda não existe") está DESATUALIZADA: `sem_aviso` já existe e é usado. É comentário, não código de comportamento, então não afeta o veredito; convém limpar para não confundir.
- A capacidade da agenda é um BALDE ÚNICO que conta também os itens já ativados e os terminais não-arquivados (`contar_agenda`, `0026:214-224`); arquivar (`arquivarAviso`, soft-delete) é o que libera vaga. Isso é coerente com H11.4 (cross-ref), não com este épico, mas explica por que ativar não libera slot de agenda (`modo_agenda.test.ts:183-185`).
