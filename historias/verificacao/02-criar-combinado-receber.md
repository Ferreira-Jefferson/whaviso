# Verificação — Épico 02: Criar combinado (receber)

> Verificação READ-ONLY do código contra a história `historias/02-criar-combinado-receber.md`.
> Fonte da verdade: a história. Divergências apontam mudança no CÓDIGO.

## Veredito (38 [x] · 1 [~] · 0 [!] · 0 [+])

O épico está implementado de ponta a ponta (api + contratos + migrations + frontend) e bem coberto por testes de integração (`avisos_e2.test.ts`, `avisos.test.ts`). Não encontrei divergência que exija refatoração nem critério faltante. Único ponto parcial: a data_combinada não tem prova explícita de UTC no banco neste épico (é tratada como data de negócio sem hora; conversão TZ vive no ciclo, E6).

## Por história

### H2.1: Cadastrar um combinado a receber

| Critério | Status | Evidência (arquivo:linha) | Teste |
|---|---|---|---|
| Informo nome devedor, motivo, valor, data, telefone, chave Pix (Pix obrigatório) | [x] | `payloads.ts:32-85` (campos + refines); `service.ts:137-139` (defesa Pix); FE `NovoAviso.tsx:184-286` | `avisos_e2.test.ts:48-56` (rejeita sem Pix); `avisos.test.ts:55-67` |
| Junto da chave, informo titular e banco (compõem 2ª msg do Pix) | [x] | `payloads.ts:53-78` (titular/banco obrigatórios no receber); `0031_aviso_pix_obrigatorio_titular_banco.sql:24-30`; `service.ts:163-164` | `avisos_e2.test.ts:58-82` (rejeita sem titular/banco; persiste) |
| Nome de quem cobra = do próprio cobrador (pré-preenchido da conta) | [x] | `service.ts:151,157` (`cobrador_id=uid`, `nome_cobrador=null` no receber: nome vem do profile); FE não pede o campo no receber `NovoAviso.tsx:184` | implícito (cobrador_id=uid nos testes) |
| Valor em reais na UI, persiste em centavos (int) | [x] | `entidades.ts:23` (`valorCentavos=int().positive()`); FE `MoneyInput` `NovoAviso.tsx:241-254` | `avisos_e2.test.ts:73-82` |
| Data em America/Sao_Paulo; banco em UTC | [~] | `entidades.ts:27-28` (data de negócio sem hora, comentário SP); conversão TZ é do ciclo (E6 `reprogramarCiclo`) | sem teste explícito de UTC neste épico (data sem hora) |
| Campos obrigatórios validados com msg clara; valor > 0 | [x] | `entidades.ts:23` (`positive()`); refines `payloads.ts:58-85`; FE `schemas.ts`/`Field erro` | `avisos.test.ts:69-76` (valor 0 → 400) |
| Ao salvar, criado em aguardando_aceite | [x] | `service.ts:196-206` (status `aguardando_aceite`) | `avisos.test.ts:55-67`; `avisos_e2.test.ts:73-82` |
| Linguagem respeita regras de ouro | [x] | FE só usa combinado/lembrete/convite (`NovoAviso.tsx`, `AvisoCriado.tsx`); sem dívida/cobrança | lint de linguagem (`linguagem.ts`) |

### H2.2: Gerar o convite (número de 6 dígitos + mensagem com link)

| Critério | Status | Evidência (arquivo:linha) | Teste |
|---|---|---|---|
| Gera número de convite de 6 dígitos ao criar | [x] | `convite.ts:31-34` (`gerarNumeroConvite`); `service.ts:195-206` | `avisos_e2.test.ts:84-97` |
| Exibição xxx-xxx; validação aceita com hífen ou 6 corridos | [x] | `convite.ts:37-50` (`formatarNumeroConvite`/`normalizarNumeroConvite`) | `avisos_e2.test.ts:90` (regex `^\d{3}-\d{3}$`) |
| Armazenamento só hash; claro nunca persiste | [x] | `convite.ts:12-14` (sha256); `0030_aviso_convite_numero.sql:25-28`; `service.ts:91` | `avisos_e2.test.ts:99-112` (só hash; claro ausente) |
| Unicidade por telefone do devedor | [x] | `0030...sql:40-42` (índice parcial `(telefone_devedor,convite_hash)`); retry `service.ts:85-107` | `avisos_e2.test.ts:137-179` (mesmo tel colide; tel diferente ok; corrida) |
| Anti-brute-force: máx 3 tentativas (efeito no E5) | [x] | `0030...sql:30-34` (`convite_tentativas` nasce 0; estrutura aqui, lógica E5) | `avisos_e2.test.ts:115-124` (nasce 0) |
| Mensagem completa (intro + número + link) | [x] | `service.ts:54-75` (`montarConvite`); FE `AvisoCriado.tsx:96-116` | `avisos_e2.test.ts:92-93` |
| Link leva ao WhatsApp do Whaviso com 1ª msg pré-preenchida | [x] | `service.ts:59-64` (`wa.me/<WHAVISO>?text=...`) | `avisos_e2.test.ts:94-97` (wa.me + "meu convite é o") |
| Validação no aceite (número + telefone) | [x] | escopo E5; helpers prontos `convite.ts:47-65` | (E5) |
| Fallback sem número | [x] | escopo E5; `extrairNumeroConvite` retorna null `convite.ts:60-65` | (E5) |
| Forma fácil de copiar/compartilhar a mensagem | [x] | FE `AvisoCriado.tsx:34-43,102-128` (copiar + abrir WhatsApp) | (UI) |
| Detalhamento do aceite no E5 | [x] | história remete ao E5 (`payloads.ts:165-168`: rota de aceite removida) | n/a |

### H2.3: Respeitar o limite do plano ao criar

| Critério | Status | Evidência (arquivo:linha) | Teste |
|---|---|---|---|
| Free não cria combinado (CTA de plano) | [x] | `planos/index.ts:134-145` (`plano_somente_leitura`); FE `NovoAviso.tsx:113-116` | `avisos.test.ts:94-104` (free → 422 plano_somente_leitura) |
| Pessoal/teto de ativos; ao estourar erro `{error:{code,message}}` | [x] | `planos/index.ts:147-154` (`agenda_cheia`); `exigirVagaDeAtivo:218-225` (`limite_plano_atingido`) | `avisos.test.ts:78-92`; `avisos_e2.test.ts:307-330` (limite edições) |
| Checagem na API, não só UI | [x] | gate na transação `service.ts:125-132`; `planos/index.ts:119-156` | `avisos.test.ts:94-104,180-205` (corrida) |
| Terminais não contam como ativos | [x] | `planos/index.ts:184-193` (`contarAtivos` exclui pago/cancelado/recusado/expirado/sem_aviso) | `avisos_e2.test.ts:398-409` (pausado/edição contam; terminais não) |

### H2.4: Não enviar nada antes do aceite

| Critério | Status | Evidência (arquivo:linha) | Teste |
|---|---|---|---|
| Em aguardando_aceite nenhum envio programado/disparado | [x] | `service.ts:196-216` (cria aviso + eventos, sem inserir envios) | `avisos_e2.test.ts:181-190` (0 envios) |
| Ciclo só após o aceite (E6) | [x] | envios criados no aceite (`aceitarAvisoDireto` nos testes; E5/E6) | `avisos.test.ts:274-283` (4 envios só após aceite) |

### H2.5: Editar (com reaprovação se já aceito)

| Critério | Status | Evidência (arquivo:linha) | Teste |
|---|---|---|---|
| Edição em qualquer fase viva | [x] | `service.ts:382-391` (`VIVOS`), `403-414`; FE `DetalheAviso.tsx:158-159` | `avisos_e2.test.ts:241-257` |
| Antes do aceite: aplica direto | [x] | `service.ts:394,420,438-443` (`EDICAO_LIVRE`) | `avisos_e2.test.ts:241-257` |
| Depois do aceite: aviso de confirmação com texto exato | [x] | FE `DetalheAviso.tsx:673-683` (texto idêntico da história) | (UI) |
| Ao confirmar → aguardando_aprovacao_aviso_editado + lembretes pausados | [x] | `service.ts:448-451`; trigger `0028...sql:107-122` (suspende envios) | `avisos_e2.test.ts:259-279` (status + 0 envios vivos) |
| Devedor recebe mensagem (alteração a aprovar, pausado) | [x] | `service.ts:453` (`aviso_edicao_a_aprovar`); `notificacoes/index.ts:31,99` | `avisos_e2.test.ts:272-273` |
| Pode desfazer a qualquer momento (volta às condições anteriores) | [x] | `service.ts:480-499` (`desfazerEdicao` restaura snapshot, → programado) | `avisos_e2.test.ts:281-295` |
| Se devedor aprova → ciclo normal com novos dados | [x] | `service.ts:506-515` (`aprovarEdicao` → programado, reprograma ciclo) | (E5 dispara; estado aqui) |
| Se devedor recusa → notifica cobrador; reativar-anterior ou reeditar | [x] | `service.ts:524-536` (restaura, → programado, `edicao_recusada` ao cobrador) | (E5 dispara; estado aqui) |
| "Algum dado incorreto" no aceite (sem texto livre, neutro) | [x] | história remete ao E5 (`payloads.ts:230-233`: gated no E5) | (E5) |
| Toda alteração registrada como evento (append-only) | [x] | `service.ts:441,451,493,511,532` (`editado`/`editado_aprovado`/`editado_recusado`); `0032...sql:18-46` | `avisos_e2.test.ts:275-294` |
| Qtde de edições por plano | [x] | `planos/index.ts:35,425-433` (`edicoes_max`); `0033_plano_edicoes_max.sql` | `avisos_e2.test.ts:307-330` |

### H2.6: Cancelar um combinado

| Critério | Status | Evidência (arquivo:linha) | Teste |
|---|---|---|---|
| Cancelar em qualquer fase viva | [x] | `service.ts:583-604` (usa `VIVOS`); FE `DetalheAviso.tsx:146-155` | `avisos_e2.test.ts:364-396` (aceito e pausado) |
| Se já aceito, devedor é notificado | [x] | `service.ts:592,599-601` (`aviso_cancelado` se jaAceito) | `avisos_e2.test.ts:364-396` |
| cancelado é terminal | [x] | `0028...sql:80-89` (não há transição de saída de `cancelado`) | (máquina de estados) |
| Não apaga do banco (estado, não DELETE) | [x] | `service.ts:593` (atualizarStatus, sem delete) | `avisos_e2.test.ts:372-374` (linha permanece) |
| Evento de cancelamento gravado | [x] | `service.ts:598` (`cancelado_criador`) | `avisos_e2.test.ts` (notif via evento-fonte) |

### H2.7: Pausar e reativar um combinado aceito

| Critério | Status | Evidência (arquivo:linha) | Teste |
|---|---|---|---|
| pausado só a partir de aceito | [x] | `service.ts:547-549` (só de `programado`) | `avisos_e2.test.ts:343-351` (antes do aceite → 409) |
| Ao pausar, devedor recebe mensagem | [x] | `service.ts:552` (`aviso_pausado`) | `avisos_e2.test.ts:340` |
| Em pausado nenhum lembrete enviado | [x] | trigger `0028...sql:107-122` suspende envios | `avisos_e2.test.ts:339` (0 vivos) |
| Ao reativar, devedor notificado e ciclo volta | [x] | `service.ts:569-573` (`reativado` + reprograma + `aviso_reativado`) | `avisos_e2.test.ts:353-362` |
| pausado não é terminal | [x] | `0028...sql:87` (`pausado → programado/cancelado/expirado`) | `avisos_e2.test.ts:353-362,387-396` |
| Pausa/reativação registradas como eventos | [x] | `service.ts:551,570` (`pausado`/`reativado`) | (auditoria via notif) |

## O que o código precisa mudar para seguir a história

Nada bloqueante. Observação única (não é divergência):

- **H2.1 data em UTC:** `data_combinada` é uma DATA de negócio sem hora (`entidades.ts:27-28`, coluna `date`), então não há conversão de fuso na criação; a interpretação em America/Sao_Paulo acontece no agendamento do ciclo (E6). Se desejar prova explícita no escopo deste épico, valeria um teste afirmando que a data persiste sem deslocamento de fuso. Como a história fala de "data combinada" (sem hora) e o cálculo de etapa/agendamento é declarado fora deste épico, classifico como [~] e não [+]/[!].

## Itens que a própria história marca como 🟡/fora de escopo

- "Fora de escopo deste épico" (linhas 112-115): aceite/recusa e validação do número no WhatsApp (E5); disparo e textos dos lembretes (E6); fluxo invertido criado pelo devedor (E3). Os helpers de validação do convite (`convite.ts:47-65`) já existem mas o efeito é do E5, como a própria história H2.2 (linha 37) e H2.5 (linha 70) remetem.
- H2.2 anti-brute-force "efeito: bloqueio temporário ou exigir novo convite, ver Épico 5" (linha 31): estrutura (`convite_tentativas`) está pronta; lógica é do E5.

## Observações

- `aprovarEdicao`/`recusarEdicao` (`service.ts:506-536`) existem como funções reusadas pelo E5 (gatilho via webhook), com transição e auditoria corretas; o estado/transição é deste épico.
- O frontend cobre os fluxos: criação com Pix obrigatório, número/mensagem/link na tela de sucesso (`AvisoCriado.tsx`), edição com texto exato de confirmação (`DetalheAviso.tsx:673-683`), pausar/reativar/cancelar/editar (`DetalheAviso.tsx:444-499`).
- Linguagem: nenhum termo proibido encontrado nos arquivos do épico; copy usa combinado/lembrete/convite. Sem travessão nos arquivos lidos.
