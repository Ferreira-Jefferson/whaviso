# Verificação — Épico 05: Convite & Aceite

> Verificador READ-ONLY. A história (`historias/05-convite-aceite.md`) é a única fonte da verdade. Onde o código diverge, o que muda é o código.

## Veredito (39 [x] · 1 [~] · 0 [!] · 0 [+])

O código implementa o épico de ponta a ponta: localização por número de 6 dígitos + telefone (hash), os três botões (aceitar / dado incorreto / recusar), o terminal próprio `recusado`, telefone divergente (H5.8), anti-brute-force de 3 tentativas com os dois desfechos (H5.9), expiração fixa de 7 dias (H5.7), idempotência (H5.6), conta-no-aceite por telefone (H5.3) e notificação ao criador em toda resposta. A página pública `/aceite/:token` foi removida, como a história manda. Única ressalva: a confirmação de aceite (`resposta.aceite`) não traz a CTA discreta para o painel pedida na H5.3 ([~]).

## Por história

### H5.1: Localizar o combinado pelo número de convite

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Link abre WhatsApp com mensagem inicial pré-preenchida ("Oi, aqui é [nome], meu convite é o xxx-xxx") | [x] | `api/.../avisos/service.ts:60` monta `Oi, aqui é ${nomeAutor}, meu convite é o ${numeroFormatado}` e `:63` o `wa.me/...?text=`; front exibe `mensagem_convite`/`link_whatsapp` em `frontend/.../AvisoCriado.tsx:25,96` | n/a (UI) |
| Extrai os 6 dígitos, com hífen ou corridos | [x] | `shared/contracts/convite.ts:60-65` `extrairNumeroConvite` casa `(\d{3})[\s-]?(\d{3})` com fronteira de dígito | `convite_aceite.test.ts:77,90` (hífen e corrido) + `convite.test.ts` |
| Localiza por número + telefone (compara contra o hash; claro nunca persistido/logado) | [x] | `service.ts:271` `localizarPorNumeroHash(sha256ConviteHex(numero))`; alvo por telefone em `service.ts:293` `repo.telefoneAlvo(aviso) !== telefone`; hash em `convite.ts:12` | `convite_aceite.test.ts:130` (telefone bate/não bate) |
| Fallback sem número: pede o número | [x] | `service.ts:265-267` responde `convite.pedir_numero`; texto em migration `0037:111-115` | `convite_aceite.test.ts:97` |
| Número não existe: informa e conta a tentativa | [x] | `service.ts:274` `processarErroNumero` → `repo.contarErroNumero` → `convite.nao_encontrado` (`service.ts:308`) | `convite_aceite.test.ts:201` |
| Número confere mas telefone não bate: caso à parte (H5.8) | [x] | `service.ts:292-297` ramo dedicado antes de qualquer contagem | `convite_aceite.test.ts:130,150` |
| Anti-brute-force: 3 tentativas por telefone | [x] | `repo.ts:79` `MAX_TENTATIVAS=3`, contagem em `contarErroNumero` (`repo.ts:313`) | `convite_aceite.test.ts:200-242` |
| Nada de telefone/Pix/número em log | [x] | `service.ts` só loga `{ err }`/`{ chave }`/`{ avisoId }`; comentários reforçam (`service.ts:230`); migration guarda só hash (`0037:48`) | `compliance.test.ts` (presente) |

### H5.2: Ver o combinado e escolher a resposta

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Resumo: quem cobra/paga, motivo, valor, data | [x] | `service.ts:325-340` `responderResumo` preenche nome_cobrador/nome_devedor/motivo/valor/data; template `convite.resumo` em `0037:80-92` | `convite_aceite.test.ts:77` |
| Invertido: resumo inclui a chave Pix | [x] | `service.ts:334` `if (invertido) valores.pix_chave`; variante `revisao` em `0037:96-108` (`{{6}}` = chave) | `convite_aceite.test.ts:177` (cobrador certo vê o Pix) |
| Botões (rótulos editáveis pelo owner): Aceitar / Algum dado está incorreto (invertido: Chave Pix incorreta) / Recusar combinado | [x] | botões no template (banco), rótulos `Aceitar`/`Algum dado está incorreto`/`Recusar combinado` (`0037:85-89`) e variante `Chave Pix incorreta` (`0037:101-105`); editáveis via tabela `templates` | `convite_aceite.test.ts:85` |
| Botão carrega `aviso_id` no payload (não número/token); webhook autenticado | [x] | botão `id` = `acao:avisoId` (`baileys_client/tipos.ts:5`); parse valida UUID em `service.ts:42-55`; transporte Baileys pareado (substitui o HMAC da Meta, ver Observações) | `convite_aceite.test.ts:86` (`b.id.endsWith(avisoId)`) |
| Linguagem neutra e sem palavras proibidas | [x] | textos dos templates `0037`; teste verifica ausência de dívida/cobrança/atraso | `convite_aceite.test.ts:87` + `compliance.test.ts` |

### H5.3: Aceitar o combinado

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Aceitar: `aguardando_aceite → programado` + ativa o ciclo p/ o devedor | [x] | `repo.ts:560-567` update `status='programado'` + `reservarHorario` + insere `envios` | `convite_aceite.test.ts:261` (programado + 4 envios) |
| Invertido: aceitar confirma a chave Pix mostrada | [x] | `repo.ts:558-559` comentário: o valor já está em `avisos.pix_chave`, nada a alterar (confirma o mostrado) | coberto pelo fluxo invertido |
| Vínculo: sem sessão só por telefone; com sessão vincula `profile.id` | [x] | telefone já gravado no aviso; `service.ts:131` chama `garantirContaNoAceite` → `vincularProfileConvidado` (`repo.ts:784`) | `convite_aceite.test.ts:285,313` |
| Conta criada automaticamente (H1.4) com nome + telefone, no plano free | [x] | `garantirContaPorTelefone` (`supabase_admin/index.ts:74`) cria via GoTrue com `phone`+`user_metadata.nome`; profile default = free | `convite_aceite.test.ts:285` |
| Confirmação + CTA discreta para acompanhar no painel (nunca obrigatória) | [~] | `resposta.aceite` (`0022:72-74`) traz só "Combinado confirmado! Vamos te enviar os lembretes acordados."; sem CTA/link ao painel | sem teste de CTA |
| Criador é notificado do aceite (Épico 10) | [x] | `repo.ts:579` `enfileirarNotificacao(..., 'convite_aceito')`; rota ao criador em `notificacoes/index.ts:46-57` | `convite_aceite.test.ts` (fluxo de aceite) |
| Resposta de confirmação neutra | [x] | `resposta.aceite` neutro/sem proibidas | `compliance.test.ts` |

### H5.4: Sinalizar que algum dado está incorreto

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Não aceita nem recusa (segue `aguardando_aceite`) | [x] | `repo.ts:546-555` `dado_incorreto`: não muda status | `convite_aceite.test.ts:246` (status segue aguardando_aceite) |
| Sem texto livre (só um sinal) | [x] | é botão/fallback numerado; nenhum parse de texto livre | n/a |
| Criador é notificado para revisar/reenviar | [x] | `repo.ts:554` `enfileirarNotificacao(..., 'convite_dado_incorreto')` | `convite_aceite.test.ts:258` |
| Resposta neutra ("Certo, vamos comunicar sua resposta.") | [x] | `resposta.dado_incorreto` em `0035:66-68` = "Certo, vamos comunicar sua resposta." | `compliance.test.ts` |
| Evento registrado (append-only) | [x] | `repo.ts:550-552` insere evento `pix_incorreto` em `eventos_aviso` | `convite_aceite.test.ts:252` |

### H5.5: Recusar o combinado

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Recusar: `aguardando_aceite → recusado` (evento `recusado`) | [x] | `repo.ts:535-541` update `status='recusado'` + evento `recusado` | `convite_aceite.test.ts:107` (aviso recusado tratado como terminal) |
| `recusado` é estado próprio, distinto de `cancelado` | [x] | enum + transição em `0028:39,81`; terminais listados em `0028:113` separam `recusado` de `cancelado` | n/a (schema) |
| `recusado` é terminal: nunca mais envia | [x] | `0028:113` inclui `recusado` no bloqueio de saída de terminal; `repo.ts:524` recusa só de `aguardando_aceite` | `convite_aceite.test.ts:107` |
| Criador notificado da recusa | [x] | `repo.ts:542` `enfileirarNotificacao(..., 'convite_recusado')` | fluxo de recusa |
| Resposta neutra ("Tudo bem, combinado recusado...") | [x] | `resposta.recusa` (`0022:75-77`) = "Tudo bem, combinado não confirmado. Não enviaremos lembretes." | `compliance.test.ts` |
| Combinado não é apagado (estado, não DELETE) | [x] | só `update status='recusado'`; sem DELETE | n/a |

### H5.6: Segurança e idempotência do aceite

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Webhook valida autenticidade (HMAC); payloads levam `aviso_id`, nunca número/token em claro | [x] | payload `acao:avisoId` validado como UUID (`service.ts:42-55`); transporte Baileys pareado por QR (substitui o webhook HMAC da Meta, ver Observações) | `convite_aceite.test.ts:86` |
| Estado terminal nunca reabre/reprocessa; toque tardio recebe resposta informativa | [x] | `repo.ts:524-532` (convite fora de `aguardando_aceite` → `convite.ja_respondido`, sem efeito); `service.ts:281-284` | `convite_aceite.test.ts:106-126` |
| Processamento idempotente (toque duplo não duplica) | [x] | `aplicarAcaoBotao` em transação com `for update`; `service.ts:128` só responde se `aplicado`; `on conflict do nothing` nos envios (`repo.ts:571`) | `convite_aceite.test.ts:271` (toque duplo: 4 envios, 1 confirmação) |
| Nunca logar telefone/Pix/número | [x] | logs só com `err`/`avisoId`/`chave` | `compliance.test.ts` |

### H5.7: Convite expirado ou já respondido

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Expira após 7 dias fixos (todos os planos), depois não aceita | [x] | `convite_expira_em` (`0037:33`) preenchida com `conviteExpiraEm()` = +7d (`api/service.ts:193,296`; `shared/datas/index.ts:75`); sweep em `expirar_avisos/index.ts:26-27`; rejeição em `service.ts:287-290` | `convite_aceite.test.ts:118` + `expirar.test.ts` |
| Convite expirado → orientação para pedir um novo | [x] | `service.ts:289` responde `convite.expirado` (texto orienta pedir novo, `0037:126-128`) | `convite_aceite.test.ts:118` |
| Combinado já aceito → avisa que já está ativo, sem reprocessar | [x] | `service.ts:281-284` (status != aguardando_aceite) → `convite.ja_respondido` | `convite_aceite.test.ts:107` (terminal informativo) |

### H5.8: Telefone não bate com o convite

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Número existe + telefone não bate → tratado como erro de digitação, não número inválido | [x] | `service.ts:292-297` ramo `repo.telefoneAlvo(aviso) !== telefone` antes da contagem | `convite_aceite.test.ts:130` |
| Quem tentou recebe mensagem neutra | [x] | `service.ts:295` responde `convite.telefone_divergente` (texto em `0037:139-143`) | `convite_aceite.test.ts:142` |
| Criador é notificado para conferir/reenviar | [x] | `repo.ts:374-378` `notificarTelefoneDivergente` → `convite_telefone_divergente`; rota ao criador (cobrador-sem-conta via `telefone_cobrador`, `notificacoes/index.ts:50-51`) | `convite_aceite.test.ts:139,173` |
| Não revela dado do combinado ao convidado | [x] | resposta usa template fixo sem variáveis | `convite_aceite.test.ts:142-146,172` (sem Pix/motivo/valor) |
| Não consome as 3 tentativas | [x] | `service.ts:292-297` retorna sem chamar `contarErroNumero` | `convite_aceite.test.ts:137,171` (contador nulo) |
| Nada de telefone/Pix/número em log | [x] | sem logs sensíveis | `compliance.test.ts` |

### H5.9: Esgotar as 3 tentativas de número errado

| Critério | Status | Evidência | Teste |
|---|---|---|---|
| Conta só número errado; telefone divergente (H5.8) não entra | [x] | só o ramo `!aviso` chama `processarErroNumero` (`service.ts:274`); divergente sai antes (`service.ts:292`) | `convite_aceite.test.ts:137` |
| Ao errar 3x, verifica se o telefone é alvo de convite pendente | [x] | `repo.ts:334` `temConvitePendente` no 3º erro | `convite_aceite.test.ts:214,230` |
| Telefone cadastrado: gera novo número (invalida o anterior) + notifica quem convidou | [x] | `repo.ts:338-345` `regenerarNumero` + `zerarTentativa` + `enfileirarNotificacao('convite_tentativas_esgotadas')`; resposta `convite.tentativas_cadastrado` (`service.ts:313`) | `convite_aceite.test.ts:214` (hash muda, contador zera, notifica) |
| Telefone não cadastrado: bloqueia até novo combinado; mensagem diferente, sem notificar criador | [x] | `repo.ts:347-353` set `bloqueado=true`; resposta `convite.bloqueado` (`service.ts:317`); api destrava em novo combinado (`api/avisos/repo.ts:311`) | `convite_aceite.test.ts:230` |
| Sempre que falhar 3x (caso cadastrado), novo número gerado; o antigo deixa de valer | [x] | `repo.ts:338` regenera o hash a cada ciclo de 3 falhas | `convite_aceite.test.ts:214` |
| Nada de telefone/Pix/número em log | [x] | sem logs sensíveis | `compliance.test.ts` |

## O que o código precisa mudar para seguir a história (mudanças de CÓDIGO)

1. H5.3 — CTA discreta ao painel ([~]): o template `resposta.aceite` (migration `0022:72-74`) traz só a confirmação ("Combinado confirmado! Vamos te enviar os lembretes acordados."). A história pede "confirmação **+ CTA discreta** para acompanhar no painel (nunca obrigatória)". Acrescentar ao texto do template um convite discreto/opcional ao painel (ex.: link curto ou frase "Se quiser acompanhar pelo painel, é só acessar..."), mantendo linguagem neutra e sem travessão. Como é texto de catálogo, vai por migration (upsert), não pelo seed.

## Itens que a própria história marca como 🟡/fora de escopo

Nenhuma história deste épico está marcada 🟡; todas são 🟢. Os itens explicitamente fora de escopo (linhas 145-149) são de outros épicos e não foram cobrados aqui:
- linha 146: "Disparo, agendamento e textos dos lembretes pós-aceite (Épico 6)."
- linha 147: "Interação do devedor já ativo (Já paguei / Ver Pix / Sair) (Épico 7)."
- linha 148: "Confirmação de pagamento `informado_pago` (Épico 8)."
- linha 149: "Conteúdo das notificações ao criador/cobrador (Épico 10)."

Observação da própria história (linha 137, decisão tomada): "não há história de auto-envio do convite por template" (compartilhamento manual por link `wa.me` é permanente). O código segue isso: a `api` só monta a mensagem/link `wa.me` para o criador compartilhar (`api/avisos/service.ts:54-64`); não há disparo automático. Correto, não é divergência.

## Observações

- Página de aceite por site: a história (linha 120) manda **remover** `/aceite/:token` e a rota POST pública; o aceite passa a ser 100% pelo WhatsApp. O código cumpre: o router (`frontend/src/app/router.tsx:89`) traz o comentário "a página pública /aceite/:token saiu" e só restam `/aviso/:token` e `/sair-lembretes/:token` (ações de devedor por link, Épico 7). O módulo `frontend/src/modules/aceite/` ainda existe, mas só hospeda essas duas páginas de E7, não uma página de aceite.

- H5.6 "webhook HMAC": a história foi escrita supondo o webhook HTTP da Meta (HMAC). O transporte hoje é Baileys (socket pareado por QR, `backend/apps/zap/src/shared/baileys_client/`), sem webhook HTTP da Meta, então não há assinatura HMAC a validar. O espírito do critério (payload leva `aviso_id`, nunca número/token; autenticidade do canal) é atendido: o `buttonId` é `acao:avisoId` validado como UUID (`service.ts:42-55`) e a sessão Baileys é autenticada por pareamento. Classificado [x] por isso; se/quando voltar à Meta oficial, a validação HMAC do webhook precisa ser religada.

- Coluna `avisos.convite_tentativas` (por-aviso, da `0030`) ficou sem produtor: o E5 conta por TELEFONE em `convite_tentativas_telefone` (`0037`). É documentado na própria migration (`0037:16-18`) e não conflita com a história.
