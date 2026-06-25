# Verificação — Épico 03: Criar combinado (pagar invertido)

## Veredito (28 [x] · 1 [~] · 1 [!] · 0 [+])

Backend cumpre a história 03 integralmente. A única falha real está no FRONTEND: a chave Pix é tratada como **opcional** no fluxo invertido, contra a decisão explícita da história ("sem Pix não há convite", H3.1 + Decisões tomadas). Vários critérios de H3.2/H3.3 são fechados no Épico 5 (a própria história marca como fora de escopo); aqui só conferi a maquinaria que já existe.

## Por história

### H3.1: Cadastrar um combinado a pagar

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Informo nome de quem recebe (cobrador), motivo, valor, data, telefone do cobrador | [x] | `payloads.ts:40-44` (`nome_cobrador`, `telefone_cobrador`, motivo, valor, data); refine `payloads.ts:62-65` exige `nome_cobrador`+`telefone_cobrador` no `pagar`. Front: `NovoAviso.tsx:96-104` mapeia nome/telefone do form para `nome_cobrador`/`telefone_cobrador` | `avisos.test.ts:106-148` (invertido) |
| Nome de quem paga (devedor) = o do próprio criador (pré-preenchido) | [x] | Front `NovoAviso.tsx:99` `nome_devedor: perfil?.nome` no `pagar`; backend grava `devedor_profile_id = uid` e `telefone_devedor` do perfil (`service.ts:147-156`) | — |
| Chave Pix de quem recebe é **obrigatória** para criar/enviar no invertido (sem Pix não há convite) | [!] | Backend OK: `payloads.ts:82-85` refine exige `pix_chave` no `pagar` enviar; `service.ts:140-142` lança `pix_obrigatorio`; CHECK `0035:36-42`. **Front DIVERGE:** `schemas.ts:45,56-69` só exige Pix no `receber`; `NovoAviso.tsx:266` rotula "Chave Pix (opcional)" e `NovoAviso.tsx:80,103` envia `pix_chave: pix` que pode ser null no `pagar`. Usuário pode tentar enviar sem Pix; o backend recusa, mas a UI promete o contrário | `avisos.test.ts:123-127` (backend exige Pix) |
| Nasce com `criador_papel = devedor` e sem cobrador vinculado (`cobrador_id` nulo), cobrador denormalizado | [x] | `service.ts:117,151-158` (`criador_papel='devedor'`, `cobrador_id=null`, `nome_cobrador`/`telefone_cobrador`); migration `0017` | — |
| Valor exibido em reais, persiste em centavos (int) | [x] | `payloads.ts:43` `valorCentavos`; front `MoneyInput` emite centavos `NovoAviso.tsx:243-253` | — |
| Data em America/Sao_Paulo, banco em UTC | [x] | `dataCombinada` (`payloads.ts:42`); conversão de fuso na maquinaria de datas compartilhada | — |
| Campos obrigatórios validados com mensagem clara; valor > 0 | [x] | `payloads.ts` refines; front `schemas.ts:31-34` valor positivo com msg | `avisos.test.ts:69-76` (valor 0 → 400) |
| Nasce em `aguardando_aceite` ao salvar | [x] | `service.ts:199` no modo enviar | `avisos.test.ts:55-67` (status aguardando_aceite) |
| Linguagem respeita regras de ouro | [x] | Sem palavra proibida em `service.ts`/front/copy revisada | — |

### H3.2: Gerar o convite ao cobrador (número 6 dígitos + mensagem com link)

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Mesma mecânica da H2.2, direcionada ao cobrador | [x] | `service.ts:196-219` reusa `gerarConviteComRetry`/`montarConvite` para ambos os fluxos | — |
| Número 6 dígitos, exibido `xxx-xxx`, salvo só como hash | [x] | `gerarNumeroConvite`/`sha256Hex` `service.ts:90-91`; `formatarNumeroConvite` :218; front `AvisoCriado.tsx:90-93` | `avisos.test.ts:63` (`/^\d{3}-\d{3}$/`) |
| Unicidade: dois avisos com mesmo telefone de cobrador não repetem número | [x] | Índice parcial `idx_avisos_convite_cobrador_unq` em `(telefone_cobrador, convite_hash)` `0035:47-49`; retry de colisão `service.ts:89-106` | — |
| Anti-brute-force: máx 3 tentativas por convidado | [x] | Tabela `convite_tentativas_telefone` `0037:40-45`; efeito (3 erros/bloqueio) é do Épico 5 (a própria história H3.2 remete a Épico 5) | — (zap) |
| Devedor recebe mensagem completa (intro + número + link), não só link | [x] | `montarConvite` `service.ts:65-74` monta as 3 linhas; resposta `mensagem_convite` `service.ts:223` | — |
| Link leva ao WhatsApp do Whaviso com msg pré-preenchida "Oi, aqui é [devedor], meu convite é xxx-xxx" | [x] | `service.ts:60,62-64`; autor = `body.nome_devedor` (nome do devedor) `service.ts:219` | — |
| Validação no aceite por número + telefone do cobrador | [~] | Estrutura pronta (índice por `telefone_cobrador`); o ato de validar é do Épico 5 (`webhook_whatsapp`). Fora de escopo de 03 por linha 91 | — (zap) |
| Fallback sem número: pede o número | [x] | Template `convite.pedir_numero` `0037:111-115`; lógica no zap (Épico 5) | — (zap) |
| Tela oferece copiar/compartilhar a mensagem inteira | [x] | `AvisoCriado.tsx:96-128` (copiar mensagem + abrir no WhatsApp) | — |

### H3.3: Cobrador confere dados e Pix e responde com um toque

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Convite mostra dados + a chave Pix para conferir | [x] | Template `convite.resumo` variante `revisao` inclui `{{6}}=pix_chave` `0037:96-108` | — |
| Cobrador responde por botão (Aceitar / Chave Pix incorreta / Recusar) | [x] | Botões em `0037:101-105` (rótulos editáveis, ações fixas) | — (zap) |
| Aceitar: aguardando_aceite → programado, ativa lembretes ao devedor | [x] | Transição válida `0028:81`; producer no zap `webhook .../repo.ts:579` (`convite_aceito`). Maquinaria de Épico 5/6 | `convite_aceite.test.ts` |
| Chave Pix incorreta: não aceita nem recusa, devedor notificado, resposta neutra ao cobrador | [x] | Evento `pix_incorreto` `0035:58`; resposta neutra `resposta.dado_incorreto` "Certo, vamos comunicar sua resposta." `0035:65-69`; producer `webhook .../repo.ts:548-554` | `convite_aceite.test.ts:253-258` |
| Recusar: terminal `recusado` (distinto de cancelado), devedor notificado | [x] | `recusado` no enum `0028:39` e terminal `0028:69,113`; transição `aguardando_aceite→recusado` `0028:81`; producer `webhook .../repo.ts:542` (`convite_recusado`) | `webhook.test.ts:202` |
| Em qualquer resposta, devedor que convidou é notificado | [x] | `enfileirarNotificacao(... convite_aceito/dado_incorreto/recusado)` `webhook .../repo.ts:542,554,579` | — (zap) |
| Cobrador com conta vincula por `profile.id`; sem conta fica só por telefone + CTA criar conta | [x] | Grant `cobrador_id` ao zap no aceite `0037:56-57`; CTA é do Épico 5/front | — (zap) |
| Enquanto cobrador não responde, nenhum lembrete ao devedor | [x] | Nasce `aguardando_aceite`; trigger só programa envios ao entrar em `programado` (`0028`) | — |
| Botões e textos canônicos no Épico 5 | [x] | Fora de escopo desta verificação (linha 52) | — |

### H3.4: Respeitar o limite do plano ao criar

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Mesma regra da H2.3: free não cria (só visualiza); planos pagos respeitam o teto de vagas de aviso ativo; checagem na API | [x] | `exigirVagaDeAgenda` na transação `service.ts:131`; guard free | `avisos.test.ts:94-104` (free → plano_somente_leitura) |
| Terminais não contam para "ativos" | [x] | `contarAtivos` exclui `pago/cancelado/recusado/expirado/sem_aviso` `planos/index.ts:187` | — |
| Limite considera combinados onde sou o criador, independente do papel | [x] | `contarAtivos` por papel: `(criador_papel='cobrador' and cobrador_id=$1) or (criador_papel='devedor' and devedor_profile_id=$1)` `planos/index.ts:188-189` | `avisos.test.ts:106-148` (invertido conta, C1) |

### H3.5: Editar, cancelar e pausar (mesmas regras do Épico 2)

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Edição/cancelamento/pausa seguem H2.5/H2.6/H2.7 com papéis trocados; quem é notificado é o cobrador | [x] | `editarAviso`/`cancelarAviso`/`pausarAviso`/`reativarAviso` `service.ts:403-604` (genéricos por `criador_papel`); notificam a outra ponta via `enfileirarNotificacaoDevedor` | `avisos.test.ts:207-231` (cancelar invertido idempotente) |
| Editar após aceite → aguardando_aprovacao_aviso_editado, lembretes pausados, reaprovação pelo cobrador | [x] | `service.ts:448-453` (snapshot + status + notifica); reaprovação pela outra ponta (Épico 5) | — |
| Cancelar em qualquer fase viva; se aceito notifica; cancelado terminal, nada apagado | [x] | `service.ts:583-604` (`cancelado_criador`, notifica se jaAceito, sem DELETE) | `avisos.test.ts:150-178` (soft-delete na agenda) |
| Pausar/reativar só a partir de aceito; devedor segue alvo; cobrador notificado | [x] | `service.ts:542-576` (só de `programado`/`pausado`) | — |
| Toda alteração registrada como evento (append-only) | [x] | `inserirEvento` em cada mutação `service.ts:441,451,493,511,532,551,570,598` | `avisos.test.ts:302-311` (eventos) |

## O que o código precisa mudar para seguir a história (mudanças de CÓDIGO)

1. **Frontend: exigir a chave Pix no fluxo invertido (`pagar`) ao gerar convite.** A história 03 decide (H3.1 + "Decisões tomadas", linha 88): *"O devedor só cria/envia o convite ao cobrador se informar a chave Pix. Não existe convite invertido sem Pix."* O backend já obriga (`payloads.ts:82-85`, `service.ts:140-142`), mas o frontend trata como opcional:
   - `frontend/src/modules/avisos/schemas.ts`: os refines de Pix (linhas 58-69) só valem para `direcao === 'receber'`. Falta um refine que exija `pix_chave` quando `modo === 'enviar' && direcao === 'pagar'` (titular/banco continuam dispensados na criação invertida, conforme H3.1/H3.3).
   - `frontend/src/modules/avisos/pages/NovoAviso.tsx:266`: o rótulo "Chave Pix (opcional)" no `pagar` contradiz a história; deve indicar obrigatoriedade ao gerar convite (manter opcional só no modo agenda). O texto de apoio em :271 ("Quem confirmar pode ajustar") está OK quanto ao titular/banco, mas a chave em si não é opcional.
   - Resultado atual: o usuário pode submeter "Salvar e gerar convite" sem Pix; o backend devolve `pix_obrigatorio` e a mensagem cai no banner de erro geral, experiência pior do que validar no formulário.

## Itens que a própria história marca como 🟡/fora de escopo (com a linha)

- Linha 91: "❌ Aceite/recusa e validação do número de convite no WhatsApp (Épico 5)." Por isso H3.2 (validação no aceite, fallback sem número) e H3.3 (botões, transições de aceite/recusa, notificações ao criador) foram conferidos só quanto à estrutura/maquinaria que já existe; os producers vivem no `zap` (Épico 5) e estão presentes.
- Linha 92: "❌ Disparo e textos dos lembretes ao devedor (Épico 6)."
- Linha 93: "❌ Confirmação de pagamento e notificação ao cobrador (Épicos 7 e 9)."
- Linhas 76-85 ("Divergências com a definição atual") descrevem migrações de design já realizadas (número de convite, novos estados, Pix informado pelo devedor na criação); todas já refletidas no código atual (migrations 0028/0030/0035/0037).

## Observações

- O critério "Chave Pix incorreta" (H3.3) usa o evento genérico `pix_incorreto` e a resposta neutra exatamente como a história pede ("Certo, vamos comunicar sua resposta."), `0035:60-69`.
- A unicidade do convite tem índice próprio por telefone de cobrador no invertido (`0035:47-49`), espelhando o do receber; o retry de colisão é comum aos dois fluxos (`service.ts:85-107`).
- O backend conta o limite por papel do criador (`planos/index.ts:188-189`), coberto pelo teste C1 (`avisos.test.ts:106-148`), satisfazendo H3.4 sem ambiguidade.
- Marcado [~] em "validação no aceite por número+telefone" (H3.2) apenas porque o ATO de validar é Épico 5; a estrutura (índice + tabela de tentativas) está completa, então não é falha de 03.
